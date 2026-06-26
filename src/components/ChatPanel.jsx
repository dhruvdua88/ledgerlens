import React, { useState, useEffect, useRef } from 'react'
import ResultTable from './ResultTable.jsx'
import { exportToExcel } from '../lib/export.js'
import { fmtINR } from '../lib/pricing.js'
import { looksLikeReformat } from '../lib/intent.js'
import { REFORMAT_MODES } from '../lib/assistant.js'

const SUGGESTIONS = [
  'Trial balance — net per ledger with group',
  'Sales vouchers with no GST charged',
  'Top 10 parties by turnover',
  'Cash payments over ₹10,000',
  'Effective GST rate per sales voucher',
]

export default function ChatPanel({ ready, history = [], onAsk, onReformat, onSaveQuery, onClearChat, onDeleteTurn, pending, onConsumePending, model, rate, groups = [] }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [inflight, setInflight] = useState(null) // { label, kind }
  const [active, setActive] = useState([])
  const [openSql, setOpenSql] = useState({})
  const [savedIds, setSavedIds] = useState({})
  const [routeMode, setRouteMode] = useState('auto') // auto | sql | ask
  const busyRef = useRef(false)
  const endRef = useRef(null)

  const lastResult = [...history].reverse().find((t) => t.kind === 'sql' && !t.error && (t.columns || []).length)

  async function runSql(question) {
    setInflight({ label: question, kind: 'sql' })
    try { await onAsk(question, active.length ? active : null) } catch { /* recorded */ } finally { setInflight(null) }
  }
  async function runReformat(sourceTurn, modeOrText) {
    const label = REFORMAT_MODES[modeOrText]?.label || modeOrText
    setInflight({ label, kind: 'prose' })
    try { await onReformat(sourceTurn, modeOrText) } catch { /* recorded */ } finally { setInflight(null) }
  }

  async function submit(text) {
    const question = (text ?? q).trim()
    if (!question || busyRef.current || !ready) return
    busyRef.current = true; setBusy(true); setQ('')
    const reformatRoute = routeMode === 'ask' || (routeMode === 'auto' && lastResult && looksLikeReformat(question))
    try {
      if (reformatRoute && lastResult) await runReformat(lastResult, question)
      else await runSql(question)
    } finally { busyRef.current = false; setBusy(false) }
  }

  useEffect(() => { if (pending && ready) { submit(pending); onConsumePending?.() } }, [pending, ready]) // eslint-disable-line
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [history.length, inflight])

  const toggleSql = (id) => setOpenSql((m) => ({ ...m, [id]: !m[id] }))
  const empty = !history.length && !inflight

  return (
    <>
      <div className="body">
        {history.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
            <span className="lnk" style={{ fontSize: 12, color: 'var(--text-3)', cursor: 'pointer' }} onClick={onClearChat}>＋ New chat</span>
          </div>
        )}

        {empty && (
          <div className="empty welcome">
            <div className="welcome-mark" aria-hidden="true">◐</div>
            <h2 className="welcome-ttl">Ask your books anything</h2>
            <p className="welcome-sub">Plain English in. Audited SQL out. Your data never leaves this device.</p>
            <div className="welcome-hint">Try one of these</div>
          </div>
        )}
        {empty && <div className="suggest">{SUGGESTIONS.map((s) => <span key={s} className="chip" onClick={() => submit(s)}>{s}</span>)}</div>}

        {history.map((t) => (
          <div key={t.id} className="turn">
            <div className="q-row"><div className="bubble-q">{t.question}</div></div>

            {t.error && <div className="err">{t.error}</div>}

            {!t.error && t.kind === 'prose' && (
              <div className="prosecard">
                <div className="bar">
                  <span className="ok">✎ {t.assistant}</span>
                  {t.leaks && <span style={{ color: 'var(--amber-900)' }}>sent to cloud</span>}
                  <span className="lnk" onClick={() => navigator.clipboard.writeText(t.prose)}>copy</span>
                  <span className="lnk" style={{ marginLeft: 0 }} onClick={() => onDeleteTurn?.(t.id)} title="Delete">✕</span>
                </div>
                <div className="prose">{t.prose}</div>
              </div>
            )}

            {!t.error && t.kind === 'sql' && (
              <>
                <div className="sqlcard">
                  <div className="bar">
                    <span className="ok">✓ read-only</span>
                    <span>{t.rows?.length ?? 0} rows</span>
                    <span>{(t.usage?.prompt_tokens || 0) + (t.usage?.completion_tokens || 0)} tokens · {t.free ? 'local · ₹0' : fmtINR(t.cost?.usd || 0, rate)}</span>
                    {t.retried && <span>self-corrected</span>}
                    <span className="lnk" onClick={() => toggleSql(t.id)}>{openSql[t.id] ? 'hide SQL' : 'show SQL'}</span>
                    <span className="lnk" style={{ marginLeft: 0 }} onClick={() => onDeleteTurn?.(t.id)} title="Delete">✕</span>
                  </div>
                  {openSql[t.id] && <pre>{t.sql}</pre>}
                </div>
                <ResultTable columns={t.columns || []} rows={t.rows || []} />
                <div className="actions">
                  <button className="btn pri" onClick={() => exportToExcel({ question: t.question, sql: t.sql, columns: t.columns, rows: t.rows, model: t.model })}>⤓ Export Excel</button>
                  <button className="btn" onClick={() => navigator.clipboard.writeText(t.sql)}>Copy SQL</button>
                  <button className="btn" disabled={savedIds[t.id]} onClick={() => { onSaveQuery?.(t.question, t.sql); setSavedIds((m) => ({ ...m, [t.id]: true })) }}>{savedIds[t.id] ? '✓ Saved' : '☆ Save query'}</button>
                  <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8 }}>
                    {Object.entries(REFORMAT_MODES).map(([k, m]) => (
                      <button key={k} className="btn" disabled={busy} onClick={() => runReformat(t, k)}>{m.label}</button>
                    ))}
                  </span>
                </div>
              </>
            )}
          </div>
        ))}

        {inflight && (
          <div className="turn">
            <div className="q-row"><div className="bubble-q">{inflight.label}</div></div>
            <div className="hint loading">{inflight.kind === 'prose' ? 'Drafting with the assistant…' : 'Compiling your question to SQL…'}</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div style={{ padding: '8px 20px 0', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Mode:</span>
        {[['auto', 'Auto'], ['sql', 'SQL'], ['ask', 'Ask result']].map(([k, lbl]) => (
          <span key={k} className="chip" onClick={() => setRouteMode(k)}
            style={routeMode === k ? { borderColor: 'var(--purple)', color: 'var(--purple)', background: 'var(--purple-100)' } : {}}>{lbl}</span>
        ))}
        {!!groups.length && <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 8 }}>Scope:</span>}
        {groups.map((g) => {
          const on = active.includes(g.id)
          return (
            <span key={g.id} className="chip" onClick={() => setActive(on ? active.filter((x) => x !== g.id) : [...active, g.id])}
              style={on ? { borderColor: g.color, color: g.color, background: 'var(--bg-3)' } : {}}>{on ? '✓ ' : ''}{g.name}</span>
          )
        })}
      </div>
      <div className="composer">
        <textarea
          value={q}
          placeholder={ready ? (routeMode === 'ask' ? 'Ask about the last result — “draft a client email”, “summarize”…' : 'Ask a question, a follow-up (“now only March”), or “summarize as an email”') : 'Loading data…'}
          disabled={!ready || busy}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
        />
        <button className="btn pri" disabled={!ready || busy || !q.trim()} onClick={() => submit()}>{busy ? '…' : 'Ask'}</button>
      </div>
    </>
  )
}
