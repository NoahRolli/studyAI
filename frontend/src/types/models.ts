// TypeScript-Typen für alle Pallas Datenmodelle
// Diese Typen spiegeln die Backend-Models (SQLAlchemy) wider
// Sie sorgen dafür, dass VS Code Fehler erkennt wenn wir
// falsche Felder verwenden oder Typen verwechseln
//
// Beispiel: Wenn das Backend "name" als String liefert,
// und wir versehentlich module.titel schreiben, zeigt VS Code einen Fehler

// --- Studienmodul ---
// Entspricht backend/models/module.py
// Ein Modul ist ein Fach/Kurs (z.B. "Lineare Algebra")
export interface Module {
  id: number
  name: string
  description: string
  color: string
  sort_order: number
  is_pinned: boolean
  created_at: string
}
// Payload zum Erstellen/Aktualisieren eines Moduls
// Enthält nur die Felder die der User eingibt (ohne id, timestamps)
export interface ModuleCreate {
  name: string
  description: string
  color: string
}

// --- Dokument ---
// Entspricht backend/models/document.py
// Ein hochgeladenes Dokument innerhalb eines Moduls
export interface Document {
  id: number
  module_id: number
  filename: string
  display_name: string | null
  file_path: string
  file_type: string          // z.B. "pdf", "docx", "txt"
  raw_text: string           // Extrahierter Text (vom Parser)
  uploaded_at: string
}

// --- Zusammenfassung ---
// Entspricht backend/models/summary.py
// AI-generierte Zusammenfassung eines Dokuments
export interface Summary {
  id: number
  document_id: number
  title: string | null
  summary: string            // Der Zusammenfassungstext
  key_terms: string[]        // Liste der Schlüsselbegriffe
  ai_provider: string        // "claude", "ollama" oder "groq"
  model_used?: string        // z.B. "groq:llama-3.3-70b-versatile"
  created_at: string
}

// --- Mindmap-Knoten ---
// Entspricht backend/models/mindmap_node.py
// Ein einzelner Knoten in der Mindmap-Baumstruktur
export interface MindmapNode {
  id: number
  label: string              // Kurzbezeichnung (z.B. "Vektoren")
  detail: string             // Erklärung
  depth_level: number        // 0=Übersicht, 1=Kapitel, 2+=Detail
  position_x: number         // X-Position für das Frontend
  position_y: number         // Y-Position für das Frontend
  children: MindmapNode[]    // Rekursiv: Unterknoten
}

// --- Journal ---
// Entspricht backend/journal/models/journal_entry.py
// Ein entschlüsselter Tagebucheintrag (wie er vom Backend kommt)
export interface JournalEntry {
  id: number
  title: string              // Entschlüsselter Titel
  content: string            // Entschlüsselter Inhalt
  date: string               // Entschlüsseltes Datum (ISO)
  created_at: string
  updated_at: string
}

// Payload zum Erstellen eines neuen Eintrags
export interface JournalEntryCreate {
  title: string
  content: string
  date: string               // ISO-Format, z.B. "2026-03-11"
}

// Status des Journals (von GET /api/journal/status)
export interface JournalStatus {
  is_setup: boolean          // Wurde ein Passwort gesetzt?
  is_unlocked: boolean       // Ist die Session aktiv?
}
// --- Journal Analytics ---

// Stimmungsanalyse eines Eintrags (von POST /api/journal/analytics/mood)
export interface FuzzyMembership {
  [key: string]: number  // z.B. { gut: 0.7, neutral: 0.3 }
}

export interface MoodResult {
  entry_id: number
  score: number             // -1.0 (negativ) bis 1.0 (positiv)
  label: string             // z.B. "freudig", "nachdenklich"
  keywords: string[]
  error?: string            // Falls Ollama nicht verfügbar
  fuzzy?: FuzzyMembership
  fuzzy_label?: string
}

// Themen-Cluster (von POST /api/journal/analytics/clusters)
export interface ClusterResult {
  cluster_id: number
  entry_ids: number[]
  titles: string[]
  label: string             // AI-generiertes Cluster-Label
}

// Narrative Storyline (von POST /api/journal/analytics/storylines)
export interface StorylineResult {
  title: string
  arc_type: 'rising' | 'falling' | 'resolved' | 'ongoing'
  confidence: number        // 0.0 bis 1.0
  entry_ids: number[]
}
// --- Medikamenten-Tracker ---

