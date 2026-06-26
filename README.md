# LedgerLens

Local-first audit assistant for Chartered Accountants. Ask your Tally books in plain
English → it generates SQL, runs it **in the browser**, and shows verifiable results.
**Your data never leaves the device.**

## Why
Tally exports are queryable but cryptic. LedgerLens puts a natural-language layer on top,
with a privacy model strong enough for client financials: only a **masked** schema (ledger/
party/stock names replaced by tokens) ever reaches an LLM — never a rupee figure, never a
client name, never a row.

## Features
- **Chat with data** — NL → SQL over an in-browser SQLite (`sql.js`), read-only guard, self-correct.
- **Privacy masking** — ledgers/parties/stock-items tokenised before any LLM call; SQL un-tokenised locally before running.
- **Custom groups** — define semantic buckets (Related parties, Cash equivalents…) by primary group / parent / ledger / stock item; mixed + rule-based auto-refresh.
- **Three model tiers** — DeepSeek (cloud, masked) · BYO key · **fully air-gapped local** (Ollama / Arctic-Text2SQL-R1).
- **Assistant** — a separate writer model (Chrome Gemini Nano → local → DeepSeek) turns results into summaries / client emails / explanations.
- **Chat history** — persisted per company; multi-turn follow-ups ("now only March").
- **Profiles** — export/import saved queries + groups + prefs (never the API key).
- **Cost tab** — DeepSeek spend in INR; **Excel export** with a provenance working-paper sheet.

## Stack
Vite + React, `sql.js` (SQLite/WASM), `xlsx`. Fully client-side — deployable to GitHub Pages.

## Run
```bash
npm install
npm run dev      # http://localhost:5188
```

## Data
No sample database is committed (client financials stay off-GitHub by design). To try it,
use the **Load .sqlite** button with a Tally-loader SQLite export, or drop one at
`public/sample_data/cache_digitech.sqlite`.

## Local / air-gapped model
```bash
ollama pull a-kore/Arctic-Text2SQL-R1-7B
OLLAMA_ORIGINS=* ollama serve
```
Then Settings → provider = Local model. Nothing leaves the device.

## Privacy contract
- DB opened read-only; never mutated.
- LLM sees: masked schema + tokenised catalog + the (masked) question. Nothing else.
- Guard rejects any non-SELECT/WITH statement.
- Local tier = zero network egress.
