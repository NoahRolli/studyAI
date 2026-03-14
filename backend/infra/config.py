# Zentrale Konfiguration für das pallas Backend
# Enthält Pfade, Datenbank-URL und AI-Provider Einstellungen

from pathlib import Path

# Pfade
# BASE_DIR zeigt auf das Hauptverzeichnis des Projekts (pallas/)
# .parent.parent.parent weil: config.py → infra/ → backend/ → pallas/
BASE_DIR = Path(__file__).parent.parent.parent

# Storage: SSD-Symlink bevorzugt, lokaler Fallback wenn SSD nicht angeschlossen
STORAGE_DIR = BASE_DIR / "backend_storage"
if not STORAGE_DIR.exists():
    # Fallback auf lokalen Ordner (z.B. wenn SSD nicht verbunden)
    STORAGE_DIR = BASE_DIR / "local_storage"

# Ordner erstellen falls er noch nicht existiert
import os
os.makedirs(STORAGE_DIR, exist_ok=True)

# Datenbank
DATABASE_URL = f"sqlite:///{BASE_DIR}/pallas.db"

# AI Provider: "claude" oder "ollama"
AI_PROVIDER = "ollama"

# Claude API
CLAUDE_API_KEY = ""  # Später in .env auslagern
CLAUDE_MODEL = "claude-sonnet-4-20250514"

# Ollama
OLLAMA_BASE_URL = "http://localhost:11434"
OLLAMA_MODEL = "llama3.2"
