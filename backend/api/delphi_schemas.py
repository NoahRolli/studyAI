"""
Delphi API — Pydantic-Input-Schemas + ORM-zu-Dict-Helper.

Pallas-Stil: Pydantic nur fuer Request-Bodies, Output via _to_dict()-Helper
(siehe notes.py, calendar.py). Haelt Response-Schemas flexibel und vermeidet
Boilerplate.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

from backend.models.delphi_models import (
    DelphiConversation,
    DelphiMessage,
    DelphiCitation,
)


# ---------- Input-Schemas ----------
class CreateConversationIn(BaseModel):
    """Optional Title vorgeben; wenn leer, wird er aus erster Frage generiert."""
    title: Optional[str] = None


class UpdateConversationIn(BaseModel):
    """Partial-Update: alle Felder optional. Nur gesetzte werden geupdated."""
    title: Optional[str] = None
    keep_active: Optional[bool] = None
    is_archived: Optional[bool] = None


class SendMessageIn(BaseModel):
    """User-Message fuer POST /conversations/{id}/messages."""
    content: str = Field(..., min_length=1, max_length=5000)


# ---------- Helper-Funktionen ----------
def _iso(dt: Optional[datetime]) -> Optional[str]:
    """Datetime zu ISO-String; None bleibt None."""
    return dt.isoformat() if dt else None


def _citation_to_dict(c: DelphiCitation) -> dict:
    """Citation als JSON-serialisierbares Dict."""
    return {
        "id": c.id,
        "citation_index": c.citation_index,
        "source_type": c.source_type,
        "source_id": c.source_id,
        "title": c.preview_text.split("\n", 1)[0] if c.preview_text else "",
        "preview_text": c.preview_text or "",
        "similarity_score": c.similarity_score,
    }


def _message_to_dict(m: DelphiMessage, include_citations: bool = True) -> dict:
    """DelphiMessage zu Dict, optional mit Citations."""
    out = {
        "id": m.id,
        "conversation_id": m.conversation_id,
        "turn_index": m.turn_index,
        "role": m.role,
        "content": m.content,
        "confidence": m.confidence,
        "provider": m.provider,
        "model": m.model,
        "has_unverified_claims": m.has_unverified_claims,
        "created_at": _iso(m.created_at),
    }
    if include_citations:
        out["citations"] = [_citation_to_dict(c) for c in m.citations]
    return out


def _conversation_summary_to_dict(
    conv: DelphiConversation,
    message_count: int,
) -> dict:
    """Conversation als Listen-Eintrag (ohne Messages, mit Counter)."""
    return {
        "id": conv.id,
        "title": conv.title,
        "created_at": _iso(conv.created_at),
        "updated_at": _iso(conv.updated_at),
        "last_message_at": _iso(conv.last_message_at),
        "is_archived": conv.is_archived,
        "keep_active": conv.keep_active,
        "archived_doc_id": conv.archived_doc_id,
        "message_count": message_count,
    }


def _conversation_detail_to_dict(conv: DelphiConversation) -> dict:
    """Conversation mit allen Messages + Citations (Detail-View)."""
    return {
        "id": conv.id,
        "title": conv.title,
        "created_at": _iso(conv.created_at),
        "updated_at": _iso(conv.updated_at),
        "last_message_at": _iso(conv.last_message_at),
        "is_archived": conv.is_archived,
        "keep_active": conv.keep_active,
        "archived_doc_id": conv.archived_doc_id,
        "messages": [_message_to_dict(m) for m in conv.messages],
    }


def _generate_title_from_content(content: str, max_chars: int = 60) -> str:
    """Auto-Title aus erster User-Message: erste Zeile, getrimmt."""
    first_line = content.strip().split("\n", 1)[0].strip()
    if len(first_line) <= max_chars:
        return first_line or "Neue Konversation"
    return first_line[:max_chars - 1].rstrip() + "…"
