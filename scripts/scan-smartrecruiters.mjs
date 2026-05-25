// SmartRecruiters fetcher — runs after scan.mjs and APPENDS matching jobs to data/jobs.json.
// Companies are picked up from companies.yml where careers_url contains "smartrecruiters.com".

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import YAML from 'yaml';

const REPO = resolve(new URL('..', import.meta.url).pathname);
const COMPANIES = resolve(REPO, 'companies.yml');
const FILTERS = resolve(REPO, 'config/filters.yml');
const JOBS = resolve(REPO, 'data/jobs.json');
const SEEN = resolve(REPO, 'data/seen.tsv');
const CACHE_DIR = resolve(REPO, 'data/.cache');

const TIMEOUT_MS = 15000;

function readYaml(p) { return YAML.parse(readFileSync(p, 'utf8')); }

function slugFromSrUrl(url) {
  const m = url.match(/smartrecruiters\.com\/([^/?#]+)/i);
  return m ? m[1] : null;
}

async function fetchSrCompany(slug) {
  // SmartRecruiters public posting API. Returns up to 100 active postings.
  const url = `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

function normalize(company, posting) {
  // SmartRecruiters posting shape:
  //   { id, name, uuid, refNumber, releasedDate, postingUrl,
  //     location: { city, region, country }, customField, ... }
  const loc = posting.location || {};
  const locStr = [loc.city, loc.region, loc.country].filter(Boolean).join(', ');
  return {
    company,
    title: posting.name || '',
    location: locStr,
    url: posting.applyUrl || posting.postingUrl || posting.ref || '',
    posted_at: posting.releasedDate || posting.createdOn || '',
    source: 'smartrecruiters',
    external_id: String(posting.id || posting.uuid || posting.refNumber || ''),
  };
}

function passFilters(job, filters) {
  const titleLc = (job.title || '').toLowerCase();
  const locLc = (job.location || '').toLowerCase();

  const tpos = (filters.title?.positive || []).map(s => s.toLowerCase());
  const tneg = (filters.title?.negative || []).map(s => s.toLowerCase());
  const lpos = (filters.location?.positive || []).map(s => s.toLowerCase());
  const lneg = (filters.location?.negative || []).map(s => s.toLowerCase());

  if (tpos.length && !tpos.some(s => titleLc.includes(s))) return false;
  if (tneg.some(s => titleLc.includes(s))) return false;
  if (lpos.length && !lpos.some(s => locLc.includes(s))) return false;
  if (lneg.some(s => locLc.includes(s))) return false;

  if (filters.max_age_days && filters.max_age_days > 0 && job.posted_at) {
    const ageMs = Date.now() - new Date(job.posted_at).getTime();
    if (Number.isFinite(ageMs) && ageMs > filters.max_age_days * 86400 * 1000) return false;
  }
  return true;
}

function loadSeen() {
  if (!existsSync(SEEN)) return new Set();
  const lines = readFileSync(SEEN, 'utf8').split(/\r?\n/).filter(Boolean);
  return new Set(lines);
}

async function main() {
  const companies = readYaml(COMPANIES).companies || [];
  const filters = readYaml(FILTERS) || {};
  const seen = loadSeen();

  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

  const srTargets = companies
    .filter(c => c.careers_url && /smartrecruiters\.com/i.test(c.careers_url))
    .map(c => ({ name: c.name, slug: slugFromSrUrl(c.careers_url) }))
    .filter(c => c.slug);

  if (!srTargets.length) {
    console.log('scan-sr: no SmartRecruiters entries in companies.yml');
    return;
  }

  const discoveredAt = new Date().toISOString();
  const newJobs = [];
  const rawAll = {};

  for (const { name, slug } of srTargets) {
    try {
      const data = await fetchSrCompany(slug);
      const postings = Array.isArray(data.content) ? data.content
                     : Array.isArray(data) ? data
                     : [];
      rawAll[slug] = postings.length;

      for (const p of postings) {
        const job = normalize(name, p);
        if (!job.external_id) {
          job.external_id = createHash('sha1').update(job.url || job.title).digest('hex').slice(0, 12);
        }
        const seenKey = `${name}\t${job.external_id}`;
        if (seen.has(seenKey)) continue;
        if (!passFilters(job, filters)) continue;

        job.discovered_at = discoveredAt;
        newJobs.push(job);
        seen.add(seenKey);
        appendFileSync(SEEN, `${seenKey}\n`);
      }
      console.log(`scan-sr: ${name} (${slug}) — ${postings.length} postings, ${newJobs.filter(j => j.company === name).length} new`);
    } catch (e) {
      console.warn(`scan-sr: ${name} (${slug}) FAILED — ${e.message}`);
    }
  }

  // Append new jobs to data/jobs.json (merge — don't replace what scan.mjs wrote)
  let existing = [];
  if (existsSync(JOBS)) {
    try { existing = JSON.parse(readFileSync(JOBS, 'utf8')); } catch { existing = []; }
  }
  const merged = [...existing, ...newJobs];

  // Dedupe by company + external_id (in case scan.mjs already saw any of these)
  const seenKeys = new Set();
  const deduped = [];
  for (const j of merged) {
    const k = `${j.company}\t${j.external_id}`;
    if (seenKeys.has(k)) continue;
    seenKeys.add(k);
    deduped.push(j);
  }

  writeFileSync(JOBS, JSON.stringify(deduped, null, 2));
  writeFileSync(resolve(CACHE_DIR, `smartrecruiters-${discoveredAt.replace(/[:.]/g, '-')}.json`), JSON.stringify(rawAll, null, 2));
  console.log(`scan-sr: added ${newJobs.length} new, total ${deduped.length} active`);
}

main().catch(e => {
  console.error('scan-sr: fatal —', e.message);
  process.exit(1);
});
