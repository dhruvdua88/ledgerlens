// Read-only SQL guard. Runs on the model's output BEFORE execution.
const BANNED = /\b(insert|update|delete|drop|alter|create|replace|attach|detach|pragma|vacuum|reindex|trigger)\b/i

export function sanitizeSql(raw) {
  let sql = (raw || '').trim()

  // 1) drop reasoning blocks (R1-style reasoning models, e.g. Arctic-Text2SQL-R1)
  sql = sql.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  // if an unclosed <think> remains, keep only what's after it
  const t = sql.lastIndexOf('</think>')
  if (t !== -1) sql = sql.slice(t + 8).trim()

  // 2) prefer the last fenced ```sql block if present
  const fences = [...sql.matchAll(/```sql\s*([\s\S]*?)```/gi)]
  if (fences.length) sql = fences[fences.length - 1][1].trim()
  else sql = sql.replace(/^```sql\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '').trim()

  // 3) if there's prose before the query, start at the last SELECT/WITH
  const m = sql.match(/\b(WITH|SELECT)\b[\s\S]*$/i)
  if (m) sql = m[0].trim()

  // 4) single statement only — cut at first semicolon, keep it
  const semi = sql.indexOf(';')
  if (semi !== -1) sql = sql.slice(0, semi + 1)
  return sql.trim()
}

export function assertReadOnly(sql) {
  const s = sql.trim().toLowerCase()
  if (!(s.startsWith('select') || s.startsWith('with'))) {
    throw new Error('Blocked: query must start with SELECT or WITH.')
  }
  if (BANNED.test(sql)) {
    throw new Error('Blocked: query contains a write/DDL keyword.')
  }
  if ((sql.match(/;/g) || []).length > 1) {
    throw new Error('Blocked: multiple statements are not allowed.')
  }
  return true
}

// Add a safety LIMIT if the model wrote a bare SELECT with no aggregate/limit.
export function withRowCap(sql, cap = 1000) {
  const s = sql.toLowerCase()
  if (/\blimit\b/.test(s)) return sql
  if (/\b(group by|count\(|sum\(|avg\(|min\(|max\()/.test(s)) return sql
  return sql.replace(/;?\s*$/, ` LIMIT ${cap};`)
}
