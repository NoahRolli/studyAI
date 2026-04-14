# AI-Service: Einheitliches Interface für alle Provider
# Routet Summarize/Mindmap/Explain an den aktiven Provider
# Auto-Fallback: Groq 429 → ollama_server → ollama_local
# Journal nutzt NICHT diesen Service (bleibt Ollama-only)

import logging
from backend.infra.config import AI_PROVIDER, OLLAMA_MODEL_LOCAL, OLLAMA_MODEL_SERVER
from backend.infra.model_router import get_active_provider
from backend.services.claude_provider import ClaudeProvider
from backend.services.ollama_provider import OllamaProvider
from backend.services.groq_provider import GroqProvider, GroqRateLimitError

logger = logging.getLogger(__name__)

# Provider-Instanzen — zwei Ollama mit unterschiedlichem Modell
_claude = ClaudeProvider()
_ollama_local = OllamaProvider(model=OLLAMA_MODEL_LOCAL)
_ollama_server = OllamaProvider(model=OLLAMA_MODEL_SERVER)
_groq = GroqProvider()

# Fallback-Kette: Server-Ollama zuerst, dann lokal
_fallback_chain = [
    ("ollama_server", _ollama_server),
    ("ollama_local", _ollama_local),
]


def get_provider():
    """Gibt den aktuell aktiven AI-Provider zurück (model_router)."""
    active = get_active_provider()
    if active == "groq":
        return _groq
    if active == "ollama_server":
        return _ollama_server
    if AI_PROVIDER == "claude":
        return _claude
    return _ollama_local


def get_active_provider_name() -> str:
    """Gibt den Namen des aktuell aktiven Providers zurück."""
    return get_active_provider()


async def _call_with_fallback(method: str, *args, **kwargs):
    """
    Ruft Methode auf aktivem Provider auf.
    Bei Groq 429 → automatisch Ollama-Fallback (Server → Local).
    Gibt Tuple (result, provider_name) zurück.
    """
    provider = get_provider()
    try:
        result = await getattr(provider, method)(*args, **kwargs)
        return result, get_active_provider()
    except (GroqRateLimitError, ConnectionError):
        logger.warning(f"Groq 429 bei {method} — starte Fallback-Kette")
        for name, fallback in _fallback_chain:
            try:
                logger.info(f"Fallback auf {name} fuer {method}")
                result = await getattr(fallback, method)(*args, **kwargs)
                return result, name
            except Exception as e:
                logger.warning(f"Fallback {name} fehlgeschlagen: {e}")
                continue
        raise ConnectionError(
            "Groq Rate Limit + alle Ollama-Fallbacks fehlgeschlagen"
        )


async def summarize(text: str) -> dict:
    """Generiert Zusammenfassung mit Schlüsselbegriffen."""
    result, _ = await _call_with_fallback("summarize", text)
    return result


async def explain_term(term: str, context: str) -> str:
    """Erklärt einen Fachbegriff im Kontext."""
    result, _ = await _call_with_fallback("explain_term", term, context)
    return result


async def generate_mindmap(text: str) -> list[dict]:
    """Generiert eine Mindmap-Struktur aus Text."""
    result, _ = await _call_with_fallback("generate_mindmap", text)
    return result


async def deep_dive(node_label: str, node_detail: str, context: str) -> list[dict]:
    """Generiert Unterknoten für einen Mindmap-Knoten."""
    result, _ = await _call_with_fallback("deep_dive", node_label, node_detail, context)
    return result


async def chat_with_fallback(prompt: str, system: str = "",
                              max_tokens: int = 4000) -> tuple[str, str]:
    """
    Chat mit Auto-Fallback. Für direkten Zugriff (z.B. concepts_ai).
    Gibt (antwort_text, provider_name) zurück.
    """
    result, name = await _call_with_fallback("chat", prompt, system, max_tokens)
    return result, name
