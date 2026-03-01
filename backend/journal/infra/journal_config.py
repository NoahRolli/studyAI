# Konfiguration für das Journal-Modul
# Komplett getrennt von der pallas-Hauptkonfiguration
# Sicherheitsprinzip: Alle sensiblen Daten bleiben lokal

from pathlib import Path

# Pfade
# Journal-DB liegt NICHT in der pallas-DB — komplett separate Datenbank
BASE_DIR = Path(__file__).parent.parent.parent.parent
JOURNAL_DB_PATH = BASE_DIR / "journal.db"
JOURNAL_DATABASE_URL = f"sqlite:///{JOURNAL_DB_PATH}"

# Argon2id Parameter für Passwort-Hashing
# Hohe Werte = langsamer aber sicherer gegen Brute-Force
ARGON2_MEMORY_COST = 65536      # 64 MB RAM-Nutzung
ARGON2_TIME_COST = 3            # 3 Iterationen
ARGON2_PARALLELISM = 4          # 4 parallele Threads
ARGON2_HASH_LENGTH = 32         # 256-bit Hash (für AES-256 Key)
ARGON2_SALT_LENGTH = 16         # 128-bit Salt

# AES-256-GCM Verschlüsselung
AES_KEY_LENGTH = 32             # 256-bit Schlüssel
AES_IV_LENGTH = 12              # 96-bit IV (empfohlen für GCM)

# Ollama — EINZIGER erlaubter AI-Provider für Journal
# Kein Fallback auf Claude, kein gemeinsamer Code-Pfad
OLLAMA_BASE_URL = "http://localhost:11434"
OLLAMA_CHAT_MODEL = "llama3.2"              # Für Sentiment, Storylines
OLLAMA_EMBED_MODEL = "nomic-embed-text"     # Für Embeddings/Clustering

# Session-Einstellungen
# AES-Key lebt nur im RAM, wird bei Server-Neustart gelöscht

SESSION_TIMEOUT_MINUTES = 30    # Nach 30 Min Inaktivität automatisch sperren

# Zusätzliche Sperr-Optionen (vom User in der UI einstellbar)
# Diese Werte sind die Standardeinstellungen — User kann sie ändern
LOCK_ON_NAVIGATE_AWAY = True    # Sperren wenn User die Journal-Seite verlässt
LOCK_ON_SCREEN_LOCK = True      # Sperren wenn Laptop gesperrt wird (via Frontend)
LOCK_ON_TAB_SWITCH = False      # Sperren bei Browser-Tab-Wechsel (Standard: aus, wäre nervig)
LOCK_ON_IDLE_ENABLED = True     # Inaktivitäts-Timer aktiv?