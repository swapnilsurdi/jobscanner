// Merges data/jobs.json (current scan) into data/jobs-all.json (canonical history).
// jobs-all.json grows append-only; dedup by company+external_id.
// Carries existing discovered_at on prior entries so it doesn't reset.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(new URL('..', import.meta.url).pathname);
const CURRENT = resolve(REPO, 'data/jobs.json');
const HISTORY = resolve(REPO, 'data/jobs-all.json');

const current = existsSync(CURRENT) ? JSON.parse(readFileSync(CURRENT, 'utf8')) : [];
const history = existsSync(HISTORY) ? JSON.parse(readFileSync(HISTORY, 'utf8')) : [];

const byKey = new Map();
for (const j of history) byKey.set(`${j.company}\t${j.external_id}`, j);

let added = 0, refreshed = 0;
for (const j of current) {
  const k = `${j.company}\t${j.external_id}`;
  if (byKey.has(k)) {
    // Preserve original discovered_at; update last_seen_at + posted_at if newly available
    const prev = byKey.get(k);
    byKey.set(k, {
      ...prev,
      last_seen_at: j.discovered_at || prev.last_seen_at || prev.discovered_at,
      posted_at: j.posted_at || prev.posted_at,
      title: j.title || prev.title,
      location: j.location || prev.location,
      url: j.url || prev.url,
    });
    refreshed++;
  } else {
    byKey.set(k, { ...j, last_seen_at: j.discovered_at });
    added++;
  }
}

const merged = [...byKey.values()];
writeFileSync(HISTORY, JSON.stringify(merged, null, 2));
console.log(`merge: +${added} new, ${refreshed} refreshed, total ${merged.length} in history`);
