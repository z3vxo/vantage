let ovActiveId = null;

// ── Sidebar ──
function renderOverviewSidebar(filter = '') {
  const list = document.getElementById('overview-sidebar-list');
  if (!list) return;
  const filtered = filter
    ? allHosts.filter(h => h.url.toLowerCase().includes(filter))
    : allHosts;
  if (!filtered.length) {
    list.innerHTML = `<div class="overview-empty-msg" style="min-height:120px">${filter ? 'No matches' : 'No hosts loaded'}</div>`;
    return;
  }
  list.innerHTML = filtered.map(h => `
    <div class="sidebar-item ${h.id === ovActiveId ? 'si-active' : ''}"
         onclick="selectOverviewHost(${h.id})" data-sid="${h.id}">
      <div class="sidebar-item-url">${escHtml(h.url)}</div>
      <div class="sidebar-item-meta">
        <span class="sidebar-item-status ${h.sc}">${h.status}</span>
        ${h.badges && h.badges.length ? renderBadges(h.badges) : ''}
      </div>
    </div>`).join('');
}

function filterOverviewSidebar() {
  const q = document.getElementById('search-overview').value.toLowerCase();
  renderOverviewSidebar(q);
}

// ── Select host ──
function selectOverviewHost(id) {
  ovActiveId = id;
  const host = allHosts.find(h => h.id === id);
  if (!host) return;

  document.querySelectorAll('#overview-sidebar-list .sidebar-item').forEach(el => {
    el.classList.toggle('si-active', parseInt(el.dataset.sid) === id);
  });

  let origin;
  try { origin = new URL(host.url).origin; } catch { origin = host.url; }
  const hostHits = allHits.filter(h => h.url.startsWith(origin + '/') || h.url === origin);

  renderOverviewContent(host, hostHits);
}

// ── Render overview content ──
function renderOverviewContent(host, hostHits) {
  const main = document.getElementById('overview-main');

  const cell = (label, content, mono = false, full = false) => `
    <div class="ov-info-cell${full ? ' full' : ''}">
      <div class="ov-info-label">${label}</div>
      <div class="ov-info-value${mono ? ' mono' : ''}">${content || '<span style="color:var(--text-muted)">—</span>'}</div>
    </div>`;

  const scMap = {s200:'var(--green)',s201:'var(--green)',s301:'var(--orange)',s302:'var(--orange)',s403:'var(--red)',s400:'var(--red)'};
  const statusColor = scMap[host.sc] || 'var(--text)';
  const sevBadge = { high: 'badge-red', medium: 'badge-orange', low: 'badge-yellow' };

  const techHtml = host.tech && host.tech.length
    ? host.tech.map(t => `<span class="tech-pill">${escHtml(t)}</span>`).join('')
    : '<span style="color:var(--text-muted)">—</span>';

  const portsHtml = host.ports && host.ports.length
    ? host.ports.map(p => `<span class="tech-pill"><span style="color:var(--accent)">${escHtml(p.port)}</span> <span style="color:var(--text-muted)">— ${escHtml(p.service)}</span></span>`).join('')
    : '<span style="color:var(--text-muted)">—</span>';

  const hitsHtml = hostHits.length
    ? `<table class="ov-hits-table">
        <thead><tr>
          <th>Path</th><th>Status</th><th>Size</th><th>Severity</th>
        </tr></thead>
        <tbody>
          ${hostHits.map(h => `
            <tr>
              <td><a href="${escHtml(h.url)}" target="_blank" style="color:var(--accent)">${escHtml(h.url)}</a></td>
              <td class="${h.sc}">${h.status}</td>
              <td>${h.size}</td>
              <td><span class="badge ${sevBadge[h.severity] || 'badge-yellow'}">${h.severity}</span></td>
            </tr>`).join('')}
        </tbody>
      </table>`
    : `<div class="ov-hits-empty">No path hits for this host.</div>`;

  const triageHtml = `
    <div class="triage-btns">
      ${['none','to-test','dead-end','tested'].map(s => `
        <button class="triage-btn ${(host.triage_status||'none')===s?'active':''}" data-status="${s}"
          onclick="setTriage(this,'${escHtml(host.url)}','${s}')">${s}</button>
      `).join('')}
    </div>`;

  main.innerHTML = `
    <div class="ov-header">
      <div class="ov-host-url">
        <a href="${escHtml(host.url)}" target="_blank">${escHtml(host.url)}</a>
        ${renderBadges(host.badges)}
      </div>
      <div class="ov-meta-row">
        <span class="status-val" style="color:${statusColor};font-size:16px">${host.status}</span>
        <span style="color:var(--text-muted);font-size:12px;font-family:'Fira Code',monospace">${escHtml(host.server || '')}</span>
      </div>
    </div>
    <div class="ov-body">

      <div class="ov-section">
        <div class="ov-section-title">Screenshot</div>
        <div class="ov-screenshot" id="ov-screenshot-wrap">
          <span>No screenshot available</span>
        </div>
      </div>

      <div class="ov-section">
        <div class="ov-section-title">Host Info</div>
        <div class="ov-info-grid">
          ${cell('Status Code', `<span style="color:${statusColor};font-weight:600;font-family:'Fira Code',monospace">${host.status}</span>`)}
          ${cell('Content-Type', escHtml(host.ctype), true)}
          ${cell('Title', escHtml(host.title))}
          ${cell('Server', escHtml(host.server), true)}
          ${cell('IP Address(es)', escHtml((host.ips||[]).join(', ')), true)}
          ${cell('CNAME', escHtml((host.cname||[]).join(', ')), true)}
          <div class="ov-info-cell full">
            <div class="ov-info-label">Tech Stack</div>
            <div class="ov-info-value">${techHtml}</div>
          </div>
          <div class="ov-info-cell full">
            <div class="ov-info-label">Open Ports</div>
            <div class="ov-info-value">${portsHtml}</div>
          </div>
        </div>
      </div>

      <div class="ov-section">
        <div class="ov-section-title">Path Hits (${hostHits.length})</div>
        ${hitsHtml}
      </div>

      <div class="ov-section">
        <div class="ov-section-title">Triage</div>
        ${triageHtml}
      </div>

      <div class="ov-section">
        <div class="ov-section-title">Notes</div>
        <textarea class="notes-area" id="ov-notes" placeholder="Notes about this host...">${escHtml(host.notes||'')}</textarea>
        <button class="notes-save" onclick="saveNotes('${escHtml(host.url)}','ov-notes')">Save</button>
      </div>

    </div>`;

  // Try to load screenshot — silently no-ops if endpoint doesn't exist yet
  const domain = localStorage.getItem('recon_target');
  const img = new Image();
  img.onload = () => {
    const wrap = document.getElementById('ov-screenshot-wrap');
    if (wrap) { wrap.innerHTML = ''; wrap.appendChild(img); }
  };
  img.src = `/api/${encodeURIComponent(domain)}/screenshot/${encodeURIComponent(host.url)}`;
}
