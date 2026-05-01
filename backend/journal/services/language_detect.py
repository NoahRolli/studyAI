# Language Detection — Inhalts-Sprache von Journal-Eintraegen erkennen
#
# Trennt Inhalts-Sprache (von langdetect) von UI-Sprache (useLanguage Hook).
# Genutzt von generate_title() um Titel in der Sprache des Inhalts zu erzeugen.
#
# Verhalten:
# - Bei Text < MIN_LENGTH (30 Zeichen): nutze fallback (zu wenig Signal)
# - Bei langdetect-Fehler: nutze fallback (defensiv)
# - Bei erfolgreichen Detect: gib "de" oder "en" zurueck
#   (andere Sprachen werden auf fallback gemappt — Pallas unterstuetzt aktuell nur de/en)

from typing import Literal
from langdetect import detect, LangDetectException, DetectorFactory

# Deterministischer Output - wichtig fuer Tests + Reproduzierbarkeit
DetectorFactory.seed = 0

# Mindestlaenge fuer zuverlaessige Detection
# Bei sehr kurzen Texten ist langdetect unreliable
MIN_LENGTH = 30

# Sprachen die Pallas aktuell unterstuetzt
SUPPORTED_LANGUAGES = {"de", "en"}


def detect_content_language(
    text: str,
    fallback: Literal["de", "en"] = "de",
) -> Literal["de", "en"]:
    """
    Erkennt die Sprache eines Textes. Gibt nur de oder en zurueck.
    Bei zu kurzem Text oder Erkennungs-Fehler: fallback.
    """
    if not text or len(text.strip()) < MIN_LENGTH:
        return fallback

    try:
        detected = detect(text)
        # langdetect kann 55+ Sprachen erkennen, wir mappen auf de/en
        if detected in SUPPORTED_LANGUAGES:
            return detected  # type: ignore[return-value]
        return fallback
    except LangDetectException:
        return fallback
