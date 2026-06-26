import React, { useEffect, useState, useCallback } from 'react'
import { openSample, openSqlite, readCatalog, readSchema, readCompany } from './lib/db.js'
import { buildMask } from './lib/mask.js'
import { ask } from './lib/pipeline.js'
import { DEFAULT_USDINR, DEFAULT_PRICE } from './lib/pricing.js'
import { PROVIDERS, DEFAULT_PROVIDER, DEFAULT_LOCAL_MODEL } from './lib/providers.js'
import { loadGroups, saveGroups, resolveGroup } from './lib/groups.js'
import ChatPanel from './components/ChatPanel.jsx'
import SettingsTab from './components/SettingsTab.jsx'
import CostTab from './components/CostTab.jsx'
import PrivacyTab from './components/PrivacyTab.jsx'
import GroupManager from './components/GroupManager.jsx'
import ManualTab from './components/ManualTab.jsx'
import ProfileTab from './components/ProfileTab.jsx'
import { loadSavedQueries, persistSavedQueries, makeSavedQuery } from './lib/profile.js'
import { loadHistory, saveHistory, clearHistory, turnId, priorContext } from './lib/history.js'
import { resolveAssistant, reformat, REFORMAT_MODES } from './lib/assistant.js'
import { improveQuestion } from './lib/improve.js'
import ModuleView from './components/ModuleView.jsx'
import { MODULES, moduleById } from './lib/modules.js'

const LS = {
  key: 'll_api_key', cost: 'll_cost_log', rate: 'll_usdinr', provider: 'll_provider',
  cloudBase: 'll_cloud_base', cloudModel: 'll_cloud_model', priceIn: 'll_price_in', priceOut: 'll_price_out',
  localBase: 'll_local_base', localModel: 'll_local_model',
  assistant: 'll_assistant', assistantModel: 'll_assistant_model',
}

function loadSettings() {
  const num = (k, d) => { const v = Number(localStorage.getItem(k)); return Number.isFinite(v) && v > 0 ? v : d }
  return {
    provider: localStorage.getItem(LS.provider) || DEFAULT_PROVIDER,
    apiKey: localStorage.getItem(LS.key) || '',
    cloudBaseUrl: localStorage.getItem(LS.cloudBase) || '',
    cloudModel: localStorage.getItem(LS.cloudModel) || '',
    priceIn: num(LS.priceIn, DEFAULT_PRICE.inPer1M),
    priceOut: num(LS.priceOut, DEFAULT_PRICE.outPer1M),
    localBaseUrl: localStorage.getItem(LS.localBase) || PROVIDERS.local.baseUrl,
    localModel: localStorage.getItem(LS.localModel) || DEFAULT_LOCAL_MODEL,
    rate: num(LS.rate, DEFAULT_USDINR),
    assistant: localStorage.getItem(LS.assistant) || 'auto', // auto = Chrome Nano -> local
    assistantLocalModel: localStorage.getItem(LS.assistantModel) || 'qwen2.5:3b',
  }
}
function persistSettings(s) {
  localStorage.setItem(LS.provider, s.provider)
  localStorage.setItem(LS.key, s.apiKey)
  localStorage.setItem(LS.cloudBase, s.cloudBaseUrl)
  localStorage.setItem(LS.cloudModel, s.cloudModel)
  localStorage.setItem(LS.priceIn, String(s.priceIn))
  localStorage.setItem(LS.priceOut, String(s.priceOut))
  localStorage.setItem(LS.localBase, s.localBaseUrl)
  localStorage.setItem(LS.localModel, s.localModel)
  localStorage.setItem(LS.rate, String(s.rate))
  localStorage.setItem(LS.assistant, s.assistant)
  localStorage.setItem(LS.assistantModel, s.assistantLocalModel)
}
// derive the runtime provider config the pipeline needs
function providerConfig(s) {
  if (s.provider === 'local') return { baseUrl: s.localBaseUrl, apiKey: '', model: s.localModel, free: true }
  return { baseUrl: s.cloudBaseUrl, apiKey: s.apiKey, model: s.cloudModel, free: false, price: { inPer1M: s.priceIn, outPer1M: s.priceOut } }
}

const TITLES = {
  chat: 'Chat with data', groups: 'Groups', manual: 'Manual mode',
  profile: 'Profile', privacy: 'Privacy', cost: 'API cost', settings: 'Settings',
}

