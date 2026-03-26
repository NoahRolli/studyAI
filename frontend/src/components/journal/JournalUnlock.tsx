// JournalUnlock — Passwort eingeben um Journal zu entsperren
// Wird angezeigt wenn is_setup === true aber is_unlocked === false

import { useLanguage } from '../../hooks/useLanguage'

interface JournalUnlockProps {
  password: string
  onPasswordChange: (pw: string) => void
  onUnlock: () => void
}

function JournalUnlock({ password, onPasswordChange, onUnlock }: JournalUnlockProps) {
  const { t } = useLanguage()

  return (
    <div className="max-w-md">
      <div className="hud-card p-6 animate-glow-pulse">
        <h2
          className="hud-title text-lg mb-2"
          style={{ color: 'var(--color-primary)' }}
        >
          {t.journalUnlock.title}
        </h2>
        <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          {t.journalUnlock.description}
        </p>
        <div className="mb-4">
          <input
            type="password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            placeholder={t.journalUnlock.placeholder}
            onKeyDown={(e) => e.key === 'Enter' && onUnlock()}
            className="hud-input"
          />
        </div>
        <button
          onClick={onUnlock}
          disabled={!password}
          className="hud-btn hud-btn-primary w-full"
        >
          {t.journalUnlock.submit}
        </button>
      </div>
    </div>
  )
}

export default JournalUnlock