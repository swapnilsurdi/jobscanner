// Copies data/jobs.json -> docs/jobs.json so GitHub Pages serves the latest scan.
// Called by scripts/run-scan.sh after the scan skill completes.

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const repo = resolve(new URL('..', import.meta.url).pathname);
const src = resolve(repo, 'data/jobs.json');
const dst = resolve(repo, 'docs/jobs.json');

if (!existsSync(src)) {
  console.error(`sync-pages: ${src} missing — nothing to copy`);
  process.exit(0);
}
mkdirSync(dirname(dst), { recursive: true });
copyFileSync(src, dst);
console.log(`sync-pages: ${src} -> ${dst}`);
