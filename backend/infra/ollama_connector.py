# Ollama Connector — Dynamische URL-Auflösung mit Fallback
# Primary: MacBook-Ollama (schnell, Apple Silicon)
# Fallback: Lokales Ollama auf dem Server (langsamer, CPU)
# Ergebnis wird gecacht um nicht bei jedem Request zu pingen
# Wird von allen Ollama-nutzenden Services importiert

import time
import httpx
import os
import logging

logger = logging.getLogger(__name__)

# URLs aus Env-Variablen
# OLLAMA_PRIMARY_URL: MacBook (optional, leer = kein Primary)
# OLLAMA_BASE_URL: Fallback (immer vorhanden, Default localhost)
_PRIMARY_URL = os.environ.get("OLLAMA_PRIMARY_URL", "")
_FALLBACK_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")

# Cache: aktive URL + Zeitstempel der letzten Prüfung
_cached_url: str = _FALLBACK_URL
_cache_timestamp: float = 0.0
_CACHE_TTL: float = 60.0  # Sekunden bis zur nächsten Prüfung


async def get_ollama_url() -> str:
    """
    Gibt die aktuell erreichbare Ollama-URL zurück.
    Prüft Primary mit kurzem Timeout, fällt auf Fallback zurück.
    Ergebnis wird 60 Sekunden gecacht.
    """
    global _cached_url, _cache_timestamp

    # Kein Primary konfiguriert → immer Fallback
    if not _PRIMARY_URL:
        return _FALLBACK_URL

    # Cache noch gültig → gespeicherte URL zurückgeben
    now = time.time()
    if now - _cache_timestamp < _CACHE_TTL:
        return _cached_url

    # Primary mit kurzem Timeout prüfen
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(f"{_PRIMARY_URL}/api/tags")
            if response.status_code == 200:
                _cached_url = _PRIMARY_URL
                _cache_timestamp = now
                logger.info(f"Ollama Primary erreichbar: {_PRIMARY_URL}")
                return _cached_url
    except Exception:
        pass

    # Primary nicht erreichbar → Fallback
    _cached_url = _FALLBACK_URL
    _cache_timestamp = now
    logger.info(f"Ollama Primary nicht erreichbar, Fallback: {_FALLBACK_URL}")
    return _cached_url
