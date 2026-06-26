# LedgerLens — internal TODO

NL→SQL audit assistant over Tally exports. **Local-first. Data never leaves the browser.**
Headline feature = chat → SQL → run in-browser → beautiful result + Excel export.
LLM backend = DeepSeek (BYO key). New project — NOT a branch of FinAnalyzer.

## Stack (decided)
- Vite + React (client-side SPA, deployable to GitHub Pages)
- `sql.js` (SQLite compiled to WASM) — runs entirely in the browser tab
- DeepSeek API, OpenAI-compatible, base `https://api.deepseek.com`
  - Models: `deepseek-v4-flash` (cheap, default), `deepseek-v4-pro` (hard queries)
  - (`deepseek-chat`/`deepseek-reasoner` deprecate 2026-07-24 → map to v4-flash modes)
- `xlsx` (SheetJS) for Excel export with provenance sheet

## Privacy model (NON-NEGOTIABLE — the whole pitch)
- DB opened **read-only**; never mutated.
- LLM call sends ONLY: table/column schema + a **masked** catalog of ledgers/parties/groups
  (real names → tokens `@@L42@@`, structural attrs like primary_group kept — not sensitive).
- User question is masked too: known entity names → tokens before send.
- LLM returns SQL using tokens → we **unmask** tokens → real names → run on local DB.
- No row data, no rupee figure, no client name ever leaves the device.
- Guard: reject any SQL that isn't a single read-only SELECT/WITH.
- Air-gapped tier (later): swap DeepSeek for local Ollama → zero egress.

## Phase 1 — SQL bot (DOING NOW)
- [x] Confirm DeepSeek latest models + pricing
- [x] Project scaffold + sample Cache Digitech DB
- [ ] sql.js loader: load sample DB + upload .sqlite / .zip-of-csv
- [ ] Build `daybook_accounting_lines` view if export only has raw CSVs
- [ ] Masking engine (bidirectional token map, mask question + catalog, unmask SQL)
- [ ] Schema/prompt builder (system prompt + few-shot incl. GSTR1=sales-base trap)
- [ ] DeepSeek client (OpenAI-compat fetch, read usage tokens)
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
- [x] All DeepSeek costs in INR (editable USD→INR rate, default ₹94, in Settings)
- [x] Manual mode module: build tokenized prompt → copy into any LLM → paste SQL back → unmask + run locally (zero-API, proves tokenization)
- [x] Stock-item masking (@@S#@@ tokens) + full sample DB (33 tables, 114 stock items, 610 inventory)

## Phase 4 — local model / air-gapped tier  ✅ DONE
- [x] Provider abstraction (providers.js) — DeepSeek cloud vs Local, both OpenAI-compatible
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
- [x] Tiered: Chrome Nano (on-device) -> local Ollama -> DeepSeek (opt-in, warns)
- [x] chromeai.js (Prompt API / LanguageModel), assistant.js, intent.js
- [x] Result buttons: Summarize / Draft email / Explain + smart follow-up routing (Auto/SQL/Ask)
- [x] Prose turns stored in history; copy; "sent to cloud" badge when DeepSeek
- [x] Pre-format amount cols to INR before sending to writer (fixes magnitude errors)
- [x] Broadened amount-column regex (turnover/gross/sum/…) — fixes table display too
- [x] Verified: local qwen2.5:3b drafts correct client email (₹164.77 Crore); Chrome Nano falls back cleanly

## Phase 3 — port FinAnalyzer modules (copy LATER, design schema first)
- [ ] Ledger Statement
- [ ] Party Ledger Transaction Matrix
- [ ] Voucher Book View
- [ ] (reuse FinAnalyzer styling but apply design-critique fixes: local-first hero state,
      3-tier hierarchy, one accent color, single Indian number format)

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
