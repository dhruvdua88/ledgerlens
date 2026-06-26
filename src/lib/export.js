// Excel export with a provenance sheet — the result becomes an audit working paper.
import * as XLSX from 'xlsx'

export function exportToExcel({ question, sql, columns, rows, model }) {
  const wb = XLSX.utils.book_new()

  const dataAoa = [columns, ...rows]
  const wsData = XLSX.utils.aoa_to_sheet(dataAoa)
  XLSX.utils.book_append_sheet(wb, wsData, 'Result')

  const prov = [
    ['LedgerLens — working paper'],
    [],
    ['Question', question],
    ['Generated SQL', sql],
    ['Model', model || ''],
    ['Run at', new Date().toLocaleString('en-IN')],
    ['Rows returned', rows.length],
    [],
    ['Note', 'Data queried locally in-browser. No client data left the device.'],
  ]
  const wsProv = XLSX.utils.aoa_to_sheet(prov)
  wsProv['!cols'] = [{ wch: 16 }, { wch: 90 }]
  XLSX.utils.book_append_sheet(wb, wsProv, 'Provenance')

  const stamp = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `ledgerlens_${stamp}.xlsx`)
}
