// Hard post-filter. Drops rows that ATS fetchers or Playwright agent let slip.
// Runs after all scanners but before normalize+prune.
//
// Rules:
//   - Drop if `location` is empty (location filter can't validate -> reject as untrustworthy).
//   - Drop if title matches expanded negative list (entry-level + Staff+ at big tech).
//   - Drop if title contains no positive substring (extra belt-and-braces).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';

const REPO = resolve(new URL('..', import.meta.url).pathname);
const JOBS = resolve(REPO, 'data/jobs.json');
const FILTERS = resolve(REPO, 'config/filters.yml');

if (!existsSync(JOBS)) { console.log('clean: data/jobs.json missing'); process.exit(0); }
const filters = existsSync(FILTERS) ? YAML.parse(readFileSync(FILTERS, 'utf8')) : {};
const tpos = (filters.title?.positive || []).map(s => s.toLowerCase());
const tneg = [...(filters.title?.negative || []),
  // Extras to catch Playwright-discovered patterns the user's list missed
  'Staff Software Engineer',
  'Senior Staff Software',
  'Staff+ ',
  'Software Engineer I,',
  'Software Engineer I ',
  'Software Engineer I-',
  'SDE I,',
  'SDE I ',
  'Engineer II',  // careful: matches both directions — kept to drop Amazon SDE II that maps to mid-senior at big tech and is fine, REMOVE if too aggressive
].map(s => s.toLowerCase());
// Actually keep "Engineer II" allowed for big tech mid-senior; remove from negatives
const KEEP = new Set(['engineer ii']);
const tnegFinal = tneg.filter(s => !KEEP.has(s));

const lpos = (filters.location?.positive || []).map(s => s.toLowerCase());
const lneg = (filters.location?.negative || []).map(s => s.toLowerCase());

const before = JSON.parse(readFileSync(JOBS, 'utf8'));
const dropped = { no_location: 0, title_neg: 0, no_title_pos: 0, loc_neg: 0 };
const kept = [];

for (const j of before) {
  const title = (j.title || '').toLowerCase();
  const loc = (j.location || '').toLowerCase();

  if (!loc.trim()) { dropped.no_location++; continue; }
  if (lneg.some(s => loc.includes(s))) { dropped.loc_neg++; continue; }
  if (lpos.length && !lpos.some(s => loc.includes(s))) { dropped.loc_neg++; continue; }
  if (tnegFinal.some(s => title.includes(s))) { dropped.title_neg++; continue; }
  if (tpos.length && !tpos.some(s => title.includes(s))) { dropped.no_title_pos++; continue; }

  kept.push(j);
}

writeFileSync(JOBS, JSON.stringify(kept, null, 2));
console.log(`clean: kept ${kept.length} of ${before.length}; dropped ${JSON.stringify(dropped)}`);
