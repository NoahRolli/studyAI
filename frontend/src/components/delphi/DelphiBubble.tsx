// DelphiBubble — Floating Quick-Access fuer Delphi
// Mini-Toggle unten rechts, klickbar -> Chat-Fenster slidet auf
// Frage tippen + Enter -> navigiert zu /delphi mit autoSend
//
// Wird in Layout.tsx eingehaengt, conditional: nicht auf /delphi selbst
// Persistenz: localStorage merkt sich open/closed-State

import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useLanguage } from '../../hooks/useLanguage'

const STORAGE_KEY = 'pallas-delphi-bubble-open'

function DelphiBubble() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()

  // mounted-State: bei jedem Route-Wechsel false -> nach 800ms true
  // -> Bubble fadet erst NACH der Page-Animation ein
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(false)
    const timer = setTimeout(() => setMounted(true), 800)
    return () => clearTimeout(timer)
  }, [location.pathname])

  // Open-State aus localStorage (Default closed)
  const [open, setOpen] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  })
  const [draft, setDraft] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Persistenz: jeder open-Wechsel wird gespeichert
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(open))
  }, [open])

  // Auto-Fokus auf Textarea wenn Bubble geoeffnet wird
  useEffect(() => {
    if (open) {
      // setTimeout damit Slide-Animation laeuft bevor Fokus gesetzt wird
      const t = setTimeout(() => textareaRef.current?.focus(), 200)
      return () => clearTimeout(t)
    }
  }, [open])

  function handleToggle() {
    setOpen(o => !o)
  }

  function handleClose() {
    setOpen(false)
  }

  function handleSubmit() {
    const content = draft.trim()
    if (!content) return
    // Navigation zu /delphi mit autoSend-Flag
    // DelphiPage liest location.state.initialDraft + autoSend
    navigate('/delphi', { state: { initialDraft: content, autoSend: true } })
    setDraft('')
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sendet, Shift+Enter macht Newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
    // Escape schliesst Bubble
    if (e.key === 'Escape') {
      e.preventDefault()
      handleClose()
    }
  }

  // === Toggle-State (closed) ===
  if (!open) {
    return (
      <button
        onClick={handleToggle}
        aria-label={t.delphiBubble.toggleAriaLabel}
        className="fixed bottom-6 right-6 z-40 group"
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          backgroundColor: 'var(--color-bg-card)',
          border: '2px solid var(--color-primary)',
          boxShadow: '0 0 12px rgba(0, 212, 255, 0.3), inset 0 0 8px rgba(0, 212, 255, 0.1)',
          cursor: 'pointer',
          display: 'flex',
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'scale(1)' : 'scale(0.85)',
          pointerEvents: mounted ? 'auto' : 'none',
          transition: 'opacity 0.5s ease, transform 0.5s ease, box-shadow 0.3s ease',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow =
            '0 0 18px rgba(0, 212, 255, 0.6), inset 0 0 10px rgba(0, 212, 255, 0.2)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow =
            '0 0 12px rgba(0, 212, 255, 0.3), inset 0 0 8px rgba(0, 212, 255, 0.1)'
        }}
      >
        {/* Pulsierender Cyan-Punkt im Hintergrund */}
        <div
          className="absolute animate-glow-pulse"
          style={{
            width: '34px',
            height: '34px',
            borderRadius: '50%',
            backgroundColor: 'var(--color-primary)',
            opacity: 0.25,
          }}
        />
        {/* Delta-Symbol vorne (SVG, hohl, bis zum äußeren Ring) */}
        <svg
          viewBox="-12 -12 24 24"
          width="38"
          height="38"
          className="relative"
          style={{
            filter: 'drop-shadow(0 0 6px rgba(0, 212, 255, 0.8))',
            overflow: 'visible',
          }}
          aria-hidden="true"
        >
          <polygon
            points="0,-10 -8.66,5 8.66,5"
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    )
  }

  // === Open-State (Chat-Fenster) ===
  return (
    <div
      className="fixed bottom-6 right-6 z-40 hud-card animate-fade-in"
      style={{
        width: '380px',
        height: '480px',
        backgroundColor: 'var(--color-bg-card)',
        border: '1px solid var(--color-primary)',
        borderRadius: '12px',
        boxShadow: '0 0 24px rgba(0, 212, 255, 0.2), 0 8px 32px rgba(0, 0, 0, 0.4)',
        display: 'flex',
        flexDirection: 'column',
        transformOrigin: 'bottom right',
      }}
    >
      {/* Header: Title + Close */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <h3
          className="hud-title text-sm tracking-wider"
          style={{ color: 'var(--color-primary)' }}
        >
          Δ {t.delphiBubble.title}
        </h3>
        <button
          onClick={handleClose}
          aria-label={t.delphiBubble.closeAriaLabel}
          className="p-1 rounded hover:bg-[var(--color-hover-bg)] transition-colors"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Body: Hint */}
      <div className="flex-1 px-4 py-6 flex items-center justify-center">
        <p
          className="text-xs text-center leading-relaxed max-w-xs"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {t.delphiBubble.hint}
        </p>
      </div>

      {/* Footer: Input + Send */}
      <div
        className="px-3 py-3 border-t flex gap-2 items-end"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t.delphiBubble.placeholder}
          rows={2}
          className="flex-1 hud-input text-xs resize-none"
          style={{
            backgroundColor: 'var(--color-bg-base)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
            padding: '8px 10px',
            outline: 'none',
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={!draft.trim()}
          aria-label={t.delphiBubble.sendAriaLabel}
          className="hud-btn flex items-center justify-center"
          style={{
            width: '36px',
            height: '36px',
            opacity: draft.trim() ? 1 : 0.4,
            cursor: draft.trim() ? 'pointer' : 'not-allowed',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path
              d="M2 8h12M9 3l5 5-5 5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default DelphiBubble
