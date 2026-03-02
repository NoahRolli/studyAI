# AI-Service: Einheitliches Interface für Claude und Ollama
# Abstrahiert den AI-Provider — der Rest der App spricht nur mit diesem Service
# Umschaltbar via config.py oder API-Endpunkt

from backend.infra.config import AI_PROVIDER
from backend.services.claude_provider import ClaudeProvider
from backend.services.ollama_provider import OllamaProvider


# Beide Provider instanziieren
_providers = {
    "claude": ClaudeProvider(),
    "ollama": OllamaProvider(),
}

# Aktuell aktiver Provider (kann zur Laufzeit geändert werden)
_active_provider = AI_PROVIDER


def get_provider():
    """Gibt den aktuell aktiven AI-Provider zurück."""
    return _providers[_active_provider]


def set_provider(name: str):
    """
    Wechselt den aktiven AI-Provider.
    Erlaubte Werte: "claude" oder "ollama"
    """
    global _active_provider
    if name not in _providers:
        raise ValueError(f"Unbekannter Provider: '{name}'. Erlaubt: claude, ollama")
    _active_provider = name


def get_active_provider_name() -> str:
    """Gibt den Namen des aktuell aktiven Providers zurück."""
    return _active_provider


async def summarize(text: str) -> dict:
    """
    Generiert eine Zusammenfassung mit Schlüsselbegriffen.
    Gibt zurück: {"summary": str, "key_terms": list[str]}
    """
    return await get_provider().summarize(text)


async def explain_term(term: str, context: str) -> str:
    """
    Erklärt einen Fachbegriff im Kontext des Dokuments.
    Gibt eine verständliche Erklärung zurück.
    """
    return await get_provider().explain_term(term, context)


async def generate_mindmap(text: str) -> list[dict]:
    """
    Generiert eine Mindmap-Struktur aus einem Text.
    Gibt eine Liste von Knoten zurück: [{"label": str, "detail": str, "children": [...]}]
    """
    return await get_provider().generate_mindmap(text)


async def deep_dive(node_label: str, node_detail: str, context: str) -> list[dict]:
    """
    Generiert Unterknoten für einen Mindmap-Knoten (Reinzoomen).
    Gibt eine Liste von Kind-Knoten zurück.
    """
    return await get_provider().deep_dive(node_label, node_detail, context)