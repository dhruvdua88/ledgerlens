// Question improver — helps a CA phrase a precise, answerable data question.
// Uses the Assistant model (Chrome Nano / local / DeepSeek), NOT the SQL engine.
// Sends only the question + generic vocabulary — never ledger/party names.
import { chat } from './llm.js'
import { isChromeReady, chromePrompt } from './chromeai.js'

// Audit-check templates that make good, concrete questions.
const AUDIT_IDEAS = [
  'aged receivables over 90 days', 'cash payments over a threshold', 'round-sum journal entries',
  'sales without GST', 'GST rate mismatch per voucher', 'duplicate invoice numbers',
  'top vendors by purchase value', 'month-on-month expense trend', 'related-party transactions',
  'TDS not deducted on applicable expenses', 'ledgers with a sudden spike',
]
const VOUCHER_TYPES = ['Sales', 'Purchase', 'Payment', 'Receipt', 'Journal', 'Contra', 'Credit Note', 'Debit Note']

function buildVocab({ primaries = [], groupNames = [] }) {
  return [
    `Voucher types: ${VOUCHER_TYPES.join(', ')}`,
    `Account groups: ${primaries.slice(0, 20).join(', ')}`,
    groupNames.length ? `User-defined groups: ${groupNames.join(', ')}` : '',
    `Common audit checks: ${AUDIT_IDEAS.join('; ')}`,
  ].filter(Boolean).join('\n')
}

const SYSTEM = `You help a Chartered Accountant turn a rough request into a precise, answerable question about their Tally accounting books. Make questions concrete: add a time period, a money threshold, a grouping, or a specific account group where it sharpens intent. Use only the provided vocabulary. Never invent specific company or ledger names.
Return ONLY JSON: {"improved":"<one sharper question>","why":"<max 12 words>","alternatives":["<q>","<q>","<q>"]}`

function parseJson(text) {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) } catch { return null }
}

export async function improveQuestion({ question, vocabCtx, assistant }) {
  const vocab = buildVocab(vocabCtx)
  const user = `Vocabulary:\n${vocab}\n\nRough request: "${question || '(the user has not typed anything — suggest 4 strong starter questions)'}"\nReturn the JSON.`

  let raw
  if (assistant.kind === 'chrome') {
    raw = await chromePrompt(SYSTEM, user)
  } else {
    const out = await chat({
      baseUrl: assistant.baseUrl, apiKey: assistant.apiKey, model: assistant.model,
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }], temperature: 0.4,
    })
    raw = out.content
  }
  const parsed = parseJson(raw) || {}
  return {
    improved: parsed.improved || '',
    why: parsed.why || '',
    alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives.slice(0, 3) : [],
  }
}
