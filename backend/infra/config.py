from pathlib import Path

# Pfade
BASE_DIR = Path(__file__).parent.parent.parent
STORAGE_DIR = BASE_DIR / "backend_storage"
STORAGE_DIR.mkdir(exist_ok=True)

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