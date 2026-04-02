# Ollama Status-Endpunkt — zeigt welche Ollama-Instanz aktiv ist
# Wird vom Frontend gepollt um MacBook vs Server anzuzeigen
# Nutzt den bestehenden ollama_connector für URL-Auflösung

from fastapi import APIRouter
from backend.infra.ollama_connector import get_ollama_url, _PRIMARY_URL, _FALLBACK_URL

router = APIRouter(prefix="/api/ollama", tags=["ollama"])


@router.get("/status")
async def ollama_status():
    """
    Gibt die aktive Ollama-Instanz zurück.
    instance: 'macbook' (Primary, Apple Silicon) oder 'server' (Fallback, CPU)
    """
    url = await get_ollama_url()

    # Instanz-Name ableiten: Primary = MacBook, alles andere = Server
    if _PRIMARY_URL and url == _PRIMARY_URL:
        instance = "macbook"
    else:
        instance = "server"

    return {
        "url": url,
        "instance": instance,
        "available": True,
    }
