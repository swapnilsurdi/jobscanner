#!/bin/bash
# Cron entry point v6. Tighter Claude prompt that explicitly mandates the Playwright pass
# for careers_url-only companies. Adds prune-stale.mjs after normalization.

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

# Tighter prompt — explicitly tells Claude to do the Playwright pass for careers_url entries.
"$CLAUDE_BIN" -p "Run the jobscan skill end-to-end per skills/jobscan/SKILL.md. Steps you MUST do in order: (1) node scripts/scan.mjs for the Greenhouse/Ashby/Lever fetch. (2) node scripts/scan-smartrecruiters.mjs for SmartRecruiters companies. (3) For EVERY entry in companies.yml that has a careers_url but no ats AND does NOT use smartrecruiters.com — open the page with Playwright MCP (mcp__playwright__browser_navigate + browser_snapshot), extract title/location/url/posted_at for visible job rows, apply config/filters.yml, dedupe against data/seen.tsv, and append the surviving rows to data/jobs.json. This means you MUST scrape: Atlassian, ServiceNow, Waymo, Zoox, Airbnb, Google, Meta, Amazon, Microsoft, Apple, NVIDIA, EvenUp. Spend no more than 30 seconds per company; skip on errors. Use selectors documented in SKILL.md. Apply title positive substring match (Software Engineer / Backend / Full Stack / Senior / Forward Deployed / Solutions Engineer / AI Engineer / SDE II) AND NOT title negatives (Manager / Director / Staff Engineer / Solutions Architect / Designer / Analyst / Counsel / Marketing). Apply location positives (San Francisco / Bay Area / Mountain View / Sunnyvale / Remote / United States / US-) AND NOT location negatives (United Kingdom / EMEA / Europe / India / Canada). When done, print a single summary line and exit. Do not commit or push — the wrapper handles that." \
  --permission-mode bypassPermissions \
  --output-format text \
  > data/scan.log 2>&1 || {
    echo "claude exit $? — see data/scan.log" >&2
    exit 1
  }

# Defensive — if Claude skipped the SR/normalize/prune steps, run them ourselves.
node scripts/scan-smartrecruiters.mjs >> data/scan.log 2>&1 || true
node scripts/normalize-jobs.mjs       >> data/scan.log 2>&1 || true
node scripts/prune-stale.mjs          >> data/scan.log 2>&1 || true
node scripts/regen-readme.mjs         >> data/scan.log 2>&1 || true

mkdir -p docs
cp data/jobs.json docs/jobs.json

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
