import { useState, useEffect, useCallback } from 'react'
import type { Host, Hit, HostStats } from '../lib/types'
import { fetchApi } from '../lib/types'
import HostsTab from './HostsTab'
import HitsTab from './HitsTab'
import OverviewTab from './OverviewTab'

type Tab = 'hosts' | 'hits' | 'js' | 'overview'

export default function DashboardPage() {
  const [tab,            setTab]            = useState<Tab>('hosts')
  const [hosts,          setHosts]          = useState<Host[]>([])
  const [hits,           setHits]           = useState<Hit[]>([])
  const [stats,          setStats]          = useState<HostStats | null>(null)
  const [overviewHostId, setOverviewHostId] = useState<number | null>(null)

  const domain = localStorage.getItem('recon_target') ?? ''

  const fetchHosts = useCallback(() => {
    if (!domain) return
    fetchApi(`/api/${encodeURIComponent(domain)}/hosts`)
      .then(r => r.json())
      .then(data => { setHosts(data.hosts ?? []); setStats(data.stats ?? null) })
      .catch(() => {})
  }, [domain])

  const fetchHits = useCallback(() => {
    if (!domain) return
    fetchApi(`/api/${encodeURIComponent(domain)}/hits`)
      .then(r => r.json())
      .then(data => setHits(data.hits ?? []))
      .catch(() => {})
  }, [domain])

  useEffect(() => { fetchHosts(); fetchHits() }, [fetchHosts, fetchHits])

  function reload() { fetchHosts(); fetchHits() }

  function updateHostTriage(id: number, status: string) {
    setHosts(prev => prev.map(h => h.id === id ? { ...h, triage_status: status } : h))
  }

  function updateHostNotes(id: number, notes: string) {
    setHosts(prev => prev.map(h => h.id === id ? { ...h, notes } : h))
  }

  function openInOverview(id: number) {
    setOverviewHostId(id)
    setTab('overview')
  }

  if (!domain) {
    return (
      <div className="app-shell">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 16 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No target selected.</div>
          <a href="/" className="btn btn-primary" style={{ textDecoration: 'none', padding: '6px 18px', fontSize: 13 }}>← Select Target</a>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      {/* Header */}
      <header className="header">
        <div className="header-brand">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3ecf8e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <div className="brand-name">Vantage</div>
        </div>
        <div className="header-divider" />
        <div className="header-date">{new Date().toLocaleString()}</div>

        <div className="dash-tabs">
          {(['hosts', 'hits', 'js', 'overview'] as Tab[]).map(t => (
            <button
              key={t}
              className={`tab-btn tab-${t}${tab === t ? ' active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'hosts'    && <>Host Enumeration <span className="tab-count">{stats?.total ?? '—'}</span></>}
              {t === 'hits'     && <>Juicy Hits <span className="tab-count">{hits.length || '—'}</span></>}
              {t === 'js'       && <>JS Analysis <span className="tab-count">—</span></>}
              {t === 'overview' && <>Overview <span className="tab-count">{hosts.length || '—'}</span></>}
            </button>
          ))}
        </div>

        <div className="header-divider" />
        <a href="/" style={{ textDecoration: 'none', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>←</span>
          <span style={{
            color: 'var(--accent)',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "'Fira Code', monospace",
            background: 'var(--accent-dim)',
            border: '1px solid var(--accent)',
            borderRadius: 4,
            padding: '2px 8px',
          }}>{domain}</span>
        </a>
      </header>

      {/* Tab content */}
      <div style={{ flex: 1, display: tab === 'hosts' ? 'flex' : 'none', flexDirection: 'column', minHeight: 0 }}>
        <HostsTab
          domain={domain}
          hosts={hosts}
          stats={stats}
          onImport={reload}
          onOpenInOverview={openInOverview}
          onTriageChange={updateHostTriage}
          onNotesChange={updateHostNotes}
        />
      </div>

      {tab === 'overview' && (
        <OverviewTab
          domain={domain}
          hosts={hosts}
          hits={hits}
          initialHostId={overviewHostId}
          onTriageChange={updateHostTriage}
          onNotesChange={updateHostNotes}
        />
      )}

      {tab === 'hits' && <HitsTab hits={hits} />}
      {tab === 'js'   && <StubTab label="JS Analysis" color="var(--yellow)" />}
    </div>
  )
}

function StubTab({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, flexDirection: 'column', gap: 10 }}>
      <div style={{ color, fontSize: 14, fontWeight: 600 }}>{label}</div>
      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Migration in progress...</div>
    </div>
  )
}
