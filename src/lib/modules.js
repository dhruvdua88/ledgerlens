// Core-audit modules — ported from FinAnalyzer branch worktree-purchase-register-parity.
// SIGN CONVENTION (branch): raw signed amount → amount<0 = DEBIT, amount>0 = CREDIT.
// Opening/closing come from mst_ledger (signed, same convention). All deterministic.
import { runQuery } from './db.js'

const DB = 'daybook_accounting_lines'
const dr = (a) => (a < 0 ? -a : 0)
const cr = (a) => (a > 0 ? a : 0)
const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100
const parseBal = (t) => { if (t == null || t === '') return null; const n = parseFloat(String(t).replace(/,/g, '').replace(/[^0-9.\-]/g, '')); return isNaN(n) ? null : n }

function rowsObj(db, sql, keys) {
  const r = runQuery(db, sql); const idx = {}; r.columns.forEach((c, i) => (idx[c] = i))
  return r.rows.map((row) => { const o = {}; for (const k of keys) o[k] = row[idx[k]]; return o })
}

// raw daybook lines as objects (for JS-side modules)
function lines(db) {
  return rowsObj(db, `SELECT voucher_guid,voucher_date,voucher_type,voucher_number,narration,party_name,ledger_name,amount,ledger_parent,ledger_primary_group FROM ${DB}`,
    ['voucher_guid', 'voucher_date', 'voucher_type', 'voucher_number', 'narration', 'party_name', 'ledger_name', 'amount', 'ledger_parent', 'ledger_primary_group'])
    .map((o) => ({ guid: o.voucher_guid, date: o.voucher_date, vtype: o.voucher_type || '', vno: o.voucher_number || '', narration: o.narration || '', party: o.party_name || '', ledger: o.ledger_name || '', amount: Number(o.amount) || 0, parent: o.ledger_parent || '', primary: o.ledger_primary_group || '' }))
}

// master ledgers with parsed signed balances + primary group
function masters(db) {
  return rowsObj(db, `SELECT l.name AS name, l.parent AS parent, g.primary_group AS pg, l.opening_balance AS ob, l.closing_balance AS cb, l.gstn AS gstn, l.it_pan AS pan
    FROM mst_ledger l LEFT JOIN mst_group g ON l.parent = g.name`, ['name', 'parent', 'pg', 'ob', 'cb', 'gstn', 'pan'])
    .map((m) => ({ name: m.name, parent: m.parent || '', primary: m.pg || (m.parent || ''), opening: parseBal(m.ob), closing: parseBal(m.cb), gstn: m.gstn || '', pan: m.pan || '' }))
}

const groupVouchers = (ls) => { const m = new Map(); for (const l of ls) { const k = l.guid || `${l.vno}|${l.date}|${l.vtype}`; (m.get(k) || m.set(k, []).get(k)).push(l) } return m }
function resolveParty(legs) {
  const p = legs.find((l) => l.party && l.party.trim()); if (p) return p.party
  const dc = legs.find((l) => /debtor|creditor/i.test(l.primary) || /debtor|creditor/i.test(l.parent)); return dc ? dc.ledger : '-'
}

// ── Accounting Ledger Analytics (master opening/closing + status) ────────
function classifyStatus(m) {
  const o = m.opening || 0, c = m.closing || 0
  if (/debtor/i.test(m.primary) && c < 0) return ['abnormal', 'Abnormal (Cr in Debtor)']
  if (/creditor/i.test(m.primary) && c > 0) return ['abnormal', 'Abnormal (Dr in Creditor)']
  if (o === 0 && c === 0) return ['zero', 'Zero balance']
  if (o === c) return ['slow', 'Slow moving / no change']
  return ['active', 'Active']
}
function ledgerAnalytics(db, { search = '', primary = 'All', status = 'All' } = {}) {
  const allMs = masters(db).map((m) => { const [st, lbl] = classifyStatus(m); return { ...m, status: st, statusLabel: lbl } })
  const counts = { abnormal: 0, slow: 0, zero: 0, active: 0 }; allMs.forEach((m) => counts[m.status]++)
  const primaries = ['All', ...[...new Set(allMs.map((m) => m.primary))].filter(Boolean).sort()]
  const sq = search.toLowerCase()
  const ms = allMs.filter((m) =>
    (!sq || m.name.toLowerCase().includes(sq) || (m.parent || '').toLowerCase().includes(sq)) &&
    (primary === 'All' || m.primary === primary) &&
    (status === 'All' || m.status === status))
  const params = [
    { key: 'search', type: 'search', label: 'Search', placeholder: 'Ledger or group…', value: search },
    { key: 'primary', type: 'select', label: 'Primary group', options: primaries, value: primary },
    { key: 'status', type: 'chips', label: 'Status', options: ['All', 'active', 'abnormal', 'slow', 'zero'], value: status },
  ]
  const byLedger = {
    columns: ['Ledger', 'Primary group', 'Opening', 'Closing', 'Net change', 'Status'],
    rows: ms.map((m) => [m.name, m.primary, m.opening ?? 0, m.closing ?? 0, r2((m.closing || 0) - (m.opening || 0)), m.statusLabel]),
  }
  const grp = {}; for (const m of ms) { const g = (grp[m.primary] ||= { led: 0, ab: 0, sl: 0, ze: 0, net: 0 }); g.led++; if (m.status === 'abnormal') g.ab++; if (m.status === 'slow') g.sl++; if (m.status === 'zero') g.ze++; g.net += m.closing || 0 }
  const byGroup = { columns: ['Primary group', 'Ledgers', 'Abnormal', 'Slow', 'Zero', 'Net balance'], rows: Object.entries(grp).sort((a, b) => b[1].led - a[1].led).map(([g, v]) => [g, v.led, v.ab, v.sl, v.ze, r2(v.net)]) }
  return { params, sections: [
    { type: 'metrics', items: [{ l: 'Total ledgers', v: allMs.length }, { l: 'Abnormal balances', v: counts.abnormal, flag: counts.abnormal > 0 }, { l: 'Slow moving', v: counts.slow }, { l: 'Zero balance', v: counts.zero }] },
    { type: 'table', title: 'By ledger', ...byLedger },
    { type: 'table', title: 'By primary group', ...byGroup },
  ] }
}

