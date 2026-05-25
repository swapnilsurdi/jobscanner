// Hard post-filter on data/jobs-all.json (the canonical history).
// Drops rows that don't meet title/location filters.
// (Pure additive history is great, but we don't want junk lingering forever.)

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';

const REPO = resolve(new URL('..', import.meta.url).pathname);
const JOBS = resolve(REPO, 'data/jobs-all.json');
const FILTERS = resolve(REPO, 'config/filters.yml');

if (!existsSync(JOBS)) { console.log('clean: data/jobs-all.json missing'); process.exit(0); }
const filters = existsSync(FILTERS) ? YAML.parse(readFileSync(FILTERS, 'utf8')) : {};

const tpos = (filters.title?.positive || []).map(s => s.toLowerCase());
const tneg = [
  ...(filters.title?.negative || []),
  'Staff Software Engineer',
  'Senior Staff Software',
  'Software Engineer I,',
  'Software Engineer I ',
  'SDE I,',
  'SDE I ',
].map(s => s.toLowerCase());
const lpos = (filters.location?.positive || []).map(s => s.toLowerCase());
const lneg = (filters.location?.negative || []).map(s => s.toLowerCase());

const before = JSON.parse(readFileSync(JOBS, 'utf8'));
const dropped = { no_location: 0, title_neg: 0, no_title_pos: 0, loc_neg: 0, no_loc_match: 0 };
const kept = [];

for (const j of before) {
  const title = (j.title || '').toLowerCase();
  const loc = (j.location || '').toLowerCase();

  if (!loc.trim()) { dropped.no_location++; continue; }
  if (lneg.some(s => loc.includes(s))) { dropped.loc_neg++; continue; }
  if (lpos.length && !lpos.some(s => loc.includes(s))) { dropped.no_loc_match++; continue; }
  if (tnegFinal(tneg).some(s => title.includes(s))) { dropped.title_neg++; continue; }
  if (tpos.length && !tpos.some(s => title.includes(s))) { dropped.no_title_pos++; continue; }

  kept.push(j);
}

function tnegFinal(list) { return list; }

writeFileSync(JOBS, JSON.stringify(kept, null, 2));
console.log(`clean: kept ${kept.length} of ${before.length}; dropped ${JSON.stringify(dropped)}`);
