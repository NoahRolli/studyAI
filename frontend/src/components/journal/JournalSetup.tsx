// JournalSetup — Passwort setzen beim ersten Mal
// Wird angezeigt wenn is_setup === false

import { useLanguage } from '../../hooks/useLanguage'

interface JournalSetupProps {
  password: string
  onPasswordChange: (pw: string) => void
  onSetup: () => void
}

function JournalSetup({ password, onPasswordChange, onSetup }: JournalSetupProps) {
  const { t } = useLanguage()

  return (
    <div className="max-w-md">
      <div className="hud-card p-6 animate-glow-pulse">
        <h2
          className="hud-title text-lg mb-2"
          style={{ color: 'var(--color-primary)' }}
        >
          {t.journalSetup.title}
        </h2>
        <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          {t.journalSetup.description}
        </p>
        <div className="mb-4">
          <label
            className="block text-xs mb-1"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {t.journalSetup.passwordLabel}
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            placeholder={t.journalSetup.passwordPlaceholder}
            className="hud-input"
          />
        </div>
        <button
          onClick={onSetup}
          disabled={password.length < 8}
          className="hud-btn hud-btn-primary w-full"
        >
          {t.journalSetup.submit}
        </button>
      </div>
    </div>
  )
}

export default JournalSetup