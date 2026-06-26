// God-tier Text2SQL prompt builder for Indian Tally data.
// Techniques (from Text2SQL research — DAIL-SQL, DIN-SQL, BIRD):
//  - Code Representation: schema as CREATE TABLE DDL (strongest question representation)
//  - Schema linking: full DDL for core tables, names-only for the rest (focus the model)
//  - Evidence block: domain knowledge the model can't infer (BIRD's key lever)
//  - Diverse few-shot exemplars covering the real audit patterns
//  - Strict single-statement output contract

// Core tables get full DDL; everything else is listed by name so the model knows it exists.
const CORE = [
  'daybook_accounting_lines', 'trn_voucher', 'trn_accounting',
  'mst_ledger', 'mst_group', 'mst_stock_item', 'trn_inventory', 'mst_vouchertype',
]

// Short comments on the columns that matter for accounting analysis.
const COL_NOTES = {
  daybook_accounting_lines: {
    amount: 'REAL, signed; sign meaning depends on ledger_is_deemedpositive',
    voucher_type: 'COMPANY-DEFINED label — varies per company. Use the exact values in the DATA DICTIONARY below; never assume "Sales"/"Purchase"/"Tax Invoice".',
    ledger_primary_group: 'Tally reserved primary group (stable across companies) — TRUST THIS for classification, not the ledger name or voucher_type',
    ledger_is_deemedpositive: "'1' = natural debit (assets/expenses); '0' = natural credit (income/liab)",
    party_name: 'free text; usually matches a sundry debtor/creditor ledger',
    voucher_date: "TEXT 'YYYY-MM-DD'",
  },
}

function ddlFor(t) {
  const notes = COL_NOTES[t.table] || {}
  const cols = t.columns.map((c) => {
    const note = notes[c.name] ? `  -- ${notes[c.name]}` : ''
    return `  ${c.name} ${c.type || 'TEXT'},${note}`
  })
  // drop trailing comma on last column line (before any comment)
  return `CREATE TABLE ${t.table} (\n${cols.join('\n').replace(/,(\s*--[^\n]*)?$/, '$1')}\n);`
}

const EVIDENCE = `# EVIDENCE — Tally accounting domain knowledge (use to interpret the question)
- daybook_accounting_lines is the analysis table: one row per ledger line within a voucher. Start here.
- Join keys: daybook already enriched. Else trn_accounting.guid = trn_voucher.guid; trn_accounting.ledger = mst_ledger.name; mst_ledger.parent = mst_group.name.
- NOTHING IS HARDCODED PER COMPANY. voucher_type names and ledger names are company-defined and differ between files. NEVER assume a literal like 'Sales', 'Tax Invoice', 'Purchase' or 'Payment'. When you need a voucher_type, pick the matching value(s) from the DATA DICTIONARY block; when you need a category, classify by ledger_primary_group.
- CLASSIFY BY ledger_primary_group, not by name text. Tally's primary groups are reserved and stable across every company. The exact strings present in THIS db are in the DATA DICTIONARY — copy them verbatim (watch casing, e.g. 'Cash-in-hand'):
    • Sales revenue line  => ledger_primary_group is the sales group (typically 'Sales Accounts').
    • Purchase line       => the purchase group (typically 'Purchase Accounts').
    • GST (input+output)  => the duties/taxes group (typically 'Duties & Taxes'). Do NOT match the substring 'GST' in a ledger name — some clients name the SALES base ledger 'GSTR1' and the PURCHASE base 'GSTR2', which are NOT tax ledgers.
    • Cash => 'Cash-in-hand' group; Bank => 'Bank Accounts' group.
- A "sales voucher" is ANY voucher containing at least one sales-revenue line — identify it by GUID, not by a voucher_type literal:
    voucher_guid IN (SELECT voucher_guid FROM daybook_accounting_lines WHERE ledger_primary_group = '<sales group>')
  This is robust whether the company calls its sales voucher 'Sales', 'Domestic Sale', 'Local Sales', 'Interstate Sales', 'Tax Invoice', etc.
- ⚠ CRITICAL — the duties/taxes group holds BOTH output GST (on sales, a credit) AND input GST (on purchases, a debit). They use the SAME ledgers. If you sum the duties/taxes group across ALL vouchers, input GST nets against output GST and the result is WRONG (often negative).
  WRONG:  SUM(CASE WHEN ledger_primary_group='Duties & Taxes' THEN amount END)  -- over the whole daybook
  RIGHT:  only sum duties/taxes lines whose voucher_guid is a SALES voucher (defined above). ALWAYS scope GST-on-sales to sales vouchers via a JOIN or IN on those guids. Same rule for GST-on-purchases (scope to purchase vouchers).
- "Total sales" = SUM(amount) over sales-revenue lines (signed sum nets credit notes/returns → net sales). "GST on sales" = SUM(amount) over duties/taxes lines that sit inside those same sales vouchers (NEVER across the whole daybook).
- "Turnover" / "exposure" with a party => SUM(ABS(amount)) (a party hits both Dr and Cr so a signed SUM nets to ~0).
- Dr/Cr: ledger_is_deemedpositive='1' => positive amount is a DEBIT; ='0' => positive amount is a CREDIT.
- "Sales with no GST" => a sales voucher (defined above) having no line whose ledger_primary_group is the duties/taxes group.
- Intra-state sale: CGST amount = SGST amount. Inter-state: IGST only (never alongside CGST/SGST).
- Dates are TEXT 'YYYY-MM-DD'; use BETWEEN for ranges; substr(voucher_date,1,7) for month buckets.
- All money is INR. Round money with ROUND(x,2).
- If an ACTIVE SCOPE block is present, you MUST add its ledger/stock filter to the query (see that block).`

