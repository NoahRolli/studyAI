# Fuzzy Mood — Übersetzt Mood-Scores in unscharfe Zugehörigkeiten
# Membership-Funktionen: sehr_schlecht, schlecht, neutral, gut, sehr_gut
# Überlappende Trapez/Dreieck-Funktionen (keine harten Grenzen)
#
# Eingabe: Score -1.0 bis 1.0 (aus Ollama Mood-Analyse)
# Ausgabe: Dict mit Zugehörigkeitsgraden pro Kategorie (0.0–1.0)
#
# Beispiel: score=0.35 → {neutral: 0.3, gut: 0.7}
# Wird in Insights + AI-Summary genutzt für natürlichere Beschreibungen

from typing import NamedTuple


class FuzzySet(NamedTuple):
    """Trapez-Definition: [a, b, c, d] — steigt ab a, voll ab b, voll bis c, fällt bis d."""
    a: float
    b: float
    c: float
    d: float


# Fuzzy Sets für Stimmung (überlappend, decken -1.0 bis 1.0 ab)
MOOD_SETS: dict[str, FuzzySet] = {
    "sehr_schlecht": FuzzySet(-1.0, -1.0, -0.7, -0.4),
    "schlecht":      FuzzySet(-0.7, -0.45, -0.25, -0.05),
    "neutral":       FuzzySet(-0.25, -0.1, 0.1, 0.25),
    "gut":           FuzzySet(0.05, 0.25, 0.45, 0.7),
    "sehr_gut":      FuzzySet(0.4, 0.7, 1.0, 1.0),
}

# Labels für Frontend (DE/EN)
MOOD_LABELS = {
    "de": {
        "sehr_schlecht": "Sehr schlecht",
        "schlecht": "Schlecht",
        "neutral": "Neutral",
        "gut": "Gut",
        "sehr_gut": "Sehr gut",
    },
    "en": {
        "sehr_schlecht": "Very bad",
        "schlecht": "Bad",
        "neutral": "Neutral",
        "gut": "Good",
        "sehr_gut": "Very good",
    },
}

# Farben pro Kategorie (für Frontend-Balken)
MOOD_COLORS = {
    "sehr_schlecht": "#ef4444",
    "schlecht": "#f97316",
    "neutral": "#eab308",
    "gut": "#4ade80",
    "sehr_gut": "#22d3ee",
}


def _trapez_membership(x: float, fs: FuzzySet) -> float:
    """Berechnet Zugehörigkeitsgrad für Trapez-Funktion."""
    a, b, c, d = fs
    if x <= a or x >= d:
        return 0.0
    if b <= x <= c:
        return 1.0
    if a < x < b:
        return (x - a) / (b - a)
    # c < x < d
    return (d - x) / (d - c)


def fuzzify(score: float) -> dict[str, float]:
    """
    Übersetzt einen Mood-Score in Fuzzy-Zugehörigkeiten.
    Gibt nur Kategorien mit Zugehörigkeit > 0 zurück.

    >>> fuzzify(0.35)
    {'gut': 0.78, 'neutral': 0.0, ...}  # nur >0 Werte
    """
    score = max(-1.0, min(1.0, score))
    result = {}
    for name, fs in MOOD_SETS.items():
        mu = _trapez_membership(score, fs)
        if mu > 0.0:
            result[name] = round(mu, 2)
    return result


def dominant_mood(score: float) -> str:
    """Gibt die Kategorie mit höchster Zugehörigkeit zurück."""
    memberships = fuzzify(score)
    if not memberships:
        return "neutral"
    return max(memberships, key=memberships.get)


def fuzzify_series(scores: list[float]) -> dict[str, float]:
    """
    Fuzzy-Durchschnitt über eine Reihe von Scores.
    Gibt mittlere Zugehörigkeiten pro Kategorie zurück.
    Nützlich für Wochen-/Monatsauswertungen.
    """
    if not scores:
        return {}
    totals: dict[str, float] = {}
    counts: dict[str, int] = {}
    for s in scores:
        for name, mu in fuzzify(s).items():
            totals[name] = totals.get(name, 0.0) + mu
            counts[name] = counts.get(name, 0) + 1
    # Durchschnitt über alle Einträge (nicht nur die mit mu>0)
    n = len(scores)
    return {
        name: round(totals[name] / n, 2)
        for name in MOOD_SETS
        if name in totals and totals[name] > 0
    }


def describe_fuzzy(memberships: dict[str, float], lang: str = "de") -> str:
    """
    Erzeugt natürlichsprachliche Beschreibung der Fuzzy-Zugehörigkeiten.
    z.B. "Gut (0.7), Neutral (0.3)" oder "Very good (0.85)"
    """
    labels = MOOD_LABELS.get(lang, MOOD_LABELS["de"])
    # Sortiert nach Zugehörigkeit absteigend
    sorted_m = sorted(memberships.items(), key=lambda x: x[1], reverse=True)
    parts = [f"{labels[name]} ({mu})" for name, mu in sorted_m if mu > 0.05]
    return ", ".join(parts) if parts else labels["neutral"]


def fuzzy_for_prompt(scores: list[float]) -> str:
    """
    Erzeugt eine Fuzzy-Zusammenfassung für AI-Prompts.
    z.B. "Stimmung: überwiegend Gut (0.65), teils Neutral (0.25)"
    """
    if not scores:
        return "Keine Stimmungsdaten"
    avg = fuzzify_series(scores)
    if not avg:
        return "Stimmung: unklar"
    sorted_m = sorted(avg.items(), key=lambda x: x[1], reverse=True)
    labels = MOOD_LABELS["de"]
    parts = [f"{labels[name]} ({mu})" for name, mu in sorted_m if mu > 0.05]
    return f"Stimmungsverteilung: {', '.join(parts)}"
