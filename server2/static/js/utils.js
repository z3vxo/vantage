// ── Date ──
document.getElementById('header-date').textContent = new Date().toLocaleString();

// ── Render helpers ──
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderBadges(badges) {
  const map = { interesting: 'badge-orange', api: 'badge-yellow' };
  return (badges || []).map(b => `<span class="badge ${map[b] || 'badge-yellow'}">${b}</span>`).join('');
}

// ── Tab switching ──
function showTab(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
}

// ── Filter ──
function filterTable(inputId, tbodyId) {
  const q = document.getElementById(inputId).value.toLowerCase();
  document.querySelectorAll('#' + tbodyId + ' tr').forEach(r => {
    r.style.display = r.innerText.toLowerCase().includes(q) ? '' : 'none';
  });
}

// ── Sort (group-aware) ──
function sortTable(tableId, col) {
  const table = document.getElementById(tableId);
  const tbody = table.querySelector('tbody');
  const dir   = table.dataset.sortDir === 'asc' ? -1 : 1;
  table.dataset.sortDir = dir === 1 ? 'asc' : 'desc';

  const firstChild = tbody.querySelector('[data-group],[data-hit-group]');
  const childAttr  = firstChild
    ? (firstChild.hasAttribute('data-group') ? 'data-group' : 'data-hit-group')
    : null;

  if (childAttr) {
    const groups = [];
    let current = null;
    Array.from(tbody.rows).forEach(r => {
      if (r.hasAttribute(childAttr)) {
        if (current) current.children.push(r);
      } else {
        current = { primary: r, children: [] };
        groups.push(current);
      }
    });
    groups.sort((a, b) => {
      const A = a.primary.cells[col]?.innerText.trim() || '';
      const B = b.primary.cells[col]?.innerText.trim() || '';
      return A.localeCompare(B, undefined, {numeric: true}) * dir;
    });
    groups.forEach(g => {
      tbody.appendChild(g.primary);
      g.children.forEach(c => tbody.appendChild(c));
    });
  } else {
    const rows = Array.from(tbody.rows);
    rows.sort((a, b) => {
      const A = a.cells[col]?.innerText.trim() || '';
      const B = b.cells[col]?.innerText.trim() || '';
      return A.localeCompare(B, undefined, {numeric: true}) * dir;
    });
    rows.forEach(r => tbody.appendChild(r));
  }
}

// ── Toggle column ──
function toggleCol(tableId, col, btn) {
  const table = document.getElementById(tableId);
  const cells = table.querySelectorAll('tr td:nth-child(' + (col+1) + '), tr th:nth-child(' + (col+1) + ')');
  btn.classList.toggle('active');
  const isHidden = cells[0]?.style.display === 'none';
  cells.forEach(c => c.style.display = isHidden ? '' : 'none');
}

// ── Collapse all groups ──
function collapseAll(tbodyId, childAttr) {
  const label = childAttr === 'data-group' ? 'hosts' : 'paths';
  document.querySelectorAll(`#${tbodyId} .expand-btn.open`).forEach(btn => {
    btn.classList.remove('open');
    const n = parseInt(btn.textContent.trim().split(' ')[1]);
    btn.innerHTML = `&#9654; ${n} ${label}`;
  });
  document.querySelectorAll(`#${tbodyId} tr[${childAttr}]`).forEach(r => r.style.display = 'none');
}

// ── Toast ──
let toastTimer = null;
function showToast(type, msg) {
  const toast = document.getElementById('toast');
  const icon  = document.getElementById('toast-icon');
  const text  = document.getElementById('toast-msg');
  icon.textContent = type === 'success' ? '✓' : '✕';
  text.textContent = msg;
  toast.className  = `toast ${type} visible`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3500);
}

// ── Import ──
function importData(btn, statusId) {
  const domain = localStorage.getItem('recon_target');
  if (!domain) return;

  const status = document.getElementById(statusId);
  btn.disabled = true;
  btn.classList.add('loading');
  status.classList.add('visible');

  fetch(`/api/import/${encodeURIComponent(domain)}`, { method: 'POST' })
    .then(r => {
      if (!r.ok) return r.text().then(t => { throw new Error(t); });
      return r.json();
    })
    .then(() => {
      status.classList.remove('visible');
      btn.classList.remove('loading');
      btn.disabled = false;
      showToast('success', 'Data imported successfully!');
      loadHosts();
      loadHits();
    })
    .catch(err => {
      status.classList.remove('visible');
      btn.classList.remove('loading');
      btn.disabled = false;
      showToast('error', 'Error importing data: ' + err.message);
    });
}
