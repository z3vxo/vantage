import { useState, useEffect } from 'react'
import { fetchApi } from '../lib/types'

interface CountEntry {
  name: string
  count: number
}

interface AsnResult {
  asn: string
  holder: string
  prefixes: string[]
}

interface SummaryData {
  total_hosts: number
  unique_ips: number
  triage_reviewed: number
  juicy_hits: number
  status_codes: CountEntry[]
  tech_stack: CountEntry[]
  top_cnames: CountEntry[]
  top_ips: CountEntry[]
  badges: CountEntry[]
}

function statusCodeColor(code: string): string {
  if (code.startsWith('2')) return 'var(--green)'
  if (code.startsWith('3')) return 'var(--orange)'
  if (code.startsWith('4')) return 'var(--red)'
  if (code.startsWith('5')) return 'var(--yellow)'
  return 'var(--text-dim)'
}

const badgeColor: Record<string, string> = {
  api:        'var(--accent)',
  auth:       'var(--orange)',
  admin:      'var(--red)',
  cms:        'var(--yellow)',
  monitoring: 'var(--green)',
  dev:        'var(--orange)',
  cicd:       'var(--yellow)',
  storage:    'var(--accent)',
  collab:     'var(--text-dim)',
  docs:       'var(--text-dim)',
  default:    'var(--text-muted)',
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div style={{ flex: 1, height: 4, background: 'var(--border2)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
    </div>
  )
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '18px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      ...style,
    }}>
      {children}
    </div>
  )
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11,
      fontWeight: 700,
      color: 'var(--text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      fontFamily: "'Fira Code', monospace",
      paddingBottom: 10,
      borderBottom: '1px solid var(--border)',
    }}>
      {children}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '16px 20px',
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: "'Fira Code', monospace" }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color ?? 'var(--text)', lineHeight: 1 }}>
        {value}
      </div>
    </div>
  )
}

function BarList({ items, color, colorFn }: {
  items: CountEntry[]
  color?: string
  colorFn?: (name: string) => string
}) {
  const max = items[0]?.count ?? 1
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {items.map(({ name, count }) => (
        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 110, fontSize: 12,
            fontFamily: "'Fira Code', monospace",
            color: colorFn ? colorFn(name) : (color ?? 'var(--text)'),
            flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {name}
          </div>
          <Bar value={count} max={max} color={colorFn ? colorFn(name) : (color ?? 'var(--accent)')} />
          <div style={{ width: 28, fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', fontFamily: "'Fira Code', monospace", flexShrink: 0 }}>
            {count}
          </div>
        </div>
      ))}
      {items.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No data yet — run an import.</div>
      )}
    </div>
  )
}

