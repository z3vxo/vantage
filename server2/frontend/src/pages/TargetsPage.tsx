import { useRef, useState, useEffect, useMemo, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { fetchApi } from '../lib/types'

// ── Types ──────────────────────────────────────────────────────────────────

interface TargetStats {
  total: number | null
  s200: number | null
  s403: number | null
  s500: number | null
  loading: boolean
}

interface ToastState {
  type: 'success' | 'error'
  msg: string
}

// ── Row height (must match CSS padding/font) ──────────────────────────────
const ROW_H = 56

// ── Stat cell ─────────────────────────────────────────────────────────────
function StatCell({ val, colorClass }: { val: number | null; colorClass: string }) {
  return (
    <div className={`td-cell td-num ${colorClass}`}>
      {val === null ? <span style={{ color: 'var(--text-muted)' }}>—</span> : val}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function TargetsPage() {
  const [targets, setTargets] = useState<string[]>([])
  const [stats, setStats] = useState<Record<string, TargetStats>>({})
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [modalDomain, setModalDomain] = useState('')
  const [modalError, setModalError] = useState('')
  const [modalSubmitting, setModalSubmitting] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const modalInputRef = useRef<HTMLInputElement>(null)

  const activeTarget = localStorage.getItem('recon_target')

  // ── Derived state ──────────────────────────────────────────────────────

  const filteredTargets = useMemo(
    () =>
      filter.trim()
        ? targets.filter(t => t.toLowerCase().includes(filter.toLowerCase()))
        : targets,
    [targets, filter]
  )

  const summaryTotals = useMemo(() => {
    let hosts = 0
    let alive = 0
    for (const s of Object.values(stats)) {
      if (s.total != null) hosts += s.total
      if (s.s200 != null) alive += s.s200
    }
    return { hosts, alive }
  }, [stats])

  // ── Toast ──────────────────────────────────────────────────────────────

  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    setToast({ type, msg })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }, [])

  // ── Data loading ───────────────────────────────────────────────────────

  const loadStats = useCallback((domain: string) => {
    fetchApi(`/api/${encodeURIComponent(domain)}/hosts`)
      .then(r => r.json())
      .then(data => {
        const s = data.stats ?? {}
        setStats(prev => ({
          ...prev,
          [domain]: {
            total: s.total ?? null,
            s200: s.s200 ?? null,
            s403: s.s403 ?? null,
            s500: s.s500 ?? null,
            loading: false,
          },
        }))
      })
      .catch(() =>
        setStats(prev => ({
          ...prev,
          [domain]: { total: null, s200: null, s403: null, s500: null, loading: false },
        }))
      )
  }, [])

  const loadTargets = useCallback(() => {
    setLoading(true)
    fetchApi('/api/targets')
      .then(r => r.json())
      .then(data => {
        const list: string[] = data.targets ?? []
        setTargets(list)
        const init: Record<string, TargetStats> = {}
        list.forEach(t => {
          init[t] = { total: null, s200: null, s403: null, s500: null, loading: true }
        })
        setStats(init)
        list.forEach(loadStats)
      })
      .catch(() => setTargets([]))
      .finally(() => setLoading(false))
  }, [loadStats])

  useEffect(() => {
    loadTargets()
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [loadTargets])

  // ── Actions ────────────────────────────────────────────────────────────

  function selectTarget(domain: string) {
    localStorage.setItem('recon_target', domain)
    window.location.href = '/dashboard'
  }

  async function deleteTarget(domain: string, e: React.MouseEvent) {
    e.stopPropagation()
    setDeleting(domain)
    try {
      const r = await fetchApi(`/api/delete/${encodeURIComponent(domain)}`, { method: 'DELETE' })
      const data = await r.json()
      if (!r.ok) {
        showToast('error', data.status ?? 'Delete failed')
        return
      }
      showToast('success', data.status ?? 'Deleted')
      setTargets(prev => prev.filter(t => t !== domain))
      setStats(prev => {
        const n = { ...prev }
        delete n[domain]
        return n
      })
      if (domain === localStorage.getItem('recon_target')) {
        localStorage.removeItem('recon_target')
      }
    } catch {
      showToast('error', 'Delete failed')
    } finally {
      setDeleting(null)
    }
  }

  // ── Modal ──────────────────────────────────────────────────────────────

  function openModal() {
    setModalDomain('')
    setModalError('')
    setShowModal(true)
    setTimeout(() => modalInputRef.current?.focus(), 50)
  }

  function closeModal() {
    if (modalSubmitting) return
    setShowModal(false)
  }

  async function submitNew() {
    const domain = modalDomain.trim()
    if (!domain) {
      setModalError('Domain cannot be empty.')
      return
    }
    setModalError('')
    setModalSubmitting(true)
    try {
      const r = await fetchApi('/api/targets/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      })
      if (!r.ok) {
        const t = await r.text()
        throw new Error(t)
      }
      setShowModal(false)
      setModalDomain('')
      loadTargets()
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Failed to create target.')
    } finally {
      setModalSubmitting(false)
    }
  }

  // ── Virtualizer ────────────────────────────────────────────────────────

  const rowVirtualizer = useVirtualizer({
    count: filteredTargets.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 8,
  })

  // ── Keyboard ───────────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ── Render ─────────────────────────────────────────────────────────────

  const phMeta = loading
    ? 'loading...'
    : `${targets.length} target${targets.length !== 1 ? 's' : ''}`

  return (
    <div className="app-shell">
      {/* ── Header ── */}
      <header className="header">
        <div className="header-brand">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3ecf8e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <div className="brand-name">Vantage</div>
        </div>
        <div className="header-divider" />
        <div className="header-date">{new Date().toLocaleString()}</div>
        <div className="header-divider" />
        <div className="header-meta">
          active target: <span>{activeTarget ?? 'none'}</span>
        </div>
      </header>

      {/* ── Content ── */}
      <div className="content">
        {/* Page header */}
        <div className="page-header">
          <div className="ph-left">
            <div className="ph-title">Active Targets</div>
            <div className="ph-meta">{phMeta}</div>
          </div>
          <div className="ph-right">
            <div className="filter-wrap">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                className="filter-input"
                type="text"
                placeholder="Filter targets..."
                value={filter}
                onChange={e => setFilter(e.target.value)}
              />
            </div>
            <button className="btn btn-new" onClick={openModal}>+ New Target</button>
          </div>
        </div>

        {/* Table area */}
        {loading ? (
          <div className="empty-state"><p>Loading...</p></div>
        ) : targets.length === 0 ? (
          <div className="empty-state">
            <p>No targets yet.</p>
            <button className="btn btn-primary" onClick={openModal}>+ New Target</button>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              {/* Sticky column headers */}
              <div className="target-grid target-thead">
                <div className="target-th">Domain</div>
                <div className="target-th th-num">Total hosts</div>
                <div className="target-th th-num">200 OK</div>
                <div className="target-th th-num">403</div>
                <div className="target-th th-num">5xx</div>
                <div className="target-th">Status</div>
                <div className="target-th" />
              </div>

              {/* Virtualizer scroll container */}
              <div ref={scrollRef} className="target-scroll">
                <div
                  className="target-virtual-inner"
                  style={{ height: rowVirtualizer.getTotalSize() }}
                >
                  {rowVirtualizer.getVirtualItems().map(virtualRow => {
                    const domain = filteredTargets[virtualRow.index]
                    const s = stats[domain] ?? { loading: true, total: null, s200: null, s403: null, s500: null }
                    const isActive = domain === activeTarget
                    const isDel = deleting === domain

                    return (
                      <div
                        key={domain}
                        className={`target-grid target-row${isActive ? ' is-active' : ''}`}
                        style={{ top: virtualRow.start, height: ROW_H }}
                        onClick={() => selectTarget(domain)}
                      >
                        {/* Domain */}
                        <div className="td-cell td-domain">
                          {domain}
                          {isActive && <span className="active-badge">active</span>}
                        </div>

                        {/* Stats */}
                        <StatCell val={s.loading ? null : s.total} colorClass="clr-dim" />
                        <StatCell val={s.loading ? null : s.s200} colorClass="clr-green" />
                        <StatCell val={s.loading ? null : s.s403} colorClass="clr-orange" />
                        <StatCell val={s.loading ? null : s.s500} colorClass="clr-red" />

                        {/* Status */}
                        <div className="td-cell">
                          <span className="status-dot" />
                          ready
                        </div>

                        {/* Actions */}
                        <div className="td-cell td-actions" onClick={e => e.stopPropagation()}>
                          <button
                            className="btn btn-primary"
                            onClick={() => selectTarget(domain)}
                          >
                            Select →
                          </button>
                          <button
                            className="btn btn-danger"
                            disabled={isDel}
                            onClick={e => deleteTarget(domain, e)}
                          >
                            {isDel ? '...' : 'Delete'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Summary bar */}
            <div className="summary-bar">
              <div className="sb-item">
                targets <span className="sb-val">{filteredTargets.length}</span>
              </div>
              <div className="sb-divider" />
              <div className="sb-item">
                total hosts <span className="sb-val">{summaryTotals.hosts || '—'}</span>
              </div>
              <div className="sb-divider" />
              <div className="sb-item">
                alive <span className="sb-val green">{summaryTotals.alive || '—'}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── New Target Modal ── */}
      {showModal && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) closeModal() }}>
          <div className="modal">
            <div className="modal-title">New Target</div>
            <div className="modal-desc">Creates a new SQLite database for the target scope.</div>
            <div className="modal-label">Domain</div>
            <input
              ref={modalInputRef}
              className="modal-input"
              type="text"
              placeholder="e.g. example.com"
              value={modalDomain}
              onChange={e => setModalDomain(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitNew() }}
            />
            <div className="modal-hint">Subdomains and hosts will be scoped under this root domain.</div>
            {modalError && <div className="modal-error">{modalError}</div>}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
              <button className="btn btn-primary" onClick={submitNew} disabled={modalSubmitting}>
                {modalSubmitting ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className={`toast ${toast.type}`}>
          <span className={`toast-icon ${toast.type}`}>{toast.type === 'success' ? '✓' : '✕'}</span>
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  )
}
