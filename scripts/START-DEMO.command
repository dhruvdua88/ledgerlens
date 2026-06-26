#!/bin/bash
# One-click demo start: Ollama (+ warm models) then the web app.
# Leave this window open during the demo.
DIR="$(dirname "$0")"

# 1) Ollama
echo "▶ Starting Ollama…"
open -a Ollama
for i in $(seq 1 30); do curl -s -o /dev/null http://localhost:11434/api/tags && break; sleep 1; done
echo "▶ Pre-warming models…"
ollama run a-kore/Arctic-Text2SQL-R1-7B "SELECT 1;" >/dev/null 2>&1 && echo "  ✓ Arctic (SQL)"
ollama run qwen2.5:3b "ok" >/dev/null 2>&1 && echo "  ✓ qwen2.5 (writer)"

# 2) Web app
cd "$DIR/.." || exit 1
[ -d node_modules ] || npm install
echo "▶ Web app → http://localhost:5188 (leave this window open)"
( sleep 3; open "http://localhost:5188" ) &
npm run dev
