"""
Delphi API — REST-Endpoints fuer Knowledge-Chat.

POST   /api/delphi/conversations                  Neue Conversation
GET    /api/delphi/conversations                  Liste (active vs archived)
GET    /api/delphi/conversations/{id}             Detail mit allen Messages
POST   /api/delphi/conversations/{id}/messages    Frage stellen, Antwort syncron
PATCH  /api/delphi/conversations/{id}             Partial-Update (Title/Flags)
DELETE /api/delphi/conversations/{id}             Conversation + Messages loeschen

Slice 1: synchron, kein Streaming, kein Auto-Archive (kommt in File 5).
"""

import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.models.database import get_db
from backend.models.delphi_models import (
    DelphiConversation,
    DelphiMessage,
    DelphiCitation,
)
from backend.services.delphi_retrieval import retrieve_for_query, RetrievalResult
from backend.services.delphi_provider import generate_delphi_response
from backend.api.delphi_schemas import (
    CreateConversationIn,
    UpdateConversationIn,
    SendMessageIn,
    _message_to_dict,
    _conversation_summary_to_dict,
    _conversation_detail_to_dict,
    _generate_title_from_content,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["delphi"])


# ---------- Helpers ----------
def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _get_conversation_or_404(
    conv_id: int, db: Session
) -> DelphiConversation:
    conv = db.query(DelphiConversation).filter(
        DelphiConversation.id == conv_id
    ).first()
    if not conv:
        raise HTTPException(404, f"Conversation {conv_id} nicht gefunden")
    return conv


def _next_turn_index(conv_id: int, db: Session) -> int:
    """Naechster turn_index fuer eine Conversation (0-basiert)."""
    max_idx = db.query(func.max(DelphiMessage.turn_index)).filter(
        DelphiMessage.conversation_id == conv_id
    ).scalar()
    return 0 if max_idx is None else max_idx + 1


def _persist_assistant_message(
    conv_id: int,
    turn_index: int,
    response,                # ProviderResponse
    retrieval: RetrievalResult,
    db: Session,
) -> DelphiMessage:
    """Speichert assistant-Message + Citations (nur fuer real existierende Sources)."""
    msg = DelphiMessage(
        conversation_id=conv_id,
        turn_index=turn_index,
        role="assistant",
        content=response.answer,
        confidence=retrieval.confidence,
        provider=response.provider,
        model=response.model,
        has_unverified_claims=response.has_unverified_claims,
    )
    db.add(msg)
    db.flush()  # Damit msg.id verfuegbar ist

    # Defensive: nur Citations speichern fuer Indices die wir tatsaechlich
    # in retrieval.sources haben. Phantom-Citations vom LLM ignorieren.
    n_sources = len(retrieval.sources)
    for cite_idx in response.cited_indices:
        if cite_idx < 1 or cite_idx > n_sources:
            logger.warning(
                f"Phantom-Citation [{cite_idx}] in msg {msg.id} ignoriert "
                f"(nur {n_sources} Sources vorhanden)"
            )
            continue
        src = retrieval.sources[cite_idx - 1]
        cit = DelphiCitation(
            message_id=msg.id,
            citation_index=cite_idx,
            source_type=src.source_type,
            source_id=src.source_id,
            similarity_score=src.similarity_score,
            preview_text=f"{src.title}\n{src.preview_text}",
        )
        db.add(cit)

    return msg


