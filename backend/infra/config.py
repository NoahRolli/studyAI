# Zentrale Konfiguration für das StudyAI Backend
# Enthält Pfade, Datenbank-URL und AI-Provider Einstellungen

from pathlib import Path

# Pfade
# BASE_DIR zeigt auf das Hauptverzeichnis des Projekts (studyAI/)
# .parent.parent.parent weil: config.py → infra/ → backend/ → studyAI/
BASE_DIR = Path(__file__).parent.parent.parent
STORAGE_DIR = BASE_DIR / "backend_storage"

# Hinweis: backend_storage ist ein Symlink zur SSD
# Der Symlink wurde manuell erstellt und muss nicht automatisch erzeugt werden

# Datenbank
DATABASE_URL = f"sqlite:///{BASE_DIR}/studyai.db"

# AI Provider: "claude" oder "ollama"
AI_PROVIDER = "ollama"

# Claude API
CLAUDE_API_KEY = ""  # Später in .env auslagern
CLAUDE_MODEL = "claude-sonnet-4-20250514"

# Ollama
OLLAMA_BASE_URL = "http://localhost:11434"
OLLAMA_MODEL = "llama3.2"
