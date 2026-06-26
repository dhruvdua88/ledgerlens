// The "Assistant" (writer) role — separate from the SQL engine.
// Turns a query RESULT into prose: summary, client email, plain-English explanation.
// Privacy ladder: Chrome Nano (on-device) -> local Ollama -> DeepSeek (opt-in, data leaves).
import { chat } from './llm.js'
import { isChromeReady, chromePrompt } from './chromeai.js'
import { PROVIDERS } from './providers.js'
import { isAmountColumn, abbrINR } from './format.js'

export const REFORMAT_MODES = {
  summary: { label: 'Summarize', instruction: 'Summarize this result in 4–6 crisp bullet points an auditor would note. Lead with the headline number.' },
  email: { label: 'Draft email', instruction: 'Draft a short, professional email to the client conveying these results. Indian business English, INR figures with lakh/crore where natural, no fluff, ready to send.' },
  explain: { label: 'Explain', instruction: 'Explain in plain English what this result means and flag anything an auditor should verify or follow up on.' },
}

const SYSTEM = 'You are a precise Indian Chartered Accountant\'s assistant. You are given a query result table and an instruction. Use ONLY the numbers in the table — never invent figures. Respond with the requested text only, no preamble. Money is in INR.'

function resultToText(result, capRows = 40) {
  const cols = result.columns || []
  const all = result.rows || []
  const rows = all.slice(0, capRows)
  // pre-format amount columns to clean INR so the writer doesn't fumble the magnitude
  const amountCol = cols.map((c, i) => isAmountColumn(c, all.slice(0, 20).map((r) => r[i])))
  const fmt = (v, i) => {
    if (v == null) return ''
    if (amountCol[i]) { const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, '')); if (!isNaN(n)) return abbrINR(n) }
    return String(v)
  }
  const head = '| ' + cols.join(' | ') + ' |'
  const sep = '| ' + cols.map(() => '---').join(' | ') + ' |'
  const body = rows.map((r) => '| ' + r.map((v, i) => fmt(v, i)).join(' | ') + ' |').join('\n')
  const more = all.length > capRows ? `\n…and ${all.length - capRows} more rows` : ''
  return `${head}\n${sep}\n${body}${more}`
}

// Resolve which writer to use. pref = 'auto' | 'local' | 'deepseek'.
export async function resolveAssistant(settings) {
  const pref = settings.assistant || 'auto'
  if (pref === 'deepseek') {
    return { kind: 'cloud', baseUrl: PROVIDERS.deepseek.baseUrl, apiKey: settings.apiKey, model: settings.model, free: false, label: 'DeepSeek', leaks: true }
  }
  if (pref === 'auto' && await isChromeReady()) {
    return { kind: 'chrome', free: true, label: 'Chrome Nano', leaks: false }
  }
  // local (explicit, or auto fallback when Chrome unavailable)
  return { kind: 'cloud', baseUrl: settings.localBaseUrl, apiKey: '', model: settings.assistantLocalModel || 'qwen2.5:3b', free: true, label: 'local', leaks: false }
}

// Produce prose. result = { columns, rows }. instruction = free text or a REFORMAT_MODES instruction.
export async function reformat({ instruction, result, assistant }) {
  const user = `${instruction}\n\nResult (${(result.rows || []).length} rows):\n${resultToText(result)}`
  if (assistant.kind === 'chrome') {
    return chromePrompt(SYSTEM, user)
  }
  const out = await chat({
    baseUrl: assistant.baseUrl, apiKey: assistant.apiKey, model: assistant.model,
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
    temperature: 0.3,
  })
  return out.content
}
