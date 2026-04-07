import { useRef, useState, useEffect, useMemo, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Host, HostStats } from '../lib/types'
import { fetchApi } from '../lib/types'
import HostPanel from './HostPanel'

// ── Types ──────────────────────────────────────────────────────────────────

interface Props {
  domain: string
  hosts: Host[]
  stats: HostStats | null
  onImport: () => void
  onOpenInOverview: (id: number) => void
  onTriageChange: (id: number, status: string) => void
  onNotesChange: (id: number, notes: string) => void
}

interface HostGroup {
  key: string
  primary: Host
  children: Host[]
}

type FlatItem =
  | { kind: 'primary'; host: Host; groupKey: string; childCount: number }
  | { kind: 'child';   host: Host; groupKey: string }

interface ColVis {
  ips: boolean
  cname: boolean
  ctype: boolean
}

type SortDir = 'asc' | 'desc'

// ── Grouping helpers ────────────────────────────────────────────────────────

function urlPriority(url: string): number {
  try {
    const u = new URL(url)
    const port = u.port ? parseInt(u.port) : (u.protocol === 'https:' ? 443 : 80)
    if (u.protocol === 'https:' && port === 443) return 0
    if (u.protocol === 'http:'  && port === 80)  return 1
    return 2000 + port
  } catch { return 99999 }
}

function groupByHostname(hosts: Host[]): HostGroup[] {
  const map = new Map<string, Host[]>()
  for (const h of hosts) {
    let key: string
    try { key = new URL(h.url).hostname } catch { key = h.url }
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(h)
  }
  const groups: HostGroup[] = []
  map.forEach((members, key) => {
    members.sort((a, b) => urlPriority(a.url) - urlPriority(b.url))
    groups.push({ key, primary: members[0], children: members.slice(1) })
  })
  return groups
}

// ── Column helpers ──────────────────────────────────────────────────────────

const COLS = [
  { label: 'URL',          sortKey: (h: Host) => h.url },
  { label: 'Status',       sortKey: (h: Host) => h.status },
  { label: 'Title',        sortKey: (h: Host) => h.title ?? '' },
  { label: 'Server',       sortKey: (h: Host) => h.server ?? '' },
  { label: 'Tech',         sortKey: (h: Host) => (h.tech ?? []).join(',') },
  { label: 'Ports',        sortKey: (h: Host) => (h.ports ?? []).map(p => p.port).join(',') },
  { label: 'IPs',          sortKey: (h: Host) => (h.ips ?? []).join(','), toggleable: 'ips' as keyof ColVis },
  { label: 'CNAME',        sortKey: (h: Host) => (h.cname ?? []).join(','), toggleable: 'cname' as keyof ColVis },
  { label: 'Content-Type', sortKey: (h: Host) => h.ctype ?? '', toggleable: 'ctype' as keyof ColVis },
]

function gridTemplate(vis: ColVis): string {
  return [
    'minmax(180px, 380px)',
    '70px',
    '150px',
    '120px',
    '120px',
    '80px',
    ...(vis.ips   ? ['110px'] : []),
    ...(vis.cname ? ['110px'] : []),
    ...(vis.ctype ? ['130px'] : []),
  ].join(' ')
}

// ── Badge map ───────────────────────────────────────────────────────────────

const BADGE_CLASS: Record<string, string> = { interesting: 'badge-orange', api: 'badge-yellow' }

// ── Main component ──────────────────────────────────────────────────────────

