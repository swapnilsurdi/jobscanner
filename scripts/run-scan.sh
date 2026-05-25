#!/bin/bash
# Cron entry point. Loads .env, runs scan via claude -p, syncs Pages data, commits, pushes.
# Same as run-scan.sh but also mirrors data/jobs.json -> docs/jobs.json for GitHub Pages.
# RENAME this to run-scan.sh to make it the active wrapper (overwriting the older version).

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"

if [ -f "$REPO_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO_DIR/.env"
  set +a
fi

CLAUDE_BIN="${CLAUDE_BIN:-claude}"
GIT_REMOTE="${GIT_REMOTE:-origin}"
GIT_BRANCH="${GIT_BRANCH:-main}"

cd "$REPO_DIR"

git fetch "$GIT_REMOTE" "$GIT_BRANCH" --quiet || true
git merge --ff-only "$GIT_REMOTE/$GIT_BRANCH" --quiet || true

"$CLAUDE_BIN" -p "Run the jobscan skill. Scan all companies in companies.yml using the configured ATS endpoints, falling back to Playwright MCP for JS-rendered pages. Apply config/filters.yml. Write results to data/jobs.json (canonical store, JSON array) and regenerate README.md with the latest filtered jobs grouped by company. Be concise — no commentary, just do the work." \
  --permission-mode bypassPermissions \
  --output-format text \
  > data/scan.log 2>&1 || {
    echo "claude exit $? — see data/scan.log" >&2
    exit 1
  }

node scripts/sync-pages.mjs >> data/scan.log 2>&1 || true

if ! git diff --quiet HEAD -- data/jobs.json docs/jobs.json README.md 2>/dev/null; then
  TIMESTAMP="$(date -u +%Y-%m-%dT%H:%MZ)"
  git add data/jobs.json docs/jobs.json README.md
  git commit -m "scan: $TIMESTAMP" --quiet
  git push "$GIT_REMOTE" "$GIT_BRANCH" --quiet
  echo "pushed scan: $TIMESTAMP"
else
  echo "no changes"
fi
