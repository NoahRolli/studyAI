// useSphereSettings — Persistente Sphäre-Einstellungen via localStorage
// Slider für Nebel, Edges, Nodes + Toggles für visuelle Features
// Boolean-Werte für Ontologie-Symbole, Edge-Labels, Node-Farben
// layoutMode: folder (hierarchisch) | hybrid (folder-anker + cluster-pca)

import { useState, useCallback } from 'react'

export type LayoutMode = 'folder' | 'hybrid'

export interface SphereSettings {
  layoutMode: LayoutMode
  nebulaIntensity: number
  nebulaSize: number
  edgeSimilarity: number
  edgeOntology: number
  nodeGlow: number
  colorIntensity: number
  showOntologyMarkers: boolean
  showEdgeLabels: boolean
  showEdgeColors: boolean
  showNodeColors: boolean
  clusterPulse: boolean
  ontologyThickness: number
}

const STORAGE_KEY = 'pallas-sphere-settings'

const DEFAULTS: SphereSettings = {
  layoutMode: 'folder',
  nebulaIntensity: 1.0,
  nebulaSize: 1.0,
  edgeSimilarity: 1.0,
  edgeOntology: 1.5,
  nodeGlow: 1.0,
  colorIntensity: 1.0,
  showOntologyMarkers: true,
  showEdgeLabels: true,
  showEdgeColors: false,
  showNodeColors: true,
  clusterPulse: true,
  ontologyThickness: 2.0,
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

  const update = useCallback(
    (key: keyof SphereSettings, value: number | boolean | LayoutMode) => {
      setSettings(prev => ({ ...prev, [key]: value }))
    },
    [],
  )

  const save = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  const reset = useCallback(() => {
    setSettings({ ...DEFAULTS })
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  return { settings, update, save, reset }
}
