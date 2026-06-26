#!/bin/bash
# Start Ollama + load the demo models into memory. Double-click to run.
echo "▶ Starting Ollama…"
open -a Ollama

echo "  waiting for server on :11434"
for i in $(seq 1 30); do
  if curl -s -o /dev/null http://localhost:11434/api/tags; then break; fi
  sleep 1
done

if ! curl -s -o /dev/null http://localhost:11434/api/tags; then
  echo "✗ Ollama did not start. Open the Ollama app manually."; exit 1
fi
echo "✓ Ollama up"

echo "▶ Pre-warming models (so the demo's first query is instant)…"
ollama run a-kore/Arctic-Text2SQL-R1-7B "SELECT 1;" >/dev/null 2>&1 && echo "  ✓ Arctic-Text2SQL (SQL engine) loaded"
ollama run qwen2.5:3b "ok" >/dev/null 2>&1 && echo "  ✓ qwen2.5:3b (writer) loaded"

echo
echo "Loaded now:"
ollama ps
echo
echo "✓ Ready for the demo. (Close this window — Ollama keeps running.)"
