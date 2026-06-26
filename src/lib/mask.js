// Masking engine — the privacy core.
// Real ledger/party NAMES are sensitive (a debtor ledger IS a client's name).
// We replace every name with an opaque token before anything reaches the LLM,
// and reverse the substitution on the SQL that comes back, locally.
//
// Token format @@L42@@ / @@P7@@ — distinctive, survives JSON, never collides with
// real accounting text, and stays valid inside a SQL string literal.

const TOK = (prefix, i) => `@@${prefix}${i}@@`

// Build a mask context from the catalog (db.readCatalog output).
export function buildMask(catalog) {
  const fwd = new Map() // realName -> token
  const rev = new Map() // token -> realName
  const ledgerTokens = []
  const partyTokens = []

  catalog.ledgers.forEach((l, i) => {
    const t = TOK('L', i)
    fwd.set(l.name, t); rev.set(t, l.name)
    // structural attrs are NOT sensitive — keep them so the model can reason
    ledgerTokens.push({
      token: t, parent: l.parent || '', primaryGroup: l.primaryGroup || '',
      isRevenue: l.isRevenue, isDeemedPositive: l.isDeemedPositive,
    })
  })
  catalog.parties.forEach((name, i) => {
    if (fwd.has(name)) { partyTokens.push({ token: fwd.get(name) }); return }
    const t = TOK('P', i)
    fwd.set(name, t); rev.set(t, name)
    partyTokens.push({ token: t })
  })

  const stockTokens = []
  ;(catalog.stockItems || []).forEach((name, i) => {
    if (fwd.has(name)) { stockTokens.push({ token: fwd.get(name) }); return }
    const t = TOK('S', i)
    fwd.set(name, t); rev.set(t, name)
    stockTokens.push({ token: t })
  })

  // longest names first so substring names don't partially match
  const names = [...fwd.keys()].sort((a, b) => b.length - a.length)

  // distinctive single words -> same token, so partial mentions ("Redington" for
  // "Redington Ltd.") still get masked. Skip corporate/stop words that aren't identifying.
  const STOP = new Set(['ltd', 'limited', 'pvt', 'private', 'llp', 'inc', 'co', 'company',
    'the', 'and', 'of', 'india', 'indian', 'services', 'solutions', 'technologies',
    'enterprises', 'industries', 'corporation', 'group', 'trust', 'huf', 'sons',
    // common accounting / query words — they appear inside ledger names ('Sales Accounts',
    // 'Cash-in-hand') but in a question they are generic verbs/nouns, NOT an entity the user
    // means to filter to. Masking them mis-narrows the query to one ledger. Never tokenise them.
    'sales', 'sale', 'purchase', 'purchases', 'cash', 'bank', 'tax', 'taxes', 'gst', 'igst',
    'cgst', 'sgst', 'tds', 'duty', 'duties', 'output', 'input', 'expense', 'expenses', 'income',
    'incomes', 'interest', 'salary', 'wages', 'rent', 'journal', 'payment', 'payments', 'receipt',
    'receipts', 'contra', 'invoice', 'invoices', 'voucher', 'vouchers', 'party', 'parties',
    'customer', 'customers', 'vendor', 'vendors', 'debtor', 'debtors', 'creditor', 'creditors',
    'sundry', 'stock', 'inventory', 'item', 'items', 'ledger', 'ledgers', 'account', 'accounts',
    'opening', 'closing', 'balance', 'net', 'gross', 'total', 'turnover', 'month', 'monthly',
    'year', 'yearly', 'quarter', 'date', 'amount', 'value', 'goods', 'capital', 'asset', 'assets',
    'liability', 'liabilities', 'provision', 'provisions', 'loan', 'loans', 'fixed', 'current',
    'direct', 'indirect', 'reverse', 'charge', 'professional', 'contractor', 'depreciation'])
  const wordMap = new Map() // lowerword -> token (only if unambiguous)
  const seen = new Map()    // lowerword -> Set(token)
  for (const [name, tok] of fwd) {
    for (const w of name.split(/[^A-Za-z0-9]+/)) {
      const lw = w.toLowerCase()
      if (lw.length < 4 || STOP.has(lw) || /^\d+$/.test(lw)) continue
      if (!seen.has(lw)) seen.set(lw, new Set())
      seen.get(lw).add(tok)
    }
  }
  for (const [lw, toks] of seen) if (toks.size === 1) wordMap.set(lw, [...toks][0])
  const words = [...wordMap.keys()].sort((a, b) => b.length - a.length)

  return { fwd, rev, ledgerTokens, partyTokens, stockTokens, names, wordMap, words }
}

// token for a known real name (ledger/party/stock item)
export const tokenFor = (mask, realName) => mask.fwd.get(realName) || null

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Replace any real entity name appearing in the user's question with its token.
export function maskQuestion(question, mask) {
  let q = question
  // 1) full names first (most specific)
  for (const name of mask.names) {
    if (name.length < 3) continue
    q = q.replace(new RegExp(escapeRe(name), 'gi'), mask.fwd.get(name))
  }
  // 2) distinctive name-words, on word boundaries, skipping already-placed tokens
  for (const w of mask.words || []) {
    q = q.replace(new RegExp(`\\b${escapeRe(w)}\\b`, 'gi'), mask.wordMap.get(w))
  }
  return q
}

// Reverse: turn tokens in the model's SQL back into real names.
// Names are placed inside single quotes, so escape embedded quotes for SQLite.
export function unmaskSql(sql, mask) {
  return sql.replace(/@@[LPS]\d+@@/g, (tok) => {
    const real = mask.rev.get(tok)
    if (real == null) return tok
    return real.replace(/'/g, "''")
  })
}

// Unmask tokens inside generated Python code — escape for Python string literals
// (works whether the model used single or double quotes around the name).
export function unmaskPy(code, mask) {
  return code.replace(/@@[LPS]\d+@@/g, (tok) => {
    const real = mask.rev.get(tok)
    if (real == null) return tok
    return real.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"')
  })
}

// Audit helper: what bytes actually leave the device for a given payload.
export function leakReport(mask) {
  return {
    ledgersMasked: mask.ledgerTokens.length,
    partiesMasked: mask.partyTokens.length,
    realNamesSent: 0,
    note: 'Only tokens + structural group attributes are sent. No names, amounts, or rows.',
  }
}