const CONTRACT = `# OUTPUT CONTRACT
- Return EXACTLY ONE statement. It MUST start with SELECT or WITH.
- Never INSERT/UPDATE/DELETE/DROP/ALTER/CREATE/PRAGMA/ATTACH.
- Use ONLY tables and columns shown above. Never invent a column.
- Ledger/party/stock-item names are provided ONLY as tokens like @@L42@@. Use the token verbatim inside quotes: WHERE ledger_name = '@@L42@@'. Never write a real name or guess one.
- Output SQL only — no prose, no markdown fences, no explanation. End with a semicolon.
- If the request is broad, still produce one best-effort query (sensible LIMIT for row-level, none for aggregates). Do not ask questions.`

// resolvedGroups = [{ name, ledgerTokens:[], stockTokens:[] }]
// catalog = db.readCatalog output (for the data dictionary); opts.scoped = the resolvedGroups are an ACTIVE mandatory filter.
export function buildSystemPrompt(schema, mask, resolvedGroups, catalog = null, opts = {}) {
  const core = CORE.map((name) => schema.find((t) => t.table === name)).filter(Boolean)
  const coreNames = new Set(core.map((t) => t.table))
  const others = schema.filter((t) => !coreNames.has(t.table)).map((t) => t.table)

  const ddl = core.map(ddlFor).join('\n\n')
  const otherTables = others.length ? `\n# OTHER AVAILABLE TABLES (ask for columns via the schema above if needed)\n${others.join(', ')}` : ''

  const ledgerText = mask.ledgerTokens
    .slice(0, 400)
    .map((l) => `${l.token}\tgroup=${l.primaryGroup}\tparent=${l.parent}\tdeemed+=${l.isDeemedPositive}`)
    .join('\n')

  // Data dictionary: the ACTUAL values present in THIS company's db, so the model
  // never has to guess voucher_type / group names. This is what makes it generic.
  const list = (arr) => (arr && arr.length ? arr.map((v) => `'${v}'`).join(', ') : '(none)')
  const dataDict = catalog
    ? `\n# DATA DICTIONARY — actual values in THIS database (use these EXACT strings; do not invent or assume)
VOUCHER TYPES (${(catalog.voucherTypes || []).length}): ${list(catalog.voucherTypes)}
LEDGER PRIMARY GROUPS (${(catalog.primaries || []).length}): ${list(catalog.primaries)}\n`
    : ''

  const groupText = (resolvedGroups || [])
    .map((g) => {
      const key = g.name.toUpperCase().replace(/\s+/g, '_')
      const parts = []
      if (g.ledgerTokens.length) parts.push(`ledgers [${g.ledgerTokens.join(', ')}]`)
      if (g.stockTokens.length) parts.push(`stock [${g.stockTokens.join(', ')}]`)
      return `${key}: ${parts.join('  ')}`
    })
    .join('\n') || '(none defined)'

  // When the user picked group(s) as scope, the filter is MANDATORY — list the union
  // of tokens explicitly so the model applies it even if the question never names the group.
  let scopeBlock = ''
  if (opts.scoped && (resolvedGroups || []).length) {
    const ledgerTokens = [...new Set(resolvedGroups.flatMap((g) => g.ledgerTokens))]
    const stockTokens = [...new Set(resolvedGroups.flatMap((g) => g.stockTokens))]
    const names = resolvedGroups.map((g) => g.name).join(', ')
    const lines = []
    if (ledgerTokens.length) lines.push(`  AND ledger_name IN (${ledgerTokens.map((t) => `'${t}'`).join(', ')})`)
    if (stockTokens.length) lines.push(`  -- inventory queries: AND name IN (${stockTokens.map((t) => `'${t}'`).join(', ')})`)
    scopeBlock = `\n# ACTIVE SCOPE — MANDATORY FILTER
The user restricted this query to group(s): ${names}.
You MUST constrain the result to these members even if the question does not mention the group:
${lines.join('\n')}\n`
  }

  return `You are a meticulous Indian Chartered Accountant who writes flawless, read-only SQLite queries over Tally accounting data. You translate an auditor's plain-English question into one correct query.

# DATABASE SCHEMA (SQLite)
${ddl}${otherTables}
${dataDict}
${EVIDENCE}

# LEDGER CATALOG (token -> structural attributes; real names withheld for privacy)
${ledgerText}

# USER-DEFINED GROUPS (semantic buckets; filter ledger_name with a group's ledger tokens, item with its stock tokens)
${groupText}
${scopeBlock}
${CONTRACT}`
}

