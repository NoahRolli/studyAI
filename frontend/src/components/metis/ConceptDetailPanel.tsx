// ConceptDetailPanel — Zeigt Detail zu einem Konzept in der Sphäre
// Quellen, verwandte Konzepte, Edge-Confirm/Reject

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { get } from '../../hooks/useAPI'
import type { ConceptDetail, ChatSource, ChatSourcesResponse, ConceptSource } from '../../types/metis'
import { getSourceRoute, sourceRouteToUrl } from '../../utils/metisSourceRouting'

interface Props {
  conceptId: number
  onClose: () => void
  onEdgeReviewed?: () => void
}

export default function ConceptDetailPanel({
  conceptId, onClose,
}: Props) {
  const navigate = useNavigate()
  const [detail, setDetail] = useState<ConceptDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [chatSources, setChatSources] = useState<ChatSource[] | null>(null)

  const loadDetail = useCallback(async () => {
    setLoading(true)
    try {
      const data = await get<ConceptDetail>(`/api/concepts/${conceptId}`)
      setDetail(data)
    } catch (err) {
      console.error('Concept detail load failed:', err)
    } finally {
      setLoading(false)
    }
  }, [conceptId])

  useEffect(() => { loadDetail() }, [loadDetail])

  // Chat-Messages lazy laden — separater Endpoint weil pro Konzept
  // hunderte Messages möglich sind und /api/concepts/{id} sonst aufbläht
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await get<ChatSourcesResponse>(`/api/concepts/${conceptId}/chat-sources`)
        if (!cancelled) setChatSources(data.sources)
      } catch (err) {
        console.error('Chat-sources load failed:', err)
        if (!cancelled) setChatSources([])
      }
    })()
    return () => { cancelled = true }
  }, [conceptId])

  // Zentrales Routing: ConceptSource → Navigation + Highlight des Concept-Namens.
  // chat_message öffnet in neuem Tab (User behält Metis-Kontext).
  const openSource = (s: ConceptSource) => {
    const route = getSourceRoute(s, detail?.name)
    if (!route) return
    const url = sourceRouteToUrl(route)
    if (route.newTab) window.open(url, '_blank')
    else navigate(url)
  }

  // Chat-Message aus separater ChatSources-Liste (hat document_id + turn_index direkt)
  const openChatSource = (c: ChatSource) => {
    const hl = detail?.name ? `?highlight=${encodeURIComponent(detail.name)}` : ''
    window.open(`/archiv/llm-chat/${c.document_id}${hl}#msg-${c.turn_index}`, '_blank')
  }


  // Relationstyp-Farbe
  const relColor = (type: string) => {
    if (type === 'builds_on') return 'var(--color-accent-cyan)'
    if (type === 'contradicts') return 'var(--color-accent-red, #ff4444)'
    if (type === 'part_of') return 'var(--color-accent-violet, #a855f7)'
    return 'var(--color-text-muted)'
  }

  return (
    <div className="absolute top-0 right-0 z-30 w-80 h-full overflow-y-auto border-l border-[var(--color-border)]"
      style={{ background: 'var(--color-bg-deep)' }}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-[var(--color-border)]">
        <h3 className="text-sm font-medium text-[var(--color-text-primary)] truncate">
          {detail?.name || '...'}
        </h3>
        <button onClick={onClose} className="hud-btn text-xs px-2 py-1">X</button>
      </div>

      {loading ? (
        <p className="p-3 text-xs text-[var(--color-text-muted)]">Laden...</p>
      ) : detail ? (
        <div className="p-3 space-y-4">
          {/* Description */}
          {detail.description && (
            <p className="text-xs text-[var(--color-text-secondary)]">
              {detail.description}
            </p>
          )}

          {/* Quellen */}
          {detail.sources.length > 0 && (
            <div>
              <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">
                Quellen ({detail.sources.length})
              </p>
              <div className="space-y-1">
                {detail.sources.map((s, i) => (
                  <button key={i}
                    onClick={() => openSource(s)}
                    className="flex items-center gap-2 text-xs w-full text-left hover:text-[var(--color-accent-cyan)] transition-colors">
                    <span className="px-1.5 py-0.5 rounded text-[10px] uppercase"
                      style={{
                        background:
                          s.type === 'note' ? 'rgba(125, 212, 163, 0.15)' :
                          s.type === 'summary' ? 'rgba(212, 165, 116, 0.15)' :
                          s.type === 'chat_message' ? 'rgba(0, 212, 255, 0.15)' :
                          'rgba(168, 85, 247, 0.15)',
                        color:
                          s.type === 'note' ? '#7dd4a3' :
                          s.type === 'summary' ? '#d4a574' :
                          s.type === 'chat_message' ? '#00d4ff' :
                          '#a855f7',
                      }}>
                      {s.type}
                    </span>
                    <span className="truncate">{s.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chat-Messages (lazy-loaded) */}
          {chatSources && chatSources.length > 0 && (
            <div>
              <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">
                Chat-Messages ({chatSources.length})
              </p>
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {chatSources.map((c) => (
                  <button key={c.message_id}
                    onClick={() => openChatSource(c)}
                    className="block w-full text-left p-2 rounded border border-[var(--color-border)] hover:border-[var(--color-accent-cyan)] transition-colors">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-1.5 py-0.5 rounded text-[10px] uppercase"
                        style={{
                          background: c.role === 'user' ? 'rgba(100, 200, 255, 0.15)' : 'rgba(168, 85, 247, 0.15)',
                          color: c.role === 'user' ? '#64c8ff' : '#a855f7'
                        }}>
                        {c.role}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-muted)] truncate">
                        {c.conversation_title}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--color-text-secondary)] line-clamp-2">
                      {c.text_preview}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Verwandte Konzepte */}
          {detail.related.length > 0 && (
            <div>
              <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">
                Verbindungen ({detail.related.length})
              </p>
              <div className="space-y-1.5">
                {detail.related.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-1.5 py-0.5 rounded text-[10px]"
                        style={{ color: relColor(r.relation), border: `1px solid ${relColor(r.relation)}` }}>
                        {r.relation}
                      </span>
                      <span className="truncate text-[var(--color-text-primary)]">
                        {r.name}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Info */}
          <p className="text-[10px] text-[var(--color-text-muted)]">
            {detail.source_count} Quellen
          </p>
        </div>
      ) : null}
    </div>
  )
}
