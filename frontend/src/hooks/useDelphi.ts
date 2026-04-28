// useDelphi — State + Logik fuer Delphi Knowledge-Chat
// Laedt Conversations-Liste + aktuelle Conversation-Detail, CRUD, Send-Message
// Synchron: sendMessage wartet auf LLM-Antwort (Slice 2 wird streamen)

import { useState, useEffect, useCallback } from 'react'
import { get, post, patch as apiPatch, del } from './useAPI'
import { useLanguage } from './useLanguage'
import type {
  DelphiConversation,
  DelphiConversationDetail,
  DelphiSendResponse,
  DelphiCreateConversationIn,
  DelphiUpdateConversationIn,
  DelphiSendMessageIn,
} from '../types/delphi'

export function useDelphi() {
  const { t } = useLanguage()

  // --- State ---
  const [conversations, setConversations] = useState<DelphiConversation[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [currentId, setCurrentId] = useState<number | null>(null)
  const [currentDetail, setCurrentDetail] =
    useState<DelphiConversationDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // --- Loaders ---
  const loadConversations = useCallback(async () => {
    try {
      setError(null)
      const query = showArchived ? '?archived=true' : ''
      const data = await get<DelphiConversation[]>(
        `/api/delphi/conversations${query}`
      )
      setConversations(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.delphi.errorGeneric)
    }
  }, [showArchived, t])

  const loadConversationDetail = useCallback(async (id: number) => {
    try {
      setLoading(true)
      setError(null)
      const data = await get<DelphiConversationDetail>(
        `/api/delphi/conversations/${id}`
      )
      setCurrentDetail(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.delphi.errorGeneric)
      setCurrentDetail(null)
    } finally {
      setLoading(false)
    }
  }, [t])

  // Initial-Load + Reload bei showArchived-Toggle
  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  // Detail nachladen wenn currentId wechselt
  useEffect(() => {
    if (currentId !== null) {
      loadConversationDetail(currentId)
    } else {
      setCurrentDetail(null)
    }
  }, [currentId, loadConversationDetail])

  // --- Actions ---
  async function newConversation() {
    try {
      setError(null)
      const payload: DelphiCreateConversationIn = {}
      const conv = await post<DelphiConversation>(
        '/api/delphi/conversations', payload
      )
      // Optimistic: vorne in Liste einfuegen + sofort selektieren
      setConversations(prev => [conv, ...prev])
      setCurrentId(conv.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.delphi.errorGeneric)
    }
  }

  function selectConversation(id: number) {
    setCurrentId(id)
  }

  async function sendMessage(content: string) {
    if (!currentId || !content.trim() || sending) return
    try {
      setSending(true)
      setError(null)
      const payload: DelphiSendMessageIn = { content }
      const resp = await post<DelphiSendResponse>(
        `/api/delphi/conversations/${currentId}/messages`, payload
      )
      // Lokales Detail-Update: zwei neue Messages anhaengen
      setCurrentDetail(prev => prev ? {
        ...prev,
        messages: [...prev.messages, resp.user_message, resp.assistant_message],
      } : prev)
      // Conversations-Liste refreshen damit message_count + updated_at stimmen
      // (asynchron, blockiert UI nicht)
      loadConversations()
    } catch (err) {
      setError(err instanceof Error ? err.message : t.delphi.errorSendFailed)
      // Recovery: Detail neu laden falls User-Msg schon persistiert wurde
      if (currentId !== null) loadConversationDetail(currentId)
    } finally {
      setSending(false)
    }
  }

  async function renameConversation(id: number, title: string) {
    try {
      setError(null)
      const payload: DelphiUpdateConversationIn = { title }
      await apiPatch(`/api/delphi/conversations/${id}`, payload)
      // Lokal updaten
      setConversations(prev =>
        prev.map(c => c.id === id ? { ...c, title } : c)
      )
      if (currentDetail && currentDetail.id === id) {
        setCurrentDetail({ ...currentDetail, title })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.delphi.errorGeneric)
    }
  }

  async function archiveConversation(id: number, archived: boolean) {
    try {
      setError(null)
      const payload: DelphiUpdateConversationIn = { is_archived: archived }
      await apiPatch(`/api/delphi/conversations/${id}`, payload)
      // Aus aktueller Liste entfernen wenn Filter nicht passt
      setConversations(prev => prev.filter(c => c.id !== id))
      if (currentId === id) setCurrentId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.delphi.errorGeneric)
    }
  }

  async function setKeepActive(id: number, keep: boolean) {
    try {
      setError(null)
      const payload: DelphiUpdateConversationIn = { keep_active: keep }
      await apiPatch(`/api/delphi/conversations/${id}`, payload)
      setConversations(prev =>
        prev.map(c => c.id === id ? { ...c, keep_active: keep } : c)
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : t.delphi.errorGeneric)
    }
  }

  async function deleteConversation(id: number) {
    if (!confirm(t.delphi.deleteConfirm)) return
    try {
      setError(null)
      await del(`/api/delphi/conversations/${id}`)
      setConversations(prev => prev.filter(c => c.id !== id))
      if (currentId === id) setCurrentId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.delphi.errorGeneric)
    }
  }

  return {
    // State
    conversations,
    showArchived,
    currentId,
    currentDetail,
    loading,
    sending,
    error,
    // Setter
    setShowArchived,
    setCurrentId,
    // Actions
    newConversation,
    selectConversation,
    sendMessage,
    renameConversation,
    archiveConversation,
    setKeepActive,
    deleteConversation,
    // Manual refresh
    refresh: loadConversations,
  }
}