// Diverse, high-signal exemplars (DAIL-SQL style). Generic tokens; teach the patterns.
export const FEW_SHOT = [
  {
    q: 'trial balance — net per ledger with its group',
    sql: `SELECT ledger_name, ledger_primary_group, ROUND(SUM(amount),2) AS net_amount, COUNT(*) AS lines
FROM daybook_accounting_lines
GROUP BY ledger_name, ledger_primary_group
ORDER BY ABS(SUM(amount)) DESC;`,
  },
  {
    q: 'top 10 parties by turnover',
    sql: `SELECT party_name, COUNT(DISTINCT voucher_guid) AS vouchers, ROUND(SUM(ABS(amount)),2) AS turnover
FROM daybook_accounting_lines
WHERE party_name <> ''
GROUP BY party_name
ORDER BY turnover DESC
LIMIT 10;`,
  },
  {
    q: 'sales vouchers with no GST charged',
    sql: `WITH sales AS (SELECT DISTINCT voucher_guid FROM daybook_accounting_lines WHERE ledger_primary_group = 'Sales Accounts'),
     gst AS (SELECT DISTINCT voucher_guid FROM daybook_accounting_lines WHERE ledger_primary_group = 'Duties & Taxes')
SELECT d.voucher_number, d.voucher_date, d.party_name, ROUND(SUM(d.amount),2) AS net
FROM daybook_accounting_lines d JOIN sales s ON d.voucher_guid = s.voucher_guid
WHERE d.voucher_guid NOT IN (SELECT voucher_guid FROM gst)
GROUP BY d.voucher_guid
ORDER BY ABS(net) DESC;`,
  },
  {
    q: 'cash payments over 10000',
    sql: `SELECT d.voucher_date, d.voucher_type, d.voucher_number, d.ledger_name, ROUND(ABS(d.amount),2) AS amount
FROM daybook_accounting_lines d
WHERE d.ledger_primary_group = 'Cash-in-hand' AND ABS(d.amount) > 10000
ORDER BY ABS(d.amount) DESC;`,
  },
  {
    q: 'monthly sales trend',
    sql: `SELECT substr(voucher_date,1,7) AS month, ROUND(SUM(amount),2) AS sales
FROM daybook_accounting_lines
WHERE ledger_primary_group = 'Sales Accounts'
GROUP BY month
ORDER BY month;`,
  },
  {
    q: 'total sales per month and GST thereon',
    // Single-pass SUM(CASE) BUT scoped to sales vouchers via WHERE voucher_guid IN (...).
    // The WHERE is mandatory: without it the duties/taxes total mixes input GST (purchases,
    // negative) with output GST (sales, positive) and the GST column comes out wrong/negative.
    sql: `SELECT substr(voucher_date,1,7) AS month,
       ROUND(SUM(CASE WHEN ledger_primary_group = 'Sales Accounts' THEN amount ELSE 0 END),2) AS sales,
       ROUND(SUM(CASE WHEN ledger_primary_group = 'Duties & Taxes' THEN amount ELSE 0 END),2) AS gst
FROM daybook_accounting_lines
WHERE voucher_guid IN (SELECT voucher_guid FROM daybook_accounting_lines WHERE ledger_primary_group = 'Sales Accounts')
GROUP BY month
ORDER BY month;`,
  },
  {
    q: 'transactions with related parties over 50 lakh (group RELATED_PARTIES defined)',
    sql: `SELECT d.voucher_date, d.voucher_type, d.voucher_number, d.ledger_name, ROUND(d.amount,2) AS amount
FROM daybook_accounting_lines d
WHERE d.ledger_name IN ('@@L7@@','@@L13@@','@@L14@@') AND ABS(d.amount) > 5000000
ORDER BY ABS(d.amount) DESC;`,
  },
]

// prior = [{ maskedQuestion, maskedSql }] — real conversation context for follow-ups.
export function buildMessages(systemPrompt, maskedQuestion, prior = []) {
  const msgs = [{ role: 'system', content: systemPrompt }]
  for (const ex of FEW_SHOT) {
    msgs.push({ role: 'user', content: ex.q })
    msgs.push({ role: 'assistant', content: ex.sql })
  }
  // earlier turns of THIS conversation (so "now only March" / "break that by month" work)
  for (const t of prior) {
    msgs.push({ role: 'user', content: t.maskedQuestion })
    msgs.push({ role: 'assistant', content: t.maskedSql })
  }
  msgs.push({ role: 'user', content: maskedQuestion })
  return msgs
}
