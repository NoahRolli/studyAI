# Settings API — Provider-Steuerung für das Frontend
# GET/PUT globaler Provider, GET/PUT Page-Overrides
# Gibt auch Provider-Status zurück (verfügbar/nicht verfügbar)

from fastapi import APIRouter
from pydantic import BaseModel
from backend.infra.model_router import (
    get_active_provider, set_active_provider,
    set_page_override, get_all_settings, get_model_used,
)
from backend.services.groq_provider import GroqProvider
from backend.services.ollama_provider import OllamaProvider

router = APIRouter(prefix="/api/settings", tags=["settings"])

# Provider-Instanzen für Availability-Check
_groq = GroqProvider()
_ollama = OllamaProvider()


class ProviderUpdate(BaseModel):
    provider: str

class PageOverride(BaseModel):
    page: str
    provider: str | None = None


@router.get("/provider")
async def get_provider_settings():
    """Gibt kompletten Provider-Status zurück."""
    settings = get_all_settings()
    # Verfügbarkeit prüfen
    groq_ok = await _groq.is_available()
    ollama_ok = await _ollama.is_available()
    settings["status"] = {
        "ollama_local": ollama_ok,
        "ollama_server": ollama_ok,
        "groq": groq_ok,
    }
    return settings


@router.put("/provider")
async def update_provider(body: ProviderUpdate):
    """Setzt den globalen Default-Provider."""
    try:
        new = set_active_provider(body.provider)
        return {"global": new, "model_used": get_model_used(new)}
    except ValueError as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/provider/page")
async def update_page_override(body: PageOverride):
    """Setzt oder entfernt einen Page-Override."""
    try:
        overrides = set_page_override(body.page, body.provider)
        return {"pages": overrides}
    except ValueError as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=str(e))
