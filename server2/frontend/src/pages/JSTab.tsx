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

interface JsResult {
  secrets: string[]
  links: string[]
}

interface ScanState {
  phase: ScanPhase
  jobId?: string
  result?: JsResult
  error?: string
}

// ── JS scan hook ───────────────────────────────────────────────────────────

function useJsScan(domain: string, hostURL: string) {
  const [scan, setScan] = useState<ScanState>({ phase: 'idle' })
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const enc = encodeURIComponent

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  useEffect(() => {
    stopPolling()
    setScan({ phase: 'idle' })
    return stopPolling
  }, [domain, hostURL])

  async function startScan() {
    if (pollRef.current) return
    setScan({ phase: 'polling' })
    try {
      const r = await fetchApi(`/api/${enc(domain)}/host/${enc(hostURL)}/js`, { method: 'POST' })
      if (!r.ok) { setScan({ phase: 'failed', error: 'Failed to start scan' }); return }
      const data = await r.json()
      const jobId: string = data.id
      setScan({ phase: 'polling', jobId })

      pollRef.current = setInterval(async () => {
        try {
          const r2 = await fetchApi(`/api/${enc(domain)}/host/${enc(hostURL)}/js/status?id=${jobId}`)
          const d = await r2.json()
          if (d.status === 'done') {
            stopPolling()
            setScan({ phase: 'done', jobId, result: { secrets: d.secrets ?? [], links: d.links ?? [] } })
          } else if (d.status === 'failed') {
            stopPolling()
            setScan({ phase: 'failed', jobId, error: d.error || 'Scan failed' })
          }
          // pending → keep polling
        } catch {
          stopPolling()
          setScan(prev => ({ ...prev, phase: 'failed', error: 'Network error while polling' }))
        }
      }, 5000)
    } catch {
      setScan({ phase: 'failed', error: 'Failed to start scan' })
    }
  }

  return { scan, startScan }
}

// ── Host JS panel ──────────────────────────────────────────────────────────

function HostJsPanel({ domain, host }: { domain: string; host: Host }) {
  const { scan, startScan } = useJsScan(domain, host.url)

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
            <button
              className="ov-action-btn"
              disabled={scan.phase === 'polling'}
              onClick={startScan}
            >
              {scan.phase === 'polling' ? 'Scanning...' : 'Scrape & Scan'}
            </button>
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
            <div className="js-results-list">
              {scan.result?.secrets.map((s, i) => (
                <div key={i} className="js-result-item js-secret">
                  <span className="badge badge-red" style={{ marginRight: 8, flexShrink: 0 }}>secret</span>
                  <span className="js-result-value mono">{s}</span>
                </div>
              ))}
            </div>
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
            <div className="js-results-list">
              {scan.result?.links.map((l, i) => (
                <div key={i} className="js-result-item">
                  <a href={l} target="_blank" rel="noreferrer" className="js-result-value mono">{l}</a>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

// ── JS tab ─────────────────────────────────────────────────────────────────

export default function JSTab({ domain, hosts }: Props) {
  const [activeId, setActiveId] = useState<number | null>(null)
  const [filter, setFilter] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(
    () => filter ? hosts.filter(h => h.url.toLowerCase().includes(filter.toLowerCase())) : hosts,
    [hosts, filter]
  )

  const activeHost = hosts.find(h => h.id === activeId) ?? null

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 58,
    overscan: 8,
  })

  const scColor: Record<string, string> = {
    s200: 'var(--green)', s201: 'var(--green)', s301: 'var(--orange)',
    s302: 'var(--orange)', s403: 'var(--red)', s400: 'var(--red)',
  }

  return (
    <div className="overview-layout">
      {/* Sidebar */}
      <div className={`overview-sidebar${collapsed ? ' collapsed' : ''}`}>
        <div className="sidebar-header">
          {!collapsed && (
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
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? '▶' : '◀'}
          </button>
        </div>

        {!collapsed && (
          <div ref={scrollRef} className="sidebar-list">
            <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
              {rowVirtualizer.getVirtualItems().map(vr => {
                const h = filtered[vr.index]
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
          <HostJsPanel key={activeHost.id} domain={domain} host={activeHost} />
        ) : (
          <div className="overview-empty-msg">← Select a host to analyse its JavaScript</div>
        )}
      </div>
    </div>
  )
}
