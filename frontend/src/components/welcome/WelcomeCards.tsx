// WelcomeCards — Schnellzugriff-Karten + Delphi-Eingabe für WelcomePage
// 2x3 Grid: Archiv, Journal, Kalender | Notes, Metis, Ontologie
// Darunter: Delphi-Eingabefeld (Breite = 3 Karten + 2 Gaps)

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLanguage } from '../../hooks/useLanguage'

// Karten-Definition (6 Stück → 2 Reihen à 3)
const CARDS = [
  { to: '/archiv', titleKey: 'archivTitle', descKey: 'archivDesc' },
  { to: '/journal', titleKey: 'journalTitle', descKey: 'journalDesc' },
  { to: '/calendar', titleKey: 'calendarTitle', descKey: 'calendarDesc' },
  { to: '/notes', titleKey: 'notesTitle', descKey: 'notesDesc' },
  { to: '/metis', titleKey: 'metisTitle', descKey: 'metisDesc' },
  { to: '/ontology', titleKey: 'ontologyTitle', descKey: 'ontologyDesc' },
]

// Breite exakt wie 3 Karten + 2 Gaps: 3*14rem + 2*1.5rem = 45rem
const ROW_WIDTH = 'calc(3 * 14rem + 2 * 1.5rem)'

interface Props {
  visible: boolean
  delayBase: number
}

export default function WelcomeCards({ visible, delayBase }: Props) {
  const { t, language } = useLanguage()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  const w = t.welcome as Record<string, string>

  // Karte rendern (wiederverwendbar für beide Reihen)
  const renderCard = (card: typeof CARDS[0], i: number) => (
    <Link
      key={card.to}
      to={card.to}
      className="group w-56"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition: `opacity 0.4s ease ${delayBase + i * 100}ms, transform 0.4s ease ${delayBase + i * 100}ms`,
      }}
    >
      <div
        className="hud-card p-6 rounded-lg border transition-all duration-300 h-36
          group-hover:border-[var(--color-primary)] group-hover:shadow-[0_0_20px_rgba(0,212,255,0.15)]"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <h2
          className="hud-title text-sm text-glow mb-2"
          style={{ color: 'var(--color-primary)' }}
        >
          {w[card.titleKey]}
        </h2>
        <p
          className="text-xs leading-relaxed"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {w[card.descKey]}
        </p>
      </div>
    </Link>
  )

  // Enter → navigiert zu Delphi mit Query
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && query.trim()) {
      navigate(`/delphi?q=${encodeURIComponent(query.trim())}`)
    }
  }

  return (
    <>
      {/* Erste Reihe: 3 Karten */}
      <div className="flex justify-center gap-6" style={{ width: ROW_WIDTH }}>
        {CARDS.slice(0, 3).map((card, i) => renderCard(card, i))}
      </div>

      {/* Zweite Reihe: 3 Karten */}
      <div className="flex justify-center gap-6 mt-6" style={{ width: ROW_WIDTH }}>
        {CARDS.slice(3, 6).map((card, i) => renderCard(card, i + 3))}
      </div>

      {/* Delphi — Wissens-Chat Eingabe */}
      <div
        className="mt-6"
        style={{
          width: ROW_WIDTH,
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(20px)',
          transition: `opacity 0.4s ease ${delayBase + 700}ms, transform 0.4s ease ${delayBase + 700}ms`,
        }}
      >
        <div
          className="hud-card rounded-lg border transition-all duration-300 h-24 flex flex-col
            focus-within:border-[var(--color-primary)] focus-within:shadow-[0_0_20px_rgba(0,212,255,0.15)]"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center gap-2 px-5 pt-3 pb-1">
            <h2
              className="hud-title text-sm text-glow tracking-wide"
              style={{ color: 'var(--color-primary)', fontFamily: "'Orbitron', monospace" }}
            >
              Delphi
            </h2>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              — {w.delphiDesc}
            </span>
          </div>
          <div className="flex-1 px-5 pb-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={language === 'de' ? 'Frag dein Wissen...' : 'Ask your knowledge...'}
              className="w-full h-full bg-transparent text-sm outline-none"
              style={{ color: 'var(--color-text-primary)' }}
            />
          </div>
        </div>
      </div>
    </>
  )
}
