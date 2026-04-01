// LoginPage — Authentifizierung für den Olymp-Server
// Wird nur in Production benötigt (wenn Auth-Middleware aktiv)
// Prüft beim Laden ob bereits eingeloggt, sonst Passwort-Eingabe
// Nach erfolgreichem Login → Weiterleitung auf "/"

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../hooks/useLanguage'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const { t } = useLanguage()

  // Beim Laden prüfen ob bereits eingeloggt
  useEffect(() => {
    fetch('/api/auth/check', { credentials: 'include' })
      .then(res => {
        if (res.ok) navigate('/', { replace: true })
        else setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [navigate])

  // Login absenden
  const handleLogin = async () => {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        navigate('/', { replace: true })
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.detail || t.login.error)
        setLoading(false)
      }
    } catch {
      setError(t.login.error)
      setLoading(false)
    }
  }

  // Enter-Taste zum Absenden
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLogin()
  }

  // Ladescreen während Auth-Check
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--color-bg-deep)' }}>
        <div className="text-glow" style={{ color: 'var(--color-primary)' }}>
          ...
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center hud-grid-bg"
      style={{ background: 'var(--color-bg-deep)' }}>
      <div className="hud-card p-8 w-full max-w-sm animate-fade-in">
        {/* Logo / Titel */}
        <h1 className="hud-title text-2xl text-center mb-6"
          style={{ color: 'var(--color-primary)' }}>
          PALLAS
        </h1>

        {/* Passwort-Feld */}
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t.login.placeholder}
          autoFocus
          className="hud-input w-full mb-4"
        />

        {/* Fehlermeldung */}
        {error && (
          <p className="text-sm mb-4" style={{ color: 'var(--color-danger)' }}>
            {error}
          </p>
        )}

        {/* Login-Button */}
        <button
          onClick={handleLogin}
          disabled={!password}
          className="hud-btn hud-btn-primary w-full"
        >
          {t.login.button}
        </button>
      </div>
    </div>
  )
}
