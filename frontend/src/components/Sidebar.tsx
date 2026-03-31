// Sidebar — Hauptnavigation der Pallas App
// Einklappbar (Toggle), resizable (Drag am rechten Rand)
// Collapsed-State wird in localStorage gespeichert
// Pallas-Logo klickbar → Begrüssungsseite (/)
// Nav-Links: Dashboard, Journal, Kalender
// Language-Toggle und Theme-Selector unten (nur wenn ausgeklappt)

import { useState, useCallback, useEffect, useRef } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { useLanguage } from '../hooks/useLanguage'
import LanguageToggle from './LanguageToggle'
import ThemeSelector from './ThemeSelector'

// Breiten-Limits für Resize (in px)
const MIN_WIDTH = 180
const MAX_WIDTH = 400
const DEFAULT_WIDTH = 256
const COLLAPSED_WIDTH = 56
const STORAGE_KEY = 'pallas-sidebar-collapsed'

function Sidebar() {
  const { t } = useLanguage()

  // Sidebar ein-/ausgeklappt (aus localStorage lesen)
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  })

  // Aktuelle Breite (nur relevant wenn ausgeklappt)
  const [width, setWidth] = useState(DEFAULT_WIDTH)

  // Drag-State für Resize
  const [isDragging, setIsDragging] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)

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
        ? 'text-[var(--color-primary)] bg-[rgba(0,212,255,0.1)] border border-[var(--color-border-glow)]'
        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[rgba(0,212,255,0.05)] border border-transparent'
    }`

  // Aktuelle Breite: collapsed oder frei einstellbar
  const currentWidth = collapsed ? COLLAPSED_WIDTH : width

  return (
    <aside
      ref={sidebarRef}
      className="relative flex flex-col border-r flex-shrink-0 transition-[width] duration-200"
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

          {/* Toggle-Button: Ein-/Ausklappen */}
          <button
            onClick={toggleCollapsed}
            className="p-1.5 rounded-md transition-all duration-300
              hover:bg-[rgba(0,212,255,0.1)]"
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

        {/* Navigation — Dashboard, Journal, Kalender */}
        <nav className="flex flex-col gap-2">
          <NavLink to="/dashboard" className={linkStyle} title={t.sidebar.dashboard}>
            {collapsed ? 'D' : t.sidebar.dashboard}
          </NavLink>
          <NavLink to="/journal" className={linkStyle} title={t.sidebar.journal}>
            {collapsed ? 'J' : t.sidebar.journal}
          </NavLink>
          <NavLink to="/calendar" className={linkStyle} title={t.sidebar.calendar}>
            {collapsed ? 'C' : t.sidebar.calendar}
          </NavLink>
        </nav>

        {/* Spacer — drückt alles Folgende nach unten */}
        <div className="mt-auto" />

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

        {/* Footer: Versionsnummer + Status */}
        <div className={`flex items-center gap-2 ${collapsed ? 'justify-center' : ''}`}>
          <div
            className="w-2 h-2 rounded-full animate-glow-pulse flex-shrink-0"
            style={{ backgroundColor: 'var(--color-success)' }}
          />
          {!collapsed && (
            <span style={{ color: 'var(--color-text-muted)', fontSize: '0.7rem' }}>
              {t.sidebar.version}
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