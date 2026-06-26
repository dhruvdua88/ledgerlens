import React, { useMemo, useState } from 'react'
import { emptyGroup, resolveGroup, COLORS } from '../lib/groups.js'

const BASES = [
  { key: 'primary', label: 'Primary group', hint: 'All ledgers under a Tally primary group' },
  { key: 'parent', label: 'Parent group', hint: 'All ledgers under a parent group' },
  { key: 'ledger', label: 'Ledger', hint: 'Hand-pick individual ledgers' },
  { key: 'stockitem', label: 'Stock item', hint: 'Pick inventory items' },
]

function optionsFor(basis, catalog) {
  if (basis === 'primary') return catalog.primaries
  if (basis === 'parent') return catalog.parents
  if (basis === 'ledger') return catalog.ledgers.map((l) => l.name)
  if (basis === 'stockitem') return catalog.stockItems
  return []
}

export default function GroupManager({ catalog, groups, onSave, onDelete }) {
  const [editing, setEditing] = useState(null) // group being edited
  const [basis, setBasis] = useState('primary')
  const [search, setSearch] = useState('')

  const startNew = () => { setEditing(emptyGroup()); setBasis('primary'); setSearch('') }
  const startEdit = (g) => { setEditing(JSON.parse(JSON.stringify(g))); setBasis('primary'); setSearch('') }

  const opts = useMemo(() => {
    if (!editing) return []
    const all = optionsFor(basis, catalog)
    const q = search.toLowerCase()
    return all.filter((o) => o.toLowerCase().includes(q)).slice(0, 300)
  }, [basis, search, editing, catalog])

  const resolved = useMemo(() => editing ? resolveGroup(editing, catalog) : null, [editing, catalog])

  function toggle(value) {
    const cur = new Set(editing.sel[basis])
    cur.has(value) ? cur.delete(value) : cur.add(value)
    setEditing({ ...editing, sel: { ...editing.sel, [basis]: [...cur] } })
  }
  const selectedSet = new Set(editing?.sel[basis] || [])
  const totalSelectors = (g) => Object.values(g.sel).reduce((s, a) => s + a.length, 0)

  if (!editing) {
    return (
      <div className="body">
        <div className="panel" style={{ maxWidth: 720 }}>
          <h3>Groups</h3>
          <p className="muted">Define your own semantic buckets (Related parties, Cash equivalents, GST output…). Mix bases freely — a primary-group rule plus a few hand-picked ledgers. Rules auto-refresh on the next data load. Pick them per query in the chat.</p>
          <div className="actions" style={{ marginBottom: 16 }}>
            <button className="btn pri" onClick={startNew}>＋ New group</button>
          </div>
          {!groups.length && <div className="empty">No groups yet. Create one to teach the assistant your vocabulary.</div>}
          {groups.map((g) => {
            const r = resolveGroup(g, catalog)
            return (
              <div key={g.id} className="kv" style={{ alignItems: 'center' }}>
                <span className="k" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: g.color, display: 'inline-block' }} />
                  <b style={{ color: 'var(--text)', fontWeight: 500 }}>{g.name || '(unnamed)'}</b>
                  <span style={{ color: 'var(--text-3)' }}>· {r.ledgers.length} ledgers{r.stockItems.length ? `, ${r.stockItems.length} items` : ''}</span>
                </span>
                <span style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" onClick={() => startEdit(g)}>Edit</button>
                  <button className="btn" onClick={() => onDelete(g.id)}>Delete</button>
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="body">
      <div className="panel" style={{ maxWidth: 760 }}>
        <h3>{editing.name ? `Edit: ${editing.name}` : 'New group'}</h3>

        <div className="field" style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label>Group name</label>
            <input value={editing.name} placeholder="e.g. Related parties" onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </div>
          <div>
            <label>Colour</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {COLORS.map((c) => (
                <span key={c} onClick={() => setEditing({ ...editing, color: c })}
                  style={{ width: 22, height: 22, borderRadius: 6, background: c, cursor: 'pointer', outline: editing.color === c ? '2px solid var(--text)' : 'none', outlineOffset: 2 }} />
              ))}
            </div>
          </div>
        </div>

        <label style={{ fontSize: 13, fontWeight: 500 }}>Add members by</label>
        <div style={{ display: 'flex', gap: 6, margin: '6px 0 4px', flexWrap: 'wrap' }}>
          {BASES.map((b) => (
            <span key={b.key} className="chip" onClick={() => { setBasis(b.key); setSearch('') }}
              style={basis === b.key ? { borderColor: 'var(--purple)', color: 'var(--purple)', background: 'var(--purple-100)' } : {}}>
              {b.label} {editing.sel[b.key].length ? `(${editing.sel[b.key].length})` : ''}
            </span>
          ))}
        </div>
        <p className="muted" style={{ margin: '2px 0 8px' }}>{BASES.find((b) => b.key === basis).hint}</p>

        <input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
        <div className="tablewrap" style={{ maxHeight: 240, marginBottom: 14 }}>
          <table className="res">
            <tbody>
              {opts.map((o) => (
                <tr key={o} onClick={() => toggle(o)} style={{ cursor: 'pointer' }}>
                  <td style={{ width: 28 }}>{selectedSet.has(o) ? '☑' : '☐'}</td>
                  <td>{o}</td>
                </tr>
              ))}
              {!opts.length && <tr><td style={{ color: 'var(--text-3)' }}>No matches</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="metrics" style={{ marginBottom: 14 }}>
          <div className="metric"><div className="l">Resolves to</div><div className="v">{resolved.ledgers.length} ledgers</div></div>
          {!!resolved.stockItems.length && <div className="metric"><div className="l">Stock items</div><div className="v">{resolved.stockItems.length}</div></div>}
          <div className="metric"><div className="l">Selectors</div><div className="v">{totalSelectors(editing)}</div></div>
        </div>

        {!!resolved.ledgers.length && (
          <details style={{ marginBottom: 14 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--blue-700)' }}>Preview resolved members ({resolved.ledgers.length})</summary>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 8, lineHeight: 1.8 }}>
              {resolved.ledgers.slice(0, 60).map((n) => (
                <span key={n} style={{ background: 'var(--bg-3)', padding: '2px 8px', borderRadius: 6, marginRight: 6, display: 'inline-block' }}>{n}</span>
              ))}
              {resolved.ledgers.length > 60 && <span> +{resolved.ledgers.length - 60} more</span>}
            </div>
          </details>
        )}

        <div className="actions">
          <button className="btn pri" disabled={!editing.name.trim()} onClick={() => { onSave(editing); setEditing(null) }}>Save group</button>
          <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
