"""
JSON-Schemas fuer Delphi Calendar-Tools — B-Track Erweiterung.

Parallel zu delphi_tool_schemas_git.py. Eingebunden ueber
delphi_tool_schemas.py durch CALENDAR_TOOL_SCHEMAS-Import + Listen-Concat.

Aenderungen hier muessen mit den Funktions-Signaturen in
delphi_tools_calendar.py synchron bleiben.

Hinweis im Wording: bei mehreren Tool-Wahlen sagen wann ein anderes
besser passt — verhindert dass der LLM Calendar nutzt fuer Fragen die
eigentlich Topic-Timeline brauchen oder umgekehrt.
"""

CALENDAR_TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "calendar_events_in_period",
            "description": (
                "Listet Kalender-Events in einem Zeitraum, inklusive "
                "wiederkehrender Instanzen. Nutze fuer Fragen wie 'was "
                "steht naechste Woche an', 'was hatte ich im Maerz', "
                "'welche Termine kommen vor X'. Recurrence (daily/weekly/"
                "monthly/yearly) wird automatisch expandiert — du bekommst "
                "die einzelnen Termine, nicht die Regel. Optional query-"
                "Filter auf Titel und Beschreibung. NICHT fuer thema-"
                "bezogene Wissensfragen ohne Termin-Kontext — dafuer ist "
                "get_topic_timeline da."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "start_date": {
                        "type": "string",
                        "description": "Startdatum YYYY-MM-DD (inklusive).",
                    },
                    "end_date": {
                        "type": "string",
                        "description": "Enddatum YYYY-MM-DD (inklusive, bis Tagesende).",
                    },
                    "query": {
                        "type": "string",
                        "description": (
                            "Optional: Substring-Filter auf Event-Titel und "
                            "Beschreibung (case-insensitive)."
                        ),
                    },
                },
                "required": ["start_date", "end_date"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calendar_search_events",
            "description": (
                "Volltext-Suche in Kalender-Events ueber Titel + "
                "Beschreibung. Nutze fuer Fragen wie 'wann habe ich "
                "<Person/Thema> getroffen', 'gab es einen Termin zu X', "
                "'wann war meine letzte <Aktivitaet>'. Lexikalische Suche "
                "(SQL LIKE), keine Embedding-Aehnlichkeit. Bei "
                "wiederkehrenden Events wird das Base-Event gezeigt — "
                "ueber 'recurrence=...' Marker erkennbar. Sortiert nach "
                "Datum absteigend. Fuer 'was hatte ich genau in Woche X' "
                "ist calendar_events_in_period mit query-Filter besser."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Suchbegriff (z.B. Personenname, Thema).",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Anzahl Treffer (1-50, default 10).",
                        "default": 10,
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calendar_next_event",
            "description": (
                "Liefert das naechste anstehende Event ab jetzt, optional "
                "gefiltert. Nutze fuer Fragen wie 'wann ist mein naechster "
                "Arzttermin', 'was kommt als naechstes', 'wann sehe ich "
                "<Person> wieder'. Beruecksichtigt Recurrence — die "
                "naechste Instanz eines wiederkehrenden Events kommt in "
                "Betracht. Such-Window default 1 Jahr ab heute."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": (
                            "Optional: Substring-Filter (z.B. 'Arzt', 'Uni')."
                        ),
                    },
                    "days_ahead": {
                        "type": "integer",
                        "description": "Such-Fenster in Tagen (default 365, max 1825).",
                        "default": 365,
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calendar_event_frequency",
            "description": (
                "Zaehlt Event-Instanzen in einem Zeitraum, gruppiert nach "
                "Tag/Woche/Monat, optional gefiltert auf query. Nutze fuer "
                "Fragen wie 'wie oft Uni diesen Monat', 'wie viele Arzt-"
                "termine im Jahr', 'wann hatte ich die meisten Termine'. "
                "Recurrence wird expandiert — wiederkehrende Events "
                "zaehlen pro Instanz. Bei langem Zeitraum group_by='month', "
                "bei kurzem 'day' verwenden."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "start_date": {
                        "type": "string",
                        "description": "Startdatum YYYY-MM-DD.",
                    },
                    "end_date": {
                        "type": "string",
                        "description": "Enddatum YYYY-MM-DD.",
                    },
                    "query": {
                        "type": "string",
                        "description": (
                            "Optional: nur Events deren Titel/Beschreibung "
                            "diesen Substring enthaelt."
                        ),
                    },
                    "group_by": {
                        "type": "string",
                        "enum": ["day", "week", "month"],
                        "description": "Bucket-Granularitaet. Default 'week'.",
                    },
                },
                "required": ["start_date", "end_date"],
            },
        },
    },
]
