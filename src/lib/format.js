// Indian number formatting + value helpers for the result table.

const looksLikeAmountCol = (name) =>
  /amount|amt|net|total|debit|credit|balance|value|opening|closing|tax|turnover|gross|sum|paid|received|outstanding|exposure|rupees|inr|\bdr\b|\bcr\b|during|\bop\b/i.test(name)

export function isAmountColumn(colName, sampleValues) {
  if (!looksLikeAmountCol(colName)) return false
  const nums = sampleValues.filter((v) => typeof v === 'number' || /^-?[\d.,]+$/.test(String(v)))
  return nums.length >= Math.max(1, sampleValues.length * 0.6)
}

// 12345678 -> "1,23,45,678"  (Indian grouping)
export function indianGroup(n) {
  const neg = n < 0
  let s = Math.abs(Math.round(n)).toString()
  let last3 = s.slice(-3)
  let rest = s.slice(0, -3)
  if (rest) last3 = ',' + last3
  rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')
  return (neg ? '-' : '') + rest + last3
}

// abbreviated: ₹1.71 Cr / ₹9.09 L / ₹4,250
export function abbrINR(n) {
  const a = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)} Cr`
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(2)} L`
  return `${sign}₹${indianGroup(a)}`
}

export function fmtCell(value, isAmount) {
  if (value == null) return ''
  if (isAmount) {
    const num = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''))
    if (!isNaN(num)) return indianGroup(num)
  }
  return String(value)
}
