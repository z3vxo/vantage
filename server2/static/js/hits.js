// ── Group hits by origin (scheme+host+port) — separate group per port ──
function groupHitsByOrigin(hits) {
  const map = new Map();
  hits.forEach(h => {
    let key;
    try { key = new URL(h.url).origin; } catch { key = h.url; }
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(h);
  });
  const sevOrder = { high: 0, medium: 1, low: 2 };
  const groups = [];
  map.forEach((group, origin) => {
    group.sort((a, b) => (sevOrder[a.severity] ?? 3) - (sevOrder[b.severity] ?? 3));
    groups.push({ origin, hits: group, worstSev: group[0].severity });
  });
  return groups;
}

// ── Expand/collapse hit child rows ──
function toggleHitGroup(event, groupId) {
  event.stopPropagation();
  const btn  = event.currentTarget;
  const rows = document.querySelectorAll(`tr[data-hit-group="${groupId}"]`);
  const isOpen = btn.classList.toggle('open');
  rows.forEach(r => r.style.display = isOpen ? '' : 'none');
  btn.innerHTML = isOpen ? `&#9660; ${rows.length} paths` : `&#9654; ${rows.length} paths`;
}

// ── Load hits ──
function loadHits() {
  const domain = localStorage.getItem('recon_target');
  fetch(`/api/${encodeURIComponent(domain)}/hits`)
    .then(r => r.json())
    .then(data => {
      const { hits } = data;
      allHits = hits;
      document.getElementById('count-hits').textContent = hits.length;

      const tbody = document.getElementById('tbody-hits');
      if (!hits.length) {
        tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state">No path hits found.</div></td></tr>`;
        return;
      }

      const sevBadge = { high: 'badge-red', medium: 'badge-orange', low: 'badge-yellow' };
      const groups = groupHitsByOrigin(hits);
      let html = '';
      groups.forEach((g, gid) => {
        const multi      = g.hits.length > 1;
        const expandBtn  = multi
          ? `<button class="expand-btn" onclick="toggleHitGroup(event,${gid})">&#9654; ${g.hits.length} paths</button>`
          : '';
        const displayUrl = multi ? g.origin : g.hits[0].url;
        const worstBadge = `<span class="badge ${sevBadge[g.worstSev] || 'badge-yellow'}">${g.worstSev}</span>`;

        html += `
          <tr class="hit-${g.worstSev}">
            <td><a href="${escHtml(displayUrl)}" target="_blank" onclick="event.stopPropagation()">${escHtml(displayUrl)}</a>${expandBtn}</td>
            <td>${multi ? `<span style="color:var(--text-muted);font-size:11px">${g.hits.length} paths</span>` : `<span class="${g.hits[0].sc}">${g.hits[0].status}</span>`}</td>
            <td>${multi ? '—' : g.hits[0].size}</td>
            <td>${worstBadge}</td>
          </tr>`;

        if (multi) {
          g.hits.forEach(h => {
            html += `
              <tr data-hit-group="${gid}" class="child-row" style="display:none">
                <td style="padding-left:28px"><a href="${escHtml(h.url)}" target="_blank">${escHtml(h.url)}</a></td>
                <td class="${h.sc}">${h.status}</td>
                <td>${h.size}</td>
                <td><span class="badge ${sevBadge[h.severity] || 'badge-yellow'}">${h.severity}</span></td>
              </tr>`;
          });
        }
      });
      tbody.innerHTML = html;
    });
}