export default function HostsTab({ domain, hosts, stats, onImport, onOpenInOverview, onTriageChange, onNotesChange }: Props) {
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set())
  const [filter,      setFilter]      = useState('')
  const [sortCol,     setSortCol]     = useState<number | null>(null)
  const [sortDir,     setSortDir]     = useState<SortDir>('asc')
  const [colVis,      setColVis]      = useState<ColVis>({ ips: true, cname: true, ctype: true })
  const [panelHost,   setPanelHost]   = useState<Host | null>(null)
  const [importing,   setImporting]   = useState(false)
  const [toast,       setToast]       = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [hidden,      setHidden]      = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(`recon_hidden_${domain}`)
      return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>()
    } catch { return new Set<string>() }
  })
  const [showHidden,      setShowHidden]      = useState(false)
  const [tagFilter,       setTagFilter]       = useState<Set<string>>(new Set())
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false)

  const scrollRef      = useRef<HTMLDivElement>(null)
  const toastTimer     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tagDropdownRef = useRef<HTMLDivElement>(null)

  // Persist hidden list to localStorage
  useEffect(() => {
    localStorage.setItem(`recon_hidden_${domain}`, JSON.stringify([...hidden]))
  }, [hidden, domain])

  // Close panel on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanelHost(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Close tag dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(e.target as Node))
        setTagDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function showToast(type: 'success' | 'error', msg: string) {
    setToast({ type, msg })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }

  // ── Derived data ───────────────────────────────────────────────────────

  const TRIAGE_TAGS = new Set(['to-test', 'dead-end', 'tested', 'none'])

  const filteredHosts = useMemo(() => {
    let result = hosts

    if (filter.trim()) {
      const q = filter.toLowerCase()
      result = result.filter(h =>
        h.url.toLowerCase().includes(q) ||
        (h.title ?? '').toLowerCase().includes(q) ||
        (h.server ?? '').toLowerCase().includes(q)
      )
    }

    if (tagFilter.size > 0) {
      result = result.filter(h => {
        for (const tag of tagFilter) {
          if (TRIAGE_TAGS.has(tag)) { if (h.triage_status === tag) return true }
          else                      { if (h.badges?.includes(tag))  return true }
        }
        return false
      })
    }

    return result
  }, [hosts, filter, tagFilter])

  const groups = useMemo(() => {
    const gs = groupByHostname(filteredHosts)
    if (sortCol === null) return gs
    const fn = COLS[sortCol]?.sortKey
    if (!fn) return gs
    return [...gs].sort((a, b) => {
      const A = fn(a.primary), B = fn(b.primary)
      return A.localeCompare(B, undefined, { numeric: true }) * (sortDir === 'asc' ? 1 : -1)
    })
  }, [filteredHosts, sortCol, sortDir])

  const flatItems = useMemo<FlatItem[]>(() => {
    const items: FlatItem[] = []
    const source = showHidden ? groups : groups.filter(g => !hidden.has(g.key))
    for (const g of source) {
      items.push({ kind: 'primary', host: g.primary, groupKey: g.key, childCount: g.children.length })
      if (expanded.has(g.key)) {
        for (const c of g.children) {
          items.push({ kind: 'child', host: c, groupKey: g.key })
        }
      }
    }
    return items
  }, [groups, expanded, hidden, showHidden])

  // ── Virtualizer ────────────────────────────────────────────────────────

  const rowVirtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: i => flatItems[i]?.kind === 'child' ? 40 : 52,
    overscan: 10,
    measureElement: el => el.getBoundingClientRect().height,
  })

  // ── Actions ────────────────────────────────────────────────────────────

  function toggleGroup(e: React.MouseEvent, key: string) {
    e.stopPropagation()
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function toggleHide(e: React.MouseEvent, key: string) {
    e.stopPropagation()
    setHidden(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function collapseAll() {
    setExpanded(new Set())
  }

  function handleSort(col: number) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  function toggleCol(key: keyof ColVis) {
    setColVis(v => ({ ...v, [key]: !v[key] }))
  }

  function toggleTag(tag: string) {
    setTagFilter(prev => {
      const next = new Set(prev)
      next.has(tag) ? next.delete(tag) : next.add(tag)
      return next
    })
  }

  const doImport = useCallback(async () => {
    setImporting(true)
    try {
      const r = await fetchApi(`/api/import/${encodeURIComponent(domain)}`, { method: 'POST' })
      if (!r.ok) { const t = await r.text(); throw new Error(t) }
      showToast('success', 'Data imported successfully!')
      onImport()
    } catch (err: unknown) {
      showToast('error', 'Import failed: ' + (err instanceof Error ? err.message : 'unknown'))
    } finally {
      setImporting(false)
    }
  }, [domain, onImport])

  // ── Render helpers ─────────────────────────────────────────────────────

  const template = gridTemplate(colVis)

  function visibleCols(host: Host) {
    return [
      host.url,
      host.status,
      host.title ?? '',
      host.server ?? '',
      (host.tech ?? []).join(', ') || '—',
      (host.ports ?? []).map(p => p.port).join(', ') || '—',
      ...(colVis.ips   ? [(host.ips ?? []).join(', ') || '—'] : []),
      ...(colVis.cname ? [(host.cname ?? []).join(', ') || '—'] : []),
      ...(colVis.ctype ? [host.ctype ?? '—'] : []),
    ]
  }


  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="hosts-tab-shell">

      {/* Stats bar */}
      <div className="stats">
        <div className="stat-card">
          <div className="stat-value">{stats?.total ?? '—'}</div>
          <div className="stat-label">Total Hosts</div>
        </div>
        <div className="stat-card ok">
          <div className="stat-value">{stats?.s200 ?? '—'}</div>
          <div className="stat-label">200 OK</div>
        </div>
        <div className="stat-card warn">
          <div className="stat-value">{stats?.s403 ?? '—'}</div>
          <div className="stat-label">403 Forbidden</div>
        </div>
        <div className="stat-card danger">
          <div className="stat-value">{stats?.s500 ?? '—'}</div>
          <div className="stat-label">5xx Errors</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="hosts-toolbar">
        <div className="search-wrap">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="Filter hosts..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>

        {/* Tag filter dropdown */}
        <div ref={tagDropdownRef} style={{ position: 'relative' }}>
          <button
            className={`expand-btn${tagFilter.size > 0 ? ' open' : ''}`}
            onClick={() => setTagDropdownOpen(v => !v)}
          >
            Tags{tagFilter.size > 0 ? ` (${tagFilter.size})` : ''}
          </button>
          {tagDropdownOpen && (
            <div className="tag-filter-dropdown">
              <div className="tag-filter-group-label">Triage</div>
              {(['to-test', 'dead-end', 'tested', 'none'] as const).map(t => (
                <label key={t} className="tag-filter-item">
                  <input type="checkbox" checked={tagFilter.has(t)} onChange={() => toggleTag(t)} />
                  {t}
                </label>
              ))}
              <div className="tag-filter-group-label" style={{ marginTop: 8 }}>Badges</div>
              {(['api', 'interesting'] as const).map(t => (
                <label key={t} className="tag-filter-item">
                  <input type="checkbox" checked={tagFilter.has(t)} onChange={() => toggleTag(t)} />
                  {t}
                </label>
              ))}
              {tagFilter.size > 0 && (
                <button className="tag-filter-clear" onClick={() => setTagFilter(new Set())}>
                  clear all
                </button>
              )}
            </div>
          )}
        </div>

        <div className="col-toggle">
          <span>Columns</span>
          {(['ips', 'cname', 'ctype'] as const).map(k => (
            <button
              key={k}
              className={colVis[k] ? 'active' : ''}
              onClick={() => toggleCol(k)}
            >
              {k === 'ips' ? 'IPs' : k === 'cname' ? 'CNAME' : 'Content-Type'}
            </button>
          ))}
        </div>

        <button className="expand-btn" onClick={collapseAll}>▲ Collapse All</button>

        {hidden.size > 0 && (
          <button
            className={`expand-btn${showHidden ? ' open' : ''}`}
            onClick={() => setShowHidden(v => !v)}
          >
            {showHidden ? '● ' : '○ '}{hidden.size} hidden
          </button>
        )}

        <button
          className={`btn-import${importing ? ' loading' : ''}`}
          disabled={importing}
          onClick={doImport}
        >
          {importing ? (
            <><div className="spinner" /> Importing...</>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Import
            </>
          )}
        </button>
      </div>

      {/* Table */}
      <div className="hosts-table-wrap">

        {/* Sticky header */}
        <div className="hosts-header-row" style={{ gridTemplateColumns: template }}>
          {COLS.filter((_c, i) => {
            if (i < 6) return true
            if (i === 6) return colVis.ips
            if (i === 7) return colVis.cname
            return colVis.ctype
          }).map((col, i) => (
            <div
              key={col.label}
              className={`hosts-th${i > 0 ? ' hosts-th-num' : ''}`}
              onClick={() => handleSort(COLS.indexOf(col))}
            >
              {col.label}
              <span className="sort-icon" style={{ opacity: sortCol === COLS.indexOf(col) ? 1 : 0.3 }}>
                {sortCol === COLS.indexOf(col) ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
              </span>
            </div>
          ))}
        </div>

        {/* Virtualised rows */}
        <div ref={scrollRef} className="hosts-scroll">
          {flatItems.length === 0 ? (
            <div className="empty-state">{filter ? 'No hosts match filter.' : 'No hosts loaded.'}</div>
          ) : (
            <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
              {rowVirtualizer.getVirtualItems().map(vr => {
                const item = flatItems[vr.index]
                const h    = item.host
                const cols = visibleCols(h)
                const isChild    = item.kind === 'child'
                const isExpanded = item.kind === 'primary' && expanded.has(item.groupKey)
                const isHidden   = hidden.has(item.groupKey)

                return (
                  <div
                    key={`${item.groupKey}-${h.id}`}
                    data-index={vr.index}
                    ref={rowVirtualizer.measureElement}
                    className={`hosts-row${isChild ? ' hosts-row-child' : ''}${isHidden ? ' hosts-row-hidden' : ''}`}
                    style={{ position: 'absolute', top: vr.start, left: 0, width: '100%', gridTemplateColumns: template }}
                    onClick={() => setPanelHost(h)}
                  >
                    {/* URL cell */}
                    <div className="hosts-td hosts-td-url" style={isChild ? { paddingLeft: 28 } : undefined}>
                      <div className="url-line">
                        <a href={h.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                          {h.url}
                        </a>
                        {item.kind === 'primary' && item.childCount > 0 && (
                          <button
                            className={`expand-btn${isExpanded ? ' open' : ''}`}
                            onClick={e => toggleGroup(e, item.groupKey)}
                          >
                            {isExpanded ? `▼ ${item.childCount + 1} hosts` : `▶ ${item.childCount + 1} hosts`}
                          </button>
                        )}
                        {item.kind === 'primary' && (
                          <button
                            className="hide-host-btn"
                            onClick={e => toggleHide(e, item.groupKey)}
                            title={isHidden ? 'Unhide' : 'Hide'}
                          >
                            {isHidden ? 'unhide' : 'hide'}
                          </button>
                        )}
                      </div>
                      {!isExpanded && (h.badges?.length > 0 || (h.triage_status && h.triage_status !== 'none')) && (
                        <div className="url-meta">
                          {h.badges?.map(b => (
                            <span key={b} className={`badge ${BADGE_CLASS[b] ?? 'badge-yellow'}`}>{b}</span>
                          ))}
                          {h.triage_status && h.triage_status !== 'none' && (
                            <span className="triage-tag" data-status={h.triage_status}>{h.triage_status}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Status */}
                    <div className={`hosts-td ${h.sc}`}>{h.status}</div>

                    {/* Remaining cols */}
                    {cols.slice(2).map((val, i) => (
                      <div key={i} className="hosts-td hosts-td-trunc">{val}</div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Side panel */}
      {panelHost && (
        <HostPanel
          key={panelHost.id}
          host={panelHost}
          domain={domain}
          onClose={() => setPanelHost(null)}
          onOpenInOverview={onOpenInOverview}
          onTriageChange={onTriageChange}
          onNotesChange={onNotesChange}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.type}`}>
          <span className={`toast-icon ${toast.type}`}>{toast.type === 'success' ? '✓' : '✕'}</span>
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  )
}
