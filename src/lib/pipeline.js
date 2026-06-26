// The ask() pipeline: question -> masked prompt -> DeepSeek -> guard -> unmask -> run.
// One self-correct retry if SQLite rejects the query.
import { chat } from './llm.js'
import { buildSystemPrompt, buildMessages, FEW_SHOT } from './schema.js'
import { maskQuestion, unmaskSql } from './mask.js'
import { sanitizeSql, assertReadOnly, withRowCap } from './guard.js'
import { runQuery } from './db.js'
import { costOf } from './pricing.js'
import { resolveTokens } from './groups.js'

// Build everything that would be sent to an LLM, WITHOUT calling one.
// Used by the chat pipeline AND the manual "copy prompt" module.
export function buildPrompt({ schema, mask, catalog, groups, activeGroupIds, question, prior = [] }) {
  const scoped = !!(activeGroupIds && activeGroupIds.length)
  const active = (groups || []).filter((g) => !activeGroupIds || activeGroupIds.includes(g.id))
  const resolved = resolveTokens(active, catalog, mask)
  const system = buildSystemPrompt(schema, mask, resolved, catalog, { scoped })
  const maskedQ = maskQuestion(question, mask)
  const messages = buildMessages(system, maskedQ, prior)
  return { system, maskedQuestion: maskedQ, messages, resolvedGroups: resolved }
}

// Compile model output (token SQL) into a runnable, read-only, real-name query.
export function compileSql(maskedSql, mask) {
  const clean = sanitizeSql(maskedSql)
  assertReadOnly(clean)
  return { runnable: withRowCap(unmaskSql(clean, mask)), maskedSql: clean }
}

// Run a compiled query locally and return rows.
export function runCompiled(db, runnable) {
  return runQuery(db, runnable)
}

// provider = { baseUrl, apiKey, model, free }; prior = [{maskedQuestion, maskedSql}]
export async function ask({ db, schema, mask, catalog, groups, activeGroupIds, provider, question, prior = [] }) {
  const { messages, maskedQuestion, resolvedGroups } = buildPrompt({ schema, mask, catalog, groups, activeGroupIds, question, prior })
  const { baseUrl, apiKey, model, free } = provider

  let usageTotal = { prompt_tokens: 0, completion_tokens: 0, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 0 }
  const addUsage = (u) => {
    usageTotal.prompt_tokens += u.prompt_tokens || 0
    usageTotal.completion_tokens += u.completion_tokens || 0
    usageTotal.prompt_cache_hit_tokens += u.prompt_cache_hit_tokens || 0
    usageTotal.prompt_cache_miss_tokens += u.prompt_cache_miss_tokens || 0
  }

  let msgs = [...messages]
  let { content, usage } = await chat({ baseUrl, apiKey, model, messages: msgs })
  addUsage(usage)

  let compiled, result, lastErr
  try {
    compiled = compileSql(content, mask)
    result = runCompiled(db, compiled.runnable)
  } catch (e) {
    lastErr = e
    msgs.push({ role: 'assistant', content: sanitizeSql(content) })
    msgs.push({ role: 'user', content: `That query failed with: "${e.message}". Return a corrected single read-only SQL query. SQL only.` })
    const retry = await chat({ baseUrl, apiKey, model, messages: msgs })
    addUsage(retry.usage)
    compiled = compileSql(retry.content, mask)
    result = runCompiled(db, compiled.runnable)
  }

  const cost = free ? { usd: 0, inHit: 0, inMiss: usageTotal.prompt_tokens, output: usageTotal.completion_tokens } : costOf(model, usageTotal)
  return {
    question, maskedQuestion,
    sql: compiled.runnable, maskedSql: compiled.maskedSql,
    columns: result.columns, rows: result.rows,
    usage: usageTotal, cost, model, free: !!free, retried: !!lastErr,
    resolvedGroups,
  }
}

export { FEW_SHOT }
