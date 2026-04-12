import { useRef, useState, useEffect, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Host } from '../lib/types'
import { fetchApi } from '../lib/types'

// ── Types ──────────────────────────────────────────────────────────────────

interface Props {
  domain: string
  hosts: Host[]
}

type ScanPhase = 'idle' | 'polling' | 'done' | 'failed'

interface JsSecret {
  file: string
  type: string
  value: string
}

interface JsLink {
  file: string
  url: string
}

interface JsResult {
  secrets: JsSecret[]
  links: JsLink[]
}

interface ScanState {
  phase: ScanPhase
  jobId?: string
  result?: JsResult
  error?: string
}

interface ToastState {
  visible: boolean
  message: string
  type: 'success' | 'error'
}

// ── Host JS panel (presentational) ────────────────────────────────────────

function HostJsPanel({
  domain,
  host,
  scan,
  onStartScan,
}: {
  domain: string
  host: Host
  scan: ScanState
  onStartScan: (headless: boolean) => void
}) {
  const [headless, setHeadless] = useState(false)

  const scColor: Record<string, string> = {
    s200: 'var(--green)', s201: 'var(--green)', s301: 'var(--orange)',
    s302: 'var(--orange)', s403: 'var(--red)', s400: 'var(--red)',
  }
  const statusColor = scColor[host.sc] || 'var(--text)'

  return (
    <div className="ov-main-content">
      {/* Header */}
      <div className="ov-header">
        <div className="ov-host-url">
          <a href={host.url} target="_blank" rel="noreferrer">{host.url}</a>
        </div>
        <div className="ov-meta-row">
          <span className="status-val" style={{ color: statusColor, fontSize: 16 }}>{host.status}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 12, fontFamily: "'Fira Code', monospace" }}>
            {host.server}
          </span>
        </div>
      </div>

      <div className="ov-body">

        {/* Scan action */}
        <div className="ov-section">
          <div className="ov-section-title action-section">
            JavaScript Analysis
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
              <label className="toggle-wrap">
                <input
                  type="checkbox"
                  className="toggle-input"
                  checked={headless}
                  disabled={scan.phase === 'polling'}
                  onChange={e => setHeadless(e.target.checked)}
                />
                <span className="toggle-slider" />
                <span className="toggle-label">Headless</span>
              </label>
              <button
                className="ov-action-btn"
                disabled={scan.phase === 'polling'}
                onClick={() => onStartScan(headless)}
              >
                {scan.phase === 'polling' ? 'Scanning...' : 'Scrape & Scan'}
              </button>
            </div>
          </div>

          {scan.phase === 'idle' && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
              Press Scrape &amp; Scan to analyse JS files on this host.
            </div>
          )}
          {scan.phase === 'polling' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>
              <div className="spinner" />
              Scraping JS files and scanning for secrets...
              {scan.jobId && (
                <span style={{ fontFamily: "'Fira Code', monospace", color: 'var(--text-dim)' }}>
                  job: {scan.jobId}
                </span>
              )}
            </div>
          )}
          {scan.phase === 'failed' && (
            <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{scan.error}</div>
          )}
        </div>

        {/* Secrets */}
        <div className="ov-section">
          <div className="ov-section-title">
            Secrets
            {scan.phase === 'done' && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>
                {scan.result?.secrets.length ?? 0} found
              </span>
            )}
          </div>
          {scan.phase !== 'done' ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
              {scan.phase === 'idle' ? 'No scan run yet.' : scan.phase === 'polling' ? 'Waiting for results...' : '—'}
            </div>
          ) : scan.result?.secrets.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>No secrets found.</div>
          ) : (
            <table className="ov-hits-table">
              <thead><tr><th>Type</th><th>Value</th></tr></thead>
              <tbody>
                {scan.result?.secrets.map((s, i) => (
                  <tr key={i}>
                    <td><span className="badge badge-red">{s.type}</span></td>
                    <td className="mono" style={{ color: 'var(--red)', wordBreak: 'break-all' }}>{s.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Link finder */}
        <div className="ov-section">
          <div className="ov-section-title">
            Link Finder
            {scan.phase === 'done' && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>
                {scan.result?.links.length ?? 0} found
              </span>
            )}
          </div>
          {scan.phase !== 'done' ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
              {scan.phase === 'idle' ? 'No scan run yet.' : scan.phase === 'polling' ? 'Waiting for results...' : '—'}
            </div>
          ) : scan.result?.links.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>No links found.</div>
          ) : (
            <table className="ov-hits-table">
              <thead><tr><th>URL</th></tr></thead>
              <tbody>
                {scan.result?.links.map((l, i) => (
                  <tr key={i}>
                    <td><a href={l.url} target="_blank" rel="noreferrer" className="mono">{l.url}</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  )
}

// ── Sidebar grouping ───────────────────────────────────────────────────────

const GROUP_ORDER = ['2xx', '3xx', '4xx', '5xx', 'other']

function statusGroup(status: string): string {
  if (status.startsWith('2')) return '2xx'
  if (status.startsWith('3')) return '3xx'
  if (status.startsWith('4')) return '4xx'
  if (status.startsWith('5')) return '5xx'
  return 'other'
}

const groupColor: Record<string, string> = {
  '2xx': 'var(--green)',
  '3xx': 'var(--orange)',
  '4xx': 'var(--red)',
  '5xx': 'var(--yellow)',
  'other': 'var(--text-muted)',
}

type SidebarItem =
  | { type: 'header'; group: string; count: number }
  | { type: 'host'; host: Host }

// ── JS tab ─────────────────────────────────────────────────────────────────

export default function JSTab({ domain, hosts }: Props) {
  const [activeId, setActiveId] = useState<number | null>(null)
  const [filter, setFilter] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)

  // Scan state keyed by hostURL — persists across host/tab switches
  const [scans, setScans] = useState<Map<string, ScanState>>(new Map())
  const pollRefs = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())

  const [toast, setToast] = useState<ToastState>({ visible: false, message: '', type: 'success' })
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const enc = encodeURIComponent

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ visible: true, message, type })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(t => ({ ...t, visible: false })), 4000)
  }

  function setScan(hostURL: string, update: Partial<ScanState> | ((prev: ScanState) => ScanState)) {
    setScans(prev => {
      const next = new Map(prev)
      const current = next.get(hostURL) ?? { phase: 'idle' }
      next.set(hostURL, typeof update === 'function' ? update(current) : { ...current, ...update })
      return next
    })
  }

  function stopPoll(hostURL: string) {
    const interval = pollRefs.current.get(hostURL)
    if (interval) { clearInterval(interval); pollRefs.current.delete(hostURL) }
  }

  // Load existing results for a host when first selected
  useEffect(() => {
    if (activeId === null) return
    const host = hosts.find(h => h.id === activeId)
    if (!host) return
    const hostURL = host.url
    // Don't overwrite an in-progress or completed scan
    const existing = scans.get(hostURL)
    if (existing && existing.phase !== 'idle') return

    fetchApi(`/api/${enc(domain)}/host/${enc(hostURL)}/js`)
      .then(r => r.json())
      .then(d => {
        if ((d.secrets?.length ?? 0) > 0 || (d.links?.length ?? 0) > 0) {
          setScan(hostURL, {
            phase: 'done',
            result: { secrets: d.secrets ?? [], links: d.links ?? [] },
          })
        }
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])

  // Clean up all polls on unmount
  useEffect(() => {
    return () => {
      pollRefs.current.forEach(interval => clearInterval(interval))
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [])

  async function startScan(hostURL: string, headless: boolean) {
    if (pollRefs.current.has(hostURL)) return
    setScan(hostURL, { phase: 'polling' })

    try {
      const r = await fetchApi(`/api/${enc(domain)}/host/${enc(hostURL)}/js`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headless }),
      })
      if (!r.ok) {
        setScan(hostURL, { phase: 'failed', error: 'Failed to start scan' })
        return
      }
      const data = await r.json()
      const jobId: string = data.id
      setScan(hostURL, { phase: 'polling', jobId })

      const interval = setInterval(async () => {
        try {
          const r2 = await fetchApi(`/api/tools/status?id=${jobId}`)
          const d = await r2.json()
          if (d.status === 'done') {
            stopPoll(hostURL)
            try {
              const r3 = await fetchApi(`/api/${enc(domain)}/host/${enc(hostURL)}/js`)
              const result = await r3.json()
              const secrets: JsSecret[] = result.secrets ?? []
              const links: JsLink[] = result.links ?? []
              setScan(hostURL, { phase: 'done', jobId, result: { secrets, links } })
              showToast(
                `JS scan done — ${hostURL}: ${secrets.length} secret${secrets.length !== 1 ? 's' : ''}, ${links.length} link${links.length !== 1 ? 's' : ''}`,
                'success'
              )
            } catch {
              setScan(hostURL, { phase: 'failed', jobId, error: 'Failed to fetch results' })
              showToast(`JS scan failed for ${hostURL}`, 'error')
            }
          } else if (d.status === 'failed') {
            stopPoll(hostURL)
            setScan(hostURL, { phase: 'failed', jobId, error: d.error || 'Scan failed' })
            showToast(`JS scan failed for ${hostURL}`, 'error')
          }
        } catch {
          stopPoll(hostURL)
          setScan(hostURL, prev => ({ ...prev, phase: 'failed', error: 'Network error while polling' }))
          showToast(`JS scan failed for ${hostURL}`, 'error')
        }
      }, 5000)

      pollRefs.current.set(hostURL, interval)
    } catch {
      setScan(hostURL, { phase: 'failed', error: 'Failed to start scan' })
    }
  }

  function toggleGroup(g: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      next.has(g) ? next.delete(g) : next.add(g)
      return next
    })
  }

  const filtered = useMemo(
    () => filter ? hosts.filter(h => h.url.toLowerCase().includes(filter.toLowerCase())) : hosts,
    [hosts, filter]
  )

  const items = useMemo<SidebarItem[]>(() => {
    const map: Record<string, Host[]> = {}
    for (const h of filtered) {
      const g = statusGroup(h.status)
      ;(map[g] ??= []).push(h)
    }
    const result: SidebarItem[] = []
    for (const g of GROUP_ORDER) {
      if (!map[g]?.length) continue
      result.push({ type: 'header', group: g, count: map[g].length })
      if (!collapsedGroups.has(g)) {
        for (const h of map[g]) result.push({ type: 'host', host: h })
      }
    }
    return result
  }, [filtered, collapsedGroups])

  const activeHost = hosts.find(h => h.id === activeId) ?? null

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => items[i]?.type === 'header' ? 34 : 58,
    overscan: 8,
  })

  const scColor: Record<string, string> = {
    s200: 'var(--green)', s201: 'var(--green)', s301: 'var(--orange)',
    s302: 'var(--orange)', s403: 'var(--red)', s400: 'var(--red)',
  }

  return (
    <div className="overview-layout">
      {/* Sidebar */}
      <div className={`overview-sidebar${sidebarCollapsed ? ' collapsed' : ''}`}>
        <div className="sidebar-header">
          {!sidebarCollapsed && (
            <div className="sidebar-search-wrap">
              <input
                type="text"
                placeholder="Filter hosts..."
                value={filter}
                onChange={e => setFilter(e.target.value)}
              />
            </div>
          )}
          <button
            className="sidebar-collapse-btn"
            onClick={() => setSidebarCollapsed(c => !c)}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? '▶' : '◀'}
          </button>
        </div>

        {!sidebarCollapsed && (
          <div ref={scrollRef} className="sidebar-list">
            <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
              {rowVirtualizer.getVirtualItems().map(vr => {
                const item = items[vr.index]
                if (item.type === 'header') {
                  return (
                    <div
                      key={`grp-${item.group}`}
                      onClick={() => toggleGroup(item.group)}
                      style={{
                        position: 'absolute', top: vr.start, width: '100%', height: vr.size,
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '0 12px',
                        cursor: 'pointer',
                        background: 'var(--surface)',
                        borderBottom: '1px solid var(--border2)',
                        userSelect: 'none',
                        boxSizing: 'border-box',
                      }}
                    >
                      <span style={{ fontSize: 9, color: 'var(--text-dim)', width: 8 }}>
                        {collapsedGroups.has(item.group) ? '▶' : '▼'}
                      </span>
                      <span style={{
                        fontFamily: "'Fira Code', monospace",
                        fontSize: 12,
                        fontWeight: 700,
                        color: groupColor[item.group],
                      }}>
                        {item.group}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {item.count}
                      </span>
                    </div>
                  )
                }

                const h = item.host
                const scanPhase = scans.get(h.url)?.phase
                return (
                  <div
                    key={h.id}
                    className={`sidebar-item${activeId === h.id ? ' si-active' : ''}`}
                    style={{ position: 'absolute', top: vr.start, width: '100%', height: vr.size }}
                    onClick={() => setActiveId(h.id)}
                  >
                    <div className="sidebar-item-url">{h.url}</div>
                    <div className="sidebar-item-meta">
                      <span
                        className="sidebar-item-status"
                        style={{ color: scColor[h.sc] || 'var(--text-dim)' }}
                      >
                        {h.status}
                      </span>
                      {scanPhase === 'polling' && (
                        <span className="badge badge-yellow">scanning</span>
                      )}
                      {scanPhase === 'done' && (
                        <span className="badge badge-green">scanned</span>
                      )}
                      {h.badges?.map(b => (
                        <span key={b} className="badge badge-yellow">{b}</span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="overview-main">
        {activeHost ? (
          <HostJsPanel
            key={activeHost.id}
            domain={domain}
            host={activeHost}
            scan={scans.get(activeHost.url) ?? { phase: 'idle' }}
            onStartScan={(headless) => startScan(activeHost.url, headless)}
          />
        ) : (
          <div className="overview-empty-msg">← Select a host to analyse its JavaScript</div>
        )}
      </div>

      {/* Toast */}
      {toast.visible && (
        <div className={`toast ${toast.type}`}>
          <span className={`toast-icon ${toast.type}`}>{toast.type === 'success' ? '✓' : '✕'}</span>
          {toast.message}
        </div>
      )}
    </div>
  )
}
