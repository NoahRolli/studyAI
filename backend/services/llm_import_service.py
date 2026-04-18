# LLMImporter — orchestriert den Import von ParsedConversation → DB
# Plan-Referenz: pallas_llm_archive_plan.md §4 (Ablauf), §10 (Entscheidungen)
#
# Idempotent via UniqueConstraint(provider_id, external_uuid) auf LLMConversation
# Re-Import: provider_updated_at > last_imported_at → Messages neu einlesen
#            sonst → skip
#
# Performance: pro Conversation ein Commit (§4.3, der 611-msg Olymp-Chat
# als Stresstest)

from datetime import datetime
from dataclasses import dataclass

from sqlalchemy.orm import Session

from backend.models.document import Document
from backend.models.folder import Folder
from backend.models.llm import LLMProvider, LLMConversation, LLMMessage
from backend.services.llm_export_parser import (
    ParsedConversation, render_threaded_text,
)
from backend.services.llm_classification import classify_chat


# Marker-Schema für file_path (kein File auf Disk, nur DB-Eintrag)
FILE_PATH_TEMPLATE = "llm://{slug}/{external_uuid}"


@dataclass
class ImportStats:
    # Aggregate-Stats für CLI-Output
    created: int = 0
    updated: int = 0
    skipped: int = 0
    errors: int = 0


# ----------------------------------------------------------------------
# Folder-Setup
# ----------------------------------------------------------------------

def _ensure_folder(db, name, parent_id, metis_enabled=False):
    # Idempotent: Folder mit gleichem Namen + Parent → wiederverwenden
    existing = db.query(Folder).filter(
        Folder.name == name,
        Folder.parent_id == parent_id,
    ).first()
    if existing:
        return existing
    folder = Folder(
        name=name,
        parent_id=parent_id,
        metis_enabled=metis_enabled,
    )
    db.add(folder)
    db.flush()  # ID muss sofort verfügbar sein für nested folders
    return folder


def ensure_folder_structure(db, provider_slug):
    """
    Legt Archiv/LLM-Archiv/{Provider}/_Memory/ und /_ProjectDocs/ an.

    Returns:
        Tuple (chats_folder, memory_folder, projectdocs_folder)
    """
    # Provider-Name in Title-Case für Folder ("Claude" statt "claude")
    provider_folder_name = provider_slug.capitalize()

    archiv = _ensure_folder(db, "Archiv", parent_id=None)
    llm_archiv = _ensure_folder(db, "LLM-Archiv", parent_id=archiv.id)
    chats = _ensure_folder(
        db, provider_folder_name, parent_id=llm_archiv.id,
        metis_enabled=True,  # Plan §6.2: Konzepte aus Chats in Metis
    )
    memory = _ensure_folder(db, "_Memory", parent_id=chats.id)
    projectdocs = _ensure_folder(db, "_ProjectDocs", parent_id=chats.id)
    return chats, memory, projectdocs


# ----------------------------------------------------------------------
# Provider-Setup
# ----------------------------------------------------------------------

def ensure_provider(db, name, slug, is_ongoing):
    # Idempotent via slug
    provider = db.query(LLMProvider).filter(LLMProvider.slug == slug).first()
    if provider:
        return provider
    provider = LLMProvider(name=name, slug=slug, is_ongoing=is_ongoing)
    db.add(provider)
    db.flush()
    return provider


# ----------------------------------------------------------------------
# Importer — Kernlogik
# ----------------------------------------------------------------------

