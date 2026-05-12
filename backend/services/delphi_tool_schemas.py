"""
JSON-Schemas fuer Delphi Tools — getrennt von der Implementierung in
delphi_tools.py weil das hier API-Contract ist (Format vorgeschrieben
von Groq Tool-Use API), nicht Domain-Logik.

Aenderungen hier muessen mit den Funktions-Signaturen in delphi_tools.py
synchron bleiben.
"""

# ---------- Tool-Schema fuer Groq Tool-Use API ----------
TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "get_topic_timeline",
            "description": (
                "Hauptwerkzeug fuer thema-bezogene Zeit-Fragen wie "
                "'wann begann X', 'wie lange arbeite ich an X', "
                "'was wurde wann zu X diskutiert'. Liefert ein "
                "Histogramm pro Monat, Spannweite, und einen Anker-"
                "Header der den Modus zeigt: Cluster-gefiltert "
                "(thematisch enger) oder Fallback (breiter, kann "
                "mehrdeutig sein). Bei Burst-Pattern (1 Outlier + "
                "spaeterer dichter Block) zaehlt der Block, nicht der "
                "Outlier. Bei Vergleichsfragen ('was kam zuerst, X "
                "oder Y?') zweimal aufrufen, einmal pro Topic."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "topic": {
                        "type": "string",
                        "description": "Thema oder Schlagwort, z.B. 'Pallas', 'Metis', 'Journal-Verschluesselung'.",
                    },
                },
                "required": ["topic"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "count_sources_per_period",
            "description": (
                "Zaehlt globale Aktivitaet (Anzahl Notizen / Zusammen"
                "fassungen / Chats) in einem Zeitraum. NICHT fuer "
                "thema-bezogene Fragen ('wie lange arbeite ich an "
                "Pallas?' -> get_topic_timeline statt diesem). Dieses "
                "Tool kennt kein Thema, es zaehlt ALLE Eintraege im "
                "Zeitraum. Nutze nur fuer Fragen wie 'wie viele "
                "Eintraege habe ich im Maerz erstellt'."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "start_date": {"type": "string", "description": "Startdatum YYYY-MM-DD"},
                    "end_date": {"type": "string", "description": "Enddatum YYYY-MM-DD"},
                    "source_type": {
                        "type": "string",
                        "enum": ["note", "summary", "chat_message"],
                        "description": "Optional: nur einen Typ zaehlen. Weglassen fuer alle.",
                    },
                },
                "required": ["start_date", "end_date"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_oldest_sources",
            "description": (
                "Listet die aeltesten N Quellen zu einem Thema auf. "
                "Nutzt den gleichen Cluster-Filter wie get_topic_timeline "
                "— die Tool-Antwort meldet im Header ob ein Cluster aktiv "
                "ist oder ein Fallback laeuft. Bei aktivem Cluster sind "
                "die Treffer thematisch enger; im Fallback (kein klarer "
                "Cluster gefunden) kann die Liste mehrdeutige Begriffe "
                "irrefuehrend einsortieren — pruefe die Titel auf "
                "Plausibilitaet. Nicht als alleinige Quelle fuer "
                "Projektstart-Fragen verwenden."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "topic": {"type": "string", "description": "Thema oder Schlagwort."},
                    "limit": {
                        "type": "integer",
                        "description": "Anzahl Quellen (1-20, default 5).",
                        "default": 5,
                    },
                },
                "required": ["topic"],
            },
        },
    },
]


# ---------- Git-Tools (B-Track, V2) ----------
# Separater Schema-File damit Git-Tracking als Modul unabhaengig
# enable/disable bleibt.
from backend.services.delphi_tool_schemas_git import GIT_TOOL_SCHEMAS

TOOL_SCHEMAS = TOOL_SCHEMAS + GIT_TOOL_SCHEMAS

from backend.services.delphi_tool_schemas_calendar import CALENDAR_TOOL_SCHEMAS

TOOL_SCHEMAS = TOOL_SCHEMAS + CALENDAR_TOOL_SCHEMAS
