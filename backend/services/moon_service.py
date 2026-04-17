# Moon Service — Mondphase berechnen ohne externe API
# Synodischer Zyklus: 29.53059 Tage
# Referenz-Neumond: 6. Januar 2000 18:14 UTC

from datetime import datetime, timezone


SYNODIC_MONTH = 29.53059
# Referenz-Neumond (bekannter Neumond-Zeitpunkt)
REFERENCE_NEW_MOON = datetime(2000, 1, 6, 18, 14, 0, tzinfo=timezone.utc)

# Phasen-Namen mit Bereich (0-1 normalisiert)
PHASE_NAMES_DE = [
    (0.000, 0.025, "Neumond"),
    (0.025, 0.225, "Zunehmende Sichel"),
    (0.225, 0.275, "Erstes Viertel"),
    (0.275, 0.475, "Zunehmender Mond"),
    (0.475, 0.525, "Vollmond"),
    (0.525, 0.725, "Abnehmender Mond"),
    (0.725, 0.775, "Letztes Viertel"),
    (0.775, 0.975, "Abnehmende Sichel"),
    (0.975, 1.000, "Neumond"),
]

PHASE_NAMES_EN = [
    (0.000, 0.025, "New Moon"),
    (0.025, 0.225, "Waxing Crescent"),
    (0.225, 0.275, "First Quarter"),
    (0.275, 0.475, "Waxing Gibbous"),
    (0.475, 0.525, "Full Moon"),
    (0.525, 0.725, "Waning Gibbous"),
    (0.725, 0.775, "Last Quarter"),
    (0.775, 0.975, "Waning Crescent"),
    (0.975, 1.000, "New Moon"),
]

# Unicode-Symbole fuer Mondphasen
PHASE_SYMBOLS = [
    (0.000, 0.025, "\U0001F311"),  # Neumond
    (0.025, 0.225, "\U0001F312"),  # Zunehmende Sichel
    (0.225, 0.275, "\U0001F313"),  # Erstes Viertel
    (0.275, 0.475, "\U0001F314"),  # Zunehmender Mond
    (0.475, 0.525, "\U0001F315"),  # Vollmond
    (0.525, 0.725, "\U0001F316"),  # Abnehmender Mond
    (0.725, 0.775, "\U0001F317"),  # Letztes Viertel
    (0.775, 0.975, "\U0001F318"),  # Abnehmende Sichel
    (0.975, 1.000, "\U0001F311"),  # Neumond
]


def get_moon_phase(date_str: str) -> dict:
    """Berechnet Mondphase fuer ein Datum (YYYY-MM-DD)."""
    dt = datetime.strptime(date_str, "%Y-%m-%d").replace(
        hour=12, tzinfo=timezone.utc
    )
    # Tage seit Referenz-Neumond
    diff = (dt - REFERENCE_NEW_MOON).total_seconds() / 86400.0
    # Position im Zyklus (0.0 = Neumond, 0.5 = Vollmond)
    cycle_pos = (diff % SYNODIC_MONTH) / SYNODIC_MONTH

    # Phase bestimmen
    name_de = "Unbekannt"
    name_en = "Unknown"
    symbol = ""
    for low, high, name in PHASE_NAMES_DE:
        if low <= cycle_pos < high:
            name_de = name
            break
    for low, high, name in PHASE_NAMES_EN:
        if low <= cycle_pos < high:
            name_en = name
            break
    for low, high, sym in PHASE_SYMBOLS:
        if low <= cycle_pos < high:
            symbol = sym
            break

    return {
        "phase": round(cycle_pos, 4),
        "name_de": name_de,
        "name_en": name_en,
        "symbol": symbol,
        "illumination": round(
            1 - abs(2 * cycle_pos - 1), 3
        ),
    }
