# Ollama Connector — Dynamische URL-Aufloesung mit Multi-Primary + Fallback + Cooldown
# Primary-URLs: Kommasepariert (z.B. LAN + WireGuard)
# Fallback: Lokales Ollama auf dem Server (CPU)
# Bei Chat-Timeouts: report_failure(url) aufrufen — URL kommt in Cooldown
# Bei N Fails in Folge: URL wird fuer COOLDOWN_SECONDS aus Auswahl ausgeschlossen

import time
import httpx
import os
import logging

logger = logging.getLogger(__name__)

# URLs aus Env-Variablen
_PRIMARY_URLS_RAW = os.environ.get("OLLAMA_PRIMARY_URL", "")
_PRIMARY_URLS = [u.strip() for u in _PRIMARY_URLS_RAW.split(",") if u.strip()]
_FALLBACK_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")

# Fuer Status-Endpoint
_PRIMARY_URL = _PRIMARY_URLS[0] if _PRIMARY_URLS else ""

# Cache
_cached_url: str = _FALLBACK_URL
_cache_timestamp: float = 0.0
_CACHE_TTL: float = 30.0  # war 60s — kuerzer fuer schnellere Recovery

# Failure-Tracking pro URL
_failure_counts: dict[str, int] = {}
_cooldown_until: dict[str, float] = {}
_FAILURE_THRESHOLD: int = 2       # nach 2 Fails in Folge → Cooldown
_COOLDOWN_SECONDS: float = 60.0   # 60s Cooldown


def invalidate_cache():
    """Cache invalidieren — erzwingt neue URL-Suche beim naechsten Aufruf."""
    global _cache_timestamp
    _cache_timestamp = 0.0
    logger.info("Ollama URL-Cache invalidiert")


def report_failure(url: str):
    """
    Wird aufgerufen wenn ein Chat-Call auf einer URL fehlschlaegt.
    Nach _FAILURE_THRESHOLD Fails in Folge: URL kommt in Cooldown.
    """
    global _cache_timestamp
    if not url or url == _FALLBACK_URL:
        return  # Fallback nicht in Cooldown schicken
    _failure_counts[url] = _failure_counts.get(url, 0) + 1
    count = _failure_counts[url]
    if count >= _FAILURE_THRESHOLD:
        _cooldown_until[url] = time.time() + _COOLDOWN_SECONDS
        _failure_counts[url] = 0
        _cache_timestamp = 0.0  # Cache invalidieren damit naechster Call neue URL waehlt
        logger.warning(
            f"Ollama URL {url} nach {count} Fails in Cooldown "
            f"fuer {_COOLDOWN_SECONDS}s"
        )
    else:
        logger.info(f"Ollama URL {url} Fail-Count: {count}/{_FAILURE_THRESHOLD}")


def report_success(url: str):
    """Wird bei erfolgreichem Chat-Call aufgerufen — resetet Failure-Counter."""
    if url in _failure_counts:
        _failure_counts[url] = 0


def _is_in_cooldown(url: str) -> bool:
    """Prueft ob URL aktuell in Cooldown ist."""
    until = _cooldown_until.get(url, 0.0)
    return time.time() < until


async def get_ollama_url() -> str:
    """
    Gibt die aktuell erreichbare Ollama-URL zurueck.
    Probiert alle Primary-URLs (ausser in Cooldown) mit kurzem Timeout.
    Faellt auf Fallback zurueck wenn keine Primary verfuegbar.
    Ergebnis wird _CACHE_TTL Sekunden gecacht.
    """
    global _cached_url, _cache_timestamp, _PRIMARY_URL

    # Keine Primaries konfiguriert → immer Fallback
    if not _PRIMARY_URLS:
        return _FALLBACK_URL

    # Cache noch gueltig + gecachte URL nicht in Cooldown → gecachte URL zurueckgeben
    now = time.time()
    if now - _cache_timestamp < _CACHE_TTL and not _is_in_cooldown(_cached_url):
        return _cached_url

    # Alle Primary-URLs durchprobieren — Cooldown-URLs ueberspringen
    async with httpx.AsyncClient(timeout=3.0) as client:
        for url in _PRIMARY_URLS:
            if _is_in_cooldown(url):
                logger.info(
                    f"Ollama URL {url} in Cooldown "
                    f"(noch {_cooldown_until[url] - now:.0f}s), ueberspringe"
                )
                continue
            try:
                response = await client.get(f"{url}/api/tags")
                if response.status_code == 200:
                    _cached_url = url
                    _PRIMARY_URL = url
                    _cache_timestamp = now
                    logger.info(f"Ollama Primary erreichbar: {url}")
                    return _cached_url
            except Exception as e:
                logger.info(
                    f"Ollama Primary nicht erreichbar {url}: "
                    f"{type(e).__name__}"
                )
                continue

    # Keine Primary erreichbar (oder alle in Cooldown) → Fallback
    _cached_url = _FALLBACK_URL
    _PRIMARY_URL = ""
    _cache_timestamp = now
    logger.info(f"Keine Primary erreichbar, Fallback: {_FALLBACK_URL}")
    return _cached_url
