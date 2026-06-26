# LedgerLens — internal TODO

NL→SQL audit assistant over Tally exports. **Local-first. Data never leaves the browser.**
Headline feature = chat → SQL → run in-browser → beautiful result + Excel export.
LLM backend = Cloud LLM (BYO key). New project — NOT a branch of FinAnalyzer.

## Stack (decided)
- Vite + React (client-side SPA, deployable to GitHub Pages)
- `sql.js` (SQLite compiled to WASM) — runs entirely in the browser tab
- Cloud LLM API, OpenAI-compatible, base `your endpoint`
  - Models: `a cheap cloud model` (cheap, default), `a stronger cloud model` (hard queries)
  - (``/`` deprecate 2026-07-24 → map to v4-flash modes)
- `xlsx` (SheetJS) for Excel export with provenance sheet

## Privacy model (NON-NEGOTIABLE — the whole pitch)
- DB opened **read-only**; never mutated.
- LLM call sends ONLY: table/column schema + a **masked** catalog of ledgers/parties/groups
  (real names → tokens `@@L42@@`, structural attrs like primary_group kept — not sensitive).
- User question is masked too: known entity names → tokens before send.
- LLM returns SQL using tokens → we **unmask** tokens → real names → run on local DB.
- No row data, no rupee figure, no client name ever leaves the device.
- Guard: reject any SQL that isn't a single read-only SELECT/WITH.
- Air-gapped tier (later): swap Cloud LLM for local Ollama → zero egress.

## Phase 1 — SQL bot (DOING NOW)
- [x] Confirm Cloud LLM latest models + pricing
- [x] Project scaffold + sample Cache Digitech DB
- [ ] sql.js loader: load sample DB + upload .sqlite / .zip-of-csv
- [ ] Build `daybook_accounting_lines` view if export only has raw CSVs
- [ ] Masking engine (bidirectional token map, mask question + catalog, unmask SQL)
- [ ] Schema/prompt builder (system prompt + few-shot incl. GSTR1=sales-base trap)
- [ ] Cloud LLM client (OpenAI-compat fetch, read usage tokens)
- [ ] SQL guard (read-only enforce + LIMIT cap)
- [ ] Self-correct loop (feed sql.js error back once, max 2 attempts)
- [ ] Result table: Indian number format, right-align figures, flag chips, drill-down
- [ ] Excel export with provenance sheet (question + SQL + timestamp + rows)
- [ ] Cost tab: per-call token log + cumulative $ (cache-hit/miss aware)
- [ ] Settings tab: BYO key (localStorage only, never bundled), model picker, privacy toggles
- [ ] Privacy panel: show EXACTLY what bytes left the device (the masked payload)

## Phase 2 — custom groups (semantic layer)  ✅ DONE
- [x] Group manager: create group, pick members by primary / parent / ledger / STOCK ITEM (4 bases)
- [x] Mixed bases per group + manual exclude overrides (rule + hand-pick)
- [x] Rule-based membership (re-evaluates on data load) — primary/parent auto-refresh
- [x] Member-review screen (live resolved count + preview list before save)
- [x] Groups injected into prompt as token buckets (RELATED_PARTIES → [@@L7@@…])
- [x] Sidebar lists groups w/ live member counts; per-query scope chips in composer
- [x] Persist groups in localStorage

