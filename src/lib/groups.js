// User-defined semantic groups. A group mixes selectors across 4 bases and
// resolves to concrete members against the CURRENT catalog (rule-based = auto-refresh).
//
// group = {
//   id, name, color,
//   sel: { primary:[], parent:[], ledger:[], stockitem:[] },  // include rules
//   exclude: []   // ledger names to subtract
// }

const LS_KEY = 'll_groups'
let counter = 0
export const newGroupId = () => `g${Date.now().toString(36)}${counter++}`

export const COLORS = ['#534AB7', '#0F6E56', '#185FA5', '#854F0B', '#A32D2D', '#993556']

export function emptyGroup() {
  return { id: newGroupId(), name: '', color: COLORS[0], sel: { primary: [], parent: [], ledger: [], stockitem: [] }, exclude: [] }
}

export function loadGroups() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}
export function saveGroups(groups) {
  localStorage.setItem(LS_KEY, JSON.stringify(groups))
}

// Resolve a group to member ledger names + stock item names against the catalog.
export function resolveGroup(group, catalog) {
  const ledgerSet = new Set()
  const byPrimary = new Set(group.sel.primary)
  const byParent = new Set(group.sel.parent)
  for (const l of catalog.ledgers) {
    if (byPrimary.has(l.primaryGroup)) ledgerSet.add(l.name)
    if (byParent.has(l.parent)) ledgerSet.add(l.name)
  }
  for (const name of group.sel.ledger) ledgerSet.add(name)
  for (const x of group.exclude) ledgerSet.delete(x)

  const stockItems = [...new Set(group.sel.stockitem)]
  return { ledgers: [...ledgerSet], stockItems }
}

export function memberCount(group, catalog) {
  const r = resolveGroup(group, catalog)
  return r.ledgers.length + r.stockItems.length
}

// Build the token-bucket view of selected groups for the prompt (no real names).
export function resolveTokens(groups, catalog, mask) {
  return groups.map((g) => {
    const r = resolveGroup(g, catalog)
    return {
      name: g.name,
      ledgerTokens: r.ledgers.map((n) => mask.fwd.get(n)).filter(Boolean),
      stockTokens: r.stockItems.map((n) => mask.fwd.get(n)).filter(Boolean),
    }
  }).filter((g) => g.ledgerTokens.length || g.stockTokens.length)
}
