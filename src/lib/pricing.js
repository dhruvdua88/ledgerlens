// DeepSeek pricing — USD per 1,000,000 tokens. Source: api-docs.deepseek.com/quick_start/pricing
// deepseek-chat / deepseek-reasoner deprecate 2026-07-24 (map to v4-flash modes).
export const MODELS = {
  'deepseek-v4-flash': {
    label: 'V4 Flash',
    note: 'Cheap, fast. Default for NL→SQL.',
    context: 1_000_000,
    maxOutput: 384_000,
    price: { inHit: 0.0028, inMiss: 0.14, output: 0.28 },
  },
  'deepseek-v4-pro': {
    label: 'V4 Pro',
    note: 'Stronger reasoning for hard / ambiguous queries.',
    context: 1_000_000,
    maxOutput: 384_000,
    price: { inHit: 0.003625, inMiss: 0.435, output: 0.87 },
  },
}

export const DEFAULT_MODEL = 'deepseek-v4-flash'

// usage = OpenAI-compatible object from DeepSeek response.
// DeepSeek returns prompt_cache_hit_tokens / prompt_cache_miss_tokens; fall back gracefully.
export function costOf(model, usage) {
  const p = (MODELS[model] || MODELS[DEFAULT_MODEL]).price
  const out = usage?.completion_tokens || 0
  let hit = usage?.prompt_cache_hit_tokens
  let miss = usage?.prompt_cache_miss_tokens
  if (hit == null || miss == null) {
    // no cache breakdown -> treat all prompt tokens as a miss (conservative / higher)
    miss = usage?.prompt_tokens || 0
    hit = 0
  }
  const usd =
    (hit / 1e6) * p.inHit + (miss / 1e6) * p.inMiss + (out / 1e6) * p.output
  return { usd, inHit: hit, inMiss: miss, output: out }
}

export const fmtUSD = (n) =>
  '$' + (n < 0.01 ? n.toFixed(5) : n.toFixed(4)).replace(/0+$/, '').replace(/\.$/, '')

// INR — DeepSeek bills in USD; we convert at a user-set rate (default ~94).
export const DEFAULT_USDINR = 94

export function fmtINR(usd, rate = DEFAULT_USDINR) {
  const inr = usd * rate
  if (inr < 1) return '₹' + inr.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
  if (inr < 100) return '₹' + inr.toFixed(2)
  return '₹' + Math.round(inr).toLocaleString('en-IN')
}
