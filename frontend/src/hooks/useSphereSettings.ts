// useSphereSettings — Persistente Sphäre-Einstellungen via localStorage
// Slider-Werte für Nebel, Edges, Nodes — bleibt über Sessions bestehen
// Boolean für Ontologie-Symbole auf Edges

import { useState, useCallback } from 'react'

export interface SphereSettings {
  nebulaIntensity: number    // Nebel-Leuchtstärke (0.1–2.0)
  nebulaSize: number         // Nebel-Partikelgrösse (0.5–3.0)
  edgeSimilarity: number     // Similarity-Edge Stärke (0.0–2.0)
  edgeOntology: number       // Ontology-Edge Stärke (0.0–3.0)
  nodeGlow: number           // Node-Glow Intensität (0.0–2.0)
  colorIntensity: number     // Allgemeine Farbstärke (0.5–2.0)
  showOntologyMarkers: boolean // Ontologie-Symbole auf Edges
}

const STORAGE_KEY = 'pallas-sphere-settings'

const DEFAULTS: SphereSettings = {
  nebulaIntensity: 1.0,
  nebulaSize: 1.0,
  edgeSimilarity: 1.0,
  edgeOntology: 1.5,
  nodeGlow: 1.0,
  colorIntensity: 1.0,
  showOntologyMarkers: true,
}

function loadSettings(): SphereSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch { return { ...DEFAULTS } }
}

export function useSphereSettings() {
  const [settings, setSettings] = useState<SphereSettings>(loadSettings)

  // Einzelnen Wert ändern (ohne Speichern)
  const update = useCallback((key: keyof SphereSettings, value: number | boolean) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }, [])

  // Alle Werte in localStorage speichern
  const save = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  // Auf Defaults zurücksetzen
  const reset = useCallback(() => {
    setSettings({ ...DEFAULTS })
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  return { settings, update, save, reset }
}
