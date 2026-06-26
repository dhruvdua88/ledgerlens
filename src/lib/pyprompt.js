// Prompt builder for NL → pandas code. The model gets the DataFrame schema, the live
// data dictionary, the audit domain rules, and the target output format, then returns
// ONLY Python that writes the deliverable to OUTPUT_PATH.
import { maskQuestion, unmaskPy } from './mask.js'

const SCHEMA = `Two pandas DataFrames are already loaded (do NOT read any file or network):

df  — accounting daybook, one row per ledger line:
  voucher_guid (str), voucher_date (str 'YYYY-MM-DD'), voucher_type (str),
  voucher_number (str), party_name (str), ledger_name (str),
  amount (float, SIGNED), ledger_parent (str), ledger_primary_group (str)

df_ledgers — ledger master:
  name (str), parent (str), primary_group (str), opening (float), closing (float)`

// The SAME domain knowledge schema.js feeds the SQL model — translated to pandas idioms.
const EVIDENCE = `# EVIDENCE — Tally accounting domain knowledge (use to interpret the request)
- df is the analysis table: one row per ledger line within a voucher. Start here.
- NOTHING IS HARDCODED PER COMPANY. voucher_type and ledger_name strings are company-defined.
  NEVER assume a literal like 'Sales' / 'Tax Invoice' / 'Purchase' / 'Payment'. When you need a
  voucher_type, copy a value from the DATA DICTIONARY below. To classify, use ledger_primary_group.
- CLASSIFY BY ledger_primary_group, NOT by name text. Tally primary groups are reserved and stable.
  Copy the EXACT strings from the DATA DICTIONARY (mind casing, e.g. 'Cash-in-hand'):
    * sales revenue line  => the sales group   (usually 'Sales Accounts')
    * purchase line       => the purchase group (usually 'Purchase Accounts')
    * GST (input+output)  => the duties group   (usually 'Duties & Taxes')
      Do NOT match the substring 'GST' in a ledger name — some clients name the SALES base ledger
      'GSTR1' / PURCHASE base 'GSTR2', which are NOT tax ledgers.
    * cash => 'Cash-in-hand' group ; bank => 'Bank Accounts' group.
- A "sales voucher" = ANY voucher that contains at least one sales-revenue line — identify it by
  GUID, never by a voucher_type literal:
      SALES = df.ledger_primary_group == '<sales group>'
      sales_guids = df.loc[SALES, 'voucher_guid'].unique()
  This is robust whether the company calls it 'Sales', 'Domestic Sale', 'Tax Invoice', etc.
- CRITICAL GST TRAP: the duties group holds BOTH output GST (on sales, credit) AND input GST
  (on purchases, debit) using the SAME ledgers. Summing the duties group across the WHOLE daybook
  nets input against output and is WRONG (often negative).
      WRONG:  df.loc[df.ledger_primary_group=='Duties & Taxes','amount'].sum()         # whole book
      RIGHT:  gst = df[(df.ledger_primary_group=='Duties & Taxes') &
                       df.voucher_guid.isin(sales_guids)]['amount'].sum()              # sales only
  Always SCOPE GST-on-sales to sales_guids; GST-on-purchases to purchase_guids.
- "Total sales" = SIGNED sum over sales-revenue lines (nets credit notes/returns => net sales).
- "Turnover" / "exposure" with a party => (df.amount.abs()).sum() — a party hits both Dr and Cr,
  so a signed sum nets to ~0. Use .abs() for exposure; signed sum only for net position.
- Sign: amount<0 is a debit-side movement, amount>0 a credit-side movement on that line.
- Intra-state sale: CGST == SGST. Inter-state: IGST only (never alongside CGST/SGST).
- Dates are TEXT 'YYYY-MM-DD'. Month bucket = df.voucher_date.str[:7]. Use string compares for ranges.
- All money is INR. Round money with .round(2). In charts, format big values in lakh/crore.
- If a GROUPS bucket is referenced, filter with df[df.ledger_name.isin(GROUPS['NAME'])].`