class LLMImporter:
    """
    Importiert ParsedConversation-Objekte in die DB.

    Workflow pro Conversation:
      1. Dedup-Check via (provider_id, external_uuid)
      2. Wenn neu → Document + LLMConversation + LLMMessages anlegen
      3. Wenn existiert + provider_updated_at neuer → Update-Pfad
      4. Wenn existiert + nichts neuer → skip + present_in_last_export setzen
      5. Commit pro Conversation (§4.3 Performance)
    """

    def __init__(self, db, provider, chats_folder, dry_run=False):
        self.db = db
        self.provider = provider
        self.chats_folder = chats_folder
        self.dry_run = dry_run
        self.import_run_at = datetime.utcnow()
        self.stats = ImportStats()

    def import_conversations(self, parsed_convos):
        for parsed in parsed_convos:
            try:
                self._import_one(parsed)
            except Exception as exc:
                self.stats.errors += 1
                print(f"  ERROR bei {parsed.external_uuid}: {exc}")
                self.db.rollback()
        return self.stats

    def _import_one(self, parsed):
        existing = self.db.query(LLMConversation).filter(
            LLMConversation.provider_id == self.provider.id,
            LLMConversation.external_uuid == parsed.external_uuid,
        ).first()

        if existing is None:
            self._create_new(parsed)
            self.stats.created += 1
        elif parsed.provider_updated_at > (existing.provider_updated_at or datetime.min):
            self._update_existing(existing, parsed)
            self.stats.updated += 1
        else:
            # Idempotenter Re-Import: nur present_in_last_export aktualisieren
            existing.present_in_last_export = self.import_run_at
            if not self.dry_run:
                self.db.commit()
            self.stats.skipped += 1

    def _build_document(self, parsed):
        # Chat-Titel: aus Export, sonst aus erster Human-Message ableiten
        title = parsed.title
        if not title:
            first_text = parsed.first_human_text.strip()
            title = first_text[:60] if first_text else f"Chat {parsed.external_uuid[:8]}"

        return Document(
            folder_id=self.chats_folder.id,
            filename=f"{parsed.external_uuid}.chat",
            display_name=title,
            file_path=FILE_PATH_TEMPLATE.format(
                slug=self.provider.slug,
                external_uuid=parsed.external_uuid,
            ),
            file_type="chat",
            raw_text=render_threaded_text(parsed),
            uploaded_at=parsed.provider_created_at,
        )

    def _build_messages(self, conversation_id, parsed):
        return [
            LLMMessage(
                conversation_id=conversation_id,
                external_uuid=m.external_uuid,
                parent_external_uuid=m.parent_external_uuid,
                role=m.role,
                turn_index=m.turn_index,
                text=m.text,
                thinking=m.thinking,
                has_tools=m.has_tools,
                raw_content=m.raw_content,
                attachments_info=m.attachments_info,
                created_at=m.created_at,
            )
            for m in parsed.messages
        ]

    def _create_new(self, parsed):
        doc = self._build_document(parsed)
        self.db.add(doc)
        self.db.flush()  # doc.id für FK

        convo = LLMConversation(
            document_id=doc.id,
            provider_id=self.provider.id,
            external_uuid=parsed.external_uuid,
            title=parsed.title,
            summary_from_provider=parsed.summary_from_provider,
            provider_created_at=parsed.provider_created_at,
            provider_updated_at=parsed.provider_updated_at,
            project_name_guess=classify_chat(parsed.title, parsed.first_human_text),
            message_count=parsed.message_count,
            has_thinking=parsed.has_thinking,
            has_tools=parsed.has_tools,
            present_in_last_export=self.import_run_at,
            last_imported_at=self.import_run_at,
        )
        self.db.add(convo)
        self.db.flush()  # convo.id für FK

        self.db.add_all(self._build_messages(convo.id, parsed))

        if self.dry_run:
            self.db.rollback()
        else:
            self.db.commit()

    def _update_existing(self, existing, parsed):
        # Document-Inhalt neu rendern
        existing.document_id  # Lazy-Load forcen
        doc = self.db.query(Document).filter(Document.id == existing.document_id).first()
        if doc is not None:
            doc.raw_text = render_threaded_text(parsed)
            doc.display_name = parsed.title or doc.display_name

        # Alte Messages löschen, neue einfügen (CASCADE würde auch gehen,
        # aber explizit ist klarer)
        self.db.query(LLMMessage).filter(
            LLMMessage.conversation_id == existing.id
        ).delete()

        existing.title = parsed.title
        existing.summary_from_provider = parsed.summary_from_provider
        existing.provider_updated_at = parsed.provider_updated_at
        existing.message_count = parsed.message_count
        existing.has_thinking = parsed.has_thinking
        existing.has_tools = parsed.has_tools
        existing.present_in_last_export = self.import_run_at
        existing.last_imported_at = self.import_run_at
        # project_name_guess NICHT überschreiben: User könnte manuell korrigiert
        # haben (siehe Plan §10, PATCH-Endpoint im Slice 1)

        self.db.flush()
        self.db.add_all(self._build_messages(existing.id, parsed))

        if self.dry_run:
            self.db.rollback()
        else:
            self.db.commit()
