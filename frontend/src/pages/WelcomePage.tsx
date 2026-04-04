// WelcomePage — Begrüssungsseite mit Intro-Animation
// PALLAS Titel erscheint zentriert, schwebt nach oben,
// dann tauchen Karten gestaffelt auf.
// Animation spielt bei jedem Besuch der Seite.

import { useState, useEffect } from 'react'
import { useLanguage } from '../hooks/useLanguage'
import LanguageToggle from '../components/LanguageToggle'
import ThemeSelector from '../components/ThemeSelector'
import WelcomeCards from '../components/welcome/WelcomeCards'

// Animations-Phasen (ms) — Total ~2.5s
const TITLE_FADE_IN = 0
const TITLE_MOVE_START = 800
const TITLE_MOVE_DURATION = 700
const CARDS_START = TITLE_MOVE_START + 400

function WelcomePage() {
  const { t } = useLanguage()
  const [phase, setPhase] = useState<'center' | 'moving' | 'done'>('center')
  const [cardsVisible, setCardsVisible] = useState(false)

  useEffect(() => {
    // Phase 1: Titel zentriert halten
    const moveTimer = setTimeout(() => {
      setPhase('moving')
    }, TITLE_MOVE_START)

    // Phase 2: Titel ist oben angekommen
    const doneTimer = setTimeout(() => {
      setPhase('done')
    }, TITLE_MOVE_START + TITLE_MOVE_DURATION)

    // Phase 3: Karten erscheinen
    const cardsTimer = setTimeout(() => {
      setCardsVisible(true)
    }, CARDS_START)

    return () => {
      clearTimeout(moveTimer)
      clearTimeout(doneTimer)
      clearTimeout(cardsTimer)
    }
  }, [])

  // Titel-Position: zentriert → oben
  const titleStyle = (): React.CSSProperties => {
    if (phase === 'center') {
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        opacity: 1,
        transition: 'opacity 0.5s ease',
        zIndex: 10,
      }
    }
    return {
      position: 'fixed',
      top: '0',
      left: '50%',
      transform: 'translate(-50%, 0)',
      paddingTop: '4rem',
      opacity: 1,
      transition: `top ${TITLE_MOVE_DURATION}ms ease-in-out, transform ${TITLE_MOVE_DURATION}ms ease-in-out, padding ${TITLE_MOVE_DURATION}ms ease-in-out`,
      zIndex: 10,
    }
  }

  // Karten-Container: unsichtbar bis Animation fertig
  const contentStyle = (): React.CSSProperties => ({
    opacity: phase === 'done' ? 1 : 0,
    transition: 'opacity 0.4s ease',
  })

  return (
    <div className="flex-1 flex flex-col items-center px-8 pt-16 min-h-screen">

      {/* Animierter Titel-Block */}
      <div
        className="flex flex-col items-center text-center pointer-events-none"
        style={titleStyle()}
      >
        <h1
          className="hud-title text-glow text-5xl font-bold mb-3 tracking-widest animate-fade-in"
          style={{
            color: 'var(--color-primary)',
            animationDuration: '0.6s',
            animationDelay: `${TITLE_FADE_IN}ms`,
          }}
        >
          PALLAS
        </h1>
        <p
          className="text-sm tracking-wide animate-fade-in"
          style={{
            color: 'var(--color-text-muted)',
            animationDuration: '0.6s',
            animationDelay: '250ms',
          }}
        >
          {t.welcome.subtitle}
        </p>
      </div>

      {/* Platzhalter für Titel */}
      <div className="mb-12" style={{ height: '80px' }} />

      {/* Karten + Agenda */}
      <div
        className="flex flex-col items-center w-full"
        style={contentStyle()}
      >
        <WelcomeCards visible={cardsVisible} delayBase={0} />

        {/* Footer */}
        <div className="mt-auto pb-6 pt-8 flex flex-col items-center gap-4">
          <div className="flex items-center gap-4">
            <ThemeSelector />
            <LanguageToggle />
          </div>
          <p
            className="text-xs"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {t.welcome.hint}
          </p>
        </div>
      </div>
    </div>
  )
}

export default WelcomePage
