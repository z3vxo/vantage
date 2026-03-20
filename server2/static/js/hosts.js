// ── URL priority helpers ──
function urlEffectivePort(urlStr) {
  try {
    const u = new URL(urlStr);
    return u.port ? parseInt(u.port) : (u.protocol === 'https:' ? 443 : 80);
  } catch { return 99999; }
}

function urlPriority(urlStr) {
  try {
    const u = new URL(urlStr);
    const port = urlEffectivePort(urlStr);
    if (u.protocol === 'https:' && port === 443) return 0;
    if (u.protocol === 'http:'  && port === 80)  return 1;
    return 2000 + port;
  } catch { return 99999; }
}

// ── Group hosts by hostname, pick representative by priority ──
function groupHostsByHostname(hosts) {
  const map = new Map();
  hosts.forEach(h => {
    let key;
    try { key = new URL(h.url).hostname; } catch { key = h.url; }
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(h);
  });
  const groups = [];
  map.forEach(group => {
    group.sort((a, b) => urlPriority(a.url) - urlPriority(b.url));
    groups.push({ primary: group[0], children: group.slice(1) });
  });
  return groups;
}

// ── Expand/collapse host child rows ──
function toggleGroup(event, groupId) {
  event.stopPropagation();
  const btn  = event.currentTarget;
  const rows = document.querySelectorAll(`tr[data-group="${groupId}"]`);
  const isOpen = btn.classList.toggle('open');
  rows.forEach(r => r.style.display = isOpen ? '' : 'none');
  const total = rows.length + 1;
  btn.innerHTML = isOpen ? `&#9660; ${total} hosts` : `&#9654; ${total} hosts`;
}

// ── Load hosts ──
function loadHosts() {
  const domain = localStorage.getItem('recon_target');
  fetch(`/api/${encodeURIComponent(domain)}/hosts`)
    .then(r => r.json())
    .then(data => {
      const { stats, hosts } = data;
      allHosts = hosts;
      if (typeof renderOverviewSidebar === 'function') renderOverviewSidebar();

      document.getElementById('stat-total').textContent  = stats.total;
      document.getElementById('stat-200').textContent    = stats.s200;
      document.getElementById('stat-403').textContent    = stats.s403;
      document.getElementById('stat-500').textContent    = stats.s500;
      document.getElementById('count-hosts').textContent = stats.total;

      const tbody = document.getElementById('tbody-hosts');
      if (!hosts.length) {
        tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">No hosts found.</div></td></tr>`;
        return;
      }

      const groups = groupHostsByHostname(hosts);
      let html = '';
      groups.forEach((g, gid) => {
        const h          = g.primary;
        const portsShort = h.ports.map(p => p.port).join(', ') || '-';
        const techStr    = h.tech.join(', ')   || '-';
        const ipsStr     = h.ips.join(', ')    || '-';
        const cnameStr   = h.cname.join(', ')  || '-';
        const hostData   = escHtml(JSON.stringify(h));
        const multi      = g.children.length > 0;
        const total      = g.children.length + 1;
        const expandBtn  = multi
          ? `<button class="expand-btn" onclick="toggleGroup(event,${gid})">&#9654; ${total} hosts</button>`
          : '';

        html += `
          <tr onclick="openPanel(this)" data-host="${hostData}" class="primary-row" style="cursor:pointer">
            <td><a href="${escHtml(h.url)}" target="_blank" onclick="event.stopPropagation()">${escHtml(h.url)}</a>${renderBadges(h.badges)}${expandBtn}</td>
            <td class="${h.sc}">${h.status}</td>
            <td>${escHtml(h.title)}</td>
            <td>${escHtml(h.server)}</td>
            <td>${escHtml(techStr)}</td>
            <td>${escHtml(portsShort)}</td>
            <td>${escHtml(ipsStr)}</td>
            <td>${escHtml(cnameStr)}</td>
            <td>${escHtml(h.ctype)}</td>
          </tr>`;

        g.children.forEach(c => {
          const cData       = escHtml(JSON.stringify(c));
          const cPortsShort = c.ports.map(p => p.port).join(', ') || '-';
          const cTechStr    = c.tech.join(', ') || '-';
          html += `
            <tr onclick="openPanel(this)" data-host="${cData}" data-group="${gid}" class="child-row" style="display:none;cursor:pointer">
              <td style="padding-left:28px"><a href="${escHtml(c.url)}" target="_blank" onclick="event.stopPropagation()">${escHtml(c.url)}</a>${renderBadges(c.badges)}</td>
              <td class="${c.sc}">${c.status}</td>
              <td>${escHtml(c.title)}</td>
              <td>${escHtml(c.server)}</td>
              <td>${escHtml(cTechStr)}</td>
              <td>${escHtml(cPortsShort)}</td>
              <td colspan="3"></td>
            </tr>`;
        });
      });

      tbody.innerHTML = html;
    })
    .catch(err => {
      document.getElementById('tbody-hosts').innerHTML =
        `<tr><td colspan="9"><div class="empty-state">Error loading hosts: ${err.message}</div></td></tr>`;
    });
}
