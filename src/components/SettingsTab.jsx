import React, { useState, useEffect } from 'react'
import { MODELS, fmtINR } from '../lib/pricing.js'
import { PROVIDERS, LOCAL_MODEL_SUGGESTIONS } from '../lib/providers.js'
import { chromeStatus } from '../lib/chromeai.js'

export default function SettingsTab({ settings, onSave }) {
  const [s, setS] = useState({ ...settings })
  const [saved, setSaved] = useState(false)
  const [chrome, setChrome] = useState('checking…')
  const set = (patch) => { setS((p) => ({ ...p, ...patch })); setSaved(false) }
  const isLocal = s.provider === 'local'
  const price = MODELS[s.model]?.price

  useEffect(() => { chromeStatus().then(setChrome) }, [])
  const ASSISTANTS = [
    ['auto', 'Auto (Chrome → local)'],
    ['local', 'Local model'],
    ['deepseek', 'DeepSeek (cloud)'],
  ]

  return (
    <div className="body">
      <div className="panel">
        <h3>Settings</h3>
        <p className="muted">Pick where the model runs. Cloud sends only the masked prompt; local sends nothing off the device.</p>

        <div className="field">
          <label>Provider</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {Object.entries(PROVIDERS).map(([id, p]) => (
              <span key={id} className="chip" onClick={() => set({ provider: id })}
                style={s.provider === id ? { borderColor: 'var(--purple)', color: 'var(--purple)', background: 'var(--purple-100)' } : {}}>
                {p.label}
              </span>
            ))}
          </div>
          <p className="muted" style={{ margin: '8px 0 0' }}>{PROVIDERS[s.provider].privacy}</p>
        </div>

        {!isLocal && (
          <>
            <div className="field">
              <label>DeepSeek API key (stored only in this browser)</label>
              <input type="password" value={s.apiKey} placeholder="sk-…" onChange={(e) => set({ apiKey: e.target.value })} />
            </div>
            <div className="field">
              <label>Model</label>
              <select value={s.model} onChange={(e) => set({ model: e.target.value })}>
                {Object.entries(MODELS).map(([id, info]) => <option key={id} value={id}>{info.label} — {info.note}</option>)}
              </select>
            </div>
            {price && <>
              <div className="kv"><span className="k">Input (cache miss)</span><span className="v">{fmtINR(price.inMiss, s.rate)} / 1M tok</span></div>
              <div className="kv"><span className="k">Output</span><span className="v">{fmtINR(price.output, s.rate)} / 1M tok</span></div>
            </>}
          </>
        )}

        {isLocal && (
          <>
            <div className="field">
              <label>Local server URL (OpenAI-compatible)</label>
              <input value={s.localBaseUrl} onChange={(e) => set({ localBaseUrl: e.target.value })} placeholder="http://localhost:11434/v1" />
              <p className="muted" style={{ margin: '6px 0 0' }}>Ollama <code>:11434/v1</code> · LM Studio <code>:1234/v1</code> · vLLM <code>:8000/v1</code></p>
            </div>
            <div className="field">
              <label>Model tag</label>
              <input list="localmodels" value={s.localModel} onChange={(e) => set({ localModel: e.target.value })} placeholder="arctic-text2sql-r1:7b" />
              <datalist id="localmodels">{LOCAL_MODEL_SUGGESTIONS.map((m) => <option key={m} value={m} />)}</datalist>
            </div>
            <div className="hint" style={{ marginBottom: 4 }}>
              Browser → localhost needs CORS allowed by the server.<br />
              Ollama: run <code>OLLAMA_ORIGINS=* ollama serve</code> · LM Studio: enable CORS in the server tab.<br />
              On Chrome, https→localhost works (loopback is trusted); other browsers — run the app locally.
            </div>
            <div className="kv"><span className="k">Cost</span><span className="v" style={{ color: 'var(--green)' }}>₹0 — runs on your machine</span></div>
          </>
        )}

        <div className="field" style={{ marginTop: 16 }}>
          <label>USD → INR rate (cloud cost display)</label>
          <input type="number" value={s.rate} step="0.5" onChange={(e) => set({ rate: Number(e.target.value) || 0 })} />
        </div>

        <div style={{ borderTop: '0.5px solid var(--border)', margin: '8px 0 16px', paddingTop: 16 }}>
          <h3 style={{ fontSize: 14 }}>Assistant (summaries, emails, explanations)</h3>
          <p className="muted" style={{ marginBottom: 12 }}>A separate writer model reformats results into prose. The SQL engine above does not write well; this does.</p>
          <div className="field">
            <label>Writer model</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ASSISTANTS.map(([id, lbl]) => (
                <span key={id} className="chip" onClick={() => set({ assistant: id })}
                  style={s.assistant === id ? { borderColor: 'var(--purple)', color: 'var(--purple)', background: 'var(--purple-100)' } : {}}>{lbl}</span>
              ))}
            </div>
            <p className="muted" style={{ margin: '8px 0 0' }}>
              Chrome built-in (Gemini Nano): <b style={{ color: chrome === 'available' ? 'var(--green)' : 'var(--text-2)' }}>{chrome}</b>
              {chrome !== 'available' && ' — falls back to your local model.'}
            </p>
          </div>
          {s.assistant !== 'deepseek' && (
            <div className="field">
              <label>Local writer model tag</label>
              <input value={s.assistantLocalModel} onChange={(e) => set({ assistantLocalModel: e.target.value })} placeholder="qwen2.5:3b" />
              <p className="muted" style={{ margin: '6px 0 0' }}>A general chat model (not the SQL specialist). e.g. <code>qwen2.5:3b</code>, <code>llama3.1:8b</code>.</p>
            </div>
          )}
          {s.assistant === 'deepseek' && <div className="hint">Reformatting with DeepSeek sends the result content (numbers + names) to the cloud. Use Auto/Local to keep everything on-device.</div>}
        </div>

        <div className="actions">
          <button className="btn pri" onClick={() => { onSave(s); setSaved(true) }}>Save</button>
          {saved && <span style={{ color: 'var(--green)', fontSize: 13, alignSelf: 'center' }}>Saved ✓</span>}
        </div>
      </div>
    </div>
  )
}
