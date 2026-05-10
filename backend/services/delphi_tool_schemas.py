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
                "Findet semantisch zu einem Thema passende Quellen und "
                "deren Datums-Range (frueheste/spaeteste Erwaehnung, "
                "Anzahl, Spanne in Tagen). ACHTUNG: Suche basiert auf "
                "Embedding-Aehnlichkeit, nicht auf direkter Topic-Mitglied"
                "schaft. Treffer koennen thematisch verwandt aber inhalt"
                "lich anders sein (z.B. ein Code-Chat den das Tool "
                "semantisch zu 'Pallas' matched, ohne dass er ueber das "
                "Pallas-Projekt geht). Nutze fuer Annaeherungen, nicht "
                "fuer harte Daten wie Projektstart."
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
                "Zaehlt wie viele Notizen, Zusammenfassungen oder Chat-"
                "Messages in einem Zeitraum erstellt wurden. Zaehlt ALLE "
                "Eintraege im Zeitraum, ohne Topic-Filter — kann nicht "
                "nach Pallas-bezogen filtern. Nutze fuer Aktivitaets"
                "muster ueber Zeit, nicht fuer projekt-spezifische Counts."
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
                "Listet die aeltesten N Quellen auf, deren Embedding "
                "semantisch zu einem Thema passt. ACHTUNG: aelteste "
                "semantisch passende Quelle != Projektstart oder "
                "Themen-Beginn. Wenn der Nutzer nach 'wann habe ich "
                "angefangen' fragt, ist diese Liste oft IRREFUEHREND, "
                "weil generische Code-Chats semantisch zu Tech-Themen "
                "passen koennen. Nutze fuer 'welche frueheren Quellen "
                "haben Bezug zu X' (Annaeherung), nicht fuer harte "
                "Anfangs-Daten."
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
