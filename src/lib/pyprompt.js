// Prompt builder for NL → pandas code. The model gets the DataFrame schema + the
// target output format, and returns ONLY Python that writes the deliverable to OUTPUT_PATH.
import { maskQuestion, unmaskPy } from './mask.js'

const SCHEMA = `Two pandas DataFrames are already loaded (do NOT read any file or network):

df  — accounting daybook, one row per ledger line:
  voucher_guid (str), voucher_date (str 'YYYY-MM-DD'), voucher_type (str),
  voucher_number (str), party_name (str), ledger_name (str),
  amount (float, SIGNED: amount<0 = DEBIT, amount>0 = CREDIT),
  ledger_parent (str), ledger_primary_group (str)

df_ledgers — ledger master:
  name (str), parent (str), primary_group (str), opening (float), closing (float)`

const FORMAT_RULES = {
  excel: `Target = Excel. Write a clean, well-formatted workbook to OUTPUT_PATH with pandas.ExcelWriter(OUTPUT_PATH, engine='openpyxl'). Use clear sheet names, header row, and rounded numbers.`,
  csv: `Target = CSV. Write the result DataFrame to OUTPUT_PATH with .to_csv(OUTPUT_PATH, index=False).`,
  chart_png: `Target = PNG chart. Build ONE clear matplotlib chart with plt (already imported, Agg backend). Add a title, axis labels and a legend where useful. Format large rupee values sensibly (lakh/crore). Save with plt.savefig(OUTPUT_PATH, dpi=150, bbox_inches='tight'); plt.close().`,
  chart_jpeg: `Target = JPEG chart. Build ONE clear matplotlib chart with plt (Agg backend), titled and labelled. Save with plt.savefig(OUTPUT_PATH, dpi=150, bbox_inches='tight'); plt.close().`,
  word: `Target = Word. Build a short report with python-docx: from docx import Document; add a heading, 1-2 sentences, and a table of the result; then doc.save(OUTPUT_PATH).`,
}

export function buildPySystem(format, groupNames = []) {
  const groupsBlock = `\n\n# USER-DEFINED GROUPS\nA dict GROUPS is preloaded mapping these names to lists of ledger_name strings. Filter with e.g. df[df.ledger_name.isin(GROUPS['NAME'])]:\n${groupNames.length ? groupNames.join(', ') : '(none defined)'}`
  return `You are an expert Python data analyst working with Indian Tally accounting data (amounts in INR).

# DATA
${SCHEMA}${groupsBlock}

# TASK
Write Python that answers the user's request and saves the deliverable.
${FORMAT_RULES[format] || FORMAT_RULES.excel}

# RULES
- Use ONLY df and df_ledgers (already in scope). Never read files, never use the network.
- OUTPUT_PATH is already defined — save the deliverable EXACTLY there.
- Available libraries: pandas (pd), numpy (np), matplotlib (plt, for charts), openpyxl, python-docx.
- amount is signed: debit = amount<0, credit = amount>0. "Turnover/exposure" with a party => sum of abs(amount).
- Classify by ledger_primary_group, not by name text.
- Any ledger/party name you must reference appears as a token like @@L42@@ — use it verbatim inside quotes; it is substituted with the real value before the code runs.
- Output ONLY Python code. No prose, no markdown fences, no explanation.`
}

// strip fences / reasoning, keep code
export function extractPyCode(raw) {
  let c = (raw || '').trim()
  c = c.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  const fences = [...c.matchAll(/```(?:python|py)?\s*([\s\S]*?)```/gi)]
  if (fences.length) c = fences[fences.length - 1][1].trim()
  return c
}

export function buildPyMessages(mask, question, format, groupNames = []) {
  const maskedQ = maskQuestion(question, mask)
  return { masked: maskedQ, messages: [{ role: 'system', content: buildPySystem(format, groupNames) }, { role: 'user', content: maskedQ }] }
}

export { unmaskPy }
