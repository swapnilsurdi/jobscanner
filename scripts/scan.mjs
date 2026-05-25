#!/usr/bin/env node
/**
 * scan.mjs — zero-token job scanner.
 *
 * Reads companies.yml + config/filters.yml, hits Greenhouse/Ashby/Lever public
 * JSON endpoints, normalizes, filters, dedupes against data/seen.tsv, and
 * writes data/jobs.json + regenerates README.md.
 *
 * Workday / SmartRecruiters / no-ats entries are emitted as
 * `{needs_playwright: true, ...}` into the raw cache file for a downstream
 * Playwright-driven step (handled outside this script).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

// ── Paths ───────────────────────────────────────────────────────────
const COMPANIES_PATH = 'companies.yml';
const FILTERS_PATH = 'config/filters.yml';
const SEEN_PATH = 'data/seen.tsv';
const JOBS_PATH = 'data/jobs.json';
const CACHE_DIR = 'data/.cache';
const README_TPL = 'skills/jobscan/README.template.md';
const README_OUT = 'README.md';

const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; jobscanner/0.1)';

// ── HTTP ────────────────────────────────────────────────────────────
async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ── ATS fetchers ────────────────────────────────────────────────────
async function fetchGreenhouse(entry) {
  const slug = entry.slug;
  if (!slug) throw new Error('greenhouse: missing slug');
  const url = `https://api.greenhouse.io/v1/boards/${slug}/jobs?content=true`;
  const json = await fetchJson(url);
  const jobs = Array.isArray(json?.jobs) ? json.jobs : [];
  return jobs.filter(j => j.absolute_url).map(j => ({
    company: entry.name,
    title: j.title || '',
    location: j.location?.name || '',
    url: j.absolute_url,
    posted_at: j.first_published || j.updated_at || null,
    source: 'greenhouse',
    external_id: String(j.id ?? j.internal_job_id ?? j.absolute_url),
  }));
}

async function fetchAshby(entry) {
  const slug = entry.slug;
  if (!slug) throw new Error('ashby: missing slug');
  const url = `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=false`;
  const json = await fetchJson(url);
  const jobs = Array.isArray(json?.jobs) ? json.jobs : [];
  return jobs.map(j => ({
    company: entry.name,
    title: j.title || '',
    location: j.location || '',
    url: j.jobUrl || '',
    posted_at: j.publishedAt || j.updatedAt || null,
    source: 'ashby',
    external_id: String(j.id ?? j.jobUrl ?? j.title),
  })).filter(j => j.url);
}

async function fetchLever(entry) {
  const slug = entry.slug;
  if (!slug) throw new Error('lever: missing slug');
  const url = `https://api.lever.co/v0/postings/${slug}?mode=json`;
  const json = await fetchJson(url);
  if (!Array.isArray(json)) return [];
  return json.map(j => ({
    company: entry.name,
    title: j.text || '',
    location: j.categories?.location || '',
    url: j.hostedUrl || '',
    posted_at: j.createdAt ? new Date(j.createdAt).toISOString() : null,
    source: 'lever',
    external_id: String(j.id ?? j.hostedUrl ?? j.text),
  })).filter(j => j.url);
}

// ── Filters ─────────────────────────────────────────────────────────
function buildSubstringFilter(positive = [], negative = []) {
  const pos = positive.map(s => s.toLowerCase());
  const neg = negative.map(s => s.toLowerCase());
  return (value) => {
    if (!value) return pos.length === 0; // no value → only pass if no positive required
    const v = value.toLowerCase();
    if (neg.some(k => v.includes(k))) return false;
    if (pos.length === 0) return true;
    return pos.some(k => v.includes(k));
  };
}

// Location filter — empty value should PASS (don't penalize missing data).
function buildLocationFilter(positive = [], negative = []) {
  const pos = positive.map(s => s.toLowerCase());
  const neg = negative.map(s => s.toLowerCase());
  return (value) => {
    if (!value) return true;
    const v = value.toLowerCase();
    if (neg.some(k => v.includes(k))) return false;
    if (pos.length === 0) return true;
    return pos.some(k => v.includes(k));
  };
}

function isWithinMaxAge(posted_at, maxDays) {
  if (!posted_at || !maxDays || maxDays <= 0) return true;
  const ts = Date.parse(posted_at);
  if (Number.isNaN(ts)) return true;
  const ageDays = (Date.now() - ts) / (1000 * 60 * 60 * 24);
  return ageDays <= maxDays;
}

// ── Seen ledger ─────────────────────────────────────────────────────
function loadSeen() {
  const seen = new Set();
  if (!existsSync(SEEN_PATH)) return seen;
  const text = readFileSync(SEEN_PATH, 'utf-8');
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    seen.add(line);
  }
  return seen;
}

function appendSeen(entries) {
  if (entries.length === 0) return;
  const text = entries.join('\n') + '\n';
  appendFileSync(SEEN_PATH, text, 'utf-8');
}

// ── README rendering ────────────────────────────────────────────────
function renderReadme(jobs, timestamp) {
  if (!existsSync(README_TPL)) {
    console.warn(`warn: ${README_TPL} not found — skipping README render`);
    return;
  }
  const tpl = readFileSync(README_TPL, 'utf-8');

  const byCompany = new Map();
  for (const j of jobs) {
    if (!byCompany.has(j.company)) byCompany.set(j.company, []);
    byCompany.get(j.company).push(j);
  }
  const companies = [...byCompany.keys()].sort((a, b) => a.localeCompare(b));

  let body = '';
  if (companies.length === 0) {
    body = '_No jobs surfaced in the latest scan._';
  } else {
    const sections = companies.map(c => {
      const items = byCompany.get(c)
        .slice()
        .sort((a, b) => a.title.localeCompare(b.title));
      const lines = items.map(j => {
        const date = j.posted_at ? new Date(j.posted_at).toISOString().slice(0, 10) : 'unknown';
        const loc = j.location || 'Location N/A';
        return `- [${j.title}](${j.url}) — ${loc} — posted ${date}`;
      }).join('\n');
      return `### ${c}\n\n${lines}`;
    });
    body = sections.join('\n\n');
  }

  const out = tpl
    .replaceAll('{{TIMESTAMP}}', timestamp)
    .replaceAll('{{COUNT}}', String(jobs.length))
    .replaceAll('{{COMPANY_COUNT}}', String(companies.length))
    .replaceAll('{{JOBS_BY_COMPANY}}', body);

  writeFileSync(README_OUT, out, 'utf-8');
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  // Ensure dirs
  mkdirSync('data', { recursive: true });
  mkdirSync(CACHE_DIR, { recursive: true });

  // Load configs
  if (!existsSync(COMPANIES_PATH)) {
    console.error(`error: ${COMPANIES_PATH} not found`);
    process.exit(1);
  }
  if (!existsSync(FILTERS_PATH)) {
    console.error(`error: ${FILTERS_PATH} not found`);
    process.exit(1);
  }

  const companiesYml = YAML.parse(readFileSync(COMPANIES_PATH, 'utf-8')) || {};
  const filtersYml = YAML.parse(readFileSync(FILTERS_PATH, 'utf-8')) || {};

  const companies = companiesYml.companies || companiesYml.tracked_companies || [];
  const titleFilter = buildSubstringFilter(filtersYml.title?.positive, filtersYml.title?.negative);
  const locationFilter = buildLocationFilter(filtersYml.location?.positive, filtersYml.location?.negative);
  const maxAgeDays = Number(filtersYml.max_age_days ?? 0);

  // Dispatch
  const FETCHERS = { greenhouse: fetchGreenhouse, ashby: fetchAshby, lever: fetchLever };
  const NEEDS_PW = new Set(['workday', 'smartrecruiters']);

  const raw = [];
  const needsPlaywright = [];
  const errors = [];

  await Promise.all(companies.map(async (c) => {
    if (!c || !c.name) return;
    if (c.enabled === false) return;
    const ats = c.ats;
    if (!ats || NEEDS_PW.has(ats)) {
      needsPlaywright.push({
        needs_playwright: true,
        name: c.name,
        ats: ats || null,
        careers_url: c.careers_url || null,
      });
      return;
    }
    const fn = FETCHERS[ats];
    if (!fn) {
      needsPlaywright.push({
        needs_playwright: true,
        name: c.name,
        ats,
        careers_url: c.careers_url || null,
        reason: `unknown ats: ${ats}`,
      });
      return;
    }
    try {
      const jobs = await fn(c);
      raw.push(...jobs);
    } catch (err) {
      console.error(`warn: ${c.name} (${ats}) — ${err.message}`);
      errors.push({ company: c.name, ats, error: err.message });
    }
  }));

  // Write raw cache (before filtering) so downstream tools can debug
  const timestamp = new Date().toISOString();
  const cachePath = path.join(CACHE_DIR, `raw-${timestamp.replace(/[:.]/g, '-')}.json`);
  writeFileSync(cachePath, JSON.stringify({
    timestamp,
    raw,
    needs_playwright: needsPlaywright,
    errors,
  }, null, 2), 'utf-8');

  // Filter
  const filtered = raw.filter(j =>
    titleFilter(j.title) &&
    locationFilter(j.location) &&
    isWithinMaxAge(j.posted_at, maxAgeDays)
  );

  // Load existing jobs.json (for discovered_at carry-forward) + seen ledger
  const seen = loadSeen();
  let previousJobs = [];
  if (existsSync(JOBS_PATH)) {
    try {
      previousJobs = JSON.parse(readFileSync(JOBS_PATH, 'utf-8'));
      if (!Array.isArray(previousJobs)) previousJobs = [];
    } catch {
      previousJobs = [];
    }
  }
  const prevByKey = new Map();
  for (const p of previousJobs) {
    prevByKey.set(`${p.company}\t${p.external_id}`, p);
  }

  // Dedup + normalize. We keep the job if it surfaced this scan AND
  // passes filters AND is within max age — `seen.tsv` is the append-only
  // discovery ledger; carrying forward uses jobs.json's prior entries
  // for stable discovered_at.
  const finalJobs = [];
  const newSeenLines = [];
  const intraRunKeys = new Set();
  for (const j of filtered) {
    const key = `${j.company}\t${j.external_id}`;
    if (intraRunKeys.has(key)) continue;
    intraRunKeys.add(key);

    const prev = prevByKey.get(key);
    const discovered_at = prev?.discovered_at || timestamp;
    finalJobs.push({
      company: j.company,
      title: j.title,
      location: j.location,
      url: j.url,
      posted_at: j.posted_at,
      discovered_at,
      source: j.source,
      external_id: j.external_id,
    });
    if (!seen.has(key)) {
      seen.add(key);
      newSeenLines.push(key);
    }
  }

  // Write outputs
  writeFileSync(JOBS_PATH, JSON.stringify(finalJobs, null, 2) + '\n', 'utf-8');
  appendSeen(newSeenLines);
  renderReadme(finalJobs, timestamp);

  const companyCount = new Set(finalJobs.map(j => j.company)).size;
  console.log(`scan complete: ${newSeenLines.length} new, ${finalJobs.length} total active across ${companyCount} companies`);

  if (errors.length > 0) {
    console.log(`(${errors.length} fetch error${errors.length === 1 ? '' : 's'} — see stderr above)`);
  }
  if (needsPlaywright.length > 0) {
    console.log(`(${needsPlaywright.length} companies need playwright — see ${cachePath})`);
  }
}

main().catch(err => {
  console.error('fatal:', err.stack || err.message);
  process.exit(1);
});
