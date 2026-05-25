# jobscanner

A focused job-board scanner for a personal target-company watchlist. Goal: detect new role openings at watched companies, filter them by title/level/location, and publish a fresh list to `README.md`.

## How to run a scan

Invoke the `jobscan` skill in `skills/jobscan/`. It will:

1. Read `companies.yml` (target list with ATS endpoints).
2. Read filters from `config/filters.yml`.
3. Hit Greenhouse / Ashby / Lever / Workday public APIs directly (zero-LLM, fast).
4. For companies whose APIs fail or return JS-rendered pages, fall back to **Playwright MCP** (configured in `.mcp.json`). Playwright launches via the Chrome profile path in `.env` (`CHROME_USER_DATA_DIR`) so the session looks human and avoids basic bot blocks.
5. Apply title/seniority/location filters and dedupe against `data/jobs.json` history.
6. Write new+active roles to `data/jobs.json`.
7. Regenerate `README.md` listing the latest jobs grouped by company, with discovery date, title, location, and apply URL.
8. `git add -A && git commit -m "scan: <timestamp>" && git push origin main` (single-branch repo).

## Cron entry (every 2h)

A cron line is committed at `scripts/cron.example`. Each user installs it locally with their own absolute path; nothing personal is hardcoded in this repo.

```
# every 2 hours
0 */2 * * * /bin/bash -lc 'cd "$JOBSCANNER_DIR" && ./scripts/run-scan.sh >> data/scan.log 2>&1'
```

Set `JOBSCANNER_DIR` and other vars in your shell profile or in this repo's `.env` (gitignored).

## Files

- `companies.yml` — watchlist of target companies + ATS endpoints. Edit freely.
- `config/filters.yml` — title positive/negative filters, seniority, location.
- `skills/jobscan/SKILL.md` — the scan skill the Claude agent invokes.
- `scripts/scan.mjs` — Node.js scanner (Greenhouse/Ashby/Lever/Workday + Playwright fallback).
- `scripts/run-scan.sh` — cron wrapper: loads `.env`, runs scan, commits, pushes.
- `data/jobs.json` — current active scanned jobs (canonical store).
- `data/seen.tsv` — dedup history across runs.
- `data/scan.log` — last run log.
- `.env.example` — required env vars; copy to `.env`.
- `.mcp.json` — Playwright MCP server registration (uses `CHROME_USER_DATA_DIR`).
- `.claude/settings.local.json` — agent permissions allowlist.

## Permissions model

The agent has explicit allowlist permissions for: Read/Write/Edit on this repo, Bash for `node scripts/scan.mjs`, `git add/commit/push`, and the `mcp__playwright__*` tools. See `.claude/settings.local.json`.

## Environment

Required in `.env` (see `.env.example`):
- `CHROME_USER_DATA_DIR` — path to Chrome user-data directory used by Playwright.
- `JOBSCANNER_DIR` — absolute path to this repo (for cron).
- `GIT_REMOTE` — defaults to `origin`.

Never commit `.env`. Paths and identifiers stay local.
