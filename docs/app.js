// jobscanner viewer — reads docs/data/jobs.parquet via the vendored hyparquet
// reader (no CDN, no build step).
//
// Strategy:
//   1. fetch meta.json   -> header stats (count / companies / last updated).
//   2. fetch the parquet once as a full ArrayBuffer and wrap it in a trivial
//      in-memory AsyncBuffer. We deliberately do NOT use asyncBufferFromUrl /
//      HTTP Range here: GitHub Pages' CDN serves this octet-stream with
//      Content-Encoding: gzip, and Range requests are applied to the
//      *compressed* byte stream while hyparquet computes footer offsets against
//      the *uncompressed* size. That mismatch makes the byteLength/footer probe
//      read the wrong bytes and fail with "footer != PAR1". The whole file is
//      tiny (~18 KB), so a single full fetch is both correct and cheaper than
//      the multi-request HEAD+Range dance.
//   3. read the footer metadata first, then page through the in-memory buffer
//      one PAGE_ROWS slice at a time on demand ("load more").
//   4. search filters client-side over the rows fetched so far.

import {
  parquetMetadataAsync,
  parquetReadObjects,
} from './vendor/hyparquet.min.js';

// Build an in-memory AsyncBuffer from a fully-fetched file. hyparquet only
// needs { byteLength, slice(start, end) }; slicing an ArrayBuffer we already
// hold avoids any further network I/O (and thus any Range/gzip interaction).
async function fetchAsyncBuffer(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const buf = await res.arrayBuffer();
  return {
    byteLength: buf.byteLength,
    async slice(start, end) {
      return buf.slice(start, end ?? buf.byteLength);
    },
  };
}

const PARQUET_URL = 'data/jobs.parquet';
const META_URL = 'data/meta.json';
const PAGE_ROWS = 100; // rows decoded per "load more" from the in-memory buffer.
const READ_COLUMNS = ['company', 'title', 'location', 'url', 'posted_at', 'last_seen_at'];

const els = {
  search: document.getElementById('search'),
  clear: document.getElementById('clear'),
  tbody: document.querySelector('#grid tbody'),
  count: document.getElementById('count'),
  companies: document.getElementById('companies'),
  updated: document.getElementById('updated'),
  status: document.getElementById('status'),
  more: document.getElementById('more'),
};

const state = {
  file: null,
  metadata: null,
  totalRows: 0,
  loadedRows: 0, // how many rows we've fetched from the parquet so far
  rows: [], // all rows fetched so far (across pages)
  query: '',
  loading: false,
};

function fmtDate(v) {
  if (v == null) return '—';
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}

function fmtUpdated(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  // local, compact: "2026-06-06 05:40"
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escapeText(node, text) {
  node.textContent = text == null || text === '' ? '—' : String(text);
  return node;
}

function buildRow(j) {
  const tr = document.createElement('tr');

  const tdCompany = document.createElement('td');
  tdCompany.className = 'col-company';
  escapeText(tdCompany, j.company);

  const tdTitle = document.createElement('td');
  tdTitle.className = 'col-title';
  if (j.url) {
    const a = document.createElement('a');
    a.href = j.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = j.title || j.url;
    tdTitle.appendChild(a);
  } else {
    escapeText(tdTitle, j.title);
  }

  const tdLoc = document.createElement('td');
  tdLoc.className = 'col-loc';
  escapeText(tdLoc, j.location);

  const tdPosted = document.createElement('td');
  tdPosted.className = 'col-date';
  tdPosted.textContent = fmtDate(j.posted_at);

  const tdSeen = document.createElement('td');
  tdSeen.className = 'col-date';
  tdSeen.textContent = fmtDate(j.last_seen_at);

  tr.append(tdCompany, tdTitle, tdLoc, tdPosted, tdSeen);
  return tr;
}

function matches(j, q) {
  if (!q) return true;
  return (
    (j.company || '').toLowerCase().includes(q) ||
    (j.title || '').toLowerCase().includes(q) ||
    (j.location || '').toLowerCase().includes(q)
  );
}

function render() {
  const q = state.query.trim().toLowerCase();
  const visible = q ? state.rows.filter((j) => matches(j, q)) : state.rows;

  const frag = document.createDocumentFragment();
  for (const j of visible) frag.appendChild(buildRow(j));
  els.tbody.replaceChildren(frag);

  const allLoaded = state.loadedRows >= state.totalRows;

  // status line
  if (q) {
    els.status.textContent = `${visible.length} match${visible.length === 1 ? '' : 'es'} in ${state.loadedRows} loaded`;
  } else if (state.totalRows === 0) {
    els.status.textContent = 'no jobs yet.';
  } else {
    els.status.textContent = allLoaded
      ? `showing all ${state.totalRows}`
      : `showing ${state.loadedRows} of ${state.totalRows}`;
  }

  // "load more" is about fetching more rows from the file, independent of the filter.
  els.more.hidden = allLoaded || state.loading;
  els.more.textContent = state.loading ? 'loading…' : 'load more';
}

async function loadNextPage() {
  if (state.loading || state.loadedRows >= state.totalRows) return;
  state.loading = true;
  render();

  const start = state.loadedRows;
  const end = Math.min(start + PAGE_ROWS, state.totalRows);
  try {
    const rows = await parquetReadObjects({
      file: state.file,
      metadata: state.metadata,
      rowStart: start,
      rowEnd: end,
      columns: READ_COLUMNS,
    });
    state.rows.push(...rows);
    state.loadedRows = end;
  } catch (err) {
    els.status.textContent = 'failed to load rows — ' + (err && err.message ? err.message : err);
    console.error(err);
  } finally {
    state.loading = false;
    render();
  }
}

async function loadMeta() {
  try {
    const res = await fetch(META_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function init() {
  const meta = await loadMeta();
  if (meta) {
    els.count.textContent = meta.row_count ?? '—';
    els.companies.textContent = meta.company_count ?? '—';
    els.updated.textContent = fmtUpdated(meta.generated_at);
  }

  try {
    // Full-file fetch into an in-memory buffer (no HTTP Range — see header note).
    state.file = await fetchAsyncBuffer(PARQUET_URL);
    state.metadata = await parquetMetadataAsync(state.file);
    state.totalRows = Number(state.metadata.num_rows);

    // header count falls back to parquet metadata if meta.json was missing
    if (!meta) els.count.textContent = String(state.totalRows);

    if (state.totalRows === 0) {
      render();
      return;
    }
    await loadNextPage();
  } catch (err) {
    els.status.textContent = 'failed to load data — ' + (err && err.message ? err.message : err);
    els.more.hidden = true;
    console.error(err);
  }
}

els.search.addEventListener('input', (e) => {
  state.query = e.target.value;
  render();
});
els.clear.addEventListener('click', () => {
  state.query = '';
  els.search.value = '';
  els.search.focus();
  render();
});
els.more.addEventListener('click', loadNextPage);

init();
