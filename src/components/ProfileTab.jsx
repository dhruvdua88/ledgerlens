import React, { useRef, useState } from 'react'
import { buildProfile, downloadProfile, readProfileFile, mergeProfileIntoStorage } from '../lib/profile.js'

// Export / import a portable profile (saved queries + groups + prefs). No API keys.
export default function ProfileTab({ groups, savedQueries, prefs, company, onImported, onDeleteQuery, onRunQuery }) {
  const fileRef = useRef(null)
  const [msg, setMsg] = useState(null)

  function doExport() {
    const profile = buildProfile({ groups, savedQueries, prefs, company })
    downloadProfile(profile, company || 'ledgerlens')
    setMsg({ ok: true, text: `Exported ${groups.length} groups + ${savedQueries.length} saved queries.` })
  }

  async function doImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const imported = await readProfileFile(file)
      const merged = mergeProfileIntoStorage(imported)
      onImported(merged, imported.prefs)
      setMsg({ ok: true, text: `Imported ${imported.groups.length} groups + ${imported.savedQueries.length} saved queries${imported.company ? ` from ${imported.company}` : ''}.` })
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    } finally { if (fileRef.current) fileRef.current.value = '' }
  }

  return (
    <div className="body">
      <div className="panel" style={{ maxWidth: 760 }}>
        <h3>Profile</h3>
        <p className="muted">Carry your work between machines and clients. A profile bundles your saved queries, custom groups, and preferences into one file. Your API key is never included.</p>

        <div className="actions" style={{ marginBottom: 8 }}>
          <button className="btn pri" onClick={doExport}>⤓ Export profile</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>⤒ Import profile</button>
          <input ref={fileRef} type="file" accept=".json,.llprofile.json,application/json" style={{ display: 'none' }} onChange={doImport} />
        </div>
        {msg && <div className={msg.ok ? 'hint' : 'err'} style={{ marginBottom: 8 }}>{msg.text}</div>}

        <div className="metrics" style={{ margin: '14px 0 20px' }}>
          <div className="metric"><div className="l">Saved queries</div><div className="v">{savedQueries.length}</div></div>
          <div className="metric"><div className="l">Groups</div><div className="v">{groups.length}</div></div>
        </div>

        <h3 style={{ fontSize: 14 }}>Saved queries</h3>
        {!savedQueries.length && <div className="empty" style={{ padding: '20px 0' }}>No saved queries yet. Run a query in chat and hit “Save query”.</div>}
        {savedQueries.map((q) => (
          <div key={q.id} className="kv" style={{ alignItems: 'center' }}>
            <span className="k" style={{ color: 'var(--text)', flex: 1, marginRight: 10 }}>{q.question}</span>
            <span style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={() => onRunQuery(q.question)}>Run</button>
              <button className="btn" onClick={() => onDeleteQuery(q.id)}>Delete</button>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
