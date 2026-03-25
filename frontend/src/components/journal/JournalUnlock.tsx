// JournalUnlock — Passwort eingeben um Journal zu entsperren
// Wird angezeigt wenn is_setup === true aber is_unlocked === false

interface JournalUnlockProps {
  password: string
  onPasswordChange: (pw: string) => void
  onUnlock: () => void
}

function JournalUnlock({ password, onPasswordChange, onUnlock }: JournalUnlockProps) {
  return (
    <div className="max-w-md">
      <div className="hud-card p-6 animate-glow-pulse">
        <h2
          className="hud-title text-lg mb-2"
          style={{ color: 'var(--color-primary)' }}
        >
          Journal entsperren
        </h2>
        <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          Gib dein Passwort ein um auf deine Einträge zuzugreifen.
        </p>
        <div className="mb-4">
          <input
            type="password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            placeholder="Passwort eingeben"
            onKeyDown={(e) => e.key === 'Enter' && onUnlock()}
            className="hud-input"
          />
        </div>
        <button
          onClick={onUnlock}
          disabled={!password}
          className="hud-btn hud-btn-primary w-full"
        >
          Entsperren
        </button>
      </div>
    </div>
  )
}

export default JournalUnlock