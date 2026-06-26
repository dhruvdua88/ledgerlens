import React, { useState, useRef } from 'react'
import { FORMATS } from '../lib/pyodide.js'

const SUGGESTIONS = {
  excel: 'Month-wise sales vs purchases summary as a formatted Excel',
  chart_png: 'Monthly sales trend as a line chart',
  word: 'A one-page Word note on the top 10 parties by turnover',
  csv: 'All journal vouchers above ₹1 lakh',
  chart_jpeg: 'Top 10 expense ledgers as a bar chart',
}

export default function PandasTab({ ready, onPython, groups = [] }) {
  const [q, setQ] = useState('')
  const [format, setFormat] = useState('excel')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [res, setRes] = useState(null) // { code, error?, bytes?, mime?, filename?, ext?, stdout? }
  const [showCode, setShowCode] = useState(false)
  const [imgUrl, setImgUrl] = useState(null)
  const [mention, setMention] = useState(null)
  const [hi, setHi] = useState(0)
  const taRef = useRef(null)
  const mentionList = mention ? groups.filter((g) => g.name.toLowerCase().includes(mention.query.toLowerCase())).slice(0, 8) : []

  function onComposerChange(e) {
    const val = e.target.value; setQ(val)
    const m = val.slice(0, e.target.selectionStart).match(/@([\p{L}\w]*)$/u)
    if (m && groups.length) { setMention({ query: m[1], atPos: e.target.selectionStart - m[0].length }); setHi(0) } else setMention(null)
  }
  function pickMention(g) {
    const ta = taRef.current; const cur = ta ? ta.selectionStart : q.length
    const before = q.slice(0, mention.atPos), insert = `@${g.name} `, next = before + insert + q.slice(cur)
    setQ(next); setMention(null)
    requestAnimationFrame(() => { if (ta) { ta.focus(); const p = before.length + insert.length; ta.setSelectionRange(p, p) } })
  }

  async function run(text) {
    const question = (text ?? q).trim()
    if (!question || busy || !ready) return
    setBusy(true); setRes(null); setImgUrl(null); setStatus('Generating Python…')
    try {
      const r = await onPython(question, format, setStatus)
      setRes(r); setShowCode(!!r.error)
      if (r.bytes && (r.ext === 'png' || r.ext === 'jpg')) {
        setImgUrl(URL.createObjectURL(new Blob([r.bytes], { type: r.mime })))
      }
    } catch (e) {
      setRes({ error: e.message })
    } finally { setBusy(false); setStatus('') }
  }

  function download() {
    if (!res?.bytes) return
    const url = URL.createObjectURL(new Blob([res.bytes], { type: res.mime }))
    const a = document.createElement('a'); a.href = url; a.download = res.filename; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="body">
        <div className="empty welcome" style={{ paddingBottom: 8 }}>
          <h2 className="welcome-ttl">Python (Pandas) studio</h2>
          <p className="welcome-sub">Describe an analysis; it writes &amp; runs pandas in your browser and hands you the file. Data never leaves the device.</p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0 0 14px', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Output:</span>
          {FORMATS.map((f) => (
            <span key={f.key} className="chip" onClick={() => setFormat(f.key)}
              style={format === f.key ? { borderColor: 'var(--purple)', color: 'var(--purple)', background: 'var(--purple-100)' } : {}}>{f.label}</span>
          ))}
        </div>

        {!res && !busy && (
          <div className="suggest"><span className="chip" onClick={() => run(SUGGESTIONS[format])}>{SUGGESTIONS[format]}</span></div>
        )}

        {busy && <div className="hint loading">{status || 'Working…'}</div>}

        {res?.error && (
          <>
            <div className="err">{res.error}</div>
            {res.stdout && <pre style={{ fontSize: 12, background: 'var(--bg-2)', padding: 10, borderRadius: 8, whiteSpace: 'pre-wrap' }}>{res.stdout}</pre>}
          </>
        )}

        {res && !res.error && (
          <>
            <div className="sqlcard">
              <div className="bar">
                <span className="ok">✓ ran in-browser</span>
                <span>{res.filename}</span>
                <span className="lnk" onClick={() => setShowCode((v) => !v)}>{showCode ? 'hide code' : 'show Python'}</span>
              </div>
              {showCode && <pre>{res.code}</pre>}
            </div>

            {imgUrl && <div style={{ marginBottom: 14 }}><img src={imgUrl} alt="chart" style={{ maxWidth: '100%', border: '0.5px solid var(--border)', borderRadius: 8 }} /></div>}

            <div className="actions">
              <button className="btn pri" onClick={download}>⤓ Download {res.ext?.toUpperCase()}</button>
              <button className="btn" onClick={() => navigator.clipboard.writeText(res.code)}>Copy Python</button>
            </div>
          </>
        )}
      </div>

      {mention && mentionList.length > 0 && (
        <div className="mention-menu">
          <div className="mention-hint">Reference a group</div>
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
          placeholder={ready ? `Describe the analysis — type @ to reference a group, e.g. “${SUGGESTIONS[format]}”` : 'Loading data…'}
          disabled={!ready || busy}
          onChange={onComposerChange}
          onKeyDown={(e) => {
            if (mention && mentionList.length) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => (h + 1) % mentionList.length); return }
              if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => (h - 1 + mentionList.length) % mentionList.length); return }
              if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(mentionList[hi]); return }
              if (e.key === 'Escape') { e.preventDefault(); setMention(null); return }
            }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run() }
          }}
        />
        <button className="btn pri" disabled={!ready || busy || !q.trim()} onClick={() => run()}>{busy ? '…' : 'Run'}</button>
      </div>
    </>
  )
}
