// Post-scan pruner. Drops jobs older than max_age_days from data/jobs.json.
// Age is measured from posted_at when present, otherwise discovered_at.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';

const REPO = resolve(new URL('..', import.meta.url).pathname);
const JOBS = resolve(REPO, 'data/jobs.json');
const FILTERS = resolve(REPO, 'config/filters.yml');

if (!existsSync(JOBS)) { console.log('prune: data/jobs.json missing'); process.exit(0); }
const filters = existsSync(FILTERS) ? YAML.parse(readFileSync(FILTERS, 'utf8')) : {};
const days = Number(filters.max_age_days || 0);
if (!days) { console.log('prune: max_age_days=0, no pruning'); process.exit(0); }

const cutoff = Date.now() - days * 86400 * 1000;
const before = JSON.parse(readFileSync(JOBS, 'utf8'));

const kept = before.filter(j => {
  const ts = Date.parse(j.posted_at || j.discovered_at || '');
  return Number.isFinite(ts) ? ts >= cutoff : true; // keep if no timestamp at all
});

writeFileSync(JOBS, JSON.stringify(kept, null, 2));
console.log(`prune: kept ${kept.length} of ${before.length} (dropped ${before.length - kept.length} older than ${days}d)`);
