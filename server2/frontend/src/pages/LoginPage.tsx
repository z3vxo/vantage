import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        redirect: 'manual',
      })

      if (res.type === 'opaqueredirect' || res.status === 303) {
        window.location.href = '/goaway'
        return
      }

      if (res.ok) {
        navigate('/')
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'invalid credentials')
      }
    } catch {
      setError('connection error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {/* brand */}
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', letterSpacing: '0.05em' }}>
          VANTAGE
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: "'Fira Code', monospace", marginTop: 4 }}>
          operator access only
        </div>
      </div>

      {/* card */}
      <form
        onSubmit={handleSubmit}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderTop: '2px solid var(--accent)',
          borderRadius: 4,
          padding: '28px 32px',
          width: 320,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: "'Fira Code', monospace" }}>
            username
          </label>
          <input
            type="text"
            autoFocus
            autoComplete="username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            style={{
              background: 'var(--surface2)',
              border: '1px solid var(--border2)',
              borderRadius: 3,
              padding: '8px 10px',
              color: 'var(--text)',
              fontSize: 13,
              outline: 'none',
              fontFamily: 'inherit',
            }}
            onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border2)')}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: "'Fira Code', monospace" }}>
            password
          </label>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={{
              background: 'var(--surface2)',
              border: '1px solid var(--border2)',
              borderRadius: 3,
              padding: '8px 10px',
              color: 'var(--text)',
              fontSize: 13,
              outline: 'none',
              fontFamily: 'inherit',
            }}
            onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border2)')}
          />
        </div>

        {error && (
          <div style={{
            fontSize: 11,
            color: 'var(--red)',
            fontFamily: "'Fira Code', monospace",
            background: 'var(--red-dim)',
            border: '1px solid var(--red)',
            borderRadius: 3,
            padding: '6px 10px',
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !username || !password}
          style={{
            marginTop: 4,
            background: loading ? 'var(--accent-dim)' : 'var(--accent)',
            color: loading ? 'var(--text-muted)' : '#000',
            border: 'none',
            borderRadius: 3,
            padding: '9px 0',
            fontSize: 12,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: loading || !username || !password ? 'not-allowed' : 'pointer',
            opacity: !username || !password ? 0.5 : 1,
            letterSpacing: '0.04em',
          }}
        >
          {loading ? 'authenticating...' : 'sign in'}
        </button>
      </form>
    </div>
  )
}
