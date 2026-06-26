// Persistent chat history — one transcript per company, survives tab switches
// (state lives in App) and reloads (localStorage). Rows/turns capped to bound size.
const PREFIX = 'll_hist_'
const MAX_TURNS = 40
const MAX_ROWS_PER_TURN = 200

const key = (companyKey) => PREFIX + (companyKey || 'default')

export function loadHistory(companyKey) {
  try { return JSON.parse(localStorage.getItem(key(companyKey)) || '[]') } catch { return [] }
}
export function saveHistory(companyKey, turns) {
  const trimmed = turns.slice(-MAX_TURNS).map((t) =>
    t.rows && t.rows.length > MAX_ROWS_PER_TURN ? { ...t, rows: t.rows.slice(0, MAX_ROWS_PER_TURN), rowsTruncated: true } : t
  )
  try { localStorage.setItem(key(companyKey), JSON.stringify(trimmed)) } catch { /* quota */ }
}
export function clearHistory(companyKey) {
  localStorage.removeItem(key(companyKey))
}

let c = 0
export const turnId = () => `t${Date.now().toString(36)}${c++}`

// Compact prior context for the SQL prompt: last N sql turns as {q, sql} using masked forms.
export function priorContext(history, n = 3) {
  return history
    .filter((t) => t.kind === 'sql' && !t.error && t.maskedQuestion && t.maskedSql)
    .slice(-n)
    .map((t) => ({ maskedQuestion: t.maskedQuestion, maskedSql: t.maskedSql }))
}
