import { useState, useMemo } from 'react'
import type { Hit } from '../lib/types'

interface Props {
  hits: Hit[]
}

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

const SEV_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }

const sevColor: Record<string, string> = {
  high:   'var(--red)',
  medium: 'var(--orange)',
  low:    'var(--yellow)',
}

const sevBg: Record<string, string> = {
  high:   'var(--red-dim)',
  medium: 'var(--orange-dim)',
  low:    'var(--yellow-dim)',
}

const scColor: Record<string, string> = {
  s200: 'var(--green)', s201: 'var(--green)',
  s301: 'var(--orange)', s302: 'var(--orange)',
  s403: 'var(--red)', s400: 'var(--red)',
}

export default function HitsTab({ hits }: Props) {
  const [filter, setFilter] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  function toggleGroup(g: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      next.has(g) ? next.delete(g) : next.add(g)
      return next
    })
  }

  const filtered = useMemo(() => {
    const q = filter.toLowerCase()
    return q
      ? hits.filter(h => h.url.toLowerCase().includes(q) || h.severity.includes(q) || h.status.includes(q))
      : hits
  }, [hits, filter])

  const grouped = useMemo(() => {
    const map: Record<string, Hit[]> = {}
    for (const h of filtered) {
      const g = statusGroup(h.status)
      ;(map[g] ??= []).push(h)
    }
    for (const g of Object.keys(map)) {
      map[g].sort((a, b) => (SEV_ORDER[a.severity] ?? 99) - (SEV_ORDER[b.severity] ?? 99))
    }
    return GROUP_ORDER.filter(g => map[g]?.length).map(g => ({ key: g, hits: map[g] }))
  }, [filtered])

  const highCount = hits.filter(h => h.severity === 'high').length
  const medCount  = hits.filter(h => h.severity === 'medium').length
  const lowCount  = hits.filter(h => h.severity === 'low').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: '20px 28px' }}>

      {/* Page header */}
      <div className="page-header">
        <div className="ph-left">
          <div className="ph-title">Juicy Hits</div>
          <div className="ph-meta">
            <span style={{ color: 'var(--red)' }}>{highCount} high</span>
            {' · '}
            <span style={{ color: 'var(--orange)' }}>{medCount} medium</span>
            {' · '}
            <span style={{ color: 'var(--yellow)' }}>{lowCount} low</span>
            {' · '}
            <span style={{ color: 'var(--text-dim)' }}>{hits.length} total</span>
          </div>
        </div>
        <div className="ph-right">
          <div className="filter-wrap">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="filter-input"
              placeholder="filter hits..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 0 }}>
        {filtered.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-muted)', fontSize: 13 }}>
            {hits.length === 0 ? 'No juicy hits imported yet.' : 'No results for current filter.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border2)', position: 'sticky', top: 0, zIndex: 1 }}>
                <Th style={{ width: 70 }}>Severity</Th>
                <Th style={{ width: 60 }}>Status</Th>
                <Th style={{ width: 80 }}>Size</Th>
                <Th>URL</Th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(({ key, hits: groupHits }) => (
                <GroupSection
                  key={key}
                  groupKey={key}
                  hits={groupHits}
                  collapsed={collapsedGroups.has(key)}
                  onToggle={() => toggleGroup(key)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function GroupSection({ groupKey, hits, collapsed, onToggle }: {
  groupKey: string
  hits: Hit[]
  collapsed: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        style={{
          cursor: 'pointer',
          background: 'var(--surface)',
          borderTop: '2px solid var(--border2)',
          borderBottom: '1px solid var(--border2)',
          userSelect: 'none',
        }}
      >
        <td colSpan={4} style={{ padding: '7px 14px' }}>
          <span style={{ fontSize: 10, marginRight: 8, color: 'var(--text-dim)', display: 'inline-block', width: 8 }}>
            {collapsed ? '▶' : '▼'}
          </span>
          <span style={{
            fontFamily: "'Fira Code', monospace",
            fontSize: 13,
            fontWeight: 700,
            color: groupColor[groupKey],
            marginRight: 10,
          }}>
            {groupKey}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {hits.length} hit{hits.length !== 1 ? 's' : ''}
          </span>
        </td>
      </tr>
      {!collapsed && hits.map((h, i) => (
        <tr
          key={i}
          style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--bg)' : 'var(--surface)' }}
        >
          <td style={{ padding: '7px 14px' }}>
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              color: sevColor[h.severity] ?? 'var(--text-muted)',
              background: sevBg[h.severity] ?? 'transparent',
              padding: '2px 7px',
              fontFamily: "'Fira Code', monospace",
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              {h.severity}
            </span>
          </td>
          <td style={{ padding: '7px 14px', fontFamily: "'Fira Code', monospace", fontSize: 12, color: scColor[h.sc] ?? 'var(--text-dim)' }}>
            {h.status}
          </td>
          <td style={{ padding: '7px 14px', fontFamily: "'Fira Code', monospace", fontSize: 12, color: 'var(--text-dim)' }}>
            {h.size}
          </td>
          <td style={{ padding: '7px 14px', maxWidth: 0 }}>
            <a
              href={h.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--accent)', fontFamily: "'Fira Code', monospace", fontSize: 12, textDecoration: 'none', wordBreak: 'break-all' }}
            >
              {h.url}
            </a>
          </td>
        </tr>
      ))}
    </>
  )
}

function Th({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <th style={{
      padding: '8px 14px',
      textAlign: 'left',
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      fontFamily: "'Fira Code', monospace",
      whiteSpace: 'nowrap',
      ...style,
    }}>
      {children}
    </th>
  )
}
