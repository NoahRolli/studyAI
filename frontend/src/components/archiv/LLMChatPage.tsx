// LLMChatPage — Vollseiten-Viewer für eine einzelne LLM-Conversation
// Route: /archiv/llm-chat/:id (id = document_id)
// Lädt GET /api/llm/conversations/:id
//
// Features:
//   - Role-Badges (Human/Assistant) + Timestamp pro Message
//   - Thinking-Blocks als collapsed <details>
//   - Tool-Blocks als collapsed <details>
//   - Anchor-IDs pro Message (id="msg-{turn_index}") für spätere Delphi-Sprünge
//   - Breadcrumb-Header mit "← Archiv"-Link

import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { get } from '../../hooks/useAPI'
import type { LLMConversationDetail, LLMMessage } from '../../types/models'
import { useHighlight } from '../../hooks/useHighlight'
import HighlightDismissBanner from '../HighlightDismissBanner'

// Eine einzelne Message im Viewer
function MessageBlock({ msg }: { msg: LLMMessage }) {
  const isHuman = msg.role === 'human' || msg.role === 'user'
  const roleLabel = isHuman ? 'HUMAN' : 'ASSISTANT'
  const timestamp = msg.created_at
    ? new Date(msg.created_at).toLocaleString('de-CH')
    : ''

  return (
    <article
      id={`msg-${msg.turn_index}`}
      className="hud-card p-4 scroll-mt-20"
    >
      <div className="flex items-center gap-3 mb-2">
        <span
          className="text-[9px] px-1.5 py-0.5 rounded font-mono shrink-0"
          style={{
            color: isHuman ? 'var(--color-text-secondary)' : 'var(--color-primary)',
            background: 'var(--color-hover-bg)',
            border: '1px solid var(--color-border)',
          }}
        >
          {roleLabel}
        </span>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          #{msg.turn_index}
          {timestamp && ` · ${timestamp}`}
        </span>
      </div>

      {msg.text && (
        <pre
          className="text-sm leading-relaxed font-sans"
          style={{
            color: 'var(--color-text-primary)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {msg.text}
        </pre>
      )}

      {msg.thinking && (
        <details className="mt-3">
          <summary
            className="text-xs cursor-pointer select-none"
            style={{ color: 'var(--color-text-muted)' }}
          >
            [▸ Thinking]
          </summary>
          <pre
            className="text-xs leading-relaxed font-sans mt-2 p-3 rounded"
            style={{
              color: 'var(--color-text-secondary)',
              background: 'var(--color-hover-bg)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {msg.thinking}
          </pre>
        </details>
      )}

      {msg.has_tools && (
        <details className="mt-2">
          <summary
            className="text-xs cursor-pointer select-none"
            style={{ color: 'var(--color-text-muted)' }}
          >
            [▸ Tool Use]
          </summary>
          <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
            Diese Message enthält Tool-Aufrufe. Details werden aktuell nicht
            separat gerendert.
          </p>
        </details>
      )}
    </article>
  )
}

// Haupt-Komponente
export default function LLMChatPage() {
  const { id } = useParams<{ id: string }>()
  const [detail, setDetail] = useState<LLMConversationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Highlight aus ?highlight= URL-Param (von Metis-Source-Klick).
  // WICHTIG: VOR allen bedingten Returns aufrufen — sonst React #310.
  const { active: hlActive, term: hlTerm, clear: hlClear } = useHighlight(containerRef, { enabled: !!detail })

  // Conversation laden
  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    get<LLMConversationDetail>(`/api/llm/conversations/${id}`)
      .then((data) => {
        setDetail(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Laden fehlgeschlagen')
        setLoading(false)
      })
  }, [id])

  // Nach dem Render: wenn URL einen Hash hat (#msg-42), zu der Stelle scrollen
  useEffect(() => {
    if (!detail || !containerRef.current) return
    const hash = window.location.hash
    if (hash.startsWith('#msg-')) {
      const el = document.getElementById(hash.slice(1))
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [detail])

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Lade Conversation...
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div
          className="hud-card p-4 border"
          style={{
            background: 'rgba(255,59,92,0.1)',
            borderColor: 'rgba(255,59,92,0.3)',
            color: 'var(--color-danger)',
          }}
        >
          <p className="text-sm">Fehler: {error}</p>
          <Link
            to="/archiv"
            className="text-xs mt-2 inline-block hover:underline"
            style={{ color: 'var(--color-primary)' }}
          >
            ← Zurück zum Archiv
          </Link>
        </div>
      </div>
    )
  }

  if (!detail) return null

  const conv = detail.conversation
  const title = conv.title || '(ohne Titel)'

  return (
    <div ref={containerRef} className="p-6 max-w-4xl mx-auto">
      {hlActive && hlTerm && <HighlightDismissBanner term={hlTerm} onDismiss={hlClear} />}

      {/* Breadcrumb-Header */}
      <div className="mb-6">
        <Link
          to="/archiv"
          className="text-xs hover:underline"
          style={{ color: 'var(--color-text-muted)' }}
        >
          ← Archiv
        </Link>
        <h1
          className="text-2xl font-semibold mt-2 hud-title"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {title}
        </h1>
        <div className="flex items-center gap-3 mt-2 text-xs flex-wrap"
          style={{ color: 'var(--color-text-muted)' }}>
          <span>{conv.message_count} Messages</span>
          {conv.project_name_guess && <span>· Projekt: {conv.project_name_guess}</span>}
          {conv.has_thinking && <span>· mit Thinking</span>}
          {conv.has_tools && <span>· mit Tools</span>}
          {conv.provider_created_at && (
            <span>· {new Date(conv.provider_created_at).toLocaleDateString('de-CH')}</span>
          )}
        </div>
        {conv.summary_from_provider && (
          <p
            className="text-sm mt-3 italic"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {conv.summary_from_provider}
          </p>
        )}
      </div>

      {/* Messages */}
      <div className="space-y-3">
        {detail.messages.map((msg) => (
          <MessageBlock key={msg.id} msg={msg} />
        ))}
      </div>
    </div>
  )
}
