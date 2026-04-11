// LoadingDot — Pulsierende Lade-Anzeige fuer AI-Operationen
// Kleiner Punkt mit Pulse-Animation, inline neben Text nutzbar

interface Props {
  active: boolean
  color?: string
}

export default function LoadingDot({ active, color }: Props) {
  if (!active) return null
  return (
    <span
      className="inline-block w-2 h-2 rounded-full animate-pulse ml-1.5"
      style={{ background: color || 'var(--color-primary)' }}
    />
  )
}