// ── Voucher Book View ────────────────────────────────────────────────────
function voucherBook(db, { vtype = 'All', search = '' } = {}) {
  const ls = lines(db)
  const types = ['All', ...[...new Set(ls.map((l) => l.vtype))].filter(Boolean).sort()]
  const filt = vtype && vtype !== 'All' ? ls.filter((l) => l.vtype === vtype) : ls
  const vs = groupVouchers(filt)
  const sq = search.toLowerCase()
  const rows = []
  let tDr = 0, tCr = 0, entries = 0
  for (const [, legs] of vs) {
    const d = legs.reduce((s, l) => s + dr(l.amount), 0), c = legs.reduce((s, l) => s + cr(l.amount), 0)
    const party = resolveParty(legs), narr = legs.find((l) => l.narration)?.narration || ''
    if (sq && !`${legs[0].vno} ${legs[0].vtype} ${party} ${narr}`.toLowerCase().includes(sq)) continue
    tDr += d; tCr += c; entries += legs.length
    rows.push([legs[0].date, legs[0].vtype, legs[0].vno, party, narr, r2(d), r2(c), legs.length])
  }
  rows.sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
  return { params: [
    { key: 'search', type: 'search', label: 'Search', placeholder: 'Voucher, party, narration…', value: search },
    { key: 'vtype', type: 'select', label: 'Voucher type', options: types, value: vtype },
  ], sections: [
      { type: 'metrics', items: [{ l: 'Vouchers', v: rows.length }, { l: 'Entries', v: entries }, { l: 'Total Dr', v: r2(tDr), money: true }, { l: 'Total Cr', v: r2(tCr), money: true }] },
      { type: 'table', title: 'Voucher book', columns: ['Date', 'Type', 'Voucher', 'Party', 'Narration', 'Dr', 'Cr', 'Lines'], rows: rows.slice(0, 2000) },
    ] }
}

// ── Ledger Statement (opening b/f + running balance + closing c/f + recon) ─
function ledgerStatement(db, { ledger } = {}) {
  const ls = lines(db)
  const names = [...new Set(ls.map((l) => l.ledger))].filter(Boolean).sort()
  const sel = ledger && names.includes(ledger) ? ledger : names[0]
  if (!sel) return { sections: [{ type: 'note', text: 'No ledgers.' }] }
  const m = masters(db).find((x) => x.name === sel)
  const opening = m?.opening ?? 0
  // per-voucher net hit on the selected ledger, chronological
  const byV = new Map()
  for (const l of ls) if (l.ledger === sel) { const k = l.guid || `${l.vno}|${l.date}`; const e = byV.get(k) || { date: l.date, vtype: l.vtype, vno: l.vno, party: l.party, amt: 0 }; e.amt += l.amount; if (!e.party && l.party) e.party = l.party; byV.set(k, e) }
  const evs = [...byV.values()].filter((e) => Math.abs(e.amt) > 1e-7).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  let bal = opening
  const rows = [['—', 'Opening balance b/f', '', '', '', '', r2(opening)]]
  for (const e of evs) { bal += e.amt; rows.push([e.date, e.party || '-', e.vtype, e.vno, r2(dr(e.amt)), r2(cr(e.amt)), r2(bal)]) }
  rows.push(['—', 'Closing balance c/f', '', '', '', '', r2(bal)])
  const periodNet = r2(bal - opening)
  const refClosing = m?.closing ?? null
  const reconDiff = refClosing == null ? null : r2(bal - refClosing)
  return { params: [{ key: 'ledger', type: 'select', label: 'Ledger', options: names, value: sel }],
    sections: [
      { type: 'metrics', items: [
        { l: 'Opening', v: r2(opening), money: true }, { l: 'Period net', v: periodNet, money: true },
        { l: 'Closing (computed)', v: r2(bal), money: true },
        ...(reconDiff != null ? [{ l: 'Recon diff vs master', v: reconDiff, money: true, flag: Math.abs(reconDiff) > 0.01 }] : []),
      ] },
      { type: 'table', title: `Statement — ${sel}`, columns: ['Date', 'Particulars', 'Type', 'Voucher', 'Dr', 'Cr', 'Balance'], rows },
    ] }
}

