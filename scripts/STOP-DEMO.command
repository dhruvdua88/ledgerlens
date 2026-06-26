#!/bin/bash
# One-click demo stop: web app + Ollama.
echo "■ Stopping LedgerLens (port 5188)…"
PIDS=$(lsof -ti tcp:5188 2>/dev/null)
[ -n "$PIDS" ] && echo "$PIDS" | xargs kill 2>/dev/null && echo "  ✓ app stopped" || echo "  app not running"

echo "■ Stopping Ollama…"
osascript -e 'quit app "Ollama"' 2>/dev/null
sleep 2; pkill -f "Ollama" 2>/dev/null; pkill -x ollama 2>/dev/null
curl -s -o /dev/null http://localhost:11434/api/tags && echo "  ✗ Ollama still up (quit from menu bar)" || echo "  ✓ Ollama stopped"
echo "Done."
