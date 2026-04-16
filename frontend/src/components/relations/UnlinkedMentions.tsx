// UnlinkedMentions — Konzeptnamen in Notes/Summaries ohne WikiLink
// Zeigt Vorschlaege an, User kann verknuepfen oder ignorieren
// Dismissed-State wird in localStorage gespeichert

import { useState, useEffect, useCallback } from 'react'
import { get, post } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'

const DISMISSED_KEY = 'pallas-unlinked-dismissed'

interface Mention {
  concept_id: number
  concept_name: string
  source_type: string
  source_id: number
  source_title: string
  snippets: string[]
  count: number
}

function getDismissed(): Set<string> {
  try {
    const data = localStorage.getItem(DISMISSED_KEY)
    return data ? new Set(JSON.parse(data)) : new Set()
  } catch { return new Set() }
}

function dismissKey(m: Mention): string {
  return `${m.concept_id}:${m.source_type}:${m.source_id}`
}

export default function UnlinkedMentions() {
  const { language } = useLanguage()
  const [mentions, setMentions] = useState<Mention[]>([])
  const [loading, setLoading] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(getDismissed)
  const [linking, setLinking] = useState<string | null>(null)

  const scan = useCallback(async () => {
    setLoading(true)
    try {
      const data = await get<{ mentions: Mention[]; total: number }>(
        '/api/concepts/unlinked-mentions?limit=200'
      )
      setMentions(data.mentions)
    } catch (err) {
      console.error('Scan fehlgeschlagen:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { scan() }, [scan])

  const handleLink = async (m: Mention) => {
    const key = dismissKey(m)
    setLinking(key)
    try {
      await post(
        `/api/concepts/unlinked-mentions/${m.concept_id}/link?source_type=${m.source_type}&source_id=${m.source_id}`,
        {}
      )
      // Aus Liste entfernen
      setMentions(prev => prev.filter(x => dismissKey(x) !== key))
    } catch (err) {
      console.error('Link fehlgeschlagen:', err)
    } finally {
      setLinking(null)
    }
  }

  const handleDismiss = (m: Mention) => {
    const key = dismissKey(m)
    const next = new Set(dismissed)
    next.add(key)
    setDismissed(next)
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]))
    } catch { /* localStorage voll — ignorieren */ }
  }

  const handleClearDismissed = () => {
    setDismissed(new Set())
    localStorage.removeItem(DISMISSED_KEY)
  }

  // Sichtbare Mentions (ohne dismissed)
  const visible = mentions.filter(m => !dismissed.has(dismissKey(m)))

  return (
    <div>
      {/* Header mit Scan-Button */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {loading
            ? (language === 'de' ? 'Scanne...' : 'Scanning...')
            : `${visible.length} ${language === 'de' ? 'Erwähnungen gefunden' : 'mentions found'}`}
        </p>
        <div className="flex gap-2">
          {dismissed.size > 0 && (
            <button onClick={handleClearDismissed} className="hud-btn-sm"
              style={{ color: 'var(--color-text-muted)' }}>
              {language === 'de'
                ? `${dismissed.size} Ignorierte zurücksetzen`
                : `Reset ${dismissed.size} dismissed`}
            </button>
          )}
          <button onClick={scan} disabled={loading} className="hud-btn-sm">
            {language === 'de' ? 'Erneut scannen' : 'Rescan'}
          </button>
        </div>
      </div>

      {/* Keine Ergebnisse */}
      {!loading && visible.length === 0 && (
        <div className="text-center py-8">
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {language === 'de'
              ? 'Keine unverknüpften Erwähnungen gefunden'
              : 'No unlinked mentions found'}
          </p>
        </div>
      )}

      {/* Mentions-Liste */}
      <div className="space-y-2">
        {visible.map(m => {
          const key = dismissKey(m)
          const isLinking = linking === key
          return (
            <div key={key} className="hud-card p-3">
              <div className="flex items-start justify-between gap-3">
                {/* Links: Konzeptname + Quelle + Snippet */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium"
                      style={{ color: 'var(--color-primary)' }}>
                      {m.concept_name}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded"
                      style={{
                        color: 'var(--color-text-muted)',
                        background: 'rgba(0,212,255,0.08)',
                        fontSize: '0.6rem',
                      }}>
                      {m.count}x
                    </span>
                  </div>
                  <p className="text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                    {m.source_type === 'note' ? 'Note' : 'Summary'}: {m.source_title}
                  </p>
                  {m.snippets[0] && (
                    <p className="text-xs truncate"
                      style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                      {m.snippets[0]}
                    </p>
                  )}
                </div>

                {/* Rechts: Buttons */}
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => handleLink(m)}
                    disabled={isLinking}
                    className="hud-btn-sm"
                    style={{ color: 'var(--color-success)', borderColor: 'rgba(0,200,100,0.3)' }}>
                    {isLinking
                      ? '...'
                      : (language === 'de' ? 'Verknüpfen' : 'Link')}
                  </button>
                  <button onClick={() => handleDismiss(m)}
                    className="hud-btn-sm"
                    style={{ color: 'var(--color-text-muted)' }}>
                    {language === 'de' ? 'Ignorieren' : 'Dismiss'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
