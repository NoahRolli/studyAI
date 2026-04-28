// Delphi TypeScript Types — Knowledge-Chat Datenstrukturen
// Werden von DelphiPage, useDelphi-Hook und allen Delphi-Komponenten verwendet.
// Typen entsprechen 1:1 den Pydantic-Schemas in backend/api/delphi.py.

// Rollen einer Message
export type DelphiRole = 'user' | 'assistant'

// Confidence-Tier einer Assistant-Message
// null fuer User-Messages (haben kein Confidence-Tier)
export type DelphiConfidence = 'high' | 'medium' | 'low' | null

// Source-Typ einer Citation
// Slice 1: nur note + summary, Slice 2 ergaenzt 'chat_message'
export type DelphiSourceType = 'note' | 'summary'

// Eine Citation referenziert eine Pallas-Quelle (Note oder Summary)
// citation_index ist der [N]-Marker aus der LLM-Antwort (1-basiert)
export interface DelphiCitation {
  id: number
  citation_index: number
  source_type: DelphiSourceType
  source_id: number
  title: string
  preview_text: string
  similarity_score: number | null
}

// Einzelne Message in einer Konversation
// confidence/provider/model nur bei role='assistant' gesetzt
export interface DelphiMessage {
  id: number
  conversation_id: number
  turn_index: number
  role: DelphiRole
  content: string
  confidence: DelphiConfidence
  provider: string | null
  model: string | null
  has_unverified_claims: boolean
  created_at: string | null
  citations?: DelphiCitation[]   // optional weil Listen-Endpoints es weglassen koennen
}

// Conversation in Listen-Ansicht (ohne Messages, mit Counter)
export interface DelphiConversation {
  id: number
  title: string
  created_at: string | null
  updated_at: string | null
  last_message_at: string | null
  is_archived: boolean
  keep_active: boolean
  archived_doc_id: number | null
  message_count: number
}

// Conversation-Detail mit allen Messages + Citations
export interface DelphiConversationDetail {
  id: number
  title: string
  created_at: string | null
  updated_at: string | null
  last_message_at: string | null
  is_archived: boolean
  keep_active: boolean
  archived_doc_id: number | null
  messages: DelphiMessage[]
}

// Antwort vom POST /messages-Endpoint
// retrieval_top_score: best Cosine-Score aus dem Vector-Search
export interface DelphiSendResponse {
  user_message: DelphiMessage
  assistant_message: DelphiMessage
  retrieval_top_score: number
}

// --- Input-Types fuer API-Calls ---

export interface DelphiCreateConversationIn {
  title?: string
}

export interface DelphiUpdateConversationIn {
  title?: string
  keep_active?: boolean
  is_archived?: boolean
}

export interface DelphiSendMessageIn {
  content: string
}
