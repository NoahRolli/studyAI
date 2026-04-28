// DelphiMessage — Einzelne Message in einer Delphi-Konversation
// User-Bubble vs Assistant-Bubble, Confidence-Badge, Inline [N]/[!]-Marker,
// Pill-Liste der Citations unten mit Open-Source-Buttons.

import { useState } from 'react'
import { useLanguage } from '../../hooks/useLanguage'
import type {
  DelphiMessage as DelphiMessageType,
  DelphiCitation,
  DelphiConfidence,
} from '../../types/delphi'

interface DelphiMessageProps {
  message: DelphiMessageType
}

// --- Helper: Confidence-Badge Styling ---
function confidenceMeta(c: DelphiConfidence, t: any) {
  if (c === 'high') return {
    color: '#22c55e', label: t.delphi.confidenceHigh,
    tooltip: t.delphi.confidenceTooltipHigh,
  }
  if (c === 'medium') return {
    color: '#eab308', label: t.delphi.confidenceMedium,
    tooltip: t.delphi.confidenceTooltipMedium,
  }
  return {
    color: '#94a3b8', label: t.delphi.confidenceLow,
    tooltip: t.delphi.confidenceTooltipLow,
  }
}

// --- Helper: Quelle in neuem Tab oeffnen (Slice 1: nur Notes routebar) ---
function openSource(citation: DelphiCitation) {
  if (citation.source_type === 'note') {
    window.open(`/notes?open=${citation.source_id}`, '_blank')
  }
  // Summary-Routing kommt in Slice 2
}

// --- Helper: Content mit [N]- und [!]-Markern parsen ---
// Splittet content in Text-Stuecke + Marker, returnt JSX-Array.
function renderContentWithMarkers(
  content: string,
  onCitationClick: (idx: number) => void,
  t: any,
): JSX.Element[] {
  // Regex matched [N], [SOURCE N], [Quelle N], [!] — siehe Backend _CITE_RE
  const pattern = /\[(?:SOURCE|Source|Quelle|QUELLE)?\s*(\d+)\]|\[!\]/g
  const out: JSX.Element[] = []
  let lastIdx = 0
  let key = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(content)) !== null) {
    if (match.index > lastIdx) {
      out.push(<span key={key++}>{content.slice(lastIdx, match.index)}</span>)
    }
    if (match[1]) {
      const n = parseInt(match[1], 10)
      out.push(
        <button
          key={key++}
          className="hud-btn"
          style={{
            display: 'inline-block',
            padding: '0 6px',
            margin: '0 2px',
            fontSize: '0.75em',
            verticalAlign: 'super',
            color: 'var(--color-accent)',
          }}
          onClick={e => { e.stopPropagation(); onCitationClick(n) }}
          title={`${t.delphi.source} ${n}`}
        >
          [{n}]
        </button>
      )
    } else {
      out.push(
        <span
          key={key++}
          style={{
            display: 'inline-block',
            padding: '0 4px',
            margin: '0 2px',
            fontSize: '0.85em',
            color: 'var(--color-warning, #eab308)',
            cursor: 'help',
          }}
          title={t.delphi.unverifiedClaim}
        >
          [!]
        </span>
      )
    }
    lastIdx = match.index + match[0].length
  }
  if (lastIdx < content.length) {
    out.push(<span key={key++}>{content.slice(lastIdx)}</span>)
  }
  return out
}

function DelphiMessage({ message }: DelphiMessageProps) {
  const { t } = useLanguage()
  const [expandedCitation, setExpandedCitation] = useState<number | null>(null)

  const isUser = message.role === 'user'
  const citations = message.citations || []
  const meta = !isUser ? confidenceMeta(message.confidence, t) : null

  function toggleCitation(idx: number) {
    setExpandedCitation(prev => prev === idx ? null : idx)
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className="hud-card p-3 max-w-3xl"
        style={isUser ? {
          borderLeftColor: 'var(--color-accent)',
          borderLeftWidth: 2,
        } : undefined}
      >
        {/* Header: Confidence-Badge + Provider-Info (nur bei assistant) */}
        {!isUser && meta && (
          <div className="flex items-center gap-2 mb-2 text-xs"
               style={{ color: 'var(--color-text-muted)' }}>
            <span
              title={meta.tooltip}
              className="flex items-center gap-1.5"
            >
              <span
                style={{
                  display: 'inline-block', width: 8, height: 8,
                  borderRadius: '50%', background: meta.color,
                }}
              />
              {meta.label}
            </span>
            {message.provider && (
              <span style={{ opacity: 0.6 }}>· {message.provider}</span>
            )}
          </div>
        )}

        {/* Content mit Inline-Markern */}
        <div className="text-sm leading-relaxed whitespace-pre-wrap">
          {renderContentWithMarkers(message.content, toggleCitation, t)}
        </div>

        {/* Citations Pill-Liste */}
        {!isUser && citations.length > 0 && (
          <div className="mt-3 pt-2 border-t" style={{
            borderColor: 'var(--color-border)',
          }}>
            <div className="text-xs mb-1.5"
                 style={{ color: 'var(--color-text-muted)' }}>
              {t.delphi.sources}:
            </div>
            <div className="flex flex-col gap-1.5">
              {citations.map(c => {
                const isExpanded = expandedCitation === c.citation_index
                return (
                  <div key={c.id} className="text-xs">
                    <div className="flex items-center gap-2">
                      <button
                        className="hud-btn px-2 py-0.5"
                        onClick={() => toggleCitation(c.citation_index)}
                        style={{ color: 'var(--color-accent)' }}
                      >
                        [{c.citation_index}]
                      </button>
                      <span className="flex-1 truncate">{c.title}</span>
                      {c.source_type === 'note' && (
                        <button
                          className="hud-btn text-xs px-2 py-0.5"
                          onClick={() => openSource(c)}
                          title={t.delphi.viewSource}
                        >
                          →
                        </button>
                      )}
                    </div>
                    {isExpanded && c.preview_text && (
                      <div
                        className="mt-1 px-2 py-1.5 rounded text-xs"
                        style={{
                          background: 'var(--color-bg-elevated)',
                          color: 'var(--color-text-muted)',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {c.preview_text}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Footer-Note bei Unverified-Claims ohne Citations */}
        {!isUser && message.has_unverified_claims && citations.length === 0 && (
          <div
            className="mt-2 text-xs flex items-center gap-1.5"
            style={{ color: 'var(--color-warning, #eab308)' }}
          >
            <span>⚠</span>
            <span>{t.delphi.noSourcesUsed}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default DelphiMessage