// ── Party Ledger Transaction Matrix (full FinAnalyzer processor) ─────────
// Faithful port of FinAnalyzer app/workers/partyMatrixWorker.ts + the
// PartyLedgerMatrix.tsx UI, mapped onto the LedgerLens module contract.
// Adds vs the earlier port: party master metadata (GSTIN/PAN/State/Reg-type),
// manual TDS/GST/RCM tag overrides, Debit/Credit/Movement + First/Last cols,
// and two extra sheets — Party × Counter-Ledger pivot and Voucher detail —
// which the built-in multi-sheet Excel export picks up automatically.
const BUCKETS = ['Sales', 'Purchase', 'Expenses', 'TDS', 'GST', 'RCM', 'Bank', 'Others']
const isPlPrimary = (p) => /sale|income|purchase|inward|expense/i.test(p || '')
function bucketFor(l, tds, gst, rcm) {
  const n = l.ledger.toLowerCase(), p = (l.primary || '').toLowerCase(), par = (l.parent || '').toLowerCase()
  if (tds.has(l.ledger)) return 'TDS'
  if (gst.has(l.ledger)) return 'GST'
  if (rcm.has(l.ledger)) return 'RCM'
  if (/sale|income/.test(p)) return 'Sales'
  if (/purchase|inward/.test(p)) return 'Purchase'
  if (/expense/.test(p)) return 'Expenses'
  if (/bank/.test(n) || /bank/.test(p) || /bank/.test(par)) return 'Bank'
  return 'Others'
}
// columns present on a table — defensive across tally-loader schema versions
function tableCols(db, table) {
  try { const r = runQuery(db, `PRAGMA table_info("${table}")`); const i = r.columns.indexOf('name'); return new Set(r.rows.map((row) => row[i])) }
  catch { return new Set() }
}
// per-ledger master metadata (GSTIN / PAN / State / GST reg-type) — only the
// columns that actually exist are selected, so an older export never throws.
function partyMeta(db) {
  const cols = tableCols(db, 'mst_ledger')
  if (!cols.has('name')) return {}
  const want = { gstin: ['gstn', 'gst_registration_number'], pan: ['it_pan', 'income_tax_number'], state: ['mailing_state', 'state', 'price_level'], regtype: ['gst_registration_type', 'gst_supply_type'] }
  const pick = {}; for (const k in want) { const c = want[k].find((n) => cols.has(n)); if (c) pick[k] = c }
  const sel = ['name', ...Object.values(pick)]
  const r = runQuery(db, `SELECT ${sel.map((c) => `"${c}"`).join(',')} FROM mst_ledger`)
  const idx = {}; r.columns.forEach((c, i) => (idx[c] = i))
  const g = (row, key) => (pick[key] != null ? String(row[idx[pick[key]]] ?? '').trim() : '')
  const out = {}
  for (const row of r.rows) { const nm = row[idx.name]; if (nm == null) continue; out[nm] = { gstin: g(row, 'gstin'), pan: g(row, 'pan'), state: g(row, 'state'), regtype: g(row, 'regtype') } }
  return out
}
function partyMatrix(db, { primary, anomaly = 'All', search = '', tdsExtra = '', gstExtra = '', rcmExtra = '', hideZero = true } = {}) {
  const ls = lines(db)
  const ms = masters(db)
  const meta = partyMeta(db)
  const closeBy = {}; for (const m of ms) if (m.closing != null) closeBy[m.name] = m.closing
  const primaryOf = {}; for (const l of ls) if (!(l.ledger in primaryOf)) primaryOf[l.ledger] = l.primary
  const primaries = [...new Set(ls.map((l) => l.primary))].filter(Boolean).sort()
  const eff = primary || primaries.find((p) => /debtor|creditor/i.test(p)) || primaries[0]
  // auto-tag TDS / GST / RCM ledgers by name (excluding P&L-primary ledgers),
  // then union with any manual overrides (comma-separated ledger names).
  const allLedgers = [...new Set(ls.map((l) => l.ledger))]
  const tag = (re) => allLedgers.filter((n) => re.test(n) && !isPlPrimary(primaryOf[n]))
  const extra = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean)
  const tds = new Set([...tag(/tds|194/i), ...extra(tdsExtra)])
  const gst = new Set([...tag(/igst|cgst|sgst|utgst|gst|cess/i), ...extra(gstExtra)])
  const rcm = new Set([...tag(/rcm|reverse charge/i), ...extra(rcmExtra)])

  const vs = groupVouchers(ls)
  const P = {}; let unbalanced = 0
  const vdetail = []  // one row per party × voucher (apportioned) → Voucher detail sheet
  for (const [, legs] of vs) {
    if (Math.abs(legs.reduce((s, l) => s + l.amount, 0)) > 0.01) unbalanced++
    const partyLegs = legs.filter((l) => l.primary === eff); if (!partyLegs.length) continue
    const signed = {}; for (const l of partyLegs) signed[l.ledger] = (signed[l.ledger] || 0) + l.amount
    const absTotal = Object.values(signed).reduce((s, x) => s + Math.abs(x), 0); if (!absTotal) continue
    const vdate = partyLegs[0].date || '', vtype = partyLegs[0].vtype || '', vno = partyLegs[0].vno || ''
    const cB = {}, cL = {}
    for (const l of legs) {
      if (l.primary === eff || l.amount === 0) continue
      const b = bucketFor(l, tds, gst, rcm)
      cB[b] = (cB[b] || 0) + l.amount
      const e = (cL[l.ledger] ||= { amt: 0, b }); e.amt += l.amount
    }
    const counterText = Object.entries(cL).sort((a, b) => Math.abs(b[1].amt) - Math.abs(a[1].amt)).map(([n, e]) => `${n}: ${e.amt.toFixed(2)}`).join(' | ')
    for (const [pname, ps] of Object.entries(signed)) {
      const share = Math.abs(ps) / absTotal
      const r = (P[pname] ||= { vch: 0, mv: 0, dr: 0, cr: 0, first: '', last: '', b: Object.fromEntries(BUCKETS.map((k) => [k, 0])), cl: {} })
      r.vch++; r.mv += ps
      if (ps < 0) r.dr += -ps; else if (ps > 0) r.cr += ps
      if (vdate && (!r.first || vdate < r.first)) r.first = vdate
      if (vdate && (!r.last || vdate > r.last)) r.last = vdate
      for (const b of BUCKETS) r.b[b] += (cB[b] || 0) * share
      for (const [cn, e] of Object.entries(cL)) { const x = (r.cl[cn] ||= { amt: 0, b: e.b }); x.amt += e.amt * share }
      vdetail.push([pname, vdate, vtype, vno, r2(ps), ...BUCKETS.map((b) => r2((cB[b] || 0) * share)), counterText])
    }
  }

  const all = Object.entries(P).map(([name, r]) => {
    const net = Number.isFinite(closeBy[name]) ? closeBy[name] : r.mv
    const gap = net - r.mv
    const tdsPct = Math.abs(r.b.Expenses) > 0 ? Math.abs(r.b.TDS) / Math.abs(r.b.Expenses) * 100 : 0
    const gstPct = (Math.abs(r.b.Sales) + Math.abs(r.b.Expenses)) > 0 ? Math.abs(r.b.GST) / (Math.abs(r.b.Sales) + Math.abs(r.b.Expenses)) * 100 : 0
    const tops = Object.entries(r.cl).filter(([, e]) => ['Sales', 'Purchase', 'Expenses', 'Others'].includes(e.b))
      .sort((a, b) => Math.abs(b[1].amt) - Math.abs(a[1].amt)).slice(0, 3).map(([n]) => n).join(', ')
    const active = BUCKETS.some((b) => Math.abs(r.b[b]) > 0.01) || Math.abs(r.mv) > 0.01
    const denom = BUCKETS.reduce((s, b) => s + Math.abs(r.b[b]), 0) || 1
    const md = meta[name] || {}
    return { name, ...r, net, gap, tdsPct, gstPct, tops, active, highOthers: Math.abs(r.b.Others) / denom > 0.25, ...md }
  })

  const zeroTds = all.filter((r) => r.active && Math.abs(r.b.Expenses) > 0 && Math.abs(r.b.TDS) < 1).length
  const zeroGst = all.filter((r) => r.active && (Math.abs(r.b.Sales) + Math.abs(r.b.Expenses)) > 0 && Math.abs(r.b.GST) < 1).length
  const gaps = all.filter((r) => Math.abs(r.gap) > 1).length

  let view = all
  if (hideZero) view = view.filter((r) => r.active)
  if (anomaly === 'Zero TDS') view = view.filter((r) => r.active && Math.abs(r.b.Expenses) > 0 && Math.abs(r.b.TDS) < 1)
  else if (anomaly === 'Zero GST') view = view.filter((r) => r.active && (Math.abs(r.b.Sales) + Math.abs(r.b.Expenses)) > 0 && Math.abs(r.b.GST) < 1)
  else if (anomaly === 'Balance gap') view = view.filter((r) => Math.abs(r.gap) > 1)
  else if (anomaly === 'High others') view = view.filter((r) => r.highOthers)
  if (search) view = view.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
  view = view.sort((a, b) => Math.abs(b.b.Sales + b.b.Purchase + b.b.Expenses) - Math.abs(a.b.Sales + a.b.Purchase + a.b.Expenses))

  const COLS = ['Party', 'GSTIN', 'PAN', 'State', 'Reg type', 'Vch', ...BUCKETS, 'TDS %', 'GST %', 'Debit', 'Credit', 'Movement', 'Net', 'Gap', 'First', 'Last', 'Top counter-ledgers']
  const rows = view.map((r) => [r.name, r.gstin || '', r.pan || '', r.state || '', r.regtype || '', r.vch,
    ...BUCKETS.map((b) => r2(r.b[b])), r2(r.tdsPct), r2(r.gstPct), r2(r.dr), r2(r.cr), r2(r.mv), r2(r.net), r2(r.gap), r.first || '', r.last || '', r.tops])
  const sum = (f) => r2(view.reduce((s, r) => s + f(r), 0))
  rows.push(['TOTAL', '', '', '', '', view.reduce((s, r) => s + r.vch, 0),
    ...BUCKETS.map((b) => sum((r) => r.b[b])), '', '', sum((r) => r.dr), sum((r) => r.cr), sum((r) => r.mv), sum((r) => r.net), sum((r) => r.gap), '', '', ''])

  // ── Sheet: Party × Counter-Ledger pivot (top ledgers by total magnitude) ──
  const ledTot = {}; for (const r of view) for (const [cn, e] of Object.entries(r.cl)) ledTot[cn] = (ledTot[cn] || 0) + Math.abs(e.amt)
  const pivotLedgers = Object.entries(ledTot).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([n]) => n)
  const pivotCols = ['Party', ...pivotLedgers]
  const pivotRows = view.map((r) => [r.name, ...pivotLedgers.map((cn) => r2(r.cl[cn]?.amt || 0))])

  // ── Sheet: Voucher detail (apportioned per party × voucher) ──
  const VD_COLS = ['Party', 'Date', 'Type', 'Voucher', 'Party amt', ...BUCKETS, 'Counter-ledgers']
  const vdNames = new Set(view.map((r) => r.name))
  const vdRows = vdetail.filter((r) => vdNames.has(r[0])).sort((a, b) => String(a[1]).localeCompare(String(b[1])))
  const VD_CAP = 8000
  const vdTrim = vdRows.slice(0, VD_CAP)

  const anomalies = []
  for (const r of all) {
    if (r.active && Math.abs(r.b.Expenses) > 0 && Math.abs(r.b.TDS) < 1) anomalies.push(['Zero TDS', r.name, 'Expenses', r2(r.b.Expenses), 'Expense booked, no TDS deducted'])
    if (r.active && (Math.abs(r.b.Sales) + Math.abs(r.b.Expenses)) > 0 && Math.abs(r.b.GST) < 1) anomalies.push(['Zero GST', r.name, 'Sales+Exp', r2(Math.abs(r.b.Sales) + Math.abs(r.b.Expenses)), 'Taxable activity, no GST line'])
    if (Math.abs(r.gap) > 1) anomalies.push(['Balance gap', r.name, 'Net−Movement', r2(r.gap), 'Closing balance ≠ period movement'])
    if (r.highOthers) anomalies.push(['High others', r.name, 'Others', r2(Math.abs(r.b.Others)), 'Unclassified > 25% of activity'])
  }
  anomalies.sort((a, b) => Math.abs(Number(b[3]) || 0) - Math.abs(Number(a[3]) || 0))

  return { params: [
    { key: 'primary', type: 'select', label: 'Primary group', options: primaries, value: eff },
    { key: 'anomaly', type: 'chips', label: 'Anomaly', options: ['All', 'Zero TDS', 'Zero GST', 'Balance gap', 'High others'], value: anomaly },
    { key: 'hideZero', type: 'toggle', label: 'Hide zero-activity parties', value: hideZero },
    { key: 'search', type: 'search', label: 'Party', placeholder: 'Search party…', value: search },
    { key: 'tdsExtra', type: 'search', label: 'Extra TDS ledgers (comma-sep)', placeholder: 'force-tag as TDS…', value: tdsExtra },
    { key: 'gstExtra', type: 'search', label: 'Extra GST ledgers (comma-sep)', placeholder: 'force-tag as GST…', value: gstExtra },
    { key: 'rcmExtra', type: 'search', label: 'Extra RCM ledgers (comma-sep)', placeholder: 'force-tag as RCM…', value: rcmExtra },
  ], sections: [
      { type: 'note', text: `Each voucher's counter-ledger amounts are pro-rata apportioned to the ${eff} parties on it, bucketed into Sales/Purchase/Expenses/TDS/GST/RCM/Bank/Others. Auto-tagged ledgers — TDS ${tds.size}, GST ${gst.size}, RCM ${rcm.size} (add more via the override boxes). Net = master closing (else period movement); Gap = closing − movement. "Export Excel (all)" writes a 4-sheet workbook: Party matrix, Party × Counter-Ledger pivot, Voucher detail, Anomalies.` },
      { type: 'metrics', items: [
        { l: `${eff} parties`, v: all.length }, { l: 'Active', v: all.filter((r) => r.active).length },
        { l: 'Zero TDS', v: zeroTds, flag: zeroTds > 0 }, { l: 'Zero GST', v: zeroGst, flag: zeroGst > 0 },
        { l: 'Balance gaps', v: gaps, flag: gaps > 0 }, { l: 'Unbalanced vch', v: unbalanced, flag: unbalanced > 0 },
      ] },
      { type: 'table', title: `Party matrix — ${eff}`, columns: COLS, rows },
      ...(pivotLedgers.length ? [{ type: 'table', title: `Party × Counter-Ledger pivot (top ${pivotLedgers.length})`, columns: pivotCols, rows: pivotRows }] : []),
      { type: 'table', title: `Voucher detail${vdRows.length > VD_CAP ? ` (first ${VD_CAP} of ${vdRows.length})` : ''}`, columns: VD_COLS, rows: vdTrim },
      ...(anomalies.length ? [{ type: 'table', title: `Anomalies (${anomalies.length})`, columns: ['Anomaly', 'Party', 'Metric', 'Value', 'Note'], rows: anomalies.slice(0, 300) }] : []),
    ] }
}

