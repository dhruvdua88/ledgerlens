// Saved queries + profile export/import.
// A "profile" bundles the user's saved queries, custom groups, and non-secret prefs
// into one portable JSON file. API keys are NEVER exported.
import { loadGroups, saveGroups } from './groups.js'

const SQ_KEY = 'll_saved_queries'
let c = 0
const sqId = () => `q${Date.now().toString(36)}${c++}`

export function loadSavedQueries() {
  try { return JSON.parse(localStorage.getItem(SQ_KEY) || '[]') } catch { return [] }
}
export function persistSavedQueries(list) {
  localStorage.setItem(SQ_KEY, JSON.stringify(list))
}
export function makeSavedQuery(question, sql) {
  return { id: sqId(), question, sql: sql || '', at: new Date().toISOString() }
}

const PROFILE_VERSION = 1

// Build the portable profile object. prefs excludes apiKey.
export function buildProfile({ groups, savedQueries, prefs, company }) {
  const { provider, model, localBaseUrl, localModel, rate } = prefs || {}
  return {
    app: 'LedgerLens',
    version: PROFILE_VERSION,
    exportedAt: new Date().toISOString(),
    company: company || null,
    groups: groups || [],
    savedQueries: savedQueries || [],
    prefs: { provider, model, localBaseUrl, localModel, rate }, // no apiKey, ever
  }
}

export function downloadProfile(profile, name) {
  const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(name || 'ledgerlens').replace(/[^\w-]+/g, '_')}.llprofile.json`
  a.click()
  URL.revokeObjectURL(url)
}

// Parse + validate an imported profile file.
export async function readProfileFile(file) {
  const text = await file.text()
  let data
  try { data = JSON.parse(text) } catch { throw new Error('Not a valid JSON profile file.') }
  if (data.app !== 'LedgerLens') throw new Error('This file is not a LedgerLens profile.')
  return {
    groups: Array.isArray(data.groups) ? data.groups : [],
    savedQueries: Array.isArray(data.savedQueries) ? data.savedQueries : [],
    prefs: data.prefs || {},
    company: data.company || null,
    exportedAt: data.exportedAt,
  }
}

// Merge imported items into current localStorage (dedupe by id; imported wins on clash).
// Returns the merged { groups, savedQueries } so the app can update state.
export function mergeProfileIntoStorage(imported) {
  const curGroups = loadGroups()
  const gMap = new Map(curGroups.map((g) => [g.id, g]))
  for (const g of imported.groups) gMap.set(g.id, g)
  const groups = [...gMap.values()]
  saveGroups(groups)

  const curQ = loadSavedQueries()
  const qMap = new Map(curQ.map((q) => [q.id, q]))
  for (const q of imported.savedQueries) qMap.set(q.id, q)
  const savedQueries = [...qMap.values()]
  persistSavedQueries(savedQueries)

  return { groups, savedQueries }
}