export default function App() {
  const [tab, setTab] = useState('chat')
  const [db, setDb] = useState(null)
  const [schema, setSchema] = useState(null)
  const [mask, setMask] = useState(null)
  const [catalog, setCatalog] = useState(null)
  const [meta, setMeta] = useState({ ledgers: 0, parties: 0 })
  const [company, setCompany] = useState('Cache Digitech Pvt. Ltd')
  const [companyKey, setCompanyKey] = useState('cache_digitech')
  const [history, setHistory] = useState(() => loadHistory('cache_digitech'))
  const [groups, setGroups] = useState(() => loadGroups())

  const [settings, setSettings] = useState(loadSettings)
  const [savedQueries, setSavedQueries] = useState(() => loadSavedQueries())
  const [pending, setPending] = useState(null) // question to auto-run in chat
  const [costLog, setCostLog] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS.cost) || '[]') } catch { return [] }
  })
  const activeModel = settings.provider === 'local' ? settings.localModel : settings.cloudModel

  // fallbackName used when the export has no company_name metadata (e.g. the bundled sample)
  async function loadDb(database, fallbackName) {
    const cat = readCatalog(database)
    const name = readCompany(database) || fallbackName || 'Loaded database'
    const ck = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'db'
    setDb(database); setCatalog(cat)
    setSchema(readSchema(database))
    setMask(buildMask(cat))
    setMeta({ ledgers: cat.ledgers.length, parties: cat.parties.length })
    setCompany(name); setCompanyKey(ck); setHistory(loadHistory(ck))
  }
  useEffect(() => { openSample().then((d) => loadDb(d, 'Cache Digitech Pvt. Ltd')).catch((e) => console.error('sample load', e)) }, [])

  const pushTurn = useCallback((turn) => {
    setHistory((prev) => { const next = [...prev, turn]; saveHistory(companyKey, next); return next })
  }, [companyKey])

  const onAsk = useCallback(async (question, activeGroupIds) => {
    const provider = providerConfig(settings)
    const prior = priorContext(history)
    try {
      const res = await ask({ db, schema, mask, catalog, groups, activeGroupIds, provider, question, prior })
      pushTurn({
        id: turnId(), ts: Date.now(), kind: 'sql', question,
        maskedQuestion: res.maskedQuestion, sql: res.sql, maskedSql: res.maskedSql,
        columns: res.columns, rows: res.rows, usage: res.usage, cost: res.cost,
        model: res.model, free: res.free, retried: res.retried,
      })
      const entry = {
        at: new Date().toLocaleString('en-IN', { hour12: false }),
        q: question, model: res.model, free: res.free,
        inTokens: res.usage.prompt_tokens, outTokens: res.usage.completion_tokens, usd: res.cost.usd,
      }
      setCostLog((prev) => { const next = [...prev, entry]; localStorage.setItem(LS.cost, JSON.stringify(next.slice(-200))); return next })
      return res
    } catch (e) {
      pushTurn({ id: turnId(), ts: Date.now(), kind: 'sql', question, error: e.message })
      throw e
    }
  }, [db, schema, mask, catalog, groups, settings, history, pushTurn])

  function clearChat() { setHistory([]); clearHistory(companyKey) }
  function deleteTurn(id) {
    setHistory((prev) => { const next = prev.filter((t) => t.id !== id); saveHistory(companyKey, next); return next })
  }

  // Improve / suggest questions via the Assistant model (no client names sent).
  const onImprove = useCallback(async (question) => {
    const a = await resolveAssistant(settings)
    return improveQuestion({
      question,
      vocabCtx: { primaries: catalog?.primaries || [], groupNames: groups.map((g) => g.name) },
      assistant: a,
    })
  }, [settings, catalog, groups])

  // Reformat a result into prose (summary / email / explain / free-text) via the Assistant model.
  const onReformat = useCallback(async (sourceTurn, modeOrText) => {
    const a = await resolveAssistant(settings)
    const instruction = REFORMAT_MODES[modeOrText]?.instruction || modeOrText
    const label = REFORMAT_MODES[modeOrText]?.label || modeOrText
    try {
      const text = await reformat({ instruction, result: { columns: sourceTurn.columns, rows: sourceTurn.rows }, assistant: a })
      pushTurn({ id: turnId(), ts: Date.now(), kind: 'prose', question: label, prose: text, sourceId: sourceTurn.id, assistant: a.label, leaks: a.leaks })
    } catch (e) {
      pushTurn({ id: turnId(), ts: Date.now(), kind: 'prose', question: label, error: e.message })
      throw e
    }
  }, [settings, pushTurn])

  function saveSettings(s) { setSettings(s); persistSettings(s) }
  function clearCost() { setCostLog([]); localStorage.removeItem(LS.cost) }

  function saveQuery(question, sql) {
    setSavedQueries((prev) => {
      if (prev.some((q) => q.question === question)) return prev // no dupes
      const next = [...prev, makeSavedQuery(question, sql)]
      persistSavedQueries(next); return next
    })
  }
  function deleteQuery(id) {
    setSavedQueries((prev) => { const next = prev.filter((q) => q.id !== id); persistSavedQueries(next); return next })
  }
  function runSavedQuery(question) { setPending(question); setTab('chat') }
  function onProfileImported(merged, prefs) {
    setGroups(merged.groups)
    setSavedQueries(merged.savedQueries)
    if (prefs && Object.keys(prefs).length) {
      const next = { ...settings, ...prefs, apiKey: settings.apiKey } // keep existing key
      setSettings(next); persistSettings(next)
    }
  }

  function upsertGroup(g) {
    setGroups((prev) => {
      const i = prev.findIndex((x) => x.id === g.id)
      const next = i === -1 ? [...prev, g] : prev.map((x) => (x.id === g.id ? g : x))
      saveGroups(next); return next
    })
  }
  function deleteGroup(id) {
    setGroups((prev) => { const next = prev.filter((x) => x.id !== id); saveGroups(next); return next })
  }

  async function onUpload(e) {
    const file = e.target.files?.[0]; if (!file) return
    const buf = await file.arrayBuffer()
    try {
      await loadDb(await openSqlite(buf), file.name.replace(/\.(sqlite|db)$/i, ''))
      setTab('chat')
    } catch (err) { alert('Could not open file: ' + err.message) }
  }

  const ready = !!db && !!mask
  const Nav = ({ id, label, count }) => (
    <div className={`nav ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>
      <span className="nav-ico" aria-hidden="true" style={{ width: 16, display: 'inline-flex', justifyContent: 'center', opacity: tab === id ? 1 : 0.5 }}>
        {tab === id ? '◆' : '◇'}
      </span>{label}
      {count != null && <span className="count">{count}</span>}
    </div>
  )

  return (
    <div className="app">
      <aside className="side">
        <div className="brand"><span className="dot">◐</span> LedgerLens</div>

        <div className="sec">Ask</div>
        <Nav id="chat" label="Chat with data" />
        <Nav id="manual" label="Manual mode" />

        <div className="sec">Groups</div>
        {groups.map((g) => (
          <div key={g.id} className="nav" onClick={() => setTab('groups')}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: g.color, display: 'inline-block', marginRight: 6 }} />
            {g.name || '(unnamed)'}
            <span className="count">{catalog ? resolveGroup(g, catalog).ledgers.length : 0}</span>
          </div>
        ))}
        <div className="nav nav-add" onClick={() => setTab('groups')}>＋ New / manage groups</div>

        <div className="sec">Core audit</div>
        {MODULES.map((m) => (
          <div key={m.id} className={`nav ${tab === 'mod:' + m.id ? 'on' : ''}`} onClick={() => setTab('mod:' + m.id)}>
            <span style={{ width: 16, display: 'inline-block' }}>{tab === 'mod:' + m.id ? '▸' : '·'}</span>{m.label}
          </div>
        ))}

        <div className="sec">Privacy & cost</div>
        <Nav id="profile" label="Profile" count={savedQueries.length} />
        <Nav id="privacy" label="Privacy" />
        <Nav id="cost" label="API cost" />
        <Nav id="settings" label="Settings" />

        <div style={{ marginTop: 'auto', padding: '14px 16px 6px' }}>
          <label className="side-load">
            <span className="side-load-ico" aria-hidden="true">↑</span> Load .sqlite
            <input type="file" accept=".sqlite,.db" style={{ display: 'none' }} onChange={onUpload} />
          </label>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div>
            <div className="ttl">{tab.startsWith('mod:') ? (moduleById(tab.slice(4))?.label || 'Module') : TITLES[tab]}</div>
            <div className="sub">{ready ? `${company} · ${meta.ledgers} ledgers · ${meta.parties} parties · ${groups.length} groups` : 'Loading sample data…'}</div>
          </div>
          {(() => {
            const local = settings.provider === 'local'
            const cloudReady = settings.apiKey && settings.cloudBaseUrl
            const ok = local || cloudReady || tab === 'manual'
            const text = tab === 'manual' ? 'No API — fully offline'
              : local ? 'Air-gapped — nothing leaves device'
              : cloudReady ? 'Masked schema only — data stays on device'
              : 'Set up Cloud LLM in Settings'
            return <div className={`privacy-badge ${ok ? '' : 'off'}`}>🔒 {text}</div>
          })()}
        </div>

        {tab === 'chat' && <ChatPanel ready={ready} history={history} model={activeModel} rate={settings.rate} free={settings.provider === 'local'} groups={groups} onAsk={onAsk} onReformat={onReformat} onImprove={onImprove} onSaveQuery={saveQuery} onClearChat={clearChat} onDeleteTurn={deleteTurn} pending={pending} onConsumePending={() => setPending(null)} />}
        {tab === 'manual' && <ManualTab db={db} schema={schema} mask={mask} catalog={catalog} groups={groups} />}
        {tab === 'groups' && <GroupManager catalog={catalog} groups={groups} onSave={upsertGroup} onDelete={deleteGroup} />}
        {tab === 'profile' && <ProfileTab groups={groups} savedQueries={savedQueries} prefs={settings} company={company} onImported={onProfileImported} onDeleteQuery={deleteQuery} onRunQuery={runSavedQuery} />}
        {tab === 'privacy' && <PrivacyTab schema={schema} mask={mask} catalog={catalog} groups={groups} />}
        {tab === 'cost' && <CostTab log={costLog} rate={settings.rate} onClear={clearCost} />}
        {tab === 'settings' && <SettingsTab settings={settings} onSave={saveSettings} />}
        {tab.startsWith('mod:') && (
          <ModuleView db={db} module={moduleById(tab.slice(4))} ctx={{
            relatedLedgers: catalog ? groups.filter((g) => /relat|associat|sister|subsidiar|holding/i.test(g.name)).flatMap((g) => resolveGroup(g, catalog).ledgers) : [],
          }} />
        )}
      </main>
    </div>
  )
}
