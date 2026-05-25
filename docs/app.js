// Job feed UI. Loads jobs.json (same directory), renders filterable/sortable table.

const els = {
  search: document.getElementById('search'),
  sort: document.getElementById('sort'),
  clear: document.getElementById('clear'),
  chips: document.getElementById('chips'),
  tbody: document.querySelector('#grid tbody'),
  count: document.getElementById('count'),
  updated: document.getElementById('updated'),
  empty: document.getElementById('empty'),
  ths: document.querySelectorAll('#grid thead th'),
};

let JOBS = [];
const activeCompanies = new Set(); // empty = show all
const state = { sort: 'discovered_desc', query: '' };

function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().slice(0, 10);
}

function fmtUpdated() {
  if (!JOBS.length) return '—';
  const latest = JOBS.map(j => j.discovered_at).filter(Boolean).sort().pop();
  return latest ? new Date(latest).toLocaleString() : '—';
}

function cell(text) {
  const td = document.createElement('td');
  td.textContent = text ?? '';
  return td;
}

function linkCell(text, href) {
  const td = document.createElement('td');
  const a = document.createElement('a');
  a.href = href || '#';
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = text ?? '';
  td.appendChild(a);
  return td;
}

function render() {
  const q = state.query.trim().toLowerCase();
  let rows = JOBS.filter(j => {
    if (activeCompanies.size && !activeCompanies.has(j.company)) return false;
    if (!q) return true;
    return (
      (j.title || '').toLowerCase().includes(q) ||
      (j.company || '').toLowerCase().includes(q) ||
      (j.location || '').toLowerCase().includes(q)
    );
  });

  const [key, dir] = state.sort.split('_');
  rows.sort((a, b) => {
    const av = a[key] || '';
    const bv = b[key] || '';
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });

  els.tbody.replaceChildren();
  for (const j of rows) {
    const tr = document.createElement('tr');
    tr.appendChild(cell(j.company));
    tr.appendChild(linkCell(j.title, j.url));
    tr.appendChild(cell(j.location));
    tr.appendChild(cell(fmtDate(j.posted_at)));
    tr.appendChild(cell(fmtDate(j.discovered_at)));
    els.tbody.appendChild(tr);
  }
  els.empty.hidden = rows.length > 0;
  els.count.textContent = rows.length === JOBS.length
    ? `${JOBS.length}`
    : `${rows.length} of ${JOBS.length}`;
}

function renderChips() {
  const companies = [...new Set(JOBS.map(j => j.company))].sort();
  els.chips.replaceChildren();
  for (const c of companies) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = c;
    chip.addEventListener('click', () => {
      if (activeCompanies.has(c)) activeCompanies.delete(c);
      else activeCompanies.add(c);
      chip.classList.toggle('active');
      render();
    });
    els.chips.appendChild(chip);
  }
}

els.search.addEventListener('input', e => { state.query = e.target.value; render(); });
els.sort.addEventListener('change', e => { state.sort = e.target.value; render(); });
els.clear.addEventListener('click', () => {
  state.query = '';
  els.search.value = '';
  activeCompanies.clear();
  els.chips.querySelectorAll('.chip.active').forEach(el => el.classList.remove('active'));
  render();
});
els.ths.forEach(th => {
  th.addEventListener('click', () => {
    const key = th.dataset.key;
    if (!key) return;
    const current = state.sort.split('_');
    const dir = (current[0] === key && current[1] === 'asc') ? 'desc' : 'asc';
    state.sort = `${key}_${dir}`;
    const opt = [...els.sort.options].find(o => o.value === state.sort);
    if (opt) els.sort.value = state.sort;
    render();
  });
});

fetch('jobs.json', { cache: 'no-store' })
  .then(r => r.json())
  .then(data => {
    JOBS = Array.isArray(data) ? data : [];
    els.updated.textContent = fmtUpdated();
    renderChips();
    render();
  })
  .catch(err => {
    els.empty.hidden = false;
    els.empty.textContent = 'Failed to load jobs.json — ' + err.message;
  });
