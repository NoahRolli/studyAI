# Models für das LLM-Archiv (Slice 1 von P5.1)
# Drei Tabellen für den Import von Claude/ChatGPT/Gemini Exports

# WICHTIG: Liegen in pallas.db, NICHT journal.db (Journal-Isolation)
# LLMConversation: 1:1 zu Document via document_id (UNIQUE)
# LLMMessage: spätere Embedding-Einheit (RAG, Slice 6+)
# UniqueConstraint(provider_id, external_uuid) → Re-Import idempotent

from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Boolean, JSON,
    ForeignKey, Index, UniqueConstraint,
)
from sqlalchemy.orm import relationship
from datetime import datetime
from backend.models.database import Base


class LLMProvider(Base):
    __tablename__ = "llm_providers"

    # Primärschlüssel
    id = Column(Integer, primary_key=True, index=True)

    # Anzeigename und Slug (URL-safe)
    name = Column(String, unique=True, nullable=False)  # "Claude"
    slug = Column(String, unique=True, nullable=False)  # "claude"

    # is_ongoing=True → UI zeigt "Re-Import empfohlen"-Hint
    # Claude=True, ChatGPT/Gemini=False (abgeschlossen)
    is_ongoing = Column(Boolean, nullable=False, default=False)

    # Metadata
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Beziehung — alle Conversations dieses Providers
    conversations = relationship(
        "LLMConversation",
        back_populates="provider",
        cascade="all, delete-orphan",
    )


class LLMConversation(Base):
    __tablename__ = "llm_conversations"

    # Primärschlüssel
    id = Column(Integer, primary_key=True, index=True)

    # 1:1 Beziehung zu Document (UNIQUE enforced via __table_args__)
    document_id = Column(
        Integer,
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Welcher Provider (Claude/ChatGPT/Gemini)
    provider_id = Column(
        Integer,
        ForeignKey("llm_providers.id", ondelete="RESTRICT"),
        nullable=False,
    )

    # Provider-seitige UUID — Dedup-Key für Re-Imports
    external_uuid = Column(String, nullable=False, index=True)

    # Metadata aus dem Export
    title = Column(String, nullable=True)  # "name" im Export, kann leer sein
    summary_from_provider = Column(Text, nullable=True)
    provider_created_at = Column(DateTime, nullable=False)
    provider_updated_at = Column(DateTime, nullable=False)

    # Project-Rekonstruktion (Hybrid: Seed-Liste + Regex, siehe Plan §10)
    # NULL = "Unsortiert" im UI
    project_name_guess = Column(String, nullable=True, index=True)

    # Reserviert für späteres Privacy-Feature — Slice 1 immer "normal"
    privacy_level = Column(String, nullable=False, default="normal")

    # Aggregate-Felder fürs UI ohne JOIN
    message_count = Column(Integer, nullable=False, default=0)
    has_thinking = Column(Boolean, nullable=False, default=False)
    has_tools = Column(Boolean, nullable=False, default=False)

    # Soft-Delete-Tracking (§10 Entscheidung 4)
    # Bei jedem Import auf datetime.utcnow() gesetzt
    # Wert < letzter Import-Run → "Bei Claude gelöscht"-Badge
    present_in_last_export = Column(DateTime, nullable=True)
    last_imported_at = Column(DateTime, nullable=True)

    # Constraints — document_id unique + Dedup-Key
    __table_args__ = (
        UniqueConstraint("document_id", name="uq_llm_conv_document_id"),
        UniqueConstraint(
            "provider_id", "external_uuid",
            name="uq_llm_conv_provider_external",
        ),
    )

    # Beziehungen
    provider = relationship("LLMProvider", back_populates="conversations")
    messages = relationship(
        "LLMMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="LLMMessage.turn_index",
    )


class LLMMessage(Base):
    __tablename__ = "llm_messages"

    # Primärschlüssel
    id = Column(Integer, primary_key=True, index=True)

    # Parent-Conversation
    conversation_id = Column(
        Integer,
        ForeignKey("llm_conversations.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Provider-seitige UUIDs
    external_uuid = Column(String, nullable=False, index=True)
    parent_external_uuid = Column(String, nullable=True)

    # Rolle und chronologische Position
    role = Column(String, nullable=False)  # "human" | "assistant"
    turn_index = Column(Integer, nullable=False)  # 0-basiert

    # Rendered Content — aus content[]-Blocks zusammengefügt
    # text = ohne thinking, mit Tool-Summaries inline
    text = Column(Text, nullable=False)
    thinking = Column(Text, nullable=True)
    has_tools = Column(Boolean, nullable=False, default=False)

    # Raw-Blocks (alle content[]-Einträge) für späteres Re-Rendering
    raw_content = Column(JSON, nullable=True)

    # Attachments-Metadata — Liste von Dicts
    # {file_name, file_type, extracted_content_preview, ...}
    attachments_info = Column(JSON, nullable=True)

    # Timestamp aus dem Export
    created_at = Column(DateTime, nullable=False)

    # Index für schnellen Zugriff auf Messages einer Conversation in Reihenfolge
    __table_args__ = (
        Index("ix_llm_messages_convo_turn", "conversation_id", "turn_index"),
    )

    # Beziehung
    conversation = relationship("LLMConversation", back_populates="messages")