export default function SummaryTab({ domain }: { domain: string }) {
  const [data, setData] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [asnInput, setAsnInput] = useState('')
  const [asnData, setAsnData] = useState<AsnResult | null>(null)
  const [asnLoading, setAsnLoading] = useState(false)
  const [asnError, setAsnError] = useState<string | null>(null)

  function lookupAsn() {
    const asn = asnInput.trim().replace(/^AS/i, '')
    if (!asn) return
    setAsnLoading(true)
    setAsnError(null)
    setAsnData(null)
    fetchApi(`/api/${encodeURIComponent(domain)}/asn/AS${asn}`)
      .then(r => r.json())
      .then(d => { setAsnData(d); setAsnLoading(false) })
      .catch(e => { setAsnError(e.message); setAsnLoading(false) })
  }

  useEffect(() => {
    setLoading(true)
    fetchApi(`/api/${encodeURIComponent(domain)}/summary`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [domain])

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        Loading summary...
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--red)', fontSize: 13 }}>
        {error ?? 'Failed to load summary'}
      </div>
    )
  }

  const triagePct = data.total_hosts > 0 ? Math.round((data.triage_reviewed / data.total_hosts) * 100) : 0

  // group status codes into 2xx/3xx/4xx/5xx for stat cards
  const scGroups: Record<string, number> = {}
  for (const { name, count } of data.status_codes) {
    const grp = name[0] + 'xx'
    scGroups[grp] = (scGroups[grp] ?? 0) + count
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Title */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Target Summary</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: "'Fira Code', monospace" }}>{domain}</div>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 12 }}>
        <StatCard label="Total Hosts"  value={data.total_hosts} />
        <StatCard label="Unique IPs"   value={data.unique_ips} />
        <StatCard label="Juicy Hits"   value={data.juicy_hits}  color="var(--orange)" />
        {['2xx','3xx','4xx','5xx'].filter(g => scGroups[g]).map(g => (
          <StatCard key={g} label={g} value={scGroups[g]} color={statusCodeColor(g[0])} />
        ))}
      </div>

      {/* Row 2: tech + status codes + badges/triage */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>

        <Card>
          <CardTitle>Tech Stack</CardTitle>
          <BarList items={data.tech_stack} color="var(--accent)" />
        </Card>

        <Card>
          <CardTitle>Status Codes</CardTitle>
          <BarList items={data.status_codes} colorFn={statusCodeColor} />
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card style={{ flex: 1 }}>
            <CardTitle>Badges</CardTitle>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {data.badges.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No data yet.</div>
              )}
              {data.badges.map(({ name, count }) => (
                <div key={name} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'var(--surface2)', border: '1px solid var(--border2)',
                  borderRadius: 6, padding: '5px 10px',
                }}>
                  <span style={{ fontSize: 11, color: badgeColor[name] ?? 'var(--text-dim)', fontWeight: 600 }}>{name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: "'Fira Code', monospace" }}>{count}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardTitle>Triage Progress</CardTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: "'Fira Code', monospace" }}>{data.triage_reviewed}</span>
                  {' / '}{data.total_hosts} reviewed
                </span>
                <span style={{ fontSize: 12, color: 'var(--accent)', fontFamily: "'Fira Code', monospace", fontWeight: 700 }}>{triagePct}%</span>
              </div>
              <div style={{ height: 6, background: 'var(--border2)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${triagePct}%`, height: '100%', background: 'var(--accent)', borderRadius: 3 }} />
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Row 3: CNAMEs + IPs + ASN placeholder */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>

        <Card>
          <CardTitle>Top CNAMEs</CardTitle>
          <BarList items={data.top_cnames} color="var(--orange)" />
        </Card>

        <Card>
          <CardTitle>Top IPs</CardTitle>
          <BarList items={data.top_ips} color="var(--yellow)" />
        </Card>

        <Card>
          <CardTitle>ASN Intelligence</CardTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                placeholder="e.g. 13335 or AS13335"
                value={asnInput}
                onChange={e => setAsnInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && lookupAsn()}
                style={{
                  flex: 1,
                  background: 'var(--surface2)',
                  border: '1px solid var(--border2)',
                  color: 'var(--text)',
                  padding: '6px 10px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontFamily: "'Fira Code', monospace",
                }}
              />
              <button
                onClick={lookupAsn}
                disabled={asnLoading}
                style={{
                  background: 'var(--accent)',
                  border: 'none',
                  color: 'var(--bg)',
                  padding: '6px 14px',
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: asnLoading ? 'not-allowed' : 'pointer',
                  opacity: asnLoading ? 0.6 : 1,
                  fontWeight: 600,
                }}>
                {asnLoading ? '...' : 'Lookup'}
              </button>
            </div>
            {asnError && (
              <div style={{ fontSize: 11, color: 'var(--red)' }}>{asnError}</div>
            )}
            {asnData && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>{asnData.holder}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: "'Fira Code', monospace" }}>
                  {asnData.prefixes.length} announced prefix{asnData.prefixes.length !== 1 ? 'es' : ''}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 140, overflowY: 'auto' }}>
                  {asnData.prefixes.map(p => (
                    <div key={p} style={{ fontSize: 11, fontFamily: "'Fira Code', monospace", color: 'var(--text-dim)' }}>{p}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

      </div>
    </div>
  )
}