// 10 presentation/date rules — turn raw aggregates into client-ready, correctly-ordered output.
const PRESENTATION = `# PRESENTATION & DATES — every deliverable must be client-ready (follow ALL 10)
1. PARSE DATES EXPLICITLY: dt = pd.to_datetime(df.voucher_date, format='%Y-%m-%d', errors='coerce').
   Never let pandas infer the format (silent misparse + FutureWarning). NaT-guard bad dates.
2. MONTH = KEY vs LABEL: bucket on the SORTABLE key df.voucher_date.str[:7] ('2025-07'); DISPLAY a
   human label 'Jul 2025' via pd.to_datetime(key+'-01').strftime('%b %Y'). ALWAYS sort by the key,
   NEVER by the label — alphabetical month names ('Apr','Aug','Dec'...) are wrong order.
3. CHRONOLOGICAL ALWAYS: after groupby(month/date) call .sort_index() (key ascending) BEFORE
   relabeling. Time series and every chart x-axis must run old -> new.
4. INDIAN FINANCIAL YEAR (Apr-Mar): "this year"/"current year"/"YTD" = current FY, NOT calendar year.
   FY of a date = year if month>=4 else year-1; label 'FY 2025-26'. Month order in an FY starts April.
5. FY QUARTERS, not calendar: Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar. Label 'Q1 FY25-26'.
6. FILL MISSING PERIODS: build the full month range and reindex so gaps show 0, not a skipped/
   teleporting line. A trend chart must have a continuous x-axis (no month silently dropped).
7. INDIAN DIGIT GROUPING for money: 12,34,567 (NOT 1,234,567). In Excel set the column
   number_format = '##,##,##0.00'; in chart labels / Word use the inr() helper below. Prefix the ₹ sign.
8. DATES IN OUTPUT = dd-mm-yyyy (Indian), never the ISO input: dt.dt.strftime('%d-%m-%Y'). Keep the
   ISO key only as a hidden sort column if you still need to order by it.
9. SORT BY SIGNAL: aggregates -> DESC by the main metric (turnover/amount/abs); row-level listings ->
   date ASC then voucher_number. Never leave default/insertion order.
10. TOTALS + ROUNDING: append a 'Total' row to Excel/Word money tables (sum money cols, blank labels);
    for a monthly series add a running YTD column. Round money to 2dp; never scientific notation (1.2e6).
BONUS — EMPTY GUARD: if a filter yields 0 rows, still write the file with one 'No matching records'
row so the demo never shows a traceback.

# REUSABLE HELPERS you may paste verbatim
def inr(x):  # Indian grouping: 1234567.5 -> '₹12,34,567.50'
    import re
    s = f'{abs(float(x)):.2f}'; whole, dec = s.split('.')
    if len(whole) > 3:
        whole = re.sub(r'(\\d)(?=(\\d\\d)+$)', r'\\1,', whole[:-3]) + ',' + whole[-3:]
    return ('-' if float(x) < 0 else '') + '₹' + whole + '.' + dec

def fy_label(dt):  # pandas datetime Series -> 'FY 2025-26'
    y = dt.dt.year.where(dt.dt.month >= 4, dt.dt.year - 1)
    return 'FY ' + y.astype(str) + '-' + (y + 1).astype(str).str[-2:]`

const FORMAT_RULES = {
  excel: `Target = Excel. Write a clean workbook to OUTPUT_PATH with pandas.ExcelWriter(OUTPUT_PATH, engine='openpyxl'). Clear sheet names, a header row, numbers rounded to 2dp. Add a TOTAL row where it helps.`,
  csv: `Target = CSV. Write the result DataFrame to OUTPUT_PATH with .to_csv(OUTPUT_PATH, index=False).`,
  chart_png: `Target = PNG chart. Build ONE clear matplotlib chart with plt (already imported, Agg backend). Title, axis labels, legend where useful. Format rupee axes in lakh/crore. Save with plt.savefig(OUTPUT_PATH, dpi=150, bbox_inches='tight'); plt.close().`,
  chart_jpeg: `Target = JPEG chart. Build ONE clear matplotlib chart with plt (Agg backend), titled and labelled, rupee axes in lakh/crore. Save with plt.savefig(OUTPUT_PATH, dpi=150, bbox_inches='tight'); plt.close().`,
  word: `Target = Word. Build a short report with python-docx: from docx import Document; a heading, 1-2 sentences of finding, then a table of the result; doc.save(OUTPUT_PATH).`,
}

// Live values present in THIS company's db — so the model never guesses a group/voucher_type.
function dataDict(catalog) {
  if (!catalog) return ''
  const list = (a) => (a && a.length ? a.map((v) => `'${v}'`).join(', ') : '(none)')
  return `\n# DATA DICTIONARY — actual values in THIS database (use these EXACT strings; never invent)
VOUCHER TYPES (${(catalog.voucherTypes || []).length}): ${list(catalog.voucherTypes)}
LEDGER PRIMARY GROUPS (${(catalog.primaries || []).length}): ${list(catalog.primaries)}\n`
}

