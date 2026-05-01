// DelphiPage — Knowledge-Chat-Modul
// 2-Spalten-Layout: Conversations-Sidebar links, Messages + Chat-Input rechts.
// Auto-Scroll zum letzten Message bei neuen Antworten.
// Enter sendet, Shift+Enter macht Newline.

import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLanguage } from '../hooks/useLanguage'
import { useDelphi } from '../hooks/useDelphi'
import DelphiSidebar from '../components/delphi/DelphiSidebar'
import DelphiMessage from '../components/delphi/DelphiMessage'

function DelphiPage() {
  const { t } = useLanguage()
  const {
    conversations,
    showArchived,
    currentId,
    currentDetail,
    loading,
    sending,
    error,
    setShowArchived,
    selectConversation,
    newConversation,
    sendMessage,
    renameConversation,
    archiveConversation,
    deleteConversation,
  } = useDelphi()

  const [draft, setDraft] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const location = useLocation()
  const navigate = useNavigate()

  // Bubble-Navigation: liest initialDraft aus location.state und sendet ggf. sofort
  // State wird danach gecleart damit Re-Renders nichts erneut triggern
  useEffect(() => {
    const state = location.state as {
      initialDraft?: string
      autoSend?: boolean
    } | null
    if (!state?.initialDraft) return

    const draftText = state.initialDraft
    if (state.autoSend) {
      // Async-Flow: erst Conversation erstellen, dann mit echter ID senden
      // (umgeht React-State-Race nach setCurrentId)
      ;(async () => {
        const newId = await newConversation()
        if (newId !== null) {
          await sendMessage(draftText, newId)
        }
      })()
    } else {
      // Nur Draft setzen, User schickt manuell ab
      setDraft(draftText)
    }

    // State clearen damit Re-Renders nichts erneut triggern
    navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  // Auto-Scroll zum Ende wenn neue Messages kommen
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [currentDetail?.messages.length, sending])

  // Textarea-Fokus wenn Conversation gewechselt wird
  useEffect(() => {
    if (currentId !== null) textareaRef.current?.focus()
  }, [currentId])

  function handleSend() {
    const content = draft.trim()
    if (!content || sending) return
    sendMessage(content)
    setDraft('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex-1 flex overflow-hidden gap-3 p-3">
      {/* Linke Spalte: Sidebar mit Conversations */}
      <div className="w-72 flex-shrink-0 flex flex-col">
        <DelphiSidebar
          conversations={conversations}
          currentId={currentId}
          showArchived={showArchived}
          onSelect={selectConversation}
          onNew={newConversation}
          onRename={renameConversation}
          onArchive={archiveConversation}
          onDelete={deleteConversation}
          onToggleArchive={() => setShowArchived(!showArchived)}
        />
      </div>

      {/* Rechte Spalte: Messages + Chat-Input */}
      <div className="flex-1 flex flex-col gap-3 overflow-hidden">
        {currentId === null ? (
          // Empty-State: keine Conversation gewaehlt
          <div className="flex-1 flex flex-col items-center justify-center px-8">
            <h1
              className="hud-title text-glow text-3xl font-bold mb-4 tracking-widest"
              style={{
                color: 'var(--color-primary)',
                fontFamily: "'Orbitron', monospace",
              }}
            >
              Delphi
            </h1>
            <p
              className="text-sm text-center max-w-md"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {t.delphi.emptyChat}
            </p>
          </div>
        ) : (
          <>
            {/* Header: Conversation-Title */}
            {currentDetail && (
              <div className="flex items-center justify-between border-b pb-2"
                   style={{ borderColor: 'var(--color-border)' }}>
                <h2 className="hud-title text-glow text-xl truncate">
                  {currentDetail.title}
                </h2>
                <div className="text-xs"
                     style={{ color: 'var(--color-text-muted)' }}>
                  {currentDetail.messages.length} {t.common.entries}
                </div>
              </div>
            )}

            {/* Messages-Liste */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {loading && (
                <div className="text-center py-8 text-sm"
                     style={{ color: 'var(--color-text-muted)' }}>
                  {t.common.loading}
                </div>
              )}
              {!loading && currentDetail?.messages.length === 0 && (
                <div className="text-center py-8 text-sm"
                     style={{ color: 'var(--color-text-muted)' }}>
                  {t.delphi.emptyChat}
                </div>
              )}
              {currentDetail?.messages.map(msg => (
                <DelphiMessage key={msg.id} message={msg} />
              ))}
              {sending && (
                <div className="text-center py-2 text-sm"
                     style={{ color: 'var(--color-text-muted)' }}>
                  {t.delphi.sending}
                </div>
              )}
              {error && (
                <div
                  className="hud-card p-2 text-xs"
                  style={{ color: 'var(--color-error, #f87171)' }}
                >
                  {error}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat-Input */}
            <div className="flex items-end gap-2 pt-2 border-t"
                 style={{ borderColor: 'var(--color-border)' }}>
              <textarea
                ref={textareaRef}
                className="hud-input text-sm flex-1 resize-none"
                rows={2}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t.delphi.inputPlaceholder}
                disabled={sending}
              />
              <button
                onClick={handleSend}
                disabled={!draft.trim() || sending}
                className="hud-btn hud-btn-primary text-sm px-4 py-2"
              >
                {sending ? t.delphi.sending : t.delphi.send}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default DelphiPage
