#!/bin/bash
# Cron entry point v4. Adds docs/meta.json with the actual scan-run timestamp.
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

SCAN_START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

"$CLAUDE_BIN" -p "Run the jobscan skill. Scan companies.yml using ATS endpoints. Apply config/filters.yml. Write data/jobs.json. Be concise." \
  --permission-mode bypassPermissions \
  --output-format text \
  > data/scan.log 2>&1 || {
    echo "claude exit $? — see data/scan.log" >&2
    exit 1
  }

node scripts/scan-smartrecruiters.mjs >> data/scan.log 2>&1 || true
node scripts/regen-readme.mjs >> data/scan.log 2>&1 || true

mkdir -p docs
cp data/jobs.json docs/jobs.json

# Write scan metadata for the Pages UI (separate from per-job discovered_at).
JOB_COUNT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('data/jobs.json','utf8')).length)")
COMPANY_COUNT=$(node -e "console.log(new Set(JSON.parse(require('fs').readFileSync('data/jobs.json','utf8')).map(j=>j.company)).size)")
cat > docs/meta.json <<EOF
{
  "last_scan_at": "$SCAN_START",
  "job_count": $JOB_COUNT,
  "company_count": $COMPANY_COUNT
}
EOF

if ! git diff --quiet HEAD -- data/jobs.json docs/jobs.json docs/meta.json README.md 2>/dev/null; then
  TIMESTAMP="$(date -u +%Y-%m-%dT%H:%MZ)"
  git add data/jobs.json docs/jobs.json docs/meta.json README.md data/seen.tsv
  git commit -m "scan: $TIMESTAMP" --quiet
  git push "$GIT_REMOTE" "$GIT_BRANCH" --quiet
  echo "pushed scan: $TIMESTAMP"
else
  echo "no changes"
fi
