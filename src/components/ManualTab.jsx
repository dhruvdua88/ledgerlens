import React, { useMemo, useState } from 'react'
import { buildPrompt, compileSql, runCompiled } from '../lib/pipeline.js'
import ResultTable from './ResultTable.jsx'
import { exportToExcel } from '../lib/export.js'

// No API. Build the tokenized prompt -> user copies into any LLM (Claude/ChatGPT) ->
// pastes the SQL back here -> we unmask tokens and run locally. Proves the masking.
export default function ManualTab({ db, schema, mask, catalog, groups }) {
  const [question, setQuestion] = useState('')
  const [active, setActive] = useState([])
  const [pastedSql, setPastedSql] = useState('')
  const [result, setResult] = useState(null)
  const [err, setErr] = useState(null)
  const [copied, setCopied] = useState(false)

  const built = useMemo(() => {
    if (!schema || !mask || !question.trim()) return null
    return buildPrompt({ schema, mask, catalog, groups, activeGroupIds: active.length ? active : null, question })
  }, [schema, mask, catalog, groups, active, question])

  const promptText = useMemo(() => {
    if (!built) return ''
    return built.messages.map((m) => `### ${m.role.toUpperCase()}\n${m.content}`).join('\n\n')
  }, [built])

  function run() {
    setErr(null); setResult(null)
    try {
      const compiled = compileSql(pastedSql, mask)
      const res = runCompiled(db, compiled.runnable)
      setResult({ question, sql: compiled.runnable, columns: res.columns, rows: res.rows, model: 'manual (external LLM)' })
    } catch (e) { setErr(e.message) }
  }

  if (!schema) return <div className="body"><div className="empty">Load data first.</div></div>

  return (
    <div className="body">
      <div className="panel" style={{ maxWidth: 820 }}>
        <h3>Manual mode — bring your own LLM</h3>
        <p className="muted">No API key needed. We build a fully tokenized prompt (no client names, no figures). Copy it into Claude, ChatGPT, anything. Paste the SQL it returns back here — we un-tokenize and run it locally on your data.</p>

        <div className="field">
          <label>1 · Your question</label>
          <input value={question} placeholder="e.g. transactions with related parties over ₹50 lakh" onChange={(e) => setQuestion(e.target.value)} />
        </div>

        {!!groups.length && (
          <div className="field">
            <label>Groups in scope (optional)</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {groups.map((g) => {
                const on = active.includes(g.id)
                return (
                  <span key={g.id} className="chip" onClick={() => setActive(on ? active.filter((x) => x !== g.id) : [...active, g.id])}
                    style={on ? { borderColor: g.color, color: g.color, background: 'var(--bg-3)' } : {}}>
                    {on ? '✓ ' : ''}{g.name}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {built && (
          <div className="field">
            <label style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>2 · Tokenized prompt — safe to paste anywhere</span>
              <span className="lnk" style={{ color: 'var(--blue-700)', cursor: 'pointer' }}
                onClick={() => { navigator.clipboard.writeText(promptText); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>
                {copied ? 'copied ✓' : 'copy prompt'}
              </span>
            </label>
            <pre style={{ background: 'var(--bg-2)', padding: 11, borderRadius: 8, fontSize: 11.5, whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto', fontFamily: 'var(--mono)' }}>{promptText}</pre>
          </div>
        )}

        <div className="field">
          <label>3 · Paste the SQL the LLM gave you</label>
          <textarea value={pastedSql} onChange={(e) => setPastedSql(e.target.value)} placeholder="SELECT ... (may contain @@L..@@ tokens — we'll un-tokenize)"
            style={{ width: '100%', minHeight: 90, fontFamily: 'var(--mono)', fontSize: 12, padding: 10, border: '0.5px solid var(--border-2)', borderRadius: 8 }} />
        </div>

        <div className="actions">
          <button className="btn pri" disabled={!pastedSql.trim()} onClick={run}>Run locally</button>
        </div>

        {err && <div className="err" style={{ marginTop: 14 }}>{err}</div>}
        {result && (
          <div style={{ marginTop: 18 }}>
            <div className="sqlcard"><div className="bar"><span className="ok">✓ read-only</span><span>{result.rows.length} rows</span></div><pre>{result.sql}</pre></div>
            <ResultTable columns={result.columns} rows={result.rows} />
            <div className="actions"><button className="btn pri" onClick={() => exportToExcel(result)}>⤓ Export Excel</button></div>
          </div>
        )}
      </div>
    </div>
  )
}