## Phase 2.5 — done alongside
- [x] All Cloud LLM costs in INR (editable USD→INR rate, default ₹94, in Settings)
- [x] Manual mode module: build tokenized prompt → copy into any LLM → paste SQL back → unmask + run locally (zero-API, proves tokenization)
- [x] Stock-item masking (@@S#@@ tokens) + full sample DB (33 tables, 114 stock items, 610 inventory)

## Phase 4 — local model / air-gapped tier  ✅ DONE
- [x] Provider abstraction (providers.js) — Cloud LLM cloud vs Local, both OpenAI-compatible
- [x] Generic chat client (llm.js) with configurable baseUrl/apiKey/model
- [x] Settings: provider radio; local = base URL + model tag (arctic-text2sql-r1:7b), no key
- [x] R1 reasoning strip in sanitizeSql (<think>…</think>, fenced ```sql, prose-prefixed)
- [x] Local cost = ₹0; cost log + chat strip show "local · ₹0"
- [x] Privacy badge flips to "Air-gapped — nothing leaves device"
- [x] CORS + mixed-content guidance shown in Settings (OLLAMA_ORIGINS, Chrome loopback)
- [ ] LATER: bundle sql.js wasm for true offline (currently from node module — already local, ok)
- [ ] LATER: confirm Arctic-R1 GGUF availability / Ollama pull instructions in README

## Phase 5 — profiles + god-tier prompt  ✅ DONE
- [x] Saved queries (Save query button in chat; persisted localStorage)
- [x] Profile export/import (.llprofile.json) — bundles saved queries + groups + prefs
- [x] API key NEVER exported (verified roundtrip: keyLeaked=false)
- [x] Import merges by id (imported wins); applies prefs but keeps existing key
- [x] Profile tab: export/import, counts, run/delete saved queries (run → loads + auto-runs in chat)
- [x] Prompt overhaul (schema.js) using Text2SQL research:
      - Code Representation: schema as CREATE TABLE DDL with column comments
      - Schema linking: full DDL for core tables, names-only for the rest
      - BIRD-style EVIDENCE block (Tally domain rules: Dr/Cr, ABS-turnover, GST-by-group, GSTR1 trap…)
      - 6 diverse few-shot exemplars + strict single-statement output contract
      - Verified: local Arctic now uses SUM(ABS()) for turnover (was netting to ~0)

## Phase 6 — chat history + reformat assistant  ✅ DONE
History (one transcript per company):
- [x] Lifted conversation state to App (survives tab switch — was the bug)
- [x] Persist to localStorage per company (survives reload — was the bug)
- [x] Full transcript render; New chat + per-turn delete
- [x] Multi-turn context: prior turns (masked Q+SQL) injected so "now only March" works
Reformat assistant (separate writer model):
- [x] Assistant role split from SQL engine (Arctic can't write prose)
- [x] Tiered: Chrome Nano (on-device) -> local Ollama -> Cloud LLM (opt-in, warns)
- [x] chromeai.js (Prompt API / LanguageModel), assistant.js, intent.js
- [x] Result buttons: Summarize / Draft email / Explain + smart follow-up routing (Auto/SQL/Ask)
- [x] Prose turns stored in history; copy; "sent to cloud" badge when Cloud LLM
- [x] Pre-format amount cols to INR before sending to writer (fixes magnitude errors)
- [x] Broadened amount-column regex (turnover/gross/sum/…) — fixes table display too
- [x] Verified: local qwen2.5:3b drafts correct client email (₹164.77 Crore); Chrome Nano falls back cleanly

## Phase 7 — threaded replies + question improver + intuitive UI  ✅ DONE
- [x] Threaded per-result replies: each SQL result is a parent; prose replies nest under it (left rail + indent)
- [x] Per-result inline composer "↳ Ask about this result…" — your OWN prompt against that specific result
- [x] Removed Auto/SQL/Ask toggle — intent from location (reply = reformat, bottom box = new SQL)
- [x] Quick buttons (Summarize/Email/Explain) still on each result
- [x] Question improver (improve.js): ✨ Improve sharpens your question, ✨ Suggest when empty
      - Assistant tier (Chrome→local→Cloud LLM), sends only question + generic vocab (no client names)
      - Returns improved + why + 3 alternatives, one-click to use
- [x] Intuitive empty state: 3-step explainer (Ask → see SQL+result → reply to refine)
- [x] Verified live on local Arctic + qwen: threaded reply linked via sourceId, improver returns suggestions
- NOTE: qwen 3b prose can mis-order; use a bigger local writer or Cloud LLM assistant for higher-stakes emails

## Demo ops
- [x] scripts/*.command — one-click START-DEMO / STOP-DEMO + individual ollama/app start-stop
- Storage: all app state in browser localStorage (per origin); DB in tab RAM only; ollama models in ~/.ollama

## Phase 3 — FinAnalyzer modules  ✅ DONE (reimplemented native over SQLite daybook)
"Core audit" sidebar section, deterministic (no LLM), each via SQL on daybook_accounting_lines:
- [x] Accounting Ledger Analytics — per-ledger Dr/Cr/Net/vouchers/first-last
- [x] Voucher Book View — one row per voucher, filter by type
- [x] Ledger Statement — ledger picker + chronological lines + running balance
- [x] Party Ledger Transaction Matrix — party × month turnover pivot
- [x] Related Party (RPT) Analysis — auto-flag by group+name + user "related" groups (ctx)
- [x] Trial Balance Analysis — Dr/Cr/Net by ledger + group, balanced-check (diff ₹0 ✓)
- [x] Balance Sheet (Schedule III) — closing balances mapped to Sch III heads + tie check
- Framework: lib/modules.js (MODULES registry) + components/ModuleView.jsx (metrics/table/note + param controls + per-table Excel export)
- Verified live on Cache sample: all 7 run clean; TB balances; ledger picker switches; matrix pivots
- NOTE: source was FinAnalyzer-CSV-Version (TS/CSV); logic reimplemented over SQLite, not copied verbatim

## Phase 3.5 — FinAnalyzer EXACT look & feel + styled Excel  ✅ DONE
- [x] Module UI restyled to FinAnalyzer's design (slate/Tailwind values as scoped .fa-* CSS):
      icon header + description sentence, white rounded-xl metric cards (uppercase labels,
      font-800 numbers, coloured icon chips), green "Export Excel" button, slate table cards
- [x] Per-module description sentences (FinAnalyzer pattern) added to MODULES
- [x] Styled Excel via xlsx-js-style (excelStyle.js): deep-slate title band, slate column-header
      row, Indian accounting number format (lakh/crore, parentheses-neg, Nil), zebra body,
      autofilter, freeze header — mirrors FinAnalyzer excelStyles PALETTE/NUMFMT
- [x] Per-table export + header "Export Excel (all)" → one sheet per table
- [x] Verified live: Ledger Analytics renders FinAnalyzer-style; export builds + downloads no error
- SCOPE: matches FinAnalyzer's design system + styled workbooks across all 7 modules; NOT a
  byte-identical port of each module's bespoke internals (e.g. TB collapsible tree). Deepen on request.

## Design notes (from /design-critique on FinAnalyzer)
- Local-first is the FEATURE — green "data stays on device" badge, never a yellow warning.
- 3 tiers only: headline number → table → filters-on-demand.
- One accent (purple). Color = meaning (red=exception), not decoration.
- One Indian number format everywhere (₹ L/Cr abbrev; full figure on drill-down).
- Sentence case. Tabular figures, right-aligned, in tables.

## Demo gold (real Cache Digitech findings — use on stage)
- Client names sales ledger `GSTR1`, purchase `GSTR2` → regex `%GST%` mis-tags base as tax
  → 100% bogus GST rate. ONLY user-curated role map fixes. THE pitch.
- 3 NSE IFSC sales (₹1.71 Cr) with zero GST = SEZ zero-rated, verify LUT.
- "Cache Digitech Delhi" ₹114.7 Cr in Sundry Debtors = related party auto-grouping misses.
