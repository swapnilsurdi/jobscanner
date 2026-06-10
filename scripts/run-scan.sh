#!/bin/bash
# v8: append-only history (data/jobs-all.json), top-50 README, parallel haiku agents for Playwright.
# Pages mirrors jobs-all.json (shows everything).

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
You orchestrate a parallel job scan. Goal: refresh data/jobs.json with everything we can find today.

STEP 1 — Run the API fetchers SEQUENTIALLY (fast, no parallelism needed):
  - `node scripts/scan.mjs`                       (Greenhouse/Ashby/Lever)
  - `node scripts/scan-smartrecruiters.mjs`        (SmartRecruiters API)

STEP 2 — Run the Playwright pass in PARALLEL but CHUNKED to avoid memory pressure. Dispatch Haiku subagents in batches of 4 at a time (single message with 4 parallel Agent tool calls, await all, then next batch). Companies to scrape across all batches:
  Google, Meta, Amazon, Apple, Microsoft, NVIDIA, Atlassian, ServiceNow, Waymo, Zoox, Airbnb, Snowflake, EvenUp.
  Suggested batching: [Google, Meta, Amazon, Apple] → [Microsoft, NVIDIA, Atlassian, ServiceNow] → [Waymo, Zoox, Airbnb, Snowflake] → [EvenUp].
  This is critical: more than 4 concurrent Chromium contexts will OOM-kill background apps via macOS jetsam.

For EACH subagent (Agent tool, subagent_type=general-purpose, model=haiku):

  Brief them like this:
  ---
  You are scraping <Company> for current Software Engineer openings in Bay Area or US-Remote ONLY.

  1. mcp__playwright__browser_navigate to: <careers_url from companies.yml — it's pre-filtered for US locations and "software engineer">.
  2. If the page still shows non-US locations or no results, use the page's search/filter UI to apply:
     - keyword: "software engineer"
     - location: "United States" or "California" or "San Francisco Bay Area" or "Remote, USA"
     - level/seniority (if present): include Senior / Mid / L4 / L5 / IC4-IC6; EXCLUDE Intern / Entry / Director / VP / Principal.
  3. mcp__playwright__browser_snapshot to get the rendered DOM.
  4. Extract job rows. REQUIRED fields per row: title, location, url. Optional: posted_at (convert "3 days ago" to ISO if shown).
  5. Apply filters BEFORE returning a row:
     - title must include one of: Software Engineer / Backend / Full Stack / Platform / AI Engineer / Forward Deployed / Solutions Engineer / Founding Engineer / Senior / SDE II
     - title must NOT include: Manager / Director / Staff Engineer / Staff Software Engineer / Senior Staff / Principal Engineer / VP / Head of / Solutions Architect / Designer / Analyst / Counsel / Marketing / Compliance / Data Scientist / Recruit / Intern / Sales / "Software Engineer I" / "SDE I"
     - location must include one of: San Francisco / Bay Area / Mountain View / Palo Alto / Menlo Park / Sunnyvale / Santa Clara / Foster City / Remote / United States / USA / US-
     - location must NOT include: United Kingdom / EMEA / Europe / India / Bangalore / Tokyo / Singapore / Sydney / Canada (unless "United States" also present) / Germany / France / Tel Aviv / Dublin
     - If row has empty location, DROP IT — don't ingest.
  6. Pagination: click Next / Load more up to 2 times (max 3 pages) to capture more rows.
  7. Hard timebox: 90 seconds total.
  8. Return ONLY a JSON array (no commentary) of surviving rows in this exact shape:
     [{ "title": "...", "location": "...", "url": "...", "posted_at": "" }]
     Up to 50 rows per company. If 0 rows, return [].

  Do NOT write to disk. Do NOT call any other tool besides Playwright. Return ONLY the JSON.
  ---

STEP 3 — Once all subagents return, collect their JSON arrays. For each row:
  - Compute external_id = first 12 chars of sha1(url).
  - Build the full job record: { company, title, location, url, posted_at, discovered_at: "<NOW ISO>", source: "playwright", external_id }.
  - Check `<company>\\t<external_id>` against data/seen.tsv; skip if present; otherwise append to seen.tsv.
  - Append the full record to data/jobs.json.

STEP 4 — Print a single summary line: "ATS: A new | Playwright: P new | Total in this scan: T".
Do NOT run any cleanup, normalize, merge, README regen, or git commit — the wrapper script handles that.

PERMISSIONS NOTE — This session runs with a strict allowlist (no bypassPermissions).
If ANY tool call is denied by the permission system, OR you find yourself needing a
tool that isn't on the allowlist (Bash beyond the two node scripts above, WebFetch,
Grep, Glob, additional MCP tools, etc.), STOP and write a file at
`human_interaction_needed.md` in the repo root describing:
  - which tool/command was needed
  - which step required it
  - the exact error message if you saw one
Then exit gracefully. Do not retry the same denied call repeatedly.
PROMPT_EOF

# Least-privilege: no bypassPermissions. Only the tools this prompt actually uses,
# and Bash is restricted to the two node scripts above. cwd is pinned to
# /Users/swapnil/jobscanner, so file ops can't escape this folder.
"$CLAUDE_BIN" -p "$PROMPT" \
  --permission-mode acceptEdits \
  --allowedTools "Bash(node scripts/scan.mjs)" "Bash(node scripts/scan-smartrecruiters.mjs)" "Read" "Write" "Edit" "Task" "mcp__playwright__browser_navigate" "mcp__playwright__browser_snapshot" \
  --output-format text \
  > data/scan.log 2>&1 || {
    echo "claude exit $? — see data/scan.log" >&2
    exit 1
  }

# Post-scan pipeline (idempotent)
node scripts/scan-smartrecruiters.mjs  >> data/scan.log 2>&1 || true
node scripts/merge-history.mjs         >> data/scan.log 2>&1 || true
node scripts/clean-jobs.v2.mjs         >> data/scan.log 2>&1 || true
node scripts/normalize-jobs.v2.mjs     >> data/scan.log 2>&1 || true
node scripts/regen-readme.v2.mjs       >> data/scan.log 2>&1 || true

# Pages serves the full history as Parquet (read selectively by the viewer over
# HTTP range requests). The export reads data/jobs-all.json (NOT data/jobs.json,
# which stays the canonical career-ops contract) and writes docs/data/.
mkdir -p docs/data
node scripts/export-parquet.mjs >> data/scan.log 2>&1 || echo "export-parquet failed — see data/scan.log" >&2

if ! git diff --quiet HEAD -- data/jobs.json data/jobs-all.json docs/data/jobs.parquet docs/data/meta.json README.md 2>/dev/null; then
  TIMESTAMP="$(date -u +%Y-%m-%dT%H:%MZ)"
  git add data/jobs.json data/jobs-all.json docs/data/jobs.parquet docs/data/meta.json README.md data/seen.tsv
  git commit -m "scan: $TIMESTAMP" --quiet
  git push "$GIT_REMOTE" "$GIT_BRANCH" --quiet
  echo "pushed scan: $TIMESTAMP"
else
  echo "no changes"
fi