// ── Related Party (RPT) Analysis ─────────────────────────────────────────
const RPT_KEYWORDS = ['director', 'directors remuneration', 'managerial remuneration', 'kmp', 'promoter', 'subsidiary', 'holding', 'associate', 'joint venture', 'related party', 'partner', 'proprietor']
function relatedParty(db, { search = '', flag = 'All' } = {}, ctx) {
  const ls = lines(db)
  const sq = search.toLowerCase()
  const tagged = new Set((ctx?.relatedLedgers || []).map((s) => s))
  // auto-suggest by keyword
  const suggested = new Set()
  for (const name of new Set(ls.map((l) => l.ledger))) { const n = name.toLowerCase(); if (RPT_KEYWORDS.some((k) => n.includes(k))) suggested.add(name) }
  const set = tagged.size ? tagged : suggested
  const maxDate = ls.reduce((m, l) => (l.date > m ? l.date : m), '')
  const yearEndCut = maxDate ? `${maxDate.slice(0, 8)}01` : '' // crude: same month start (approx 30d)
  const vs = groupVouchers(ls)
  const byParty = {}; const findings = []
  for (const [, legs] of vs) {
    const pl = legs.filter((l) => set.has(l.ledger)); if (!pl.length) continue
    const byName = {}; for (const l of pl) byName[l.ledger] = (byName[l.ledger] || 0) + l.amount
    for (const [pname, amt] of Object.entries(byName)) {
      const p = (byParty[pname] ||= { vch: 0, dr: 0, cr: 0 }); p.vch++; p.dr += dr(amt); p.cr += cr(amt)
      const flags = []
      const isYE = maxDate && legs[0].date >= yearEndCut; if (isYE) flags.push('Year-end')
      if (Math.abs(amt) % 100000 === 0 && amt !== 0) flags.push('Round amount')
      if (Math.abs(amt) >= 1000000) flags.push('Material')
      if (/journal|jv/i.test(legs[0].vtype)) flags.push('Journal')
      if (flags.length) findings.push([legs[0].date, pname, legs[0].vno, legs[0].vtype, r2(amt), flags.join(', '), (legs.find((l) => l.narration)?.narration || '').slice(0, 40)])
    }
  }
  const ms = masters(db)
  const partyRows = Object.entries(byParty).filter(([p]) => !sq || p.toLowerCase().includes(sq)).map(([p, v]) => { const m = ms.find((x) => x.name === p); return [p, v.vch, r2(v.dr + v.cr), r2(v.dr), r2(v.cr), m?.closing != null ? r2(m.closing) : ''] }).sort((a, b) => b[2] - a[2])
  const findRows = findings.filter((f) => (!sq || f[1].toLowerCase().includes(sq)) && (flag === 'All' || f[5].includes(flag)))
  const vol = partyRows.reduce((s, r) => s + r[2], 0)
  return { params: [
    { key: 'search', type: 'search', label: 'Search party', placeholder: 'Party…', value: search },
    { key: 'flag', type: 'chips', label: 'Findings', options: ['All', 'Year-end', 'Round amount', 'Material', 'Journal'], value: flag },
  ], sections: [
    { type: 'note', text: `Related parties = your custom "related" group${tagged.size ? '' : ' (none defined — using auto-suggested by name: director/KMP/subsidiary/holding/associate/etc.)'}. Tag precisely via Groups for AS-18 / Sec-188 disclosure.` },
    { type: 'metrics', items: [{ l: 'Related parties', v: partyRows.length }, { l: 'Aggregate volume', v: r2(vol), money: true }, { l: 'Audit findings', v: findRows.length, flag: findRows.length > 0 }] },
    { type: 'table', title: 'By party', columns: ['Party', 'Vch', 'Volume', 'Debits', 'Credits', 'Closing'], rows: partyRows },
    { type: 'table', title: 'Audit findings', columns: ['Date', 'Party', 'Voucher', 'Type', 'Amount', 'Flags', 'Narration'], rows: findRows.slice(0, 500) },
  ] }
}

