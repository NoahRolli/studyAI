// BacklinksPanel — Zeigt welche Notizen auf die aktuelle Notiz verlinken
// Wird unter dem Editor angezeigt, lädt Backlinks via API
// Klick auf einen Backlink navigiert zur verlinkten Notiz

import { useState, useEffect } from 'react'
import { useLanguage } from '../../hooks/useLanguage'
import { get } from '../../hooks/useAPI'

interface BacklinkItem {
  id: number
  title: string
  updated_at: string
}

interface BacklinksPanelProps {
  noteId: number
  onNavigate: (id: number) => void
}

function BacklinksPanel({ noteId, onNavigate }: BacklinksPanelProps) {
  const { t } = useLanguage()
  const [backlinks, setBacklinks] = useState<BacklinkItem[]>([])
  const [links, setLinks] = useState<BacklinkItem[]>([])

  // Backlinks + ausgehende Links laden wenn sich die Notiz ändert
  useEffect(() => {
    async function load() {
      try {
        const [bl, ln] = await Promise.all([
          get<BacklinkItem[]>(`/api/notes/${noteId}/backlinks`),
          get<BacklinkItem[]>(`/api/notes/${noteId}/links`),
        ])
        setBacklinks(bl)
        setLinks(ln)
      } catch { /* Ignorieren */ }
    }
    load()
  }, [noteId])

  // Nichts anzeigen wenn keine Links vorhanden
  if (backlinks.length === 0 && links.length === 0) return null

  return (
    <div
      className="mt-3 pt-3 border-t text-xs"
      style={{ borderColor: 'var(--color-border)' }}
    >
      {/* Ausgehende Links */}
      {links.length > 0 && (
        <div className="mb-2">
          <span style={{ color: 'var(--color-text-muted)' }}>
            {t.notes.links} ({links.length})
          </span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {links.map((l) => (
              <button
                key={l.id}
                onClick={() => onNavigate(l.id)}
                className="px-2 py-0.5 rounded transition-all duration-200
                  hover:bg-[rgba(0,212,255,0.1)]"
                style={{ color: 'var(--color-primary)' }}
              >
                {l.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Backlinks */}
      {backlinks.length > 0 && (
        <div>
          <span style={{ color: 'var(--color-text-muted)' }}>
            {t.notes.backlinks} ({backlinks.length})
          </span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {backlinks.map((bl) => (
              <button
                key={bl.id}
                onClick={() => onNavigate(bl.id)}
                className="px-2 py-0.5 rounded transition-all duration-200
                  hover:bg-[rgba(0,212,255,0.1)]"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {bl.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default BacklinksPanel
