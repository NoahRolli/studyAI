// Sidebar — Hauptnavigation der Pallas App
// Einklappbar (Toggle), resizable (Drag am rechten Rand)
// Collapsed-State wird in localStorage gespeichert
// Pallas-Logo klickbar → Begrüssungsseite (/)
// Nav-Links: Archiv, Journal, Kalender, Notes, Metis
// Logout-Button (nur wenn Auth aktiv auf Olymp-Server)
// Language-Toggle und Theme-Selector unten (nur wenn ausgeklappt)
// Ollama-Status-Indikator im Footer (MacBook/Server/Offline)

import { useState, useCallback, useEffect, useRef } from 'react'
import { NavLink, Link, useNavigate } from 'react-router-dom'
import { useLanguage } from '../hooks/useLanguage'
import { post } from '../hooks/useAPI'
import LanguageToggle from './LanguageToggle'
import ThemeSelector from './ThemeSelector'
import ProviderSwitch from './ProviderSwitch'

// Breiten-Limits für Resize (in px)
const MIN_WIDTH = 180
const MAX_WIDTH = 400
const DEFAULT_WIDTH = 256
const COLLAPSED_WIDTH = 56
const STORAGE_KEY = 'pallas-sidebar-collapsed'

// API-URL für Auth-Check und Ollama-Status (direkter fetch, kein useAPI wegen 401-Redirect)
const API_BASE = import.meta.env.DEV ? 'http://localhost:8000' : ''

// Ollama-Status Polling-Intervall (Sekunden)
const OLLAMA_POLL_INTERVAL = 60_000

