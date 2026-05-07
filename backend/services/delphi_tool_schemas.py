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
                "Findet zu einem Thema das frueheste und spaeteste Datum, "
                "an dem darueber geschrieben wurde, plus Anzahl der Quellen "
                "und Spanne in Tagen. Nutze das fuer Fragen wie 'wie lange "
                "arbeite ich an X?' oder 'wann habe ich mit X angefangen?'."
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
                "Zaehlt wie viele Notizen, Zusammenfassungen oder Chat-Messages "
                "in einem Zeitraum erstellt wurden. Nutze das fuer Fragen wie "
                "'wie viele Pallas-Chats hatte ich im April?' oder 'wie aktiv "
                "war ich letztes Jahr?'."
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
                "Listet die aeltesten N Quellen zu einem Thema auf, mit Datum "
                "und Titel. Nutze das fuer Fragen wie 'was waren die ersten "
                "Diskussionen zu X?' oder 'was kam zuerst, X oder Y?' (zweimal "
                "aufrufen)."
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
