// Generic LLM cost computation. Prices are user-set (USD per 1,000,000 tokens) in
// Settings, so it works for any OpenAI-compatible cloud model. No vendor hardcoding.

export const DEFAULT_PRICE = { inPer1M: 0.14, outPer1M: 0.28 } // editable in Settings
export const DEFAULT_USDINR = 94

// usage = OpenAI-compatible usage object. Honours cache hit/miss split if the API
// returns it (cache hits billed at ~2% of input); else treats all input as a miss.
export function costOf(usage, price = DEFAULT_PRICE) {
  const out = usage?.completion_tokens || 0
  const inTok = usage?.prompt_tokens || 0
  const hit = usage?.prompt_cache_hit_tokens || 0
  const miss = usage?.prompt_cache_miss_tokens != null ? usage.prompt_cache_miss_tokens : Math.max(0, inTok - hit)
  const usd = (miss / 1e6) * price.inPer1M + (hit / 1e6) * (price.inPer1M * 0.02) + (out / 1e6) * price.outPer1M
  return { usd, inHit: hit, inMiss: miss, output: out }
}

export const fmtUSD = (n) =>
  '$' + (n < 0.01 ? n.toFixed(5) : n.toFixed(4)).replace(/0+$/, '').replace(/\.$/, '')

export function fmtINR(usd, rate = DEFAULT_USDINR) {
  const inr = usd * rate
  if (inr < 1) return '₹' + inr.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
  if (inr < 100) return '₹' + inr.toFixed(2)
  return '₹' + Math.round(inr).toLocaleString('en-IN')
}
