// PageProviderBadge — Kompakter Provider-Override pro Seite
// Zeigt aktuellen Provider als Badge, Klick oeffnet Dropdown
// Wenn kein Override: zeigt "Global" mit Option zum Ueberschreiben
// Wenn Override: zeigt Provider mit Option zum Entfernen

import { useState, useRef, useEffect } from 'react'
import { useProvider, PROVIDER_META } from '../hooks/useProvider'
import type { ProviderId } from '../hooks/useProvider'

interface Props {
  page: string
}

const PROVIDERS: ProviderId[] = ['ollama_local', 'ollama_server', 'groq']

export default function PageProviderBadge({ page }: Props) {
  const { settings, setPageOverride } = useProvider()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Klick ausserhalb schliesst Dropdown
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (!settings) return null

  const override = settings.pages[page] as ProviderId | undefined
  const active = override || settings.global
  const meta = PROVIDER_META[active]
  const isOverride = !!override

  return (
    <div ref={ref} className="relative inline-block">
      {/* Badge */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded
          transition-colors hover:opacity-80"
        style={{
          color: meta.color,
          border: `1px solid ${isOverride ? meta.color : 'var(--color-border)'}`,
          background: isOverride ? 'var(--color-hover-bg)' : 'transparent',
        }}
        title={`AI Provider: ${meta.label}${isOverride ? ' (Override)' : ' (Global)'}`}
      >
        <span className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: meta.color }} />
        {meta.short}
        {isOverride && (
          <span style={{ color: 'var(--color-text-muted)', fontSize: '9px' }}>*</span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full right-0 mt-1 z-50 min-w-48
          rounded border shadow-lg"
          style={{
            background: 'var(--color-bg-secondary)',
            borderColor: 'var(--color-border)',
          }}>
          {/* Global (Override entfernen) */}
          {isOverride && (
            <button
              onClick={() => { setPageOverride(page, null); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-xs transition-colors
                hover:bg-[var(--color-hover-bg)] flex items-center gap-2"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: 'var(--color-text-muted)' }} />
              Global ({PROVIDER_META[settings.global].short})
            </button>
          )}
          {/* Provider-Optionen */}
          {PROVIDERS.map(pid => {
            const pm = PROVIDER_META[pid]
            const isActive = pid === active
            const isAvailable = settings.status[pid]
            return (
              <button
                key={pid}
                onClick={() => {
                  if (!isActive && isAvailable) {
                    setPageOverride(page, pid)
                    setOpen(false)
                  }
                }}
                disabled={!isAvailable}
                className="w-full text-left px-3 py-2 text-xs transition-colors
                  hover:bg-[var(--color-hover-bg)] flex items-center gap-2"
                style={{
                  color: isActive ? pm.color : isAvailable
                    ? 'var(--color-text-secondary)' : 'var(--color-text-muted)',
                  opacity: isAvailable ? 1 : 0.4,
                }}
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{ background: isAvailable ? pm.color : 'var(--color-text-muted)' }} />
                {pm.label}
                {isActive && ' *'}
                {!isAvailable && ' (offline)'}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
