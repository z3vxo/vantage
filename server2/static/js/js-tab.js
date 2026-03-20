// ── JS Analysis ──
function loadJS() {
  fetch('/api/js')
    .then(r => r.json())
    .then(data => {
      const { domains } = data;
      document.getElementById('count-js').textContent = domains.length;

      const tbody = document.getElementById('tbody-js');
      if (!domains.length) {
        tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state">No JS analysis data found.</div></td></tr>`;
        return;
      }

      const sevBadge = { high: 'badge-red', medium: 'badge-orange', low: 'badge-yellow', none: '' };
      const sevClass = { high: 'sev-high', medium: 'sev-medium', low: 'sev-low', none: '' };

      let html = '';
      domains.forEach((d, i) => {
        const badge = d.severity !== 'none'
          ? `<span class="badge ${sevBadge[d.severity]}">${d.severity}</span>`
          : '<span style="color:var(--text-muted)">—</span>';

        html += `
          <tr class="js-domain-row" onclick="toggleJSDomain(${i}, '${escHtml(d.domain)}', this)">
            <td>
              <span class="expand-btn" id="js-arrow-${i}">&#9654;</span>
              <span style="font-family:'Fira Code',monospace; margin-left:8px">${escHtml(d.domain)}</span>
            </td>
            <td style="color:var(--text)">${d.endpoint_count}</td>
            <td class="${sevClass[d.severity]}">${d.secret_count}</td>
            <td>${badge}</td>
          </tr>
          <tr id="js-detail-${i}" style="display:none">
            <td colspan="4" style="padding:0; background:#000; border-bottom:1px solid var(--border2)">
              <div id="js-loading-${i}" style="padding:12px 20px; color:var(--text-muted); font-size:12px">Loading...</div>
            </td>
          </tr>`;
      });

      tbody.innerHTML = html;
    });
}

function toggleJSDomain(id, domain, row) {
  const detailRow = document.getElementById(`js-detail-${id}`);
  const arrow     = document.getElementById(`js-arrow-${id}`);
  const isOpen    = detailRow.style.display !== 'none';

  if (isOpen) {
    detailRow.style.display = 'none';
    arrow.innerHTML = '&#9654;';
    arrow.classList.remove('open');
    row.classList.remove('open');
    document.getElementById(`js-loading-${id}`).innerHTML = 'Loading...';
    return;
  }

  detailRow.style.display = '';
  arrow.innerHTML = '&#9660;';
  arrow.classList.add('open');
  row.classList.add('open');

  fetch(`/api/js/${encodeURIComponent(domain)}`)
    .then(r => r.json())
    .then(data => {
      const { endpoints, secrets } = data;

      const sevBadge = { high: 'badge-red', medium: 'badge-orange', low: 'badge-yellow' };
      const sevClass = { high: 'sev-high',  medium: 'sev-medium',   low: 'sev-low' };

      const endpointRows = endpoints.length
        ? endpoints.map(e => `
            <tr>
              <td>${escHtml(e.endpoint)}</td>
              <td style="color:var(--text-muted)">${escHtml(e.source)}</td>
            </tr>`).join('')
        : `<tr><td colspan="2" style="color:var(--text-muted)">No endpoints found</td></tr>`;

      const secretRows = secrets.length
        ? secrets.map(s => `
            <tr>
              <td class="${sevClass[s.severity] || ''}">${escHtml(s.type)}</td>
              <td style="font-family:'Fira Code',monospace; max-width:300px; overflow:hidden; text-overflow:ellipsis">${escHtml(s.match)}</td>
              <td style="color:var(--text-muted)">${escHtml(s.source)}</td>
              <td><span class="badge ${sevBadge[s.severity] || 'badge-yellow'}">${s.severity}</span></td>
            </tr>`).join('')
        : `<tr><td colspan="4" style="color:var(--text-muted)">No secrets found</td></tr>`;

      document.getElementById(`js-loading-${id}`).innerHTML = `
        <div class="js-section">
          <div class="js-section-title">
            Endpoints <span class="count-pill">${endpoints.length}</span>
          </div>
          <table class="js-sub-table">
            <colgroup><col style="width:55%"><col style="width:45%"></colgroup>
            <tbody>${endpointRows}</tbody>
          </table>
        </div>
        <div class="js-section" style="border-top:1px solid var(--border2)">
          <div class="js-section-title">
            Secrets <span class="count-pill">${secrets.length}</span>
          </div>
          <table class="js-sub-table">
            <colgroup><col style="width:20%"><col style="width:45%"><col style="width:20%"><col style="width:15%"></colgroup>
            <tbody>${secretRows}</tbody>
          </table>
        </div>`;
    })
    .catch(err => {
      document.getElementById(`js-loading-${id}`).textContent = `Error: ${err.message}`;
    });
}
