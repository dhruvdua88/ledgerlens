// In-browser SQLite via sql.js. The database lives only in this tab's memory.
import initSqlJs from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

let SQL = null
async function getSQL() {
  if (!SQL) SQL = await initSqlJs({ locateFile: () => wasmUrl })
  return SQL
}

// Open a .sqlite file (ArrayBuffer). Returns a sql.js Database.
export async function openSqlite(arrayBuffer) {
  const S = await getSQL()
  return new S.Database(new Uint8Array(arrayBuffer))
}

// Load the bundled sample (Cache Digitech) for instant demo.
export async function openSample() {
  const res = await fetch('./sample_data/cache_digitech.sqlite')
  if (!res.ok) throw new Error('sample db not found')
  return openSqlite(await res.arrayBuffer())
}

// Run a SELECT, return { columns, rows } where rows are arrays.
export function runQuery(db, sql) {
  const res = db.exec(sql) // throws on bad SQL
  if (!res.length) return { columns: [], rows: [] }
  return { columns: res[0].columns, rows: res[0].values }
}

// Pull the catalog needed for masking + prompt building.
// daybook_accounting_lines is the enriched table the Tally loader writes.
export function readCatalog(db) {
  const tableExists = (t) =>
    db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${t}'`).length > 0

  const hasDaybook = tableExists('daybook_accounting_lines')
  const ledgerSql = hasDaybook
    ? `SELECT DISTINCT ledger_name AS name, ledger_parent AS parent,
              ledger_primary_group AS pg, ledger_is_revenue AS rev, ledger_is_deemedpositive AS dp
       FROM daybook_accounting_lines WHERE ledger_name IS NOT NULL`
    : `SELECT l.name AS name, l.parent AS parent, g.primary_group AS pg,
              l.is_revenue AS rev, l.is_deemedpositive AS dp
       FROM mst_ledger l LEFT JOIN mst_group g ON l.parent = g.name`

  const ledgers = (db.exec(ledgerSql)[0]?.values || []).map((r) => ({
    name: r[0], parent: r[1], primaryGroup: r[2], isRevenue: r[3], isDeemedPositive: r[4],
  }))

  const partySql = hasDaybook
    ? `SELECT DISTINCT party_name FROM daybook_accounting_lines WHERE party_name <> '' AND party_name IS NOT NULL`
    : `SELECT DISTINCT party_name FROM trn_voucher WHERE party_name <> '' AND party_name IS NOT NULL`
  const parties = (db.exec(partySql)[0]?.values || []).map((r) => r[0])

  // distinct primary groups + parent groups (for group-builder dropdowns)
  const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b))
  const primaries = uniq(ledgers.map((l) => l.primaryGroup))
  const parents = uniq(ledgers.map((l) => l.parent))

  // distinct voucher types ACTUALLY present in this company's data — these names are
  // user-defined in Tally and differ across companies, so we read them, never assume.
  const vtSql = hasDaybook
    ? `SELECT DISTINCT voucher_type FROM daybook_accounting_lines WHERE voucher_type IS NOT NULL AND voucher_type <> ''`
    : `SELECT DISTINCT voucher_type FROM trn_voucher WHERE voucher_type IS NOT NULL AND voucher_type <> ''`
  let voucherTypes = []
  try { voucherTypes = uniq((db.exec(vtSql)[0]?.values || []).map((r) => r[0])) } catch { /* no vouchers */ }

  // stock items (4th group basis)
  let stockItems = []
  try {
    if (tableExists('mst_stock_item')) {
      stockItems = (db.exec(`SELECT name FROM mst_stock_item WHERE name <> '' ORDER BY name`)[0]?.values || []).map((r) => r[0])
    }
  } catch { /* no stock items */ }

  return { hasDaybook, ledgers, parties, primaries, parents, stockItems, voucherTypes }
}

// Company name from the Tally export metadata (falls back to null).
export function readCompany(db) {
  const q = (sql) => { try { return db.exec(sql)[0]?.values?.[0]?.[0] || null } catch { return null } }
  return q("SELECT value FROM _export_info WHERE name='company_name' LIMIT 1")
    || q("SELECT value FROM config WHERE name='Company Name' LIMIT 1")
    || null
}

// Schema text (table -> columns) for the system prompt. Hides _llm_* helper tables.
export function readSchema(db) {
  const rows = db.exec(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_llm_%' ORDER BY name`
  )[0]?.values || []
  const out = []
  for (const [t] of rows) {
    const cols = db.exec(`PRAGMA table_info("${t}")`)[0]?.values || []
    out.push({ table: t, columns: cols.map((c) => ({ name: c[1], type: c[2] || 'TEXT' })) })
  }
  return out
}
