import React, { useState, useEffect, useRef } from 'react'
import ResultTable from './ResultTable.jsx'
import { exportToExcel } from '../lib/export.js'
import { fmtINR } from '../lib/pricing.js'
import { REFORMAT_MODES } from '../lib/assistant.js'

const SUGGESTIONS = [
  'Trial balance — net per ledger with group',
  'Sales vouchers with no GST charged',
  'Top 10 parties by turnover',
  'Cash payments over ₹10,000',
  'Effective GST rate per sales voucher',
]

export default function ChatPanel({ ready, history = [], onAsk, onReformat, onImprove, onSaveQuery, onClearChat, onDeleteTurn, pending, onConsumePending, rate, groups = [] }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [inflight, setInflight] = useState(null)        // { parentId, label, kind }
  const [active, setActive] = useState([])
  const [openSql, setOpenSql] = useState({})
  const [savedIds, setSavedIds] = useState({})
  const [replyTo, setReplyTo] = useState(null)          // parent id with open reply box
  const [replyText, setReplyText] = useState('')
  const [improve, setImprove] = useState(null)          // { improved, why, alternatives }
  const [improving, setImproving] = useState(false)
  const [mention, setMention] = useState(null)          // { query, atPos } when typing @group
  const [hi, setHi] = useState(0)
  const busyRef = useRef(false)
  const endRef = useRef(null)
  const taRef = useRef(null)

  const mentionList = mention ? groups.filter((g) => g.name.toLowerCase().includes(mention.query.toLowerCase())).slice(0, 8) : []

  function onComposerChange(e) {
    const val = e.target.value; setQ(val)
    const cur = e.target.selectionStart
    const m = val.slice(0, cur).match(/@([\p{L}\w]*)$/u)
    if (m && groups.length) { setMention({ query: m[1], atPos: cur - m[0].length }); setHi(0) }
    else setMention(null)
  }
  function pickMention(g) {
    const ta = taRef.current; const cur = ta ? ta.selectionStart : q.length
    const before = q.slice(0, mention.atPos), after = q.slice(cur)
    const insert = `@${g.name} `
    const next = before + insert + after
    setQ(next); setMention(null)
    setActive((a) => (a.includes(g.id) ? a : [...a, g.id]))
    requestAnimationFrame(() => { if (ta) { ta.focus(); const p = before.length + insert.length; ta.setSelectionRange(p, p) } })
  }

  async function runSql(question) {
    setInflight({ parentId: null, kind: 'sql', label: question })
    try { await onAsk(question, active.length ? active : null) } catch { /* recorded */ } finally { setInflight(null) }
  }
  async function runReformat(parent, modeOrText) {
    const label = REFORMAT_MODES[modeOrText]?.label || modeOrText
    setInflight({ parentId: parent.id, kind: 'prose', label })
    try { await onReformat(parent, modeOrText) } catch { /* recorded */ } finally { setInflight(null) }
  }
  async function ask(text) {
    const question = (text ?? q).trim()
    if (!question || busyRef.current || !ready) return
    busyRef.current = true; setBusy(true); setQ(''); setImprove(null)
    try { await runSql(question) } finally { busyRef.current = false; setBusy(false) }
  }
  async function sendReply(parent) {
    const text = replyText.trim()
    if (!text || busyRef.current) return
    busyRef.current = true; setBusy(true); setReplyText(''); setReplyTo(null)
    try { await runReformat(parent, text) } finally { busyRef.current = false; setBusy(false) }
  }
  async function doImprove() {
    if (improving) return
    setImproving(true)
    try { setImprove(await onImprove(q)) } catch (e) { setImprove({ error: e.message }) } finally { setImproving(false) }
  }

  useEffect(() => { if (pending && ready) { ask(pending); onConsumePending?.() } }, [pending, ready]) // eslint-disable-line
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [history.length, inflight])

  const toggleSql = (id) => setOpenSql((m) => ({ ...m, [id]: !m[id] }))
  const childrenOf = (id) => history.filter((t) => t.kind === 'prose' && t.sourceId === id)
  const parents = history.filter((t) => t.kind === 'sql')
  const empty = !history.length && !inflight

  const Reply = (t) => (
    <div className="reply" key={t.id}>
      <div className="reply-you">↳ {t.question}</div>
      {t.error ? <div className="err" style={{ margin: '4px 0 0' }}>{t.error}</div> : (
        <div className="prosecard" style={{ margin: '4px 0 0' }}>
          <div className="bar">
            <span className="ok">✎ {t.assistant}</span>
            {t.leaks && <span style={{ color: 'var(--amber-900)' }}>sent to cloud</span>}
            <span className="lnk" onClick={() => navigator.clipboard.writeText(t.prose)}>copy</span>
            <span className="lnk" style={{ marginLeft: 0 }} onClick={() => onDeleteTurn?.(t.id)} title="Delete">✕</span>
          </div>
          <div className="prose">{t.prose}</div>
        </div>
      )}
    </div>
  )

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
            <div className="steps">
              <div className="step"><b>1</b> Ask a question in plain English</div>
              <div className="step"><b>2</b> See the SQL it ran + the result</div>
              <div className="step"><b>3</b> Reply under any result to refine, summarize, or draft an email</div>
            </div>
            <div className="welcome-hint">Try one of these — or type your own and hit ✨ Improve</div>
            <div className="suggest" style={{ justifyContent: 'center' }}>
              {SUGGESTIONS.map((s) => <span key={s} className="chip" onClick={() => ask(s)}>{s}</span>)}
            </div>
          </div>
        )}

        {parents.map((t) => (
          <div key={t.id} className="turn">
            <div className="q-row"><div className="bubble-q">{t.question}</div></div>
            {t.error && <div className="err">{t.error}</div>}
            {!t.error && (
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

                {/* thread of replies under this result */}
                {(childrenOf(t.id).length > 0 || inflight?.parentId === t.id || replyTo === t.id) && (
                  <div className="thread">
                    {childrenOf(t.id).map((c) => Reply(c))}
                    {inflight?.parentId === t.id && <div className="reply"><div className="reply-you">↳ {inflight.label}</div><div className="hint loading" style={{ margin: '4px 0 0' }}>Drafting with the assistant…</div></div>}
                    {replyTo === t.id && (
                      <div className="reply">
                        <div className="reply-box">
                          <input autoFocus value={replyText} placeholder="Ask about this result — “draft a client email”, “make it 3 bullets”, “explain row 1”…"
                            onChange={(e) => setReplyText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendReply(t) } if (e.key === 'Escape') setReplyTo(null) }} />
                          <button className="btn pri" disabled={busy || !replyText.trim()} onClick={() => sendReply(t)}>Send</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {replyTo !== t.id && (
                  <div style={{ marginTop: 6 }}>
                    <span className="lnk" style={{ fontSize: 12.5, color: 'var(--purple)', cursor: 'pointer' }} onClick={() => { setReplyTo(t.id); setReplyText('') }}>↳ Ask about this result…</span>
                  </div>
                )}
              </>
            )}
          </div>
        ))}

        {inflight?.kind === 'sql' && (
          <div className="turn">
            <div className="q-row"><div className="bubble-q">{inflight.label}</div></div>
            <div className="hint loading">Compiling your question to SQL…</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* improve panel */}
      {improve && (
        <div className="improve-panel">
          {improve.error && <div className="err">{improve.error}</div>}
          {improve.improved && (
            <div className="improve-row">
              <div><span className="improve-tag">Sharper</span> {improve.improved} {improve.why && <span style={{ color: 'var(--text-3)' }}>· {improve.why}</span>}</div>
              <button className="btn pri" onClick={() => { setQ(improve.improved); setImprove(null) }}>Use</button>
            </div>
          )}
          {!!(improve.alternatives || []).length && (
            <div className="suggest" style={{ marginTop: 8 }}>
              {improve.alternatives.map((a, i) => <span key={i} className="chip" onClick={() => { setQ(a); setImprove(null) }}>{a}</span>)}
            </div>
          )}
        </div>
      )}

      {!!groups.length && (
        <div style={{ padding: '8px 20px 0', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Scope:</span>
          {groups.map((g) => {
            const on = active.includes(g.id)
            return <span key={g.id} className="chip" onClick={() => setActive(on ? active.filter((x) => x !== g.id) : [...active, g.id])}
              style={on ? { borderColor: g.color, color: g.color, background: 'var(--bg-3)' } : {}}>{on ? '✓ ' : ''}{g.name}</span>
          })}
        </div>
      )}

      {mention && mentionList.length > 0 && (
        <div className="mention-menu">
          <div className="mention-hint">Scope to group</div>
          {mentionList.map((g, i) => (
            <div key={g.id} className={`mention-item ${i === hi ? 'on' : ''}`} onMouseEnter={() => setHi(i)} onMouseDown={(e) => { e.preventDefault(); pickMention(g) }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: g.color, display: 'inline-block' }} />
              {g.name}
            </div>
          ))}
        </div>
      )}
      <div className="composer">
        <textarea
          ref={taRef}
          value={q}
          placeholder={ready ? 'Ask a new question — type @ to scope to a group, or ✨ Improve' : 'Loading data…'}
          disabled={!ready || busy}
          onChange={onComposerChange}
          onKeyDown={(e) => {
            if (mention && mentionList.length) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => (h + 1) % mentionList.length); return }
              if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => (h - 1 + mentionList.length) % mentionList.length); return }
              if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(mentionList[hi]); return }
              if (e.key === 'Escape') { e.preventDefault(); setMention(null); return }
            }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() }
          }}
        />
        <button className="btn" disabled={!ready || improving} onClick={doImprove} title="Improve or suggest a question">{improving ? '…' : (q.trim() ? '✨ Improve' : '✨ Suggest')}</button>
        <button className="btn pri" disabled={!ready || busy || !q.trim()} onClick={() => ask()}>{busy ? '…' : 'Ask'}</button>
      </div>
    </>
  )
}
