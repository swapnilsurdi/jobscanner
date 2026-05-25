// Regenerates README.md from skills/jobscan/README.template.md using current data/jobs.json.
// Idempotent — safe to run multiple times. Called by run-scan.sh after all scanners finish.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(new URL('..', import.meta.url).pathname);
const TEMPLATE = resolve(REPO, 'skills/jobscan/README.template.md');
const JOBS = resolve(REPO, 'data/jobs.json');
const README = resolve(REPO, 'README.md');

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

const jobs = existsSync(JOBS) ? JSON.parse(readFileSync(JOBS, 'utf8')) : [];
const template = existsSync(TEMPLATE) ? readFileSync(TEMPLATE, 'utf8') : '# jobscanner\n\n{{JOBS_BY_COMPANY}}\n';

const latestDiscovered = jobs.map(j => j.discovered_at).filter(Boolean).sort().pop() || new Date().toISOString();
const companies = [...new Set(jobs.map(j => j.company))].sort();

const sections = companies.map(c => {
  const rows = jobs.filter(j => j.company === c).sort((a, b) => (b.posted_at || '').localeCompare(a.posted_at || ''));
  const bullets = rows.map(j => `- [${j.title}](${j.url}) — ${j.location || ''} — posted ${fmtDate(j.posted_at)}`).join('\n');
  return `### ${c}\n\n${bullets}`;
}).join('\n\n');

const out = template
  .replaceAll('{{TIMESTAMP}}', latestDiscovered)
  .replaceAll('{{COUNT}}', String(jobs.length))
  .replaceAll('{{COMPANY_COUNT}}', String(companies.length))
  .replaceAll('{{JOBS_BY_COMPANY}}', sections || '_No jobs yet._');

writeFileSync(README, out);
console.log(`regen-readme: ${jobs.length} jobs across ${companies.length} companies`);
