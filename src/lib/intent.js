// Lightweight SQL-vs-reformat routing for the follow-up box.
// Reformat = operate on the LAST result with prose; SQL = new/refined query.
const REFORMAT_KW = /\b(summar|e-?mail|mail|draft|explain|rephrase|reword|reformat|format it|bullet|tl;?dr|narrat|write\s*(it|this)?\s*up|paragraph|shorten|simplif|in plain english|as a (note|memo|letter))\b/i

export function looksLikeReformat(text) {
  return REFORMAT_KW.test(text || '')
}
