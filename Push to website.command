#!/usr/bin/env bash
# Double-click in Finder: rebuilds the figure list and pushes to GitHub → website.
cd "$(dirname "$0")"
./push.sh
echo
read -n 1 -s -r -p "Done — press any key to close."
