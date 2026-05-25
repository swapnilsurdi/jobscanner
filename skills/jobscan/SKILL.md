---
name: jobscan
description: Scan target companies for new job openings, filter by title/location/seniority, dedupe against history, and regenerate README.md with the freshest list. Use when invoked by cron or when the user asks to "scan jobs" or "refresh job list".
---

# jobscan

Single-purpose skill for this repo. Adapted from the career-ops `scan` mode. Detect → filter → dedupe → publish.

## Steps

1. **Read inputs**
   - `companies.yml` — watchlist. Entries either have an `ats` (greenhouse/ashby/lever) + `slug`, OR a `careers_url` (Workday / SmartRecruiters / custom).
   - `config/filters.yml` — title/location filters + `max_age_days`.
   - `data/jobs.json` — existing scan store (may be empty array on first run).
   - `data/seen.tsv` — dedup ledger.

2. **API fetch** — call `node scripts/scan.mjs`. It hits Greenhouse / Ashby / Lever JSON endpoints directly. For Workday / SmartRecruiters / `careers_url`-only entries, it emits `{needs_playwright: true, careers_url, name}` to the raw cache and skips.

3. **SmartRecruiters fetch** — call `node scripts/scan-smartrecruiters.mjs`. It picks up entries whose `careers_url` contains `smartrecruiters.com` and uses the public posting API. Results are appended to `data/jobs.json`.

4. **Playwright fallback (REQUIRED for big tech)** — for every remaining entry in `companies.yml` that has a `careers_url` but no `ats` (and is not SmartRecruiters), you MUST open the page with Playwright MCP and scrape job rows. This is the only way to get Google, Meta, Amazon, Microsoft, Apple, NVIDIA, Atlassian, ServiceNow, Waymo, Zoox, Airbnb, EvenUp. The pattern for each company:
   - `mcp__playwright__browser_navigate({ url: <careers_url> })`
   - If the page requires entering a search query (`"software engineer"`), use `mcp__playwright__browser_fill_form` / `mcp__playwright__browser_type` and submit.
   - `mcp__playwright__browser_snapshot` to read the rendered DOM.
   - Extract `title`, `location`, `url`, and `posted_at` if visible. Common selectors per site:
     - **Google**: page is `careers.google.com` — look for `[role="article"]` cards; each has title + locations + apply link.
     - **Meta**: `metacareers.com/jobs` — table rows under `[role="row"]`, title + locations + req-id link.
     - **Amazon**: `amazon.jobs` — `.job-tile` elements; title in `.job-title`, location in `.location-and-id`.
     - **Microsoft**: `jobs.careers.microsoft.com` — search results are virtualized; scroll and extract from `[aria-label*="Job item"]` cards.
     - **Apple**: `jobs.apple.com/en-us/search` — table-based; rows contain title + team + location.
     - **NVIDIA**: Workday board — `[data-automation-id="jobTitle"]` for title, `[data-automation-id="locations"]` for location.
     - **Atlassian / ServiceNow**: Workday — same selectors as NVIDIA.
     - **Waymo / Zoox / Airbnb**: custom pages — read DOM and extract anchor lists.
     - **EvenUp**: `evenuplaw.com/careers` — Greenhouse iframe; extract from `iframe[src*=greenhouse]` if present, else the listed cards.
   - For each extracted row, build `{company, title, location, url, posted_at, source: "playwright", external_id: <sha1(url) first 12>}` and check it against `data/seen.tsv`. Apply `config/filters.yml` filters (title + location, positive AND not-negative). Append new ones to `data/jobs.json` and append `<company>\t<external_id>` to `data/seen.tsv`.
   - LIMIT each company scrape to ~30 seconds total. If a page is unreachable or the structure has changed, log a warning and move on — never block the run.

5. **Normalize + prune** — `scripts/normalize-jobs.mjs` (sorts) and `scripts/prune-stale.mjs` (drops anything older than `max_age_days`, falling back to `discovered_at` when `posted_at` is missing) are called by the cron wrapper after this skill exits.

6. **Done** — return a one-line summary: `N new from ATS, M new from Playwright, total T active across K companies`.

## Failure handling

- Single-company failures (404, timeout, DOM change) must not crash the run.
- Playwright unavailability → log a warning and skip the Playwright pass; ATS results still publish.