# ---------- Endpoints ----------
@router.post("/api/delphi/conversations")
def create_conversation(
    body: CreateConversationIn,
    db: Session = Depends(get_db),
):
    """Neue (leere) Conversation. Title optional; sonst beim ersten Send gesetzt."""
    conv = DelphiConversation(
        title=body.title or "Neue Konversation",
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return _conversation_summary_to_dict(conv, message_count=0)


@router.get("/api/delphi/conversations")
def list_conversations(
    archived: bool = Query(False, description="True = archivierte zeigen"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Conversations-Liste. Default: nicht-archivierte, neueste zuerst."""
    query = db.query(DelphiConversation).filter(
        DelphiConversation.is_archived == archived
    ).order_by(DelphiConversation.updated_at.desc()).limit(limit)

    convs = query.all()
    counts = dict(
        db.query(DelphiMessage.conversation_id, func.count(DelphiMessage.id))
        .filter(DelphiMessage.conversation_id.in_([c.id for c in convs]))
        .group_by(DelphiMessage.conversation_id)
        .all()
    ) if convs else {}

    return [
        _conversation_summary_to_dict(c, counts.get(c.id, 0))
        for c in convs
    ]


@router.get("/api/delphi/conversations/{conv_id}")
def get_conversation(conv_id: int, db: Session = Depends(get_db)):
    """Detail mit allen Messages + Citations."""
    conv = _get_conversation_or_404(conv_id, db)
    return _conversation_detail_to_dict(conv)


@router.post("/api/delphi/conversations/{conv_id}/messages")
async def send_message(
    conv_id: int,
    body: SendMessageIn,
    db: Session = Depends(get_db),
):
    """User stellt Frage, Delphi antwortet synchron mit Citations."""
    conv = _get_conversation_or_404(conv_id, db)

    # 1) User-Message persistieren
    user_turn = _next_turn_index(conv_id, db)
    user_msg = DelphiMessage(
        conversation_id=conv_id,
        turn_index=user_turn,
        role="user",
        content=body.content,
    )
    db.add(user_msg)

    # 2) Title beim ersten User-Turn auto-generieren
    if user_turn == 0 and conv.title in ("Neue Konversation", "", None):
        conv.title = _generate_title_from_content(body.content)

    # 3) History fuer Provider zusammenbauen (alle bisherigen Messages)
    prior_messages = db.query(DelphiMessage).filter(
        DelphiMessage.conversation_id == conv_id
    ).order_by(DelphiMessage.turn_index).all()
    history = [{"role": m.role, "content": m.content} for m in prior_messages]

    db.flush()  # User-Message + Title-Update sichtbar fuer Folge-Logik

    # 4) Retrieval + Provider
    retrieval = await retrieve_for_query(body.content, db)
    response = await generate_delphi_response(
        user_query=body.content,
        retrieval=retrieval,
        conversation_history=history,
    )

    # 5) Assistant-Message + Citations persistieren
    assistant_turn = _next_turn_index(conv_id, db)
    assistant_msg = _persist_assistant_message(
        conv_id, assistant_turn, response, retrieval, db
    )

    # 6) Conversation-Metadaten updaten
    conv.last_message_at = _utcnow()
    conv.updated_at = _utcnow()

    db.commit()
    db.refresh(user_msg)
    db.refresh(assistant_msg)

    return {
        "user_message": _message_to_dict(user_msg, include_citations=False),
        "assistant_message": _message_to_dict(assistant_msg, include_citations=True),
        "retrieval_top_score": retrieval.top_score,
    }


@router.patch("/api/delphi/conversations/{conv_id}")
def update_conversation(
    conv_id: int,
    body: UpdateConversationIn,
    db: Session = Depends(get_db),
):
    """Partial-Update: nur gesetzte Felder werden uebernommen."""
    conv = _get_conversation_or_404(conv_id, db)
    if body.title is not None:
        conv.title = body.title
    if body.keep_active is not None:
        conv.keep_active = body.keep_active
    if body.is_archived is not None:
        conv.is_archived = body.is_archived
    conv.updated_at = _utcnow()
    db.commit()
    db.refresh(conv)
    msg_count = db.query(DelphiMessage).filter(
        DelphiMessage.conversation_id == conv_id
    ).count()
    return _conversation_summary_to_dict(conv, msg_count)


@router.delete("/api/delphi/conversations/{conv_id}")
def delete_conversation(conv_id: int, db: Session = Depends(get_db)):
    """Loescht Conversation + Messages + Citations (CASCADE)."""
    conv = _get_conversation_or_404(conv_id, db)
    db.delete(conv)
    db.commit()
    return {"deleted": conv_id}
