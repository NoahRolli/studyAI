// MoodClusterData — Cluster-Definitionen fuer Mood + Body Check-In
// Wird von MoodCheckInModal importiert

export type Cluster = { key: string; moods: string[] }

// === STIMMUNG ===
export const POSITIVE_CLUSTERS: Cluster[] = [
  { key: 'energy', moods: ['energized', 'refreshed'] },
  { key: 'calm', moods: ['calm', 'grounded'] },
  { key: 'emotion', moods: ['happy', 'grateful', 'proud'] },
  { key: 'cognitive', moods: ['focused', 'clear', 'curious'] },
  { key: 'drive', moods: ['motivated', 'creative'] },
  { key: 'social', moods: ['social', 'connected'] },
]

export const NEGATIVE_CLUSTERS: Cluster[] = [
  { key: 'energy', moods: ['tired', 'exhausted', 'restless'] },
  { key: 'stress', moods: ['stressed', 'anxious', 'overwhelmed'] },
  { key: 'emotion', moods: ['sad', 'irritated', 'angry', 'lonely'] },
  { key: 'cognitive', moods: ['unfocused', 'foggy', 'overthinking', 'ruminating', 'scattered'] },
]

// === KOERPER ===
export const BODY_POSITIVE_CLUSTERS: Cluster[] = [
  { key: 'sleep', moods: ['well_slept'] },
  { key: 'energy', moods: ['energetic'] },
  { key: 'general', moods: ['lightness'] },
]

export const BODY_NEGATIVE_CLUSTERS: Cluster[] = [
  { key: 'sleep', moods: ['poorly_slept'] },
  { key: 'energy', moods: ['physical_fatigue'] },
  { key: 'pain', moods: ['headache', 'neck_tension', 'back_pain', 'sore_muscles'] },
  { key: 'digestion', moods: ['no_appetite', 'nausea'] },
  { key: 'general', moods: ['dizziness', 'eye_strain'] },
]
