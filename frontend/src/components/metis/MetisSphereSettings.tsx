// MetisSphereSettings — HUD-Overlay für Sphäre-Visuals
// Slider für Nebel, Edges, Nodes, Farben
// Toggles für Ontologie-Symbole, Edge-Labels, Node-Farben

import { useState } from 'react'
import { useLanguage } from '../../hooks/useLanguage'
import type { SphereSettings } from '../../hooks/useSphereSettings'

interface Props {
  settings: SphereSettings
  onUpdate: (key: keyof SphereSettings, value: number | boolean) => void
  onSave: () => void
  onReset: () => void
}

function SettingsSlider({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number
  step: number; onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-xs w-28 shrink-0"
        style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      <input type="range" min={min} max={max} step={step}
        value={value} onChange={e => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) ${((value - min) / (max - min)) * 100}%, var(--color-border) ${((value - min) / (max - min)) * 100}%, var(--color-border) 100%)`,
        }} />
      <span className="text-xs w-8 text-right font-mono"
        style={{ color: 'var(--color-text-muted)' }}>{value.toFixed(1)}</span>
    </div>
  )
}

function ToggleButton({ label, value, onChange }: {
  label: string; value: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-xs w-28 shrink-0"
        style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      <button onClick={() => onChange(!value)}
        className="text-xs px-2 py-0.5 rounded"
        style={{
          color: value ? 'var(--color-primary)' : 'var(--color-text-muted)',
          border: `1px solid ${value ? 'var(--color-primary)' : 'var(--color-border)'}`,
          background: value ? 'var(--color-hover-bg)' : 'transparent',
        }}>
        {value ? 'ON' : 'OFF'}
      </button>
    </div>
  )
}

export default function MetisSphereSettings({ settings, onUpdate, onSave, onReset }: Props) {
  const { language } = useLanguage()
  const [open, setOpen] = useState(false)
  const de = language === 'de'

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="absolute bottom-4 left-4 z-10 px-3 py-1.5 rounded text-xs"
        style={{
          background: 'rgba(13, 17, 23, 0.8)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-secondary)',
          backdropFilter: 'blur(8px)',
        }}>
        Visuals
      </button>
    )
  }

  return (
    <div className="absolute bottom-4 left-4 z-10 p-4 rounded-lg w-72"
      style={{
        background: 'rgba(13, 17, 23, 0.9)',
        border: '1px solid var(--color-border)',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 0 20px rgba(0, 0, 0, 0.5)',
      }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold tracking-widest"
          style={{ color: 'var(--color-primary)', fontFamily: 'Orbitron, monospace' }}>
          {de ? 'SPHÄRE' : 'SPHERE'}
        </span>
        <button onClick={() => setOpen(false)}
          className="text-xs px-1" style={{ color: 'var(--color-text-muted)' }}>x</button>
      </div>

      {/* Slider */}
      <SettingsSlider label={de ? 'Nebel-Leuchten' : 'Nebula Glow'}
        value={settings.nebulaIntensity} min={0.1} max={3.0} step={0.1}
        onChange={v => onUpdate('nebulaIntensity', v)} />
      <SettingsSlider label={de ? 'Nebel-Grösse' : 'Nebula Size'}
        value={settings.nebulaSize} min={0.3} max={3.0} step={0.1}
        onChange={v => onUpdate('nebulaSize', v)} />
      <SettingsSlider label={de ? 'Similarity-Edges' : 'Similarity Edges'}
        value={settings.edgeSimilarity} min={0.0} max={3.0} step={0.1}
        onChange={v => onUpdate('edgeSimilarity', v)} />
      <SettingsSlider label={de ? 'Ontology-Edges' : 'Ontology Edges'}
        value={settings.edgeOntology} min={0.0} max={5.0} step={0.1}
        onChange={v => onUpdate('edgeOntology', v)} />
      <SettingsSlider label={de ? 'Ontology-Dicke' : 'Ontology Width'}
        value={settings.ontologyThickness} min={0.5} max={5.0} step={0.5}
        onChange={v => onUpdate('ontologyThickness', v)} />
      <SettingsSlider label={de ? 'Node-Glow' : 'Node Glow'}
        value={settings.nodeGlow} min={0.0} max={3.0} step={0.1}
        onChange={v => onUpdate('nodeGlow', v)} />
      <SettingsSlider label={de ? 'Farbstärke' : 'Color Intensity'}
        value={settings.colorIntensity} min={0.3} max={3.0} step={0.1}
        onChange={v => onUpdate('colorIntensity', v)} />

      {/* Toggles */}
      <div style={{ borderTop: '1px solid var(--color-border)', marginTop: '6px', paddingTop: '6px' }}>
        <ToggleButton label={de ? 'Ontologie-Symbole' : 'Ontology Markers'}
          value={settings.showOntologyMarkers}
          onChange={v => onUpdate('showOntologyMarkers', v)} />
        <ToggleButton label={de ? 'Edge-Labels' : 'Edge Labels'}
          value={settings.showEdgeLabels}
          onChange={v => onUpdate('showEdgeLabels', v)} />
        <ToggleButton label={de ? 'Node-Farben' : 'Node Colors'}
          value={settings.showNodeColors}
          onChange={v => onUpdate('showNodeColors', v)} />
      </div>

      {/* Aktionen */}
      <div className="flex gap-2 mt-3 pt-2"
        style={{ borderTop: '1px solid var(--color-border)' }}>
        <button onClick={() => { onSave(); setOpen(false) }}
          className="hud-btn text-xs flex-1">
          {de ? 'Speichern' : 'Save'}
        </button>
        <button onClick={onReset}
          className="text-xs px-3 py-1 rounded"
          style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
          {de ? 'Zurücksetzen' : 'Reset'}
        </button>
      </div>
    </div>
  )
}
