// Provider Switch — Kompaktes Dropdown zum Wechseln des AI-Providers
// Zeigt aktiven Provider mit Farb-Indikator
// Collapsed: nur Farbpunkt, Expanded: Dropdown mit allen Optionen

import { useProvider, PROVIDER_META, type ProviderId } from '../hooks/useProvider'

interface Props {
  collapsed?: boolean
}

function ProviderSwitch({ collapsed = false }: Props) {
  const { settings, loading, setGlobal } = useProvider()

  if (loading || !settings) return null

  const current = settings.global
  const meta = PROVIDER_META[current]

  // Collapsed: nur Farbpunkt mit Tooltip
  if (collapsed) {
    return (
      <div className="flex justify-center mb-3" title={`AI: ${meta.short}`}>
        <div
          className="w-3 h-3 rounded-full cursor-pointer"
          style={{ backgroundColor: meta.color, boxShadow: `0 0 6px ${meta.color}` }}
          onClick={() => {
            // Zyklisch durchschalten: groq → ollama_server → ollama_local → groq
            const order: ProviderId[] = ['groq', 'ollama_server', 'ollama_local']
            const idx = order.indexOf(current)
            const next = order[(idx + 1) % order.length]
            if (settings.status[next]) setGlobal(next)
          }}
        />
      </div>
    )
  }

  // Expanded: Select-Dropdown
  return (
    <div className="mb-3 px-1">
      <label
        className="block text-[0.65rem] mb-1 uppercase tracking-wider"
        style={{ color: 'var(--color-text-muted)' }}
      >
        AI Provider
      </label>
      <div className="relative">
        <div
          className="absolute left-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
          style={{ backgroundColor: meta.color, boxShadow: `0 0 4px ${meta.color}` }}
        />
        <select
          className="hud-input w-full pl-6 pr-2 py-1 text-xs"
          value={current}
          onChange={(e) => setGlobal(e.target.value as ProviderId)}
        >
          {settings.available.map((id) => {
            const m = PROVIDER_META[id]
            const online = settings.status[id]
            return (
              <option key={id} value={id} disabled={!online}>
                {m.short} {online ? '' : '(offline)'}
              </option>
            )
          })}
        </select>
      </div>
    </div>
  )
}

export default ProviderSwitch
