// export-parquet.mjs — converts the scanned job history into a columnar
// Parquet file the static viewer reads selectively over HTTP range requests.
//
//   data/jobs-all.json  (append-only history, the browsable dataset)
//     -> docs/data/jobs.parquet   (sorted by last_seen desc, row-group pruned)
//     -> docs/data/meta.json      (row count / generated-at / size / columns)
//
// NOTE: data/jobs.json (the current-scan file career-ops ingests) is the
// canonical scanner output and is intentionally NOT read or modified here.
// Parquet is purely additive. We export the FULL history (jobs-all.json)
// because that is what the site browses; it also carries last_seen_at, which
// gives us a useful sort key for row-group pruning.
//
// Run: `npm run export`  (also chained after each scan in scripts/run-scan.sh)

import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { parquetWriteBuffer } from 'hyparquet-writer'

const REPO = resolve(new URL('..', import.meta.url).pathname)
const SOURCE = resolve(REPO, 'data/jobs-all.json')
const OUT_DIR = resolve(REPO, 'docs/data')
const OUT_PARQUET = resolve(OUT_DIR, 'jobs.parquet')
const OUT_META = resolve(OUT_DIR, 'meta.json')

// Row group size: small enough that a viewer "page" is one cheap range read,
// large enough to keep the footer/metadata overhead low. The dataset is a few
// hundred rows today, so in practice everything lands in a single row group;
// the cap matters once history grows into the thousands.
const ROW_GROUP_SIZE = 5000

// String columns, in display order. Kept flat (no nesting) so the reader can
// project individual columns and so row-group statistics stay meaningful.
const STRING_COLUMNS = ['company', 'title', 'location', 'url', 'source', 'external_id']
// Timestamp columns (nullable — posted_at is frequently absent upstream).
const TS_COLUMNS = ['posted_at', 'discovered_at', 'last_seen_at']

function toDate(v) {
  if (!v) return null
  const t = Date.parse(v)
  return Number.isNaN(t) ? null : new Date(t)
}

function main() {
  if (!existsSync(SOURCE)) {
    console.error(`export-parquet: source not found: ${SOURCE}`)
    process.exit(1)
  }

  const jobs = JSON.parse(readFileSync(SOURCE, 'utf8'))
  if (!Array.isArray(jobs)) {
    console.error('export-parquet: source is not a JSON array')
    process.exit(1)
  }

  // Sort by seen-date descending (newest activity first) so that range/row-group
  // pruning is useful: the viewer pages from the most recent rows outward.
  // Fall back to discovered_at, then posted_at, for rows missing last_seen_at.
  const sortKey = (j) =>
    Date.parse(j.last_seen_at || j.discovered_at || j.posted_at || 0) || 0
  jobs.sort((a, b) => sortKey(b) - sortKey(a))

  // Build columnar data (one array per column) — this is hyparquet-writer's
  // native input shape and avoids per-row object overhead.
  const columnData = [
    ...STRING_COLUMNS.map((name) => ({
      name,
      type: 'STRING',
      data: jobs.map((j) => (j[name] == null ? null : String(j[name]))),
    })),
    ...TS_COLUMNS.map((name) => ({
      name,
      type: 'TIMESTAMP',
      data: jobs.map((j) => toDate(j[name])),
    })),
  ]

  const columns = [...STRING_COLUMNS, ...TS_COLUMNS]
  const generatedAt = new Date().toISOString()

  const buffer = parquetWriteBuffer({
    columnData,
    rowGroupSize: ROW_GROUP_SIZE,
    statistics: true, // per-row-group min/max enables pruning
    kvMetadata: [
      { key: 'generated_at', value: generatedAt },
      { key: 'source', value: 'data/jobs-all.json' },
      { key: 'sorted_by', value: 'last_seen_at desc' },
      { key: 'writer', value: 'hyparquet-writer' },
    ],
  })

  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(OUT_PARQUET, Buffer.from(buffer))

  const bytes = statSync(OUT_PARQUET).size
  const companies = new Set(jobs.map((j) => j.company)).size

  const meta = {
    generated_at: generatedAt,
    row_count: jobs.length,
    company_count: companies,
    parquet_bytes: bytes,
    row_group_size: ROW_GROUP_SIZE,
    columns,
    source: 'data/jobs-all.json',
    sorted_by: 'last_seen_at desc',
  }
  writeFileSync(OUT_META, JSON.stringify(meta, null, 2) + '\n')

  console.log(
    `export-parquet: ${jobs.length} rows, ${companies} companies -> ` +
      `docs/data/jobs.parquet (${(bytes / 1024).toFixed(1)} KB)`
  )
}

main()
