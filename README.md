<div align="center">

# 🔍 LedgerLens

### Ask your Tally books in plain English. Get audit-grade answers — in your browser.

**Your client data never leaves the device.** No upload. No server. No leak.

![Local-first](https://img.shields.io/badge/Local--first-100%25%20in%20browser-0F2440)
![Privacy](https://img.shields.io/badge/Privacy-data%20never%20leaves%20device-16a34a)
![Stack](https://img.shields.io/badge/React%20%2B%20Vite-sql.js%20(SQLite%2FWASM)-3178c6)
![License](https://img.shields.io/badge/open--source-yes-blue)

</div>

---

## 💡 What is this?

Tally exports are powerful but cryptic — endless tables, reserved group names, sign conventions that trip everyone up. **LedgerLens** puts a friendly layer on top:

> *"Show me every party where we booked an expense but deducted no TDS."*
> *"Total sales with no GST line in March."*
> *"Top 10 creditors by exposure."*

You type the question. LedgerLens writes the SQL, runs it **inside your browser**, and hands back a verifiable, exportable answer. Built by a CA, for CAs and auditors.

---

## 🔒 The privacy promise (read this first)

This is the whole point. LedgerLens is **local-first**:

- 📦 Your `.sqlite` opens **entirely in the browser tab's memory** — nothing is uploaded anywhere.
- 🛡️ If you use a cloud LLM, it sees **only a masked schema** — ledger / party / stock names are swapped for tokens like `@@L42@@`. **Never a rupee figure, never a client name, never a single row.**
- 🔁 The generated SQL is un-tokenised **locally** and run **locally**.
- ✈️ Prefer zero network at all? Run the **fully air-gapped local model** — nothing leaves the machine. Ever.
- 🚫 The DB is opened **read-only**; a guard rejects anything that isn't a `SELECT` / `WITH`.

---

## 🚀 Quick start (3 steps)

```
  ┌─────────────────┐      ┌──────────────────┐      ┌─────────────────────┐
  │  1. Export from │      │  2. Load .sqlite │      │  3. Ask / click a   │
  │     Tally  →    │ ───▶ │   into LedgerLens│ ───▶ │     module          │
  │   a .sqlite     │      │   (in browser)   │      │  → instant answers  │
  └─────────────────┘      └──────────────────┘      └─────────────────────┘
```

### Step 1 — Get the `.sqlite` from Tally
Use the companion **TSF Exporter** — a one-click tool that wraps the Tally loader and produces the `.sqlite` LedgerLens reads:

### 👉 **[TSF Exporter →](https://github.com/dhruvdua88/FinAnalyzer-CSV-Version/tree/main/app/python-tsf-exporter)**

> Windows-first, hides the loader internals, GUI or CLI. Hand it to staff and they just click "Export."

### Step 2 — Open LedgerLens & load the file
```bash
npm install
npm run dev          # → http://localhost:5188
```
Click **Load .sqlite** (or try the **Sample company** if one is present). It opens instantly, in-browser.

### Step 3 — Analyse
Chat in plain English, **or** jump straight into a ready-made audit module (below).

---

## 🧰 Built-in audit modules

One click each — deterministic, no LLM needed, fully exportable to styled Excel.

| Module | What it does |
|---|---|
| 📊 **Accounting Ledger Analytics** | Opening / closing / movement per ledger, with abnormal-balance flags |
| 📖 **Voucher Book View** | Every voucher, Dr/Cr split, drill into lines |
| 🧾 **Ledger Statement** | Running-balance statement for any ledger |
| ⊞ **Party Ledger Transaction Matrix** | Per-party matrix apportioning each voucher into **Sales / Purchase / Expenses / TDS / GST / RCM / Bank / Others** — with GSTIN/PAN/State, TDS% & GST% ratios, balance gaps, anomaly flags, a Party × Counter-Ledger pivot, and a 4-sheet Excel export |
| ⚇ **Related Party (RPT) Analysis** | Surfaces director / KMP / group transactions |
| ▣ **Trial Balance Analysis** | TB with reconciliation checks (opening + movement = closing) |
| ⚖ **Balance Sheet (Schedule III)** | Schedule III–grouped balance sheet |

---

## 💬 Chat with your data

- **NL → SQL** over in-browser SQLite, with a **read-only guard** and **self-correction** on errors.
- **Custom groups** — define your own buckets (Related parties, Cash equivalents…) by primary group / parent / ledger / stock item. Rule-based auto-refresh.
- **Three model tiers**:
  - ☁️ **Cloud LLM** — bring your own OpenAI-compatible endpoint (masked schema only)
  - 🔑 **BYO key**
  - ✈️ **Fully air-gapped local** — Ollama / Arctic-Text2SQL-R1, zero egress
- **Assistant** — a separate writer model (Chrome Gemini Nano → local → cloud) turns results into summaries, client emails, or plain-English explanations.
- **Chat history** — persisted per company; multi-turn follow-ups ("now only March").
- **Profiles** — export/import saved queries + groups + prefs (never the API key).
- **Cost tab** — track cloud LLM spend in ₹, with a provenance working-paper Excel sheet.

---

## ✈️ Going fully offline (air-gapped)

```bash
ollama pull a-kore/Arctic-Text2SQL-R1-7B
OLLAMA_ORIGINS=* ollama serve
```
Then **Settings → Provider → Local model**. Nothing touches the network.

---

## 🛠️ Stack

Vite + React · `sql.js` (SQLite compiled to WASM) · `xlsx-js-style`. Fully client-side — deployable to GitHub Pages or any static host.

---

## 📁 Data note

No sample database is committed — client financials stay off GitHub by design. To try it, load your own Tally-loader `.sqlite` via **Load .sqlite**, or drop one at `public/sample_data/cache_digitech.sqlite`.

---

## 🤝 The toolkit

| | |
|---|---|
| 🔍 **LedgerLens** (this repo) | Ask & analyse Tally books in the browser |
| 📤 **[TSF Exporter](https://github.com/dhruvdua88/FinAnalyzer-CSV-Version/tree/main/app/python-tsf-exporter)** | Turn a Tally company into the `.sqlite` LedgerLens reads |

---

<div align="center">

**Built for auditors who care about privacy.** 🛡️
Local-first · open-source · your data, your device.

</div>
