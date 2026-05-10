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
                "Findet Quellen zu einem Thema und liefert Verteilung "
                "pro Monat (Burst-Pattern), Spannweite, und Anker-Info. "
                "Nutzt einen Cluster-Filter: wenn das Top-Match-Concept "
                "in einem thematisch passenden Cluster liegt, werden nur "
                "Sources dieses Clusters beruecksichtigt. Wenn kein "
                "klarer Cluster gefunden wird, faellt das Tool auf einen "
                "breiteren Embedding-Match zurueck — die erste Zeile der "
                "Antwort sagt welcher Modus aktiv ist. Achtung: auch mit "
                "Cluster-Filter kann eine fruehe Erwaehnung aus "
                "abweichendem Kontext stammen — das Histogramm zeigt ob "
                "es ein Burst-Pattern oder einzelne Outlier sind."
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
                "Messages in einem Zeitraum erstellt wurden. Im Gegen"
                "satz zu get_topic_timeline und list_oldest_sources "
                "kennt dieses Tool kein Thema — es zaehlt ALLE Eintraege "
                "im Zeitraum. Nutze fuer Aktivitaetsmuster ueber Zeit, "
                "nicht fuer projekt-spezifische Counts."
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
