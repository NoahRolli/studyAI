# Zentrale Konfiguration für das pallas Backend
# Enthält Pfade, Datenbank-URL und AI-Provider Einstellungen
# Env-Variablen überschreiben Defaults (für Docker-Deployment)
import os
from pathlib import Path

# Pfade
# BASE_DIR zeigt auf das Hauptverzeichnis des Projekts (pallas/)
# .parent.parent.parent weil: config.py → infra/ → backend/ → pallas/
BASE_DIR = Path(__file__).parent.parent.parent

# Storage: SSD-Symlink bevorzugt, lokaler Fallback wenn SSD nicht angeschlossen
# resolve() folgt dem Symlink — wenn das Ziel nicht existiert, nehmen wir den Fallback
# Im Docker-Modus wird STORAGE_DIR via Env-Variable gesetzt
STORAGE_DIR_ENV = os.environ.get("PALLAS_STORAGE_DIR")
if STORAGE_DIR_ENV:
    STORAGE_DIR = Path(STORAGE_DIR_ENV)
else:
    STORAGE_DIR = BASE_DIR / "backend_storage"
    try:
        STORAGE_DIR.resolve(strict=True)
    except (OSError, FileNotFoundError):
        STORAGE_DIR = BASE_DIR / "local_storage"

# Ordner erstellen falls er noch nicht existiert
os.makedirs(STORAGE_DIR, exist_ok=True)

# Datenbank — Env-Variable überschreibt Default (für Docker: /data/pallas.db)
DB_PATH = os.environ.get("PALLAS_DB_PATH", str(BASE_DIR / "pallas.db"))
DATABASE_URL = f"sqlite:///{DB_PATH}"

# AI Provider: "claude" oder "ollama"
AI_PROVIDER = os.environ.get("PALLAS_AI_PROVIDER", "ollama")

# Claude API
CLAUDE_API_KEY = os.environ.get("CLAUDE_API_KEY", "")
CLAUDE_MODEL = "claude-sonnet-4-20250514"

# Ollama — Primary (MacBook) mit Fallback (lokal)
# OLLAMA_PRIMARY_URL: Schnelles MacBook-Ollama (optional, leer = deaktiviert)
# OLLAMA_BASE_URL: Fallback auf lokales Ollama
OLLAMA_PRIMARY_URL = os.environ.get("OLLAMA_PRIMARY_URL", "")
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "gemma4:e2b")
OLLAMA_EMBED_MODEL = "nomic-embed-text"  # Für Metis Embeddings

# GitHub — Public API für Commit-Kalender + Zeittracking
GITHUB_USERNAME = os.environ.get("GITHUB_USERNAME", "NoahRolli")
