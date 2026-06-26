import React, { useMemo, useState } from 'react'
import { abbrINR, isAmountColumn, fmtCell } from '../lib/format.js'
import { exportStyledWorkbook } from '../lib/excelStyle.js'

const CHIPS = ['blue', 'slate', 'amber', 'green']

// numeric column = amount-like OR mostly-numeric values
function numericCols(columns, rows) {
  return columns.map((c, i) => {
    if (isAmountColumn(c, rows.slice(0, 20).map((r) => r[i]))) return true
    const vals = rows.slice(0, 20).map((r) => r[i]).filter((v) => v != null && v !== '')
    if (!vals.length) return false
    return vals.every((v) => typeof v === 'number' || /^-?[\d.,]+$/.test(String(v)))
  })
}

function Table({ title, columns, rows, onExport }) {
  const num = useMemo(() => numericCols(columns, rows), [columns, rows])
  const money = useMemo(() => columns.map((c, i) => isAmountColumn(c, rows.slice(0, 20).map((r) => r[i]))), [columns, rows])
  return (
    <div className="fa-tcard">
      <div className="thead">
        <div className="t">{title} <span className="n">· {rows.length} rows</span></div>
        <button className="fa-export" onClick={onExport}>⤓ Export Excel</button>
      </div>
      <div className="fa-tbl-wrap">
        <table className="fa-tbl">
          <thead><tr>{columns.map((c, i) => <th key={i} className={num[i] ? 'num' : ''}>{c}</th>)}</tr></thead>
          <tbody>
            {rows.slice(0, 1000).map((r, ri) => (
              <tr key={ri}>{r.map((v, ci) => <td key={ci} className={num[ci] ? 'num' : ''}>{money[ci] ? fmtCell(v, true) : (v == null ? '' : String(v))}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function ModuleView({ db, module, ctx }) {
  const [params, setParams] = useState({})
  const out = useMemo(() => {
    if (!db || !module) return null
    try { return module.run(db, params, ctx) } catch (e) { return { sections: [{ type: 'note', text: 'Error: ' + e.message }] } }
  }, [db, module, params, ctx])

  if (!db) return <div className="body"><div className="empty">Load data first.</div></div>
  if (!out) return null

  const tables = out.sections.filter((s) => s.type === 'table')
  const fileBase = module.label.replace(/[^\w]+/g, '_')
  const exportAll = () => exportStyledWorkbook({
    fileBase, title: module.label,
    subtitle: tables.length > 1 ? `${tables.length} sheets` : (tables[0]?.title || ''),
    sheets: tables.map((t) => ({ name: t.title, title: `${module.label} — ${t.title}`, columns: t.columns, rows: t.rows })),
  })
  const exportOne = (t) => exportStyledWorkbook({ fileBase: fileBase + '_' + t.title.replace(/[^\w]+/g, '_'), title: `${module.label} — ${t.title}`, subtitle: '', sheets: [{ name: t.title, columns: t.columns, rows: t.rows }] })

  return (
    <div className="body fa">
      <div className="fa-head">
        <div style={{ display: 'flex', gap: 14 }}>
          <div className="ic">{module.icon || '▦'}</div>
          <div><h2>{module.label}</h2>{module.desc && <p>{module.desc}</p>}</div>
        </div>
        {tables.length > 0 && <button className="fa-export" onClick={exportAll}>⤓ Export Excel{tables.length > 1 ? ' (all)' : ''}</button>}
      </div>

      {!!out.params?.length && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
          {out.params.map((p) => (
            <label key={p.key} style={{ fontSize: 13, color: '#475569', fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {p.label}
              <select value={params[p.key] ?? p.value} onChange={(e) => setParams((s) => ({ ...s, [p.key]: e.target.value }))}
                style={{ minWidth: 260, padding: '8px 11px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13 }}>
                {p.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}

      {out.sections.map((s, i) => {
        if (s.type === 'note') return <div key={i} className="fa-note">{s.text}</div>
        if (s.type === 'metrics') return (
          <div key={i} className="fa-cards">
            {s.items.map((m, j) => (
              <div key={j} className={`fa-card ${m.flag ? 'red' : ''}`}>
                <div className="top">
                  <span className="lbl">{m.l}</span>
                  <span className={`chip ${m.flag ? 'red' : CHIPS[j % CHIPS.length]}`}>{m.flag ? '!' : '◆'}</span>
                </div>
                <div className="val">{m.money ? abbrINR(Number(m.v) || 0) : (typeof m.v === 'number' ? m.v.toLocaleString('en-IN') : m.v)}</div>
              </div>
            ))}
          </div>
        )
        if (s.type === 'table') return <Table key={i} title={s.title} columns={s.columns} rows={s.rows} onExport={() => exportOne(s)} />
        return null
      })}
    </div>
  )
}
