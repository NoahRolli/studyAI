// JournalSetup — Passwort setzen beim ersten Mal
// Wird angezeigt wenn is_setup === false

interface JournalSetupProps {
  password: string
  onPasswordChange: (pw: string) => void
  onSetup: () => void
}

function JournalSetup({ password, onPasswordChange, onSetup }: JournalSetupProps) {
  return (
    <div className="max-w-md">
      <div className="hud-card p-6 animate-glow-pulse">
        <h2
          className="hud-title text-lg mb-2"
          style={{ color: 'var(--color-primary)' }}
        >
          Journal einrichten
        </h2>
        <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          Setze ein Passwort für dein verschlüsseltes Tagebuch.
          Dieses Passwort kann nicht zurückgesetzt werden.
        </p>
        <div className="mb-4">
          <label
            className="block text-xs mb-1"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Passwort
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            placeholder="Mindestens 8 Zeichen"
            className="hud-input"
          />
        </div>
        <button
          onClick={onSetup}
          disabled={password.length < 8}
          className="hud-btn hud-btn-primary w-full"
        >
          Journal einrichten
        </button>
      </div>
    </div>
  )
}

export default JournalSetup