// DelphiSidebar — Linke Spalte des Delphi-Moduls
// Liste aller Konversationen mit Auto-Title, Drei-Punkte-Menue pro Eintrag,
// Toggle fuer Archiv-Ansicht. Klick selektiert eine Konversation.

import { useState } from 'react'
import { useLanguage } from '../../hooks/useLanguage'
import type { DelphiConversation } from '../../types/delphi'

interface DelphiSidebarProps {
  conversations: DelphiConversation[]
  currentId: number | null
  showArchived: boolean
  onSelect: (id: number) => void
  onNew: () => void
  onRename: (id: number, newTitle: string) => void
  onArchive: (id: number, archived: boolean) => void
  onDelete: (id: number) => void
  onToggleArchive: () => void
}

function DelphiSidebar({
  conversations, currentId, showArchived,
  onSelect, onNew, onRename, onArchive, onDelete, onToggleArchive,
}: DelphiSidebarProps) {
  const { t } = useLanguage()
  const [openMenuId, setOpenMenuId] = useState<number | null>(null)
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  function startRename(conv: DelphiConversation) {
    setRenamingId(conv.id)
    setRenameDraft(conv.title)
    setOpenMenuId(null)
  }

  function commitRename() {
    if (renamingId !== null && renameDraft.trim()) {
      onRename(renamingId, renameDraft.trim())
    }
    setRenamingId(null)
    setRenameDraft('')
  }

  function cancelRename() {
    setRenamingId(null)
    setRenameDraft('')
  }

  return (
    <div className="flex-1 flex flex-col gap-3 overflow-hidden">
      {/* Header: Title + New-Button */}
      <div className="flex items-center justify-between">
        <h1 className="hud-title text-glow text-2xl">Delphi</h1>
        <button
          onClick={onNew}
          className="hud-btn hud-btn-primary text-sm"
          title={t.delphi.newConversation}
        >
          + {t.delphi.newConversation}
        </button>
      </div>

      {/* Conversations-Liste */}
      <div className="flex-1 overflow-y-auto space-y-1.5">
        {conversations.length === 0 ? (
          <div className="text-center py-8">
            <p
              className="text-sm"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {t.delphi.noConversations}
            </p>
          </div>
        ) : (
          conversations.map(conv => {
            const isActive = conv.id === currentId
            const isRenaming = conv.id === renamingId
            return (
              <div
                key={conv.id}
                className={`hud-card p-2 cursor-pointer relative ${
                  isActive ? 'border-l-2' : ''
                }`}
                style={isActive ? {
                  borderLeftColor: 'var(--color-accent)',
                } : undefined}
                onClick={() => !isRenaming && onSelect(conv.id)}
              >
                {isRenaming ? (
                  <input
                    type="text"
                    value={renameDraft}
                    onChange={e => setRenameDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitRename()
                      if (e.key === 'Escape') cancelRename()
                    }}
                    onClick={e => e.stopPropagation()}
                    autoFocus
                    className="hud-input text-sm w-full"
                  />
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{conv.title}</div>
                      <div
                        className="text-xs mt-0.5"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        {conv.message_count} {t.common.entries}
                        {conv.keep_active && ' · ★'}
                      </div>
                    </div>
                    <button
                      className="hud-btn text-xs px-2 py-0.5"
                      onClick={e => {
                        e.stopPropagation()
                        setOpenMenuId(openMenuId === conv.id ? null : conv.id)
                      }}
                      title="…"
                    >
                      …
                    </button>
                  </div>
                )}

                {/* Drei-Punkte-Menue */}
                {openMenuId === conv.id && !isRenaming && (
                  <div
                    className="hud-card absolute right-2 top-10 z-10 p-1 min-w-32"
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      className="hud-btn text-xs w-full text-left px-2 py-1"
                      onClick={() => startRename(conv)}
                    >
                      {t.delphi.rename}
                    </button>
                    <button
                      className="hud-btn text-xs w-full text-left px-2 py-1"
                      onClick={() => {
                        onArchive(conv.id, !conv.is_archived)
                        setOpenMenuId(null)
                      }}
                    >
                      {conv.is_archived
                        ? t.delphi.unarchive
                        : t.delphi.archive}
                    </button>
                    <button
                      className="hud-btn text-xs w-full text-left px-2 py-1"
                      onClick={() => {
                        onDelete(conv.id)
                        setOpenMenuId(null)
                      }}
                      style={{ color: 'var(--color-error, #f87171)' }}
                    >
                      {t.delphi.delete}
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Archiv-Toggle am unteren Rand */}
      <div className="pt-2 border-t" style={{
        borderColor: 'var(--color-border)',
      }}>
        <button
          onClick={onToggleArchive}
          className="hud-btn text-xs w-full"
        >
          {showArchived ? t.delphi.hideArchive : t.delphi.showArchive}
        </button>
      </div>
    </div>
  )
}

export default DelphiSidebar
