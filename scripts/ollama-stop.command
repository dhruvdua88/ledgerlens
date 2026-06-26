#!/bin/bash
# Stop Ollama (quits the app + server). Double-click to run.
echo "■ Stopping Ollama…"
osascript -e 'quit app "Ollama"' 2>/dev/null
sleep 2
# force-kill any leftover server process
pkill -f "Ollama" 2>/dev/null
pkill -x ollama 2>/dev/null

if curl -s -o /dev/null http://localhost:11434/api/tags; then
  echo "✗ Still responding — quit Ollama from the menu bar."
else
  echo "✓ Ollama stopped."
fi
