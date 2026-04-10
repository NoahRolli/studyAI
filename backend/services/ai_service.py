# AI-Service: Einheitliches Interface für alle Provider
# Routet Summarize/Mindmap/Explain an den aktiven Provider
# Nutzt model_router für 3-Stufen System (groq/ollama_local/ollama_server)
# Legacy: Claude bleibt als Option für Study-Features

from backend.infra.config import AI_PROVIDER
from backend.infra.model_router import get_active_provider
from backend.services.claude_provider import ClaudeProvider
from backend.services.ollama_provider import OllamaProvider
from backend.services.groq_provider import GroqProvider


# Provider-Instanzen
_claude = ClaudeProvider()
_ollama = OllamaProvider()
_groq = GroqProvider()


def get_provider():
    """Gibt den aktuell aktiven AI-Provider zurück (model_router)."""
    active = get_active_provider()
    if active == "groq":
        return _groq
    # Claude wird nur genutzt wenn explizit als Legacy konfiguriert
    if AI_PROVIDER == "claude":
        return _claude
    return _ollama


def get_active_provider_name() -> str:
    """Gibt den Namen des aktuell aktiven Providers zurück."""
    return get_active_provider()


async def summarize(text: str) -> dict:
    """Generiert Zusammenfassung mit Schlüsselbegriffen."""
    return await get_provider().summarize(text)


async def explain_term(term: str, context: str) -> str:
    """Erklärt einen Fachbegriff im Kontext."""
    return await get_provider().explain_term(term, context)


async def generate_mindmap(text: str) -> list[dict]:
    """Generiert eine Mindmap-Struktur aus Text."""
    return await get_provider().generate_mindmap(text)


async def deep_dive(node_label: str, node_detail: str, context: str) -> list[dict]:
    """Generiert Unterknoten für einen Mindmap-Knoten."""
    return await get_provider().deep_dive(node_label, node_detail, context)