// Ein entschlüsseltes Medikament (wie es vom Backend kommt)
export interface Medication {
  id: number
  name: string                 // z.B. "Ibuprofen"
  dosage: string               // z.B. "400mg"
  frequency: string            // z.B. "2x täglich"
  start_date: string           // ISO-Datum
  end_date: string | null      // null wenn noch aktiv
  notes: string | null         // Notizen/Nebenwirkungen
  created_at: string
  updated_at: string
}

// Payload zum Erstellen eines neuen Medikaments
export interface MedicationCreate {
  name: string
  dosage: string
  frequency: string
  start_date: string
  end_date?: string | null
  notes?: string | null
}

// Payload zum Aktualisieren (alle Felder optional)
export interface MedicationUpdate {
  name?: string
  dosage?: string
  frequency?: string
  start_date?: string
  end_date?: string | null
  notes?: string | null
  dose_change_reason?: string | null
}

// Ein entschlüsselter Einnahme-Log Eintrag
export interface IntakeLog {
  id: number
  medication_id: number
  date: string                 // ISO-Datum
  status: 'taken' | 'skipped'  // Genommen oder übersprungen
  notes?: string | null         // Optionale Notiz zur Einnahme
  created_at: string
}

// Payload zum Erstellen eines Einnahme-Logs
export interface IntakeLogCreate {
  medication_id: number
  date: string
  status: 'taken' | 'skipped'
  notes?: string | null
}

// Tracker-Settings (aktiviert/deaktiviert)
export interface MedicationSettingsResponse {
  is_enabled: boolean
}

// --- Ordner-Hierarchie ---

// Ein Ordner (wie er vom Backend kommt)
export interface Folder {
  id: number
  name: string
  parent_id: number | null
  sort_order: number
  is_pinned: boolean
  metis_enabled: boolean
  description: string
  created_at: string
}
// Payload zum Erstellen eines neuen Ordners
export interface FolderCreate {
  name: string
  parent_id?: number | null
}

// Inhalt eines Ordners (von GET /api/folders/contents)
export interface FolderContents {
  parent_id: number | null
  folders: Folder[]
  modules: Module[]
  documents: Document[]
}

// Breadcrumb-Eintrag (von GET /api/folders/{id}/breadcrumbs)
export interface BreadcrumbItem {
  id: number
  name: string
}
// --- Insight-Typen (Journal Analytics) ---

// Medikament ↔ Stimmung Korrelation
export interface MedMoodResult {
  medication: string
  avg_mood_with: number
  avg_mood_without: number
  difference: number
  days_with: number
  days_without: number
  trend: string
  fuzzy_with?: FuzzyMembership
  fuzzy_without?: FuzzyMembership
}

// Stimmung nach Wochentag
export interface WeekdayMoodResult {
  weekday: string
  weekday_index: number
  avg_mood: number
  entry_count: number
  fuzzy?: FuzzyMembership
  dominant?: string
}

// Schreibmuster-Analyse
export interface WritingResult {
  total_entries: number
  avg_length: number
  avg_mood_writing_days: number | null
  avg_mood_silent_days: number | null
  writing_days: number
  fuzzy_writing_days?: FuzzyMembership
  fuzzy_silent_days?: FuzzyMembership
}

// Keyword ↔ Stimmung Korrelation
export interface KeywordMoodResult {
  keyword: string
  avg_mood: number
  count: number
  fuzzy?: FuzzyMembership
  dominant?: string
}


// ---------------------------------------------------------------------
// LLM-Archiv (P5.1 Slice 1b)
// Antwort von GET /api/llm/conversations/{document_id}
// ---------------------------------------------------------------------

// Eine einzelne Message innerhalb einer LLM-Conversation
export interface LLMMessage {
  id: number
  turn_index: number
  role: string              // "human" | "assistant"
  text: string
  thinking: string | null
  has_tools: boolean
  created_at: string | null
  attachments_info: unknown // JSON, nicht strikt typisiert
}

// Meta-Daten zu einer LLM-Conversation (ohne Messages)
export interface LLMConversation {
  id: number
  document_id: number
  external_uuid: string
  title: string | null
  summary_from_provider: string | null
  provider_created_at: string | null
  provider_updated_at: string | null
  project_name_guess: string | null
  message_count: number
  has_thinking: boolean
  has_tools: boolean
}

// Kombinierte Antwort (Conversation + Messages)
export interface LLMConversationDetail {
  conversation: LLMConversation
  messages: LLMMessage[]
}
