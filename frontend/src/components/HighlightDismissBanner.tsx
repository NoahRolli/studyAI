// HighlightDismissBanner — kleiner Pill oben rechts mit dem aktiven Highlight-Term
// und X-Button. Zeigt sich nur wenn ein Highlight aktiv ist.

interface Props {
  term: string
  onDismiss: () => void
}

export default function HighlightDismissBanner({ term, onDismiss }: Props) {
  return (
    <div
      className="fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full hud-card text-xs"
      style={{
        background: 'var(--color-bg-deep)',
        borderColor: 'var(--color-accent-cyan)',
        boxShadow: '0 0 12px rgba(0, 212, 255, 0.4)',
      }}
    >
      <span style={{ color: 'var(--color-text-muted)' }}>Hervorgehoben:</span>
      <span style={{ color: 'var(--color-accent-cyan)', fontWeight: 500 }}>{term}</span>
      <button
        onClick={onDismiss}
        className="ml-1 hover:opacity-100 opacity-70"
        style={{ color: 'var(--color-text-primary)' }}
        aria-label="Highlight entfernen"
      >
        X
      </button>
    </div>
  )
}
