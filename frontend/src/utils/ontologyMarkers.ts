// ontologyMarkers — Symbol-Mapping für Ontologie-Relationstypen
// Unicode-Symbole + Farben, shared zwischen 2D, 3D und OntologyPage
// Toggle-State via localStorage (pallas-ontology-markers)

const STORAGE_KEY = 'pallas-ontology-markers'

// Symbol + Farbe pro Relationstyp
const MARKERS: Record<string, { symbol: string; color: string }> = {
  is_a:        { symbol: '△', color: '#ff6b9d' },
  subclass_of: { symbol: '▽', color: '#c084fc' },
  part_of:     { symbol: '◆', color: '#fb923c' },
  builds_on:   { symbol: '→', color: '#4ade80' },
  requires:    { symbol: '⊕', color: '#f87171' },
  contradicts: { symbol: '✕', color: '#ef4444' },
  example_of:  { symbol: '○', color: '#67e8f9' },
  related_to:  { symbol: '―', color: '#a78bfa' },
}

// Marker für einen Relationstyp holen
export function getOntologyMarker(type: string) {
  return MARKERS[type] || null
}

// Alle verfügbaren Marker (für Legenden etc.)
export function getAllMarkers() {
  return Object.entries(MARKERS).map(([type, m]) => ({
    type, ...m,
  }))
}

// Toggle-State aus localStorage lesen
export function getMarkersVisible(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw === null ? true : raw === 'true'
  } catch { return true }
}

// Toggle-State in localStorage schreiben
export function setMarkersVisible(visible: boolean) {
  localStorage.setItem(STORAGE_KEY, String(visible))
}
