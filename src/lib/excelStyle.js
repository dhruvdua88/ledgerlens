// Styled Excel export mirroring FinAnalyzer (xlsx-js-style).
// Title band (deep slate), period/generated sub-rows, slate column-header row,
// Indian accounting number format on money columns, zebra body, autofilter.
import * as XLSX from 'xlsx-js-style'

const FONT = 'Calibri'
const P = {
  band: '0F2440', bandText: 'FFFFFF', section: 'E2E8F0', sectionText: '0F172A',
  text: '0F172A', border: 'CBD5E1', borderDark: '94A3B8', zebra: 'F8FAFC', total: 'E8EEF5',
}
const NUMFMT_MONEY = '_(* ##,##,##,##0.00_);_(* (##,##,##,##0.00);_(* "Nil"_)'
const NUMFMT_INT = '##,##,##,##0;[Red](##,##,##,##0);"-"'

const isMoneyName = (n) => /amount|amt|net|total|debit|credit|balance|value|turnover|gross|opening|closing|tax|paid|received|exposure|₹|\bdr\b|\bcr\b|during|\bop\b/i.test(String(n))
const toNum = (v) => { if (typeof v === 'number') return v; const n = parseFloat(String(v).replace(/,/g, '')); return isNaN(n) ? null : n }

// classify each column: 'money' | 'int' | 'text'
function colTypes(columns, rows) {
  return columns.map((c, i) => {
    const vals = rows.slice(0, 30).map((r) => r[i])
    const nums = vals.map(toNum).filter((x) => x !== null)
    const numeric = vals.length && nums.length >= Math.max(1, vals.length * 0.6)
    if (!numeric) return 'text'
    if (isMoneyName(c)) return 'money'
    return nums.every((n) => Number.isInteger(n)) ? 'int' : 'money'
  })
}

function buildSheet({ title, subtitle, columns, rows }) {
  const types = colTypes(columns, rows)
  const ncol = columns.length
  const aoa = [[title], [subtitle || ''], [`Generated: ${new Date().toLocaleString('en-IN')}`], [], columns]
  const headerR = 4
  for (const r of rows) aoa.push(r.map((v, i) => (types[i] !== 'text' ? (toNum(v) ?? v) : v)))
  const ws = XLSX.utils.aoa_to_sheet(aoa)

  ws['!merges'] = [0, 1, 2].map((r) => ({ s: { r, c: 0 }, e: { r, c: Math.max(0, ncol - 1) } }))
  const set = (r, c, s) => { const ref = XLSX.utils.encode_cell({ r, c }); if (!ws[ref]) ws[ref] = { t: 's', v: '' }; ws[ref].s = s }

  set(0, 0, { font: { name: FONT, bold: true, sz: 14, color: { rgb: P.bandText } }, fill: { patternType: 'solid', fgColor: { rgb: P.band } }, alignment: { horizontal: 'center', vertical: 'center' } })
  set(1, 0, { font: { name: FONT, sz: 11, color: { rgb: P.bandText } }, fill: { patternType: 'solid', fgColor: { rgb: P.band } }, alignment: { horizontal: 'center' } })
  set(2, 0, { font: { name: FONT, italic: true, sz: 9, color: { rgb: P.sectionText } }, alignment: { horizontal: 'center' } })

  for (let c = 0; c < ncol; c++) set(headerR, c, {
    font: { name: FONT, bold: true, sz: 11, color: { rgb: P.sectionText } },
    fill: { patternType: 'solid', fgColor: { rgb: P.section } },
    alignment: { horizontal: types[c] === 'text' ? 'left' : 'right', vertical: 'center', wrapText: true },
    border: { bottom: { style: 'thin', color: { rgb: P.borderDark } } },
  })

  for (let i = 0; i < rows.length; i++) {
    const r = headerR + 1 + i, zebra = i % 2 === 1
    for (let c = 0; c < ncol; c++) {
      const t = types[c]
      set(r, c, {
        font: { name: FONT, sz: 11, color: { rgb: P.text } },
        alignment: { horizontal: t === 'text' ? 'left' : 'right', vertical: 'center' },
        ...(t === 'money' ? { numFmt: NUMFMT_MONEY } : t === 'int' ? { numFmt: NUMFMT_INT } : {}),
        ...(zebra ? { fill: { patternType: 'solid', fgColor: { rgb: P.zebra } } } : {}),
      })
    }
  }

  ws['!cols'] = columns.map((c, i) => ({ wch: types[i] !== 'text' ? 16 : Math.max(12, Math.min(42, String(c).length + 8)) }))
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: headerR, c: 0 }, e: { r: headerR + rows.length, c: Math.max(0, ncol - 1) } }) }
  ws['!freeze'] = { xSplit: 0, ySplit: headerR + 1 }
  return ws
}

// sheets: [{ name, title?, columns, rows }]
export function exportStyledWorkbook({ fileBase, title, subtitle, sheets }) {
  const wb = XLSX.utils.book_new()
  const used = new Set()
  for (const sh of sheets) {
    let name = (sh.name || 'Sheet').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet'
    while (used.has(name)) name = (name.slice(0, 28) + '_' + (used.size)).slice(0, 31)
    used.add(name)
    XLSX.utils.book_append_sheet(wb, buildSheet({ title: sh.title || title, subtitle, columns: sh.columns, rows: sh.rows }), name)
  }
  XLSX.writeFile(wb, `${fileBase}_${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true, cellStyles: true })
}
