# Ollama Connector — Dynamische URL-Auflösung mit Multi-Primary + Fallback
# Primary-URLs: Kommasepariert (z.B. LAN + WireGuard)
# Fallback: Lokales Ollama auf dem Server (CPU)
# Ergebnis wird 60s gecacht, bei Fehler sofort invalidiert

import time
import httpx
import os
import logging

logger = logging.getLogger(__name__)

# URLs aus Env-Variablen
# OLLAMA_PRIMARY_URL: Kommaseparierte Liste (LAN, VPN etc.)
# OLLAMA_BASE_URL: Fallback (immer vorhanden)
_PRIMARY_URLS_RAW = os.environ.get("OLLAMA_PRIMARY_URL", "")
_PRIMARY_URLS = [u.strip() for u in _PRIMARY_URLS_RAW.split(",") if u.strip()]
_FALLBACK_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")

# Für Status-Endpoint: aktuelle Primary-URL (wird dynamisch gesetzt)
_PRIMARY_URL = _PRIMARY_URLS[0] if _PRIMARY_URLS else ""

# Cache: aktive URL + Zeitstempel
_cached_url: str = _FALLBACK_URL
_cache_timestamp: float = 0.0
_CACHE_TTL: float = 60.0


def invalidate_cache():
    """Cache invalidieren — erzwingt neue URL-Suche beim nächsten Aufruf."""
    global _cache_timestamp
    _cache_timestamp = 0.0
    logger.info("Ollama URL-Cache invalidiert")


async def get_ollama_url() -> str:
    """
    Gibt die aktuell erreichbare Ollama-URL zurück.
    Probiert alle Primary-URLs mit kurzem Timeout, fällt auf Fallback zurück.
    Ergebnis wird 60 Sekunden gecacht.
    """
    global _cached_url, _cache_timestamp, _PRIMARY_URL

    # Keine Primaries konfiguriert → immer Fallback
    if not _PRIMARY_URLS:
        return _FALLBACK_URL

    # Cache noch gültig → gespeicherte URL zurückgeben
    now = time.time()
    if now - _cache_timestamp < _CACHE_TTL:
        return _cached_url

    # Alle Primary-URLs durchprobieren
    async with httpx.AsyncClient(timeout=2.0) as client:
        for url in _PRIMARY_URLS:
            try:
                response = await client.get(f"{url}/api/tags")
                if response.status_code == 200:
                    _cached_url = url
                    _PRIMARY_URL = url
                    _cache_timestamp = now
                    logger.info(f"Ollama Primary erreichbar: {url}")
                    return _cached_url
            except Exception:
                continue

    # Keine Primary erreichbar → Fallback
    _cached_url = _FALLBACK_URL
    _PRIMARY_URL = ""
    _cache_timestamp = now
    logger.info(f"Keine Primary erreichbar, Fallback: {_FALLBACK_URL}")
    return _cached_url