// ── Trial Balance Analysis (opening/during/closing + recon + balance check)
function classifyActivity(o, d, c, tol) { const ho = Math.abs(o) > tol, hm = d > tol, hc = Math.abs(c) > tol; if (!ho && !hm && !hc) return 'never-used'; if (!ho && hm) return 'new'; if (ho && !hm && hc) return 'dormant'; if (ho && hm && !hc) return 'closed'; return 'active' }
function trialBalance(db, { search = '', primary = 'All', activity = 'All', reconOnly = false } = {}) {
  const tol = 0.5
  const sq = search.toLowerCase()
  const mv = {} // ledger -> {dr,cr} during
  for (const l of lines(db)) { const e = (mv[l.ledger] ||= { dr: 0, cr: 0 }); e.dr += dr(l.amount); e.cr += cr(l.amount) }
  const ms = masters(db)
  const rows = []; const act = { dormant: 0, active: 0, new: 0, closed: 0, 'never-used': 0 }; const fails = []
  let oDr = 0, oCr = 0, dDr = 0, dCr = 0, cDr = 0, cCr = 0
  for (const m of ms) {
    const o = m.opening || 0, c = m.closing || 0, d = mv[m.name] || { dr: 0, cr: 0 }
    const a = classifyActivity(o, d.dr || 0, c, tol); act[a]++
    const duringNet = (d.cr || 0) - (d.dr || 0), calcClosing = o + duringNet, delta = calcClosing - c
    if (m.closing != null && Math.abs(delta) > tol) fails.push([m.name, m.primary, r2(o), r2(duringNet), r2(calcClosing), r2(c), r2(delta)])
    oDr += dr(o); oCr += cr(o); dDr += d.dr || 0; dCr += d.cr || 0; cDr += dr(c); cCr += cr(c)
    rows.push([m.name, m.primary, a, m.closing != null ? (Math.abs(delta) <= tol ? 'PASS' : `FAIL Δ${r2(delta)}`) : '—', r2(dr(o)), r2(cr(o)), r2(d.dr || 0), r2(d.cr || 0), r2(dr(c)), r2(cr(c))])
  }
  rows.sort((a, b) => (Math.abs(b[8] - b[9])) - (Math.abs(a[8] - a[9])))
  const primaries = ['All', ...[...new Set(ms.map((m) => m.primary))].filter(Boolean).sort()]
  const dispRows = rows.filter((r) =>
    (!sq || `${r[0]} ${r[1]}`.toLowerCase().includes(sq)) &&
    (primary === 'All' || r[1] === primary) &&
    (activity === 'All' || r[2] === activity) &&
    (!reconOnly || String(r[3]).startsWith('FAIL')))
  const byGroup = {}; for (const m of ms) { const d = mv[m.name] || { dr: 0, cr: 0 }; const g = (byGroup[m.primary] ||= { led: 0, dDr: 0, dCr: 0, cNet: 0 }); g.led++; g.dDr += d.dr || 0; g.dCr += d.cr || 0; g.cNet += (m.closing || 0) }
  const grpRows = Object.entries(byGroup).sort((a, b) => Math.abs(b[1].cNet) - Math.abs(a[1].cNet)).map(([g, v]) => [g, v.led, r2(v.dDr), r2(v.dCr), r2(v.cNet)])
  return { params: [
    { key: 'search', type: 'search', label: 'Search', placeholder: 'Ledger or group…', value: search },
    { key: 'primary', type: 'select', label: 'Primary group', options: primaries, value: primary },
    { key: 'activity', type: 'chips', label: 'Activity', options: ['All', 'active', 'dormant', 'new', 'closed', 'never-used'], value: activity },
    { key: 'reconOnly', type: 'toggle', label: 'Recon failures only', value: reconOnly },
  ], sections: [
    { type: 'metrics', items: [
      { l: 'During Dr', v: r2(dDr), money: true }, { l: 'During Cr', v: r2(dCr), money: true },
      { l: 'During Δ', v: r2(dDr - dCr), money: true, flag: Math.abs(dDr - dCr) > tol },
      { l: 'Recon failures', v: fails.length, flag: fails.length > 0 },
    ] },
    { type: 'note', text: `Activity: ${Object.entries(act).map(([k, v]) => `${k} ${v}`).join(' · ')}. Reconciliation = opening + during = master closing (tolerance ₹0.50).` },
    { type: 'table', title: 'By primary group', columns: ['Group', 'Ledgers', 'During Dr', 'During Cr', 'Closing net'], rows: grpRows },
    { type: 'table', title: 'By ledger (opening / during / closing)', columns: ['Ledger', 'Group', 'Activity', 'Recon', 'Op Dr', 'Op Cr', 'Dur Dr', 'Dur Cr', 'Cl Dr', 'Cl Cr'], rows: dispRows },
    ...(fails.length ? [{ type: 'table', title: `Reconciliation failures (${fails.length})`, columns: ['Ledger', 'Group', 'Opening', 'During net', 'Calc closing', 'Master closing', 'Delta'], rows: fails }] : []),
  ] }
}

