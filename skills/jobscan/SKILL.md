---
name: jobscan
description: Scan target companies for new job openings, filter by title/location/seniority, dedupe against history, and regenerate README.md with the freshest list. Use when invoked by cron or when the user asks to "scan jobs" or "refresh job list".
---

# jobscan

Single-purpose skill for this repo. Adapted from the career-ops `scan` mode but stripped to: detect → filter → dedupe → publish.

## Steps

1. **Read inputs**
   - `companies.yml` — watchlist with ATS endpoints / careers URLs.
   - `config/filters.yml` — title/location positive+negative filters, `max_age_days`.
   - `data/jobs.json` — existing scan store (may be empty array on first run).
   - `data/seen.tsv` — dedup ledger of `<company>\t<external_id>` seen across all runs.

2. **Fetch** by calling `node scripts/scan.mjs` from this repo. The script:
   - Hits Greenhouse / Ashby / Lever JSON endpoints directly (zero-LLM).
   - For Workday / SmartRecruiters / careers_url entries, returns an empty list with a `needs_playwright: true` flag.
   - Writes raw results to `data/.cache/raw-<timestamp>.json`.

3. **Playwright fallback** — for any entry with `needs_playwright: true` in the raw output, the skill uses the Playwright MCP tools (`mcp__playwright__browser_navigate`, `mcp__playwright__browser_snapshot`, `mcp__playwright__browser_evaluate`) to open the `careers_url`, extract job rows (title, location, URL, posted_at if visible), and merge them into the raw set. Playwright starts via the Chrome profile path provided by `.env` (`CHROME_USER_DATA_DIR`) so requests look like a real session.

4. **Filter** — apply `config/filters.yml`. A job survives only if:
   - At least one title positive substring matches AND no title negative matches.
   - At least one location positive substring matches AND no location negative matches.
   - `posted_at` (when available) is within `max_age_days`.

5. **Dedupe** — drop any job whose `<company>\t<external_id>` (or `<company>\t<sha1(url)>` as fallback) is in `data/seen.tsv`. Append new IDs to `data/seen.tsv`.

6. **Persist**
   - Update `data/jobs.json` — array of `{company, title, location, url, posted_at, discovered_at, source}`. Discarded entries (no longer in the latest scan AND older than `max_age_days`) are removed.
   - Regenerate `README.md` from `data/jobs.json` (see template in `skills/jobscan/README.template.md`).

7. **Done** — return a one-line summary: `N new, M total active across K companies`.

## What this skill does NOT do

- Does not evaluate fit / score / customize CVs / submit applications. It is purely a discovery feed.
- Does not push to git. The cron wrapper `scripts/run-scan.sh` handles commit + push after the skill exits.

## Failure handling

- If `scripts/scan.mjs` fails for a single company, that company is skipped with a logged warning. The scan still completes.
- If Playwright MCP is unavailable, careers_url-only entries are skipped with a warning.
- Never block the scan on a single failure; partial results are better than none.
