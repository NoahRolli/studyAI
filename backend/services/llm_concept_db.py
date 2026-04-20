# Sync DB-Helper für Konzept-Extraktion aus LLM-Messages (P5.1 Slice 1c).
# Jeder Helper öffnet/schließt eigene SessionLocal — keine Long-Lived Connections.
# Wird vom async-Orchestrator via asyncio.to_thread() aufgerufen.

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from backend.models.database import SessionLocal
from backend.models.llm import LLMMessage
from backend.models.concept import Concept
from backend.api.concepts_ai import get_or_create_concept, link_source

logger = logging.getLogger(__name__)


def load_message_text(msg_id: int) -> tuple[str | None, bool]:
    """
    Phase 1 — kurze Session: nur Text laden, sofort schließen.
    Returns (text_or_None, exists_flag).
    """
    db: Session = SessionLocal()
    try:
        row = db.query(LLMMessage.text).filter(LLMMessage.id == msg_id).first()
        if row is None:
            return None, False
        return (row[0] or "").strip(), True
    finally:
        db.close()


def mark_extracted(msg_id: int, dry_run: bool) -> None:
    """
    Phase 3a — Kurz-Session, nur extracted_at setzen (für Skip-Pfade).
    """
    if dry_run:
        return
    db: Session = SessionLocal()
    try:
        msg = db.query(LLMMessage).filter(LLMMessage.id == msg_id).first()
        if msg is not None:
            msg.extracted_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()


def persist_concepts(
    msg_id: int,
    concepts: list[dict],
    dry_run: bool,
) -> tuple[int, int]:
    """
    Phase 3b — Kurz-Session: Konzepte verlinken + extracted_at setzen.
    Returns (sources_linked, concepts_created) für Stats-Update im Caller.
    """
    sources_linked = 0
    concepts_created = 0

    db: Session = SessionLocal()
    try:
        msg = db.query(LLMMessage).filter(LLMMessage.id == msg_id).first()
        if msg is None:
            return 0, 0

        for c in concepts:
            normalized = c["name"].strip().lower()
            existed = db.query(Concept.id).filter(
                Concept.name == normalized
            ).first() is not None
            concept = get_or_create_concept(db, c["name"])
            if concept is None:
                continue
            link_source(db, concept, "chat_message", msg.id, c["relevance"])
            sources_linked += 1
            if not existed:
                concepts_created += 1

        if not dry_run:
            msg.extracted_at = datetime.now(timezone.utc)
            db.commit()
        else:
            db.rollback()

        return sources_linked, concepts_created
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
