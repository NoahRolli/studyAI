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

# --- AI Provider System (3 Stufen) ---
# ollama_local: MacBook gemma4:e2b (Apple Silicon, schnell)
# ollama_server: Olymp gemma4:e4b (CPU, grösseres Modell)
# groq: Cloud llama-3.3-70b-versatile (schnell, bestes Modell)
# Journal nutzt IMMER Ollama — nie Groq (erzwungen in journal_ai_service)
PROVIDERS = ["ollama_local", "ollama_server", "groq"]
DEFAULT_PROVIDER = os.environ.get("PALLAS_DEFAULT_PROVIDER", "groq")

# Legacy: wird noch von ai_service.py genutzt (claude/ollama Switch für Study)
AI_PROVIDER = os.environ.get("PALLAS_AI_PROVIDER", "ollama")

# Claude API (nur Study-Features: Summarize, Mindmap)
CLAUDE_API_KEY = os.environ.get("CLAUDE_API_KEY", "")
CLAUDE_MODEL = "claude-sonnet-4-20250514"

# Ollama — Zwei Instanzen mit unterschiedlichen Modellen
# Local: MacBook (Apple Silicon, e2b)
# Server: Olymp (CPU, e4b — grösser, bessere Qualität)
OLLAMA_PRIMARY_URL = os.environ.get("OLLAMA_PRIMARY_URL", "")
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "gemma4:e2b")
OLLAMA_MODEL_LOCAL = os.environ.get("OLLAMA_MODEL_LOCAL", "gemma4:e2b")
OLLAMA_MODEL_SERVER = os.environ.get("OLLAMA_MODEL_SERVER", "gemma4:e4b")
OLLAMA_EMBED_MODEL = "nomic-embed-text"

# Groq Cloud API (kostenlos, LPU-Hardware, grosses Modell)
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_BASE_URL = "https://api.groq.com/openai/v1"

# GitHub — Public API für Commit-Kalender + Zeittracking
GITHUB_USERNAME = os.environ.get("GITHUB_USERNAME", "NoahRolli")
