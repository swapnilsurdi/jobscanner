#!/bin/bash
# Cron entry point v7. Much more explicit Playwright prompt + post-filter via clean-jobs.mjs.

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

read -r -d '' PROMPT <<'PROMPT_EOF' || true
You are running the jobscan skill end-to-end.

REQUIRED order:
  1. Run `node scripts/scan.mjs` (Greenhouse/Ashby/Lever).
  2. Run `node scripts/scan-smartrecruiters.mjs`.
  3. PLAYWRIGHT PASS (this is where you usually skimp — do not).

For step 3, you MUST scrape every careers_url-only company in companies.yml that is NOT smartrecruiters.com. That list is: Atlassian, ServiceNow, NVIDIA, Waymo, Zoox, Airbnb, Google, Meta, Amazon, Microsoft, Apple, EvenUp.

For EACH of those companies, do ALL of the following:

A. Navigate via mcp__playwright__browser_navigate to the careers_url.
B. If the page has a search box, type "software engineer" into it and submit (mcp__playwright__browser_type, then Enter or Search). Most big-tech career pages REQUIRE a search to populate results.
C. If the page exposes location or seniority filters (sidebar, dropdown), narrow to: location="United States" (or "California" / "San Francisco Bay Area" / "Remote, USA"); seniority filter to include "Mid", "Senior", "L4", "L5" (skip Intern / Entry / Principal / Director / VP).
D. mcp__playwright__browser_snapshot to get the rendered DOM.
E. EXTRACT every visible job row. For EACH row you keep, you MUST capture all four fields:
   - title (non-empty string)
   - location (non-empty string — if a row has no location visible, DROP it; do not push it through with empty location)
   - url (absolute apply link)
   - posted_at (if visible — relative dates like "3 days ago" should be converted to ISO; if not visible, leave as empty string and let the pruner decide via discovered_at)
F. If pagination is available, click "Next" / "Load more" up to 2 times and re-snapshot to capture more rows. Do not exceed 3 pages per company.
G. Hard timebox: 60 seconds per company including all snapshots and pagination. If a page errors, log and move on.

Filtering you apply BEFORE appending:
  - Title MUST contain at least one of: "Software Engineer", "Backend", "Full Stack", "Fullstack", "Platform Engineer", "AI Engineer", "Forward Deployed", "Solutions Engineer", "Founding Engineer", "Senior". Lower-case substring match.
  - Title MUST NOT contain any of: "Manager", "Director", "Principal Engineer", "Staff Engineer", "Staff Software Engineer", "Senior Staff", "VP", "Head of", "Solutions Architect", "Designer", "Analyst", "Counsel", "Brand", "Marketing", "Compliance", "Data Scientist", "Recruit", "Intern", "Sales", "Software Engineer I,", "Software Engineer I ", "SDE I,". (Senior Software Engineer and Software Engineer II/III pass — those are fine.)
  - Location MUST contain at least one of: "San Francisco", "Bay Area", "Mountain View", "Palo Alto", "Menlo Park", "San Jose", "Sunnyvale", "Santa Clara", "Foster City", "Redwood City", "San Mateo", "Oakland", "Remote", "United States", "USA", "US-".
  - Location MUST NOT contain any of: "United Kingdom", "EMEA", "Europe", "India", "Bangalore", "Tokyo", "Singapore", "Sydney", "Australia", "Canada only", "Remote - Canada", "Germany", "France", "Spain", "Netherlands", "Tel Aviv", "Dublin".

For each surviving row, append to data/jobs.json as:
{
  "company": "<Company Name from companies.yml>",
  "title": "<extracted>",
  "location": "<extracted>",
  "url": "<absolute apply URL>",
  "posted_at": "<ISO or empty>",
  "discovered_at": "<now ISO>",
  "source": "playwright",
  "external_id": "<sha1(url) first 12 chars>"
}
Check `<company>\t<external_id>` against data/seen.tsv; skip if present; otherwise append to seen.tsv.

EXPECTED OUTCOME for a healthy run: at least 5–15 surviving rows per big-tech company (or none if the search returned nothing matching Bay Area). If you finish with 0 rows for Apple/Google/Meta/Amazon, you under-scraped — go back and apply the search + pagination steps you skipped.

Print a one-line summary at the end: "N new from ATS, M new from Playwright, total T".
Do not commit or push — the wrapper handles that.
PROMPT_EOF

"$CLAUDE_BIN" -p "$PROMPT" \
  --permission-mode bypassPermissions \
  --output-format text \
  > data/scan.log 2>&1 || {
    echo "claude exit $? — see data/scan.log" >&2
    exit 1
  }

# Defensive pipeline (idempotent if the agent did them inline)
node scripts/scan-smartrecruiters.mjs >> data/scan.log 2>&1 || true
node scripts/clean-jobs.mjs           >> data/scan.log 2>&1 || true
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
