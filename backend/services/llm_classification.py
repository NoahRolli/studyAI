# Project-Klassifikation für LLM-Chat-Imports (Slice 1 von P5.1)
# Plan-Referenz: pallas_llm_archive_plan.md §10.1 + §10.2
#
# Hybrid-Heuristik:
#   1. Manuelle Seed-Listen für 'pallas' (44 Chats) und 'nous' (4 Chats)
#   2. Regex-Score (≥2 Treffer nötig) für 4 weitere Projects
#   3. Fallback: None → UI zeigt 'Unsortiert'
#
# Verifiziert in Chat 44 gegen den echten Export: 100% Match.

import re


# Pallas-Chats — exakte Titel aus dem Claude-Export
PALLAS_TITLES = frozenset({
    "Weiter",
    "Handoff lesen und fortsetzen",
    "Handoff lesen vor P3.5 Start",
    "Stimmungsoptionen und zusätzliche KI-Dienste integrieren",
    "Handoff-Dokumentation lesen",
    "Ontologie-Weiterentwicklung nach Handoff",
    "Naming a mythological chat assistant",
    "Geschehen handoff und to-do-liste",
    "Dropdown-Menü für AI Services verschwunden",
    "Chat 35 handoff und ergänzungen",
    "Handoff 33 durchlesen und Aufgaben zusammenfassen",
    "Größeres Gemma-Modell für Zusammenfassungen nutzen",
    "Ordner-Toggle für Metis-Sphäre-Kontrolle",
    "Weiter gehts",
    "Durchlesen und Stütze nutzen",
    "Handoff 27 und Verbindungsverwaltung",
    "Handoff 26 durchlesen und UI-Ansichten entfernen",
    "Aufgabenliste erstellen",
    "Handoff 24 durchlesen und fortfahren",
    "Handoff 23 Probleme und Design-Anpassungen",
    "Kamerafunktion und Rotationsprobleme in Metis",
    "Handoff durchlesen und nächste Schritte",
    "Handoff 20 durchlesen und nächste Schritte",
    "Handoff 19 - aktueller Stand",
    "Journal-Überarbeitung für Metis",
    "Äussere ringe der 3D sphere entfernen",
    "Chat-Nummerierung korrigieren",
    "Chat 16 continuation",
    "Los mit chat 15",
    "Pallas Datenverlust beheben",
    "Continuing chat 13",
    "Chat 12 starten",
    "Chat 11 starten",
    "Continuing chat 10",
    "Chat 9 beginnt",
    "Chat 8 starten",
    "Ollama lokal nutzen ohne externe Anfragen",
    "Fahrt fortsetzen",
    "Handoff_04",
    "Handoff durchlesen und nächste schritte",
    "Intelligentes Dokumentenverwaltungssystem mit KI-Zusammenfassungen",
    "Übergabedokumentation und Memory-Setup für Projektfortsetzung",
    "Verschlüsseltes Tagebuch-Feature mit Ollama-Integration",
})

# Nous-Chats (Server-Setup, Hardware-Themen)
NOUS_TITLES = frozenset({
    "Portabler Monitor für MacBook und Lenovo",
    "Projektstand mit Dateien klären",
    "Olymp-Infrastruktur: Lenovo-Server-Setup",
    "nous",
})

# Regex-Patterns für die übrigen 4 Projects
# Score = Anzahl matchender Patterns; mind. 2 nötig damit klassifiziert wird
REGEX_RULES = {
    "schallplattenempfehlung": [
        r"\bschallplatte", r"\bvinyl", r"\balbum\b", r"\blp\b", r"record",
    ],
    "catchKen": [r"catchken", r"catch\s?ken"],
    "Bewerbungen": [
        r"bewerbung", r"motivationsschreiben", r"lebenslauf",
        r"werkstudent", r"anschreiben", r"bewerben",
    ],
    "frauddetection": [
        # Negative Lookahead: 'anomalie' soll nicht 'schlafanomalie' o.ä. matchen
        r"\bfraud", r"detection", r"anomalie(?!.*schlaf)", r"\bbetrug",
    ],
}

# Minimaler Regex-Score für Klassifikation (siehe §10.2)
MIN_REGEX_SCORE = 2


def classify_chat(title, first_human_text):
    """
    Bestimmt project_name_guess via Hybrid-Heuristik.

    Reihenfolge:
      1. Exakter Titel-Match in PALLAS_TITLES   → "pallas"
      2. Exakter Titel-Match in NOUS_TITLES     → "nous"
      3. Regex-Score über (Titel + erste Human-Message[:500])
      4. Fallback: None ('Unsortiert')

    Args:
        title: Conversation-Titel (kann None oder "" sein)
        first_human_text: Text der ersten Human-Message (kann "" sein)

    Returns:
        Project-Name als String, oder None wenn keine Klassifikation greift.
    """
    # Titel normalisieren
    name = (title or "").strip()

    # Stufe 1+2: Exakte Seed-Liste
    if name in PALLAS_TITLES:
        return "pallas"
    if name in NOUS_TITLES:
        return "nous"

    # Stufe 3: Regex-Score über Titel + erste 500 Zeichen der ersten Human-Message
    haystack = (name + " " + (first_human_text or "")[:500]).lower()
    scores = {}
    for project, patterns in REGEX_RULES.items():
        score = sum(1 for p in patterns if re.search(p, haystack, re.IGNORECASE))
        if score > 0:
            scores[project] = score

    # Kein Match → Unsortiert
    if not scores:
        return None

    # Bester Score muss ≥ MIN_REGEX_SCORE sein
    best_project, best_score = max(scores.items(), key=lambda x: x[1])
    return best_project if best_score >= MIN_REGEX_SCORE else None