export function buildPySystem(format, groupNames = [], catalog = null) {
  const groupsBlock = `\n# USER-DEFINED GROUPS\nA dict GROUPS is preloaded mapping these names to lists of ledger_name strings. Filter with df[df.ledger_name.isin(GROUPS['NAME'])]:\n${groupNames.length ? groupNames.join(', ') : '(none defined)'}`
  return `You are an expert Python data analyst AND a meticulous Indian Chartered Accountant working with Tally accounting data (amounts in INR). You translate an auditor's request into flawless pandas.

# DATA
${SCHEMA}${groupsBlock}
${dataDict(catalog)}
${EVIDENCE}

${PRESENTATION}

# TASK
Write Python that answers the request and saves the deliverable.
${FORMAT_RULES[format] || FORMAT_RULES.excel}

# RULES
- Use ONLY df and df_ledgers (already in scope). Never read files, never use the network.
- OUTPUT_PATH is already defined — save the deliverable EXACTLY there.
- Available libraries: pandas (pd), numpy (np), matplotlib (plt, charts), openpyxl, python-docx.
- Follow EVERY rule in the EVIDENCE block. Classify by ledger_primary_group. Scope GST to the
  right vouchers. Use .abs() for turnover/exposure. Copy group strings verbatim from the DATA
  DICTIONARY — if a needed group is absent there, return an empty result, do NOT invent a string.
- Any ledger/party name appears as a token like @@L42@@ — use it verbatim inside quotes; it is
  substituted with the real value before the code runs.
- Follow EVERY rule in PRESENTATION & DATES: pretty month labels ('Jul 2025') sorted chronologically,
  Indian FY for "this year", dd-mm-yyyy dates, ₹ Indian digit grouping, a Total row, no dropped months.
- Make numbers presentation-ready: .round(2), sort by signal, label columns in plain English (₹ where money).
- Output ONLY Python code. No prose, no markdown fences, no explanation.`
}

// Few-shot pandas exemplars — teach the patterns (same idea as schema.js FEW_SHOT).
const PY_FEW_SHOT = [
  {
    q: 'top 10 parties by turnover as a formatted Excel',
    code: `g = (df[df.party_name != '']
       .assign(exposure=df.amount.abs())
       .groupby('party_name')
       .agg(vouchers=('voucher_guid','nunique'), turnover=('exposure','sum'))
       .reset_index().sort_values('turnover', ascending=False).head(10).round(2))
with pd.ExcelWriter(OUTPUT_PATH, engine='openpyxl') as xl:
    g.to_excel(xl, sheet_name='Top parties', index=False)`,
  },
  {
    q: 'month-wise net sales and the GST charged on those sales, as Excel',
    code: `SALES_PG = 'Sales Accounts'   # pick the real sales group from the DATA DICTIONARY
DUTIES_PG = 'Duties & Taxes'
mkey = df.voucher_date.str[:7]                          # sortable key '2025-07'
sales_guids = df.loc[df.ledger_primary_group == SALES_PG, 'voucher_guid'].unique()
sales = df[df.ledger_primary_group == SALES_PG].groupby(mkey).amount.sum()
gst = (df[(df.ledger_primary_group == DUTIES_PG) & df.voucher_guid.isin(sales_guids)]
       .groupby(mkey).amount.sum())
out = pd.concat([sales.rename('Net Sales (₹)'), gst.rename('GST on Sales (₹)')], axis=1).fillna(0)
full = pd.period_range(out.index.min(), out.index.max(), freq='M').astype(str)  # rule 6: no gaps
out = out.reindex(full, fill_value=0).sort_index().round(2)                      # rule 3: chrono
out.index = pd.to_datetime(out.index + '-01').strftime('%b %Y')                  # rule 2: 'Jul 2025'
out.index.name = 'Month'
out = out.reset_index()
out.loc[len(out)] = ['Total', *out.iloc[:, 1:].sum().round(2)]                   # rule 10: total row
with pd.ExcelWriter(OUTPUT_PATH, engine='openpyxl') as xl:
    out.to_excel(xl, sheet_name='Sales & GST', index=False)
    ws = xl.sheets['Sales & GST']
    for col in ('B', 'C'):                                                       # rule 7: ₹ Indian grouping
        for cell in ws[col][1:]:
            cell.number_format = '##,##,##0.00'`,
  },
]

export function buildPyMessages(mask, question, format, groupNames = [], catalog = null) {
  const maskedQ = maskQuestion(question, mask)
  const messages = [{ role: 'system', content: buildPySystem(format, groupNames, catalog) }]
  for (const ex of PY_FEW_SHOT) {
    messages.push({ role: 'user', content: ex.q })
    messages.push({ role: 'assistant', content: ex.code })
  }
  messages.push({ role: 'user', content: maskedQ })
  return { masked: maskedQ, messages }
}

// strip fences / reasoning, keep code
export function extractPyCode(raw) {
  let c = (raw || '').trim()
  c = c.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  const fences = [...c.matchAll(/```(?:python|py)?\s*([\s\S]*?)```/gi)]
  if (fences.length) c = fences[fences.length - 1][1].trim()
  return c
}

export { unmaskPy }
