// Top-50 README from data/jobs-all.json (sorted by recency).
// Pages still shows everything via docs/jobs.json (mirror of jobs-all.json).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(new URL('..', import.meta.url).pathname);
const TEMPLATE = resolve(REPO, 'skills/jobscan/README.template.md');
const JOBS = resolve(REPO, 'data/jobs-all.json');
const README = resolve(REPO, 'README.md');
const TOP_N = 50;

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

const all = existsSync(JOBS) ? JSON.parse(readFileSync(JOBS, 'utf8')) : [];
const template = existsSync(TEMPLATE) ? readFileSync(TEMPLATE, 'utf8') : '# jobscanner\n\n{{JOBS_BY_COMPANY}}\n';

// "Best" = most recently discovered, with newer posted_at as tiebreak (already sorted by normalize).
const top = all.slice(0, TOP_N);

const latestDiscovered = all.map(j => j.discovered_at).filter(Boolean).sort().pop() || new Date().toISOString();

// Group top 50 by company, alphabetical
const byCompany = new Map();
for (const j of top) {
  if (!byCompany.has(j.company)) byCompany.set(j.company, []);
  byCompany.get(j.company).push(j);
}
const sections = [...byCompany.keys()].sort().map(c => {
  const rows = byCompany.get(c).sort((a, b) => (b.posted_at || b.discovered_at || '').localeCompare(a.posted_at || a.discovered_at || ''));
  const bullets = rows.map(j => `- [${j.title}](${j.url}) — ${j.location || ''} — posted ${fmtDate(j.posted_at) || '—'}`).join('\n');
  return `### ${c}\n\n${bullets}`;
}).join('\n\n');

const out = template
  .replaceAll('{{TIMESTAMP}}', latestDiscovered)
  .replaceAll('{{COUNT}}', `${top.length} of ${all.length}`)
  .replaceAll('{{COMPANY_COUNT}}', String(byCompany.size))
  .replaceAll('{{JOBS_BY_COMPANY}}', sections || '_No jobs yet._');

writeFileSync(README, out);
console.log(`regen-readme: top ${top.length} of ${all.length} across ${byCompany.size} companies`);
