// DelphiPage — Wissens-Chat
// Beantwortet Fragen basierend auf gesammeltem Wissen aller Pallas-Module
// (Archiv, Journal, Notes, Ontologie, Kalender, Metis)

import { useLanguage } from '../hooks/useLanguage'

function DelphiPage() {
  const { t } = useLanguage()

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8">
      <h1
        className="hud-title text-glow text-3xl font-bold mb-4 tracking-widest"
        style={{ color: 'var(--color-primary)', fontFamily: "'Orbitron', monospace" }}
      >
        Delphi
      </h1>
      <p
        className="text-sm"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {t.sidebar.delphi} — Coming soon
      </p>
    </div>
  )
}

export default DelphiPage
