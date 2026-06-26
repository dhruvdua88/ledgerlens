import React, { useState } from 'react'
import { buildSystemPrompt } from '../lib/schema.js'
import { maskQuestion } from '../lib/mask.js'
import { resolveTokens } from '../lib/groups.js'

// Shows EXACTLY what bytes leave the device — the masked payload. Nothing else does.
export default function PrivacyTab({ schema, mask, catalog, groups }) {
  const [q, setQ] = useState('show all transactions with Redington over 50 lakh')
  if (!schema || !mask) return <div className="body"><div className="empty">Load data first.</div></div>

  const resolved = catalog ? resolveTokens(groups || [], catalog, mask) : []
  const system = buildSystemPrompt(schema, mask, resolved, catalog)
  const masked = maskQuestion(q, mask)
  const payload = JSON.stringify({ model: '…', messages: [{ role: 'system', content: system.slice(0, 0) + '[schema + masked catalog]' }, { role: 'user', content: masked }] }, null, 2)

  return (
    <div className="body">
      <div className="panel" style={{ maxWidth: 760 }}>
        <h3>Privacy — what leaves this device</h3>
        <p className="muted">The SQLite database never uploads. Only the masked payload below is sent to the LLM. Names become tokens; no amounts, no rows, no client identities.</p>

        <div className="metrics" style={{ marginBottom: 18 }}>
          <div className="metric"><div className="l">Ledgers masked</div><div className="v">{mask.ledgerTokens.length}</div></div>
          <div className="metric"><div className="l">Parties masked</div><div className="v">{mask.partyTokens.length}</div></div>
          <div className="metric"><div className="l">Real names sent</div><div className="v" style={{ color: 'var(--green)' }}>0</div></div>
        </div>

        <div style={{ border: '0.5px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 18 }}>
          {[
            ['SQL chat', 'Runs SQL in-browser (sql.js). Sends schema + masked question. Result rows stay on device.'],
            ['Python (Pandas) studio', 'Runs pandas in-browser (Pyodide, sandboxed — no network). Sends column schema + masked question + your group NAMES only. The DataFrame and group members never leave.'],
            ['Core-audit modules', 'Pure SQL on the local DB. Nothing is sent at all.'],
            ['Assistant (summaries/emails)', 'On-device (Chrome Nano / local). Cloud writer is opt-in and warns before sending result content.'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 12, padding: '9px 12px', borderTop: '0.5px solid var(--border)', fontSize: 12.5 }}>
              <span style={{ minWidth: 170, fontWeight: 500 }}>{k}</span>
              <span style={{ color: 'var(--text-2)' }}>{v}</span>
            </div>
          ))}
        </div>

        <div className="field">
          <label>Try a question — see how it gets masked before sending</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        <div className="kv"><span className="k">You typed</span></div>
        <pre style={{ background: 'var(--bg-2)', padding: 11, borderRadius: 8, fontSize: 12, whiteSpace: 'pre-wrap', margin: '6px 0 14px' }}>{q}</pre>

        <div className="kv"><span className="k">What we send (masked)</span></div>
        <pre style={{ background: 'var(--bg-2)', padding: 11, borderRadius: 8, fontSize: 12, whiteSpace: 'pre-wrap', margin: '6px 0 14px' }}>{masked}</pre>

        <details>
          <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--blue-700)' }}>See the full masked system prompt</summary>
          <pre style={{ background: 'var(--bg-2)', padding: 11, borderRadius: 8, fontSize: 11.5, whiteSpace: 'pre-wrap', marginTop: 8, maxHeight: 300, overflow: 'auto' }}>{system}</pre>
        </details>
      </div>
    </div>
  )
}
