// Sorts data/jobs.json deterministically so the file diffs cleanly between runs
// and the Pages UI sees a stable initial order.
// Order: discovered_at desc, posted_at desc, company asc, external_id asc.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const JOBS = resolve(new URL('..', import.meta.url).pathname, 'data/jobs.json');
if (!existsSync(JOBS)) { console.log('normalize: data/jobs.json missing'); process.exit(0); }

const jobs = JSON.parse(readFileSync(JOBS, 'utf8'));
const cmp = (a, b, key, dir = 'desc') => {
  const av = a[key] || '', bv = b[key] || '';
  if (av === bv) return 0;
  return (av < bv ? -1 : 1) * (dir === 'desc' ? -1 : 1);
};
jobs.sort((a, b) =>
  cmp(a, b, 'discovered_at', 'desc') ||
  cmp(a, b, 'posted_at', 'desc') ||
  cmp(a, b, 'company', 'asc') ||
  cmp(a, b, 'external_id', 'asc')
);
writeFileSync(JOBS, JSON.stringify(jobs, null, 2));
console.log(`normalize: sorted ${jobs.length} jobs`);