function Sidebar() {
  const { t } = useLanguage()
  const navigate = useNavigate()

  // Sidebar ein-/ausgeklappt (aus localStorage lesen)
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  })

  // Aktuelle Breite (nur relevant wenn ausgeklappt)
  const [width, setWidth] = useState(DEFAULT_WIDTH)

  // Drag-State für Resize
  const [isDragging, setIsDragging] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)

  // Auth aktiv? (nur auf Olymp-Server mit /etc/olymp/auth.json)
  const [authActive, setAuthActive] = useState(false)

  // Ollama-Status: macbook | server | offline
  const [ollamaInstance, setOllamaInstance] = useState<'macbook' | 'server' | 'offline'>('offline')

  // Beim Mount prüfen ob Auth aktiv ist
  // Direkter fetch statt useAPI — useAPI redirectet bei 401 auf /login
  useEffect(() => {
    fetch(API_BASE + '/api/auth/check', { credentials: 'include' })
      .then((r) => setAuthActive(r.ok))
      .catch(() => setAuthActive(false))
  }, [])

  // Ollama-Status pollen (beim Mount + alle 60s)
  useEffect(() => {
    const fetchStatus = () => {
      fetch(API_BASE + '/api/ollama/status', { credentials: 'include' })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data?.instance) setOllamaInstance(data.instance)
          else setOllamaInstance('offline')
        })
        .catch(() => setOllamaInstance('offline'))
    }
    fetchStatus()
    const interval = setInterval(fetchStatus, OLLAMA_POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [])

  // Pallas Logout — Cookie löschen, zur Login-Seite
  async function handleLogout() {
    try {
      await post('/api/auth/logout')
    } catch { /* Ignorieren */ }
    navigate('/login')
  }

  // Toggle mit localStorage-Persistenz
  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(STORAGE_KEY, String(next))
  }

  // Resize-Handler: Mausbewegung setzt neue Breite
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX))
      setWidth(newWidth)
    },
    [isDragging]
  )

  // Resize beenden bei Maus-Loslassen
  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])

  // Event-Listener für Drag registrieren/entfernen
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  // NavLink-Styling: Aktiver Link bekommt Akzent-Glow
  const linkStyle = ({ isActive }: { isActive: boolean }) =>
    `block px-3 py-2.5 rounded-md transition-all duration-300 text-sm tracking-wide whitespace-nowrap overflow-hidden ${
      isActive
        ? 'text-[var(--color-primary)] bg-[var(--color-active-bg)] border border-[var(--color-border-glow)]'
        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-hover-bg)] border border-transparent'
    }`

  // Ollama-Status Farbe: Grün = MacBook, Orange = Server, Rot = Offline
  const ollamaColor =
    ollamaInstance === 'macbook' ? 'var(--color-success)'
    : ollamaInstance === 'server' ? 'var(--color-warning)'
    : 'var(--color-danger)'

  // Ollama-Status Label
  const ollamaLabel =
    ollamaInstance === 'macbook' ? t.sidebar.ollamaMacbook
    : ollamaInstance === 'server' ? t.sidebar.ollamaServer
    : t.sidebar.ollamaOffline

  // Aktuelle Breite: collapsed oder frei einstellbar
  const currentWidth = collapsed ? COLLAPSED_WIDTH : width

  return (
    <aside
      ref={sidebarRef}
      className="relative flex flex-col border-r flex-shrink-0 transition-[width] duration-200 h-screen sticky top-0 overflow-y-auto"
      style={{
        width: currentWidth,
        backgroundColor: 'var(--color-bg-base)',
        borderColor: 'var(--color-border)',
      }}
    >
      {/* Innerer Container mit Padding */}
      <div className={`flex flex-col h-full ${collapsed ? 'px-2 py-4' : 'p-6'}`}>

        {/* Header: Logo + Collapse-Toggle */}
        <div className={`flex items-center mb-6 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {!collapsed && (
            <Link to="/" className="block group">
              <h1
                className="hud-title text-glow text-2xl font-bold tracking-widest
                  transition-all duration-300 group-hover:opacity-80"
              >
                Pallas
              </h1>
            </Link>
          )}
          <button
            onClick={toggleCollapsed}
            className="p-1.5 rounded-md transition-all duration-300
              hover:bg-[var(--color-active-bg)]"
            style={{ color: 'var(--color-text-muted)' }}
            title={collapsed ? t.sidebar.expand : t.sidebar.collapse}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              {collapsed ? (
                <path d="M7 4l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d="M11 4l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-2">
          <NavLink to="/archiv" className={linkStyle} title={t.sidebar.archiv}>
            {collapsed ? 'A' : t.sidebar.archiv}
          </NavLink>
          <NavLink to="/journal" className={linkStyle} title={t.sidebar.journal}>
            {collapsed ? 'J' : t.sidebar.journal}
          </NavLink>
          <NavLink to="/calendar" className={linkStyle} title={t.sidebar.calendar}>
            {collapsed ? 'C' : t.sidebar.calendar}
          </NavLink>
          <NavLink to="/notes" className={linkStyle} title={t.sidebar.notes}>
            {collapsed ? 'N' : t.sidebar.notes}
          </NavLink>
          <NavLink to="/metis" className={linkStyle} title={t.sidebar.metis}>
            {collapsed ? 'M' : t.sidebar.metis}
          </NavLink>
          <NavLink to="/ontology" className={linkStyle} title="Ontology">
            {collapsed ? 'O' : 'Ontology'}
          </NavLink>
        </nav>

        {/* Spacer */}
        <div className="mt-auto" />

        {/* Provider Switch */}
        <ProviderSwitch collapsed={collapsed} />

        {/* Theme + Language nur wenn ausgeklappt */}
        {!collapsed && (
          <>
            <div className="flex flex-col gap-3 mb-4">
              <ThemeSelector />
              <LanguageToggle />
            </div>
            <div
              className="mb-4 h-px"
              style={{ backgroundColor: 'var(--color-border)' }}
            />
          </>
        )}

        {/* Logout-Button (nur wenn Auth aktiv) */}
        {authActive && (
          <button
            onClick={handleLogout}
            className={`flex items-center gap-2 rounded-md transition-all duration-300
              text-[var(--color-text-muted)] hover:text-[var(--color-danger)]
              hover:bg-[rgba(255,59,92,0.1)] mb-3
              ${collapsed ? 'justify-center p-2' : 'px-3 py-2 text-sm'}`}
            title={t.sidebar.logout}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
              <path d="M8 1v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M4.5 3.5a6 6 0 1 0 7 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {!collapsed && <span>{t.sidebar.logout}</span>}
          </button>
        )}

        {/* Footer: Ollama-Status + Version */}
        <div className={`flex items-center gap-2 ${collapsed ? 'justify-center' : ''}`}>
          <div
            className="w-2 h-2 rounded-full animate-glow-pulse flex-shrink-0"
            style={{ backgroundColor: ollamaColor }}
            title={ollamaLabel}
          />
          {!collapsed && (
            <span style={{ color: 'var(--color-text-muted)', fontSize: '0.7rem' }}>
              {t.sidebar.version} — {ollamaLabel}
            </span>
          )}
        </div>
      </div>

      {/* Resize-Handle am rechten Rand (nur wenn ausgeklappt) */}
      {!collapsed && (
        <div
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize
            hover:bg-[var(--color-primary)] transition-colors duration-200 opacity-0 hover:opacity-40"
          onMouseDown={() => setIsDragging(true)}
        />
      )}
    </aside>
  )
}

export default Sidebar
