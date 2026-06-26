#!/bin/bash
# Stop the LedgerLens web app (frees port 5188). Double-click to run.
echo "■ Stopping LedgerLens (port 5188)…"
PIDS=$(lsof -ti tcp:5188 2>/dev/null)
if [ -n "$PIDS" ]; then
  echo "$PIDS" | xargs kill 2>/dev/null
  sleep 1
  echo "✓ Stopped."
else
  echo "  nothing running on 5188."
fi
