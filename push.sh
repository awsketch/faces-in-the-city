#!/usr/bin/env bash
# push.sh — one-command sync to GitHub
# Usage:  ./push.sh "your commit message"
# If no message is given, a timestamped one is used.

set -e

cd "$(dirname "$0")"

MSG="${1:-update $(date +'%Y-%m-%d %H:%M')}"

git add -A

# Skip the commit step if there's nothing staged
if git diff --cached --quiet; then
  echo "Nothing to commit — pushing any local commits anyway."
else
  git commit -m "$MSG"
fi

# First push sets upstream; subsequent pushes are plain.
if git rev-parse --abbrev-ref --symbolic-full-name @{u} >/dev/null 2>&1; then
  git push
else
  git push -u origin main
fi
