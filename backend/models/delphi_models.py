"""
Delphi Knowledge-Chat Modul — SQLAlchemy Models.

Delphi ist Pallas' eigener Chat-Assistant mit Zugriff auf das gesamte
Pallas-Wissen (Concepts, Notes, Summaries, Journal, LLM-Archiv).

Lifecycle:
- Live-Conversations in delphi_conversations / delphi_messages
- Auto-Archive nach Idle (Hybrid-Policy: User kann via keep_active overriden)
- Beim Archivieren wird Conversation als HTML-Document ins LLM-Archiv exportiert
  und Concept-Extraction läuft (nur wenn confidence >= medium)
- archived_doc_id zeigt auf das exportierte Document; bei Re-Edit wird upserted

Anti-Halluzination:
- Jede Assistant-Message hat confidence ('high'|'medium'|'low')
- Citations als separate Tabelle, joinbar mit concepts/notes/summaries/chat_messages
- Bei confidence='low' läuft KEINE Concept-Extraction (Halluzinations-Schutz)
"""

from datetime import datetime
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Boolean,
    DateTime,
    ForeignKey,
    Float,
    Index,
)
from sqlalchemy.orm import relationship

from backend.models.database import Base


class DelphiConversation(Base):
    """
    Live-Conversation mit Delphi.

    title: Auto-generiert aus erster User-Message (truncated).
    is_archived: True wenn ins LLM-Archiv exportiert. Conversation bleibt
        trotzdem in dieser Tabelle (kann weitergeschrieben werden -> wird
        beim nächsten Idle-Cycle erneut exportiert).
    keep_active: User-Override für Hybrid-Lifecycle. Wenn True, wird
        nicht automatisch archiviert.
    archived_doc_id: FK auf documents (LLM-Archiv-Eintrag). Null bis
        erstes Archive. Bei Re-Edit wird das gleiche Document upserted.
    """

    __tablename__ = "delphi_conversations"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False, default="Neue Konversation")

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )
    last_message_at = Column(DateTime, nullable=True)

    is_archived = Column(Boolean, nullable=False, default=False)
    keep_active = Column(Boolean, nullable=False, default=False)

    # FK auf documents (LLM-Archiv) — Null bis Auto-Archive gelaufen ist.
    # SET NULL on delete: wenn Archiv-Document gelöscht wird, bleibt
    # Conversation bestehen, nur der Pointer geht verloren.
    archived_doc_id = Column(
        Integer,
        ForeignKey("documents.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Cascade: Messages werden mitgelöscht wenn Conversation gelöscht wird
    messages = relationship(
        "DelphiMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="DelphiMessage.turn_index",
    )

    __table_args__ = (
        Index("ix_delphi_conv_archived_updated", "is_archived", "updated_at"),
    )


class DelphiMessage(Base):
    """
    Einzelne Message in einer Delphi-Conversation.

    role: 'user' oder 'assistant'.
    confidence: Nur für 'assistant'-Messages gesetzt.
        - 'high':   Top-Retrieval-Score >= 0.75 (Antwort gut in Pallas verankert)
        - 'medium': Score 0.55-0.75 (teilweise Match)
        - 'low':    Score < 0.55 (Allgemeinwissen, nicht in Pallas)
    provider: 'ollama' oder 'groq' (welcher Provider hat geantwortet)
    model: Model-Name (z.B. 'gemma4:e2b' oder 'llama-3.3-70b-versatile')
    has_unverified_claims: True wenn der LLM '[!]'-Marker in der Antwort
        gesetzt hat (Aussagen ohne Source-Deckung).
    """

    __tablename__ = "delphi_messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(
        Integer,
        ForeignKey("delphi_conversations.id", ondelete="CASCADE"),
        nullable=False,
    )

    turn_index = Column(Integer, nullable=False)
    role = Column(String(16), nullable=False)  # 'user' | 'assistant'
    content = Column(Text, nullable=False)

    # Nur für assistant-Messages
    confidence = Column(String(16), nullable=True)  # 'high' | 'medium' | 'low'
    provider = Column(String(32), nullable=True)
    model = Column(String(64), nullable=True)
    has_unverified_claims = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    conversation = relationship(
        "DelphiConversation",
        back_populates="messages",
    )
    citations = relationship(
        "DelphiCitation",
        back_populates="message",
        cascade="all, delete-orphan",
        order_by="DelphiCitation.citation_index",
    )

    __table_args__ = (
        Index("ix_delphi_msg_conv_turn", "conversation_id", "turn_index"),
    )


class DelphiCitation(Base):
    """
    Eine Citation referenziert eine Source aus dem Pallas-Wissen,
    die für eine bestimmte assistant-Message herangezogen wurde.

    citation_index: Die [N]-Nummer aus der Antwort (1, 2, 3 ...).
    source_type: 'concept' | 'note' | 'summary' | 'chat_message'
    source_id: ID in der jeweiligen Quell-Tabelle. KEIN FK weil polymorph
        (würde sonst 4 separate Tabellen brauchen). Konsistenz wird auf
        Service-Layer geprüft.
    similarity_score: Cosine-Similarity vom Retrieval (für Debugging und
        UI-Sortierung).
    preview_text: Snippet das im UI gezeigt wird (max ~200 Zeichen).
        Wird beim Citation-Erstellen einmal gesnapshotted, damit Preview
        stabil bleibt auch wenn Source-Text später editiert wird.
    """

    __tablename__ = "delphi_citations"

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(
        Integer,
        ForeignKey("delphi_messages.id", ondelete="CASCADE"),
        nullable=False,
    )

    citation_index = Column(Integer, nullable=False)  # 1, 2, 3 ... in Antwort
    source_type = Column(String(32), nullable=False)
    source_id = Column(Integer, nullable=False)
    similarity_score = Column(Float, nullable=True)
    preview_text = Column(Text, nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    message = relationship("DelphiMessage", back_populates="citations")

    __table_args__ = (
        Index("ix_delphi_cit_msg_idx", "message_id", "citation_index"),
        Index("ix_delphi_cit_source", "source_type", "source_id"),
    )
