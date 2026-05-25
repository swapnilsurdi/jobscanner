#!/usr/bin/env node
// Read JSON array of {company,title,location,url,posted_at?} from stdin.
// Apply filters, dedupe via seen.tsv, append to jobs.json. Print count.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import yaml from 'yaml';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const filters = yaml.parse(fs.readFileSync(path.join(root, 'config/filters.yml'), 'utf8'));
const jobsPath = path.join(root, 'data/jobs.json');
const seenPath = path.join(root, 'data/seen.tsv');
const jobs = JSON.parse(fs.readFileSync(jobsPath, 'utf8'));
const seenLines = fs.existsSync(seenPath) ? fs.readFileSync(seenPath, 'utf8').split('\n').filter(Boolean) : [];
const seen = new Set(seenLines);

const titlePos = filters.title.positive.map(s => s.toLowerCase());
const titleNeg = filters.title.negative.map(s => s.toLowerCase());
const locPos = filters.location.positive.map(s => s.toLowerCase());
const locNeg = filters.location.negative.map(s => s.toLowerCase());

function matches(title, location) {
  const t = (title || '').toLowerCase();
  const l = (location || '').toLowerCase();
  if (!titlePos.some(s => t.includes(s))) return false;
  if (titleNeg.some(s => t.includes(s))) return false;
  if (!l) return true; // unknown location -> allow
  if (locNeg.some(s => l.includes(s))) return false;
  if (locPos.length && !locPos.some(s => l.includes(s))) return false;
  return true;
}

let input = '';
process.stdin.on('data', c => input += c);
process.stdin.on('end', () => {
  let rows;
  try { rows = JSON.parse(input); } catch (e) { console.error('bad json'); process.exit(1); }
  let added = 0;
  const now = new Date().toISOString();
  for (const r of rows) {
    if (!r || !r.url || !r.title) continue;
    if (!matches(r.title, r.location || '')) continue;
    const eid = crypto.createHash('sha1').update(r.url).digest('hex').slice(0, 12);
    const key = `${r.company}\t${eid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    jobs.push({
      company: r.company,
      title: r.title,
      location: r.location || '',
      url: r.url,
      posted_at: r.posted_at || null,
      discovered_at: now,
      source: 'playwright',
      external_id: eid,
    });
    seenLines.push(key);
    added++;
  }
  fs.writeFileSync(jobsPath, JSON.stringify(jobs, null, 2));
  fs.writeFileSync(seenPath, seenLines.join('\n') + (seenLines.length ? '\n' : ''));
  console.log(`ingested ${added}`);
});
