# Ollama Status-Endpunkt — zeigt welche Ollama-Instanz aktiv ist
# Wird vom Frontend gepollt um MacBook vs Server anzuzeigen
# Nutzt den bestehenden ollama_connector für URL-Auflösung

from fastapi import APIRouter
from backend.infra.ollama_connector import get_ollama_url, _PRIMARY_URLS, _FALLBACK_URL

router = APIRouter(prefix="/api/ollama", tags=["ollama"])


@router.get("/status")
async def ollama_status():
    """
    Gibt die aktive Ollama-Instanz zurück.
    instance: 'macbook' (Primary in LAN oder VPN) oder 'server' (Fallback, CPU)
    """
    url = await get_ollama_url()

    # MacBook wenn aktive URL in der Primary-Liste ist
    if _PRIMARY_URLS and url in _PRIMARY_URLS:
        instance = "macbook"
    else:
        instance = "server"

    return {
        "url": url,
        "instance": instance,
        "available": True,
    }