// ── Balance Sheet (Schedule III) — ported from FinAnalyzer services/balanceSheet.ts
// Tally closing sign: liability/equity/income = credit (+), asset/expense = debit (-).
// So equity/liab lines use +closing; asset lines NEGATE closing to show positive.
function balanceSheet(db) {
  const ms = masters(db)
  const inGroup = (g) => ms.filter((m) => m.primary === g)
  const sumC = (g) => inGroup(g).reduce((s, m) => s + (m.closing || 0), 0)
  const sumO = (g) => inGroup(g).reduce((s, m) => s + (m.opening || 0), 0)
  const has = (n, s) => n.toLowerCase().includes(s)

  // P&L (for current-year profit folded into Reserves) — voucher-backed P&L groups
  const revenueOps = sumC('Sales Accounts') + sumC('Direct Incomes')
  const otherInc = sumC('Indirect Incomes')
  const purchases = -sumC('Purchase Accounts')
  const directExp = -sumC('Direct Expenses')
  const indirectExp = -sumC('Indirect Expenses')
  const closingStock = -sumC('Stock-in-hand')
  const openingStock = -sumO('Stock-in-hand')
  const changesInv = openingStock - closingStock
  const totalExp = purchases + directExp + indirectExp + changesInv
  const profitBeforeTax = (revenueOps + otherInc) - totalExp

  // Equity
  const shareCapital = inGroup('Capital Account').filter((l) => !has(l.name, 'reserve') && !has(l.name, 'profit')).reduce((s, l) => s + (l.closing || 0), 0)
  const pnlOpening = sumO('Profit & Loss A/c')
  const reserves = sumC('Reserves & Surplus') + inGroup('Capital Account').filter((l) => has(l.name, 'reserve')).reduce((s, l) => s + (l.closing || 0), 0) + pnlOpening + profitBeforeTax
  const totalEquity = shareCapital + reserves
  // Non-current liabilities
  const longTermBorrow = sumC('Secured Loans') + sumC('Unsecured Loans') + sumC('Loans (Liability)')
  const totalNCL = longTermBorrow
  // Current liabilities
  const bankOdInBank = inGroup('Bank Accounts').filter((l) => (l.closing || 0) > 0).reduce((s, l) => s + l.closing, 0)
  const shortTermBorrow = sumC('Bank OD A/c') + bankOdInBank
  const tradePayables = sumC('Sundry Creditors')
  const dutiesNet = sumC('Duties & Taxes')
  const otherCL = sumC('Current Liabilities') + sumC('Branch / Divisions') + sumC('Suspense A/c')
  const provisions = sumC('Provisions')
  const totalCL = shortTermBorrow + tradePayables + dutiesNet + otherCL + provisions
  // Assets (negate closing)
  let grossFA = 0, deprFA = 0
  for (const l of inGroup('Fixed Assets')) { if (has(l.name, 'depreciation') || has(l.name, 'accumulated')) deprFA += (l.closing || 0); else grossFA += -(l.closing || 0) }
  const netFixedAssets = grossFA - deprFA
  const nonCurrentInv = -sumC('Investments')
  const longTermLA = -sumC('Deposits (Asset)') + -sumC('Loans & Advances (Asset)')
  const otherNCA = -sumC('Misc. Expenses (ASSET)')
  const totalNCA = netFixedAssets + nonCurrentInv + longTermLA + otherNCA
  const tradeReceiv = -sumC('Sundry Debtors')
  const cashBank = -sumC('Cash-in-hand') + inGroup('Bank Accounts').filter((l) => (l.closing || 0) < 0).reduce((s, l) => s + -l.closing, 0)
  const otherCA = -sumC('Current Assets')
  const totalCA = closingStock + tradeReceiv + cashBank + otherCA

  const totalEL = totalEquity + totalNCL + totalCL
  const totalAssets = totalNCA + totalCA
  const plug = totalAssets - totalEL // shown on face so the BS always closes

  const L = (label, v, kind, indent = 0) => [`${' '.repeat(indent)}${label}`, kind === 'header' ? '' : r2(v)]
  const rows = [
    L('EQUITY AND LIABILITIES', 0, 'header'),
    L("Shareholders' Funds", 0, 'header', 1),
    L('Share Capital', shareCapital, 'line', 2),
    L('Reserves & Surplus', reserves, 'line', 2),
    L("Total Shareholders' Funds", totalEquity, 'subtotal', 1),
    L('Non-Current Liabilities', 0, 'header', 1),
    L('Long-Term Borrowings', longTermBorrow, 'line', 2),
    L('Total Non-Current Liabilities', totalNCL, 'subtotal', 1),
    L('Current Liabilities', 0, 'header', 1),
    L('Short-Term Borrowings', shortTermBorrow, 'line', 2),
    L('Trade Payables', tradePayables, 'line', 2),
    L('Duties & Taxes (Net)', dutiesNet, 'line', 2),
    L('Other Current Liabilities', otherCL, 'line', 2),
    L('Short-Term Provisions', provisions, 'line', 2),
    L('Total Current Liabilities', totalCL, 'subtotal', 1),
    L('Opening Balance Difference (auto-balance)', plug, 'plug', 1),
    L('TOTAL EQUITY & LIABILITIES', totalEL + plug, 'total'),
    L('ASSETS', 0, 'header'),
    L('Non-Current Assets', 0, 'header', 1),
    L('Fixed Assets (Net)', netFixedAssets, 'line', 2),
    L('Non-Current Investments', nonCurrentInv, 'line', 2),
    L('Long-Term Loans & Advances', longTermLA, 'line', 2),
    L('Other Non-Current Assets', otherNCA, 'line', 2),
    L('Total Non-Current Assets', totalNCA, 'subtotal', 1),
    L('Current Assets', 0, 'header', 1),
    L('Inventories', closingStock, 'line', 2),
    L('Trade Receivables', tradeReceiv, 'line', 2),
    L('Cash & Cash Equivalents', cashBank, 'line', 2),
    L('Other Current Assets', otherCA, 'line', 2),
    L('Total Current Assets', totalCA, 'subtotal', 1),
    L('TOTAL ASSETS', totalAssets, 'total'),
  ]
  return { sections: [
    { type: 'note', text: 'Schedule III balance sheet from ledger closing balances (FinAnalyzer engine). Current-year voucher-backed profit is folded into Reserves; any residual sits in the auto-balance plug so the statement always closes.' },
    { type: 'metrics', items: [
      { l: 'Total equity & liabilities', v: r2(totalEL + plug), money: true },
      { l: 'Total assets', v: r2(totalAssets), money: true },
      { l: 'Profit before tax', v: r2(profitBeforeTax), money: true },
      { l: 'Auto-balance plug', v: r2(plug), money: true, flag: Math.abs(plug) > Math.abs(totalAssets) * 0.05 },
    ] },
    { type: 'table', title: 'Balance Sheet (Schedule III)', columns: ['Particulars', 'Amount (₹)'], rows },
  ] }
}

