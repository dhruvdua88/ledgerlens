import React, { useMemo } from 'react'
import { isAmountColumn, fmtCell, abbrINR } from '../lib/format.js'

export default function ResultTable({ columns, rows }) {
  const amountCols = useMemo(() => {
    return columns.map((c, i) => isAmountColumn(c, rows.slice(0, 20).map((r) => r[i])))
  }, [columns, rows])

  // headline: first numeric column total (common audit case)
  const headline = useMemo(() => {
    const idx = amountCols.findIndex(Boolean)
    if (idx === -1) return null
    let sum = 0
    for (const r of rows) {
      const v = typeof r[idx] === 'number' ? r[idx] : parseFloat(String(r[idx]).replace(/,/g, ''))
      if (!isNaN(v)) sum += v
    }
    return { col: columns[idx], sum }
  }, [amountCols, rows, columns])

  if (!columns.length) return <div className="empty">No columns returned.</div>

  return (
    <>
      <div className="metrics">
        <div className="metric"><div className="l">Rows</div><div className="v">{rows.length}</div></div>
        {headline && (
          <div className="metric">
            <div className="l">Σ {headline.col}</div>
            <div className="v">{abbrINR(headline.sum)}</div>
          </div>
        )}
      </div>
      <div className="tablewrap" style={{ maxHeight: 420 }}>
        <table className="res">
          <thead>
            <tr>{columns.map((c, i) => <th key={i} className={amountCols[i] ? 'num' : ''}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.slice(0, 500).map((r, ri) => (
              <tr key={ri}>
                {r.map((v, ci) => (
                  <td key={ci} className={amountCols[ci] ? 'num' : ''}>{fmtCell(v, amountCols[ci])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 500 && <div className="hint">Showing first 500 of {rows.length} rows. Export to Excel for all.</div>}
    </>
  )
}
