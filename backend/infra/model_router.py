# Model Router — Zentrale Steuerung welcher AI-Provider genutzt wird
# 3 Stufen: ollama_local, ollama_server, groq
# Global Default + Page-Overrides (z.B. Metis nutzt groq, Archiv nutzt Server)
# Journal wird hier NICHT geroutet (bleibt Ollama-only in journal_ai_service)

import logging
from backend.infra.config import (
    DEFAULT_PROVIDER, PROVIDERS,
    GROQ_MODEL, OLLAMA_MODEL_LOCAL, OLLAMA_MODEL_SERVER,
)

logger = logging.getLogger(__name__)

# Laufzeit-State: globaler Provider (änderbar per API)
_active_provider: str = DEFAULT_PROVIDER

# Laufzeit-State: Seiten-Overrides (z.B. {"metis": "ollama_server"})
_page_overrides: dict[str, str] = {}


def get_active_provider(page: str | None = None) -> str:
    """Gibt den aktiven Provider zurück — Page-Override vor Global."""
    if page and page in _page_overrides:
        return _page_overrides[page]
    return _active_provider


def set_active_provider(provider: str) -> str:
    """Setzt den globalen Provider. Gibt den neuen Wert zurück."""
    global _active_provider
    if provider not in PROVIDERS:
        raise ValueError(f"Unbekannter Provider: {provider}. Erlaubt: {PROVIDERS}")
    _active_provider = provider
    logger.info(f"Globaler Provider geändert: {provider}")
    return _active_provider


def set_page_override(page: str, provider: str | None) -> dict:
    """Setzt oder entfernt einen Seiten-Override."""
    global _page_overrides
    if provider is None:
        _page_overrides.pop(page, None)
        logger.info(f"Page-Override entfernt: {page}")
    else:
        if provider not in PROVIDERS:
            raise ValueError(f"Unbekannter Provider: {provider}")
        _page_overrides[page] = provider
        logger.info(f"Page-Override gesetzt: {page} → {provider}")
    return _page_overrides


def get_all_settings() -> dict:
    """Gibt kompletten Provider-Status zurück (für Frontend)."""
    return {
        "global": _active_provider,
        "pages": dict(_page_overrides),
        "available": PROVIDERS,
        "models": {
            "ollama_local": OLLAMA_MODEL_LOCAL,
            "ollama_server": OLLAMA_MODEL_SERVER,
            "groq": GROQ_MODEL,
        },
    }


def get_model_used(provider: str | None = None, page: str | None = None) -> str:
    """
    Gibt model_used String zurück für DB-Tracking.
    Format: "provider:modellname" z.B. "groq:llama-3.3-70b-versatile"
    """
    p = provider or get_active_provider(page)
    models = {
        "groq": f"groq:{GROQ_MODEL}",
        "ollama_server": f"ollama_server:{OLLAMA_MODEL_SERVER}",
        "ollama_local": f"ollama_local:{OLLAMA_MODEL_LOCAL}",
    }
    return models.get(p, f"unknown:{p}")
