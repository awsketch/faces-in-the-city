#!/usr/bin/env bash
# push.sh — rebuild the figure index, then sync to GitHub.
# Usage:  ./push.sh "your commit message"
set -e
cd "$(dirname "$0")"

if command -v node >/dev/null 2>&1; then
  node tools/build.mjs
else
  echo "! node not found — figures/index.json NOT rebuilt (install Node from nodejs.org)"
fi

MSG="${1:-update $(date +'%Y-%m-%d %H:%M')}"
git add -A
if git diff --cached --quiet; then
  echo "Nothing to commit — pushing any local commits anyway."
else
  git commit -m "$MSG"
fi
if git rev-parse --abbrev-ref --symbolic-full-name @{u} >/dev/null 2>&1; then
  git push
else
  git push -u origin main
fi
