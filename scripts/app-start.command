#!/bin/bash
# Start the LedgerLens web app (dev server). Double-click to run.
# Keep this window OPEN while demoing — closing it stops the app.
cd "$(dirname "$0")/.." || exit 1
echo "▶ LedgerLens — $(pwd)"

if [ ! -d node_modules ]; then
  echo "  installing dependencies (first run)…"
  npm install || { echo "✗ npm install failed"; exit 1; }
fi

echo "▶ Starting on http://localhost:5188"
echo "  opening browser in 3s… (leave this window open)"
( sleep 3; open "http://localhost:5188" ) &
npm run dev
