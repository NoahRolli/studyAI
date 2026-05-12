"""
JSON-Schemas fuer Delphi Git-Tools — B-Track Erweiterung.

Lebt separat von delphi_tool_schemas.py damit Git-Track unabhaengig
deployable/disableable ist. Eingebunden via delphi_tool_schemas.py
durch GIT_TOOL_SCHEMAS-Import + Listen-Concat.

Aenderungen hier muessen mit den Funktions-Signaturen in
delphi_tools_git.py synchron bleiben.

Schreib-Stil: die Beschreibungen enthalten explizit "wann nutzen / wann
nicht", weil der LLM sonst Git-Tools auch fuer thema-basierte Fragen
nutzen wuerde (wo get_topic_timeline besser ist).
"""

GIT_TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "git_first_commit",
            "description": (
                "Zeigt den AELTESTEN bekannten Git-Commit, optional gefiltert "
                "auf ein Repo. Nutze fuer Fragen wie 'wann habe ich mit "
                "<Projekt> begonnen', 'wann war mein erstes Commit zu X', "
                "'wie alt ist das Repo Y'. Liefert Datum, Repo, Message und "
                "einen Commit-Anker fuer Citation. Hinweis: lokale DB "
                "enthaelt nur Commits ab Inbetriebnahme der GitHub-Sync-"
                "Pipeline; aeltere Commits davor sind ggf. nicht erfasst — "
                "der Output weist darauf hin. NICHT verwenden fuer "
                "thema-basierte Fragen ('wann tauchte Konzept X auf') — "
                "dafuer ist get_topic_timeline besser."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "repo": {
                        "type": "string",
                        "description": (
                            "Optional: Repo-Name (z.B. 'pallas', 'metis'). "
                            "Weglassen fuer den aeltesten Commit ueber alle "
                            "Repos hinweg."
                        ),
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "git_commits_in_period",
            "description": (
                "Listet Commits in einem Zeitraum (inklusive Grenzen). "
                "Nutze fuer Fragen wie 'was habe ich letzte Woche gemacht', "
                "'welche Commits gab es im Maerz', 'was lief vor dem 15. "
                "April'. Gibt Total, Per-Repo-Breakdown (falls kein Filter) "
                "und eine chronologische Liste (max 100). Bei Bedarf "
                "Zeitraum verkleinern fuer mehr Detail. NICHT fuer "
                "Frequenz-Fragen ('an welchen Tagen viel gearbeitet') — "
                "dafuer ist git_commit_frequency besser."
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
                    "repo": {
                        "type": "string",
                        "description": "Optional: auf ein Repo einschraenken.",
                    },
                },
                "required": ["start_date", "end_date"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "git_commit_frequency",
            "description": (
                "Liefert ein Frequenz-Histogramm der Commits in einem "
                "Zeitraum, gruppiert nach Tag, Woche oder Monat. Macht "
                "Arbeits-Bursts und stille Phasen sichtbar. Nutze fuer "
                "Fragen wie 'wie viel habe ich im Maerz gearbeitet', 'in "
                "welcher Woche war ich am produktivsten', 'gab es Phasen "
                "ohne Aktivitaet'. Output: Total, aktive Buckets, Peak, "
                "ASCII-Balkenverteilung. Bei mehrjaehrigen Zeitraeumen "
                "group_by='month' verwenden, bei wenigen Wochen 'day'. "
                "NICHT fuer detaillierte Commit-Inhalte — dafuer "
                "git_commits_in_period."
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
                    "group_by": {
                        "type": "string",
                        "enum": ["day", "week", "month"],
                        "description": "Bucket-Granularitaet. Default 'day'.",
                    },
                    "repo": {
                        "type": "string",
                        "description": "Optional: auf ein Repo einschraenken.",
                    },
                },
                "required": ["start_date", "end_date"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "git_search_commits",
            "description": (
                "Volltext-Suche in Commit-Messages (case-insensitive). "
                "Nutze fuer Fragen wie 'alle Commits zu Metis', 'wann habe "
                "ich Encryption eingebaut', 'gab es Commits zu Mood'. Sucht "
                "rein lexikalisch (SQL LIKE), keine semantische Aehnlichkeit. "
                "Bei abstrakteren Themen ohne klares Keyword "
                "get_topic_timeline bevorzugen. Output sortiert nach "
                "Datum absteigend (neueste zuerst)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": (
                            "Suchbegriff. Wird case-insensitive als Substring "
                            "in Commit-Messages gesucht."
                        ),
                    },
                    "repo": {
                        "type": "string",
                        "description": "Optional: auf ein Repo einschraenken.",
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
            "name": "git_repo_stats",
            "description": (
                "Statistik pro Repo: Total Commits, erster/letzter Commit, "
                "aktive Tage, Commits/Tag. Nutze fuer Fragen wie 'welche "
                "Repos habe ich ueberhaupt', 'wie aktiv ist Projekt X', "
                "'welches Repo hat die meisten Commits', 'wie lange "
                "schon arbeite ich an Y'. Ohne repo-Filter: tabellarische "
                "Uebersicht aller Repos. Mit repo-Filter: detaillierte "
                "Stats fuer ein Repo inkl. Tagesschnitt."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "repo": {
                        "type": "string",
                        "description": "Optional: nur Stats fuer ein Repo.",
                    },
                },
                "required": [],
            },
        },
    },
]
