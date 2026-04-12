// Relations Types — Typisierte Wissensrelationen
// Tripel: source (Subjekt) → relation_type (Prädikat) → target (Objekt)

export interface RelationType {
  id: number
  name: string
  label_de: string
  label_en: string
  description?: string
  is_builtin: boolean
}

export interface RelationData {
  id: number
  source_type: string
  source_id: number
  source_title: string
  target_type: string
  target_id: number
  target_title: string
  relation_type: {
    id: number
    name: string
    label_de: string
    label_en: string
  } | null
  status: 'suggested' | 'confirmed' | 'rejected'
  reason: string | null
  origin: string
  created_by: string
  confidence?: number | null
  created_at?: string | null
  created_by: 'user' | 'ollama'
  created_at: string | null
}

export interface RelationCreate {
  source_type: string
  source_id: number
  source_title: string
  target_type: string
  target_id: number
  target_title: string
  relation_type_id: number
  reason?: string
}
