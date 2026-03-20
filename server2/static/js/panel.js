// ── Shared data store (written by hosts.js / hits.js, read by overview.js) ──
let allHosts    = [];
let allHits     = [];
let panelHostId = null;

// ── Detail panel ──
let activeRow = null;

function openPanel(row) {
  const d = JSON.parse(row.dataset.host);
  panelHostId = d.id;
  if (activeRow) activeRow.classList.remove('selected');
  activeRow = row;
  row.classList.add('selected');

  const scMap = {s200:'var(--green)',s201:'var(--green)',s301:'var(--orange)',s302:'var(--orange)',s403:'var(--red)',s400:'var(--red)'};
  const statusColor = scMap[d.sc] || 'var(--text)';

  const techHtml = d.tech && d.tech.length
    ? d.tech.map(t => `<span class="tech-pill">${t}</span>`).join('')
    : '<span style="color:var(--text-muted)">—</span>';

  const portsHtml = d.ports && d.ports.length
    ? d.ports.map(p => `<span class="tech-pill"><span style="color:var(--accent);font-weight:600">${p.port}</span> <span style="color:var(--text-muted)">— ${p.service}</span></span>`).join('')
    : '<span style="color:var(--text-muted)">—</span>';

  const val = v => (v && v !== '-' && !(Array.isArray(v) && !v.length))
    ? (Array.isArray(v) ? v.join(', ') : v)
    : '<span style="color:var(--text-muted)">—</span>';

  document.getElementById('panel-url').innerHTML = `<a href="${d.url}" target="_blank">${d.url}</a>`;
  document.getElementById('panel-body').innerHTML = `
    <div class="panel-section">
      <div class="panel-section-label">Status</div>
      <div class="panel-section-value"><span class="status-val" style="color:${statusColor}">${d.status}</span></div>
    </div>
    <div class="panel-divider"></div>
    <div class="panel-section">
      <div class="panel-section-label">Title</div>
      <div class="panel-section-value">${val(d.title)}</div>
    </div>
    <div class="panel-divider"></div>
    <div class="panel-section">
      <div class="panel-section-label">Server</div>
      <div class="panel-section-value mono">${val(d.server)}</div>
    </div>
    <div class="panel-divider"></div>
    <div class="panel-section">
      <div class="panel-section-label">Tech Stack</div>
      <div class="panel-section-value">${techHtml}</div>
    </div>
    <div class="panel-divider"></div>
    <div class="panel-section">
      <div class="panel-section-label">Open Ports</div>
      <div class="panel-section-value">${portsHtml}</div>
    </div>
    <div class="panel-divider"></div>
    <div class="panel-section">
      <div class="panel-section-label">IP Address(es)</div>
      <div class="panel-section-value mono">${val(d.ips)}</div>
    </div>
    <div class="panel-divider"></div>
    <div class="panel-section">
      <div class="panel-section-label">CNAME</div>
      <div class="panel-section-value mono">${val(d.cname)}</div>
    </div>
    <div class="panel-divider"></div>
    <div class="panel-section">
      <div class="panel-section-label">Content-Type</div>
      <div class="panel-section-value mono">${val(d.ctype)}</div>
    </div>
    <div class="panel-divider"></div>
    <div class="panel-section">
      <div class="panel-section-label">Triage</div>
      <div class="triage-btns">
        ${['none','to-test','dead-end','tested'].map(s => `
          <button class="triage-btn ${(d.triage_status||'none')===s?'active':''}" data-status="${s}"
            onclick="setTriage(this,'${escHtml(d.url)}','${s}')">${s}</button>
        `).join('')}
      </div>
    </div>
    <div class="panel-divider"></div>
    <div class="panel-section">
      <div class="panel-section-label">Notes</div>
      <textarea class="notes-area" id="panel-notes" placeholder="e.g. takes URL param at /search, worth testing...">${escHtml(d.notes||'')}</textarea>
      <button class="notes-save" onclick="saveNotes('${escHtml(d.url)}')">Save</button>
    </div>
  `;

  document.getElementById('detail-panel').classList.add('open');
  document.getElementById('panel-overlay').classList.add('open');
  document.querySelector('.content').classList.add('panel-open');
}

function closePanel() {
  document.getElementById('detail-panel').classList.remove('open');
  document.getElementById('panel-overlay').classList.remove('open');
  document.querySelector('.content').classList.remove('panel-open');
  if (activeRow) { activeRow.classList.remove('selected'); activeRow = null; }
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });

// ── Triage ──
function setTriage(btn, domainName, status) {
  const domain = localStorage.getItem('recon_target');
  fetch(`/api/domains/${encodeURIComponent(domainName)}/triage`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain, status }),
  }).then(r => {
    if (!r.ok) return;
    btn.closest('.triage-btns').querySelectorAll('.triage-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
}

// ── Notes ──
function saveNotes(domainName, elId = 'panel-notes') {
  const domain = localStorage.getItem('recon_target');
  const notes  = document.getElementById(elId).value;
  fetch(`/api/${encodeURIComponent(domainName)}/notes`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain, notes }),
  }).then(r => r.json()).then(data => {
    if (data.status === 'Note added!') {
      const host = allHosts.find(h => h.url === domainName);
      if (host) host.notes = notes;
      showToast('success', 'Note saved');
    } else {
      showToast('error', data.status || 'Failed to save note');
    }
  }).catch(() => showToast('error', 'Failed to save note'));
}

// ── Open in Overview ──
function openInOverview() {
  closePanel();
  showTab('overview');
  if (panelHostId !== null) selectOverviewHost(panelHostId);
}
