# API-Endpunkte für LLM-Archiv (P5.1 Slice 1b)
# GET  /api/llm/conversations/{document_id} — liefert Conversation + Messages für Viewer
# PATCH /api/llm/conversations/{document_id} — erlaubt Korrektur von project_name_guess
#
# Lookup-Kette: document_id → LLMConversation.document_id → LLMMessage.conversation_id.
# Memory und Project-Docs brauchen keinen eigenen Endpoint — sie sind normale Documents
# und gehen über /api/documents.

from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.models.database import get_db
from backend.models.document import Document
from backend.models.llm import LLMConversation, LLMMessage

router = APIRouter(prefix="/api/llm", tags=["llm"])


# --- Response-Schemas ---

class LLMMessageOut(BaseModel):
    """Ein einzelner Message-Turn, Plaintext-ready für den Chat-Viewer."""
    id: int
    turn_index: int
    role: str                         # "human" | "assistant"
    text: str                         # gerenderte Plaintext-Repr
    thinking: Optional[str] = None    # collapsed im Viewer
    has_tools: bool = False
    created_at: datetime
    attachments_info: Optional[Any] = None

    class Config:
        from_attributes = True        # SQLAlchemy → Pydantic


class LLMConversationOut(BaseModel):
    """Conversation-Metadaten für den Viewer."""
    id: int
    document_id: int
    external_uuid: str
    title: Optional[str] = None
    summary_from_provider: Optional[str] = None
    provider_created_at: datetime
    provider_updated_at: datetime
    project_name_guess: Optional[str] = None
    message_count: int
    has_thinking: bool
    has_tools: bool

    class Config:
        from_attributes = True


class LLMConversationDetail(BaseModel):
    """Full Payload für den Viewer: Conversation + alle Messages."""
    conversation: LLMConversationOut
    messages: list[LLMMessageOut]


class LLMConversationPatch(BaseModel):
    """PATCH-Body — nur project_name_guess ist editierbar."""
    project_name_guess: Optional[str] = Field(
        default=None,
        description="Manuelle Korrektur der Project-Zuordnung. null = Unsortiert."
    )


# --- Endpoints ---

@router.get("/conversations/{document_id}", response_model=LLMConversationDetail)
def get_llm_conversation(
    document_id: int,
    db: Session = Depends(get_db),
) -> LLMConversationDetail:
    """
    Liefert Conversation-Metadaten + alle Messages (sortiert nach turn_index).

    404 wenn document_id keine LLMConversation-Zuordnung hat.
    raw_content wird bewusst NICHT zurückgegeben (zu gross für Default-Response).
    """
    conv = db.query(LLMConversation).filter(
        LLMConversation.document_id == document_id
    ).first()
    if not conv:
        raise HTTPException(
            status_code=404,
            detail=f"Keine LLM-Conversation für document_id={document_id}",
        )

    messages = (
        db.query(LLMMessage)
        .filter(LLMMessage.conversation_id == conv.id)
        .order_by(LLMMessage.turn_index.asc())
        .all()
    )

    return LLMConversationDetail(
        conversation=LLMConversationOut.model_validate(conv),
        messages=[LLMMessageOut.model_validate(m) for m in messages],
    )


@router.patch("/conversations/{document_id}", response_model=LLMConversationOut)
def patch_llm_conversation(
    document_id: int,
    data: LLMConversationPatch,
    db: Session = Depends(get_db),
) -> LLMConversationOut:
    """
    Aktualisiert project_name_guess (manuelle Korrektur). Andere Felder
    sind read-only. Leerer String wird zu NULL ("Unsortiert").
    """
    conv = db.query(LLMConversation).filter(
        LLMConversation.document_id == document_id
    ).first()
    if not conv:
        raise HTTPException(
            status_code=404,
            detail=f"Keine LLM-Conversation für document_id={document_id}",
        )

    # Leerer String → NULL (Frontend sendet evtl. "" beim Clear)
    new_value = data.project_name_guess
    if new_value is not None and new_value.strip() == "":
        new_value = None
    conv.project_name_guess = new_value

    db.commit()
    db.refresh(conv)
    return LLMConversationOut.model_validate(conv)