export const MODULES = [
  { id: 'ledger-analytics', label: 'Accounting Ledger Analytics', icon: '▤', run: ledgerAnalytics,
    desc: 'Per-ledger audit dashboard from master opening/closing balances — flags abnormal (Dr in creditor / Cr in debtor), slow-moving and zero-balance ledgers.' },
  { id: 'voucher-book', label: 'Voucher Book View', icon: '▥', run: voucherBook,
    desc: 'Day-book — one row per voucher with party, narration and Dr/Cr totals. Filter by voucher type.' },
  { id: 'ledger-statement', label: 'Ledger Statement', icon: '▦', run: ledgerStatement,
    desc: 'Single-ledger statement: opening b/f, per-voucher running balance, closing c/f, and a reconciliation check against the master closing balance.' },
  { id: 'party-matrix', label: 'Party Ledger Transaction Matrix', icon: '⊞', run: partyMatrix,
    desc: 'Per-party matrix that apportions each voucher\'s counter-ledgers into Sales / Purchase / Expenses / TDS / GST / RCM / Bank / Others.' },
  { id: 'rpt', label: 'Related Party (RPT) Analysis', icon: '⚇', run: relatedParty,
    desc: 'AS-18 / Sec-188 lens — related-party volumes, outstanding balances and per-transaction audit flags (year-end, round-sum, material, journal).' },
  { id: 'trial-balance', label: 'Trial Balance Analysis', icon: '▣', run: trialBalance,
    desc: 'Opening + during + closing per ledger with the balance-equation reconciliation (opening + during = master closing) and activity classification.' },
  { id: 'balance-sheet', label: 'Balance Sheet (Schedule III)', icon: '⚖', run: balanceSheet,
    desc: 'Ledger closing balances mapped to Schedule III heads (Equity & Liabilities vs Assets) with a tie-out check.' },
]
export const moduleById = (id) => MODULES.find((m) => m.id === id)
