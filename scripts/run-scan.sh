#!/bin/bash
# Cron entry point v3. Inlines the docs/ copy — no separate sync-pages.mjs.
# Flow: claude(scan.mjs) -> scan-smartrecruiters.mjs -> regen-readme.mjs -> cp -> commit/push
# Overwrite scripts/run-scan.sh with this file's contents.

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

# 1. Greenhouse / Ashby / Lever fetch via the jobscan skill.
"$CLAUDE_BIN" -p "Run the jobscan skill. Scan companies.yml using ATS endpoints. Apply config/filters.yml. Write data/jobs.json. Be concise." \
  --permission-mode bypassPermissions \
  --output-format text \
  > data/scan.log 2>&1 || {
    echo "claude exit $? — see data/scan.log" >&2
    exit 1
  }

# 2. SmartRecruiters fetch — appends to data/jobs.json.
node scripts/scan-smartrecruiters.mjs >> data/scan.log 2>&1 || true

# 3. Regenerate README from the merged data/jobs.json.
node scripts/regen-readme.mjs >> data/scan.log 2>&1 || true

# 4. Mirror data/jobs.json into docs/ so Pages serves the latest scan.
mkdir -p docs
cp data/jobs.json docs/jobs.json

# 5. Commit + push only if something changed. Pages auto-deploys on push to main.
if ! git diff --quiet HEAD -- data/jobs.json docs/jobs.json README.md 2>/dev/null; then
  TIMESTAMP="$(date -u +%Y-%m-%dT%H:%MZ)"
  git add data/jobs.json docs/jobs.json README.md data/seen.tsv
  git commit -m "scan: $TIMESTAMP" --quiet
  git push "$GIT_REMOTE" "$GIT_BRANCH" --quiet
  echo "pushed scan: $TIMESTAMP"
else
  echo "no changes"
fi
