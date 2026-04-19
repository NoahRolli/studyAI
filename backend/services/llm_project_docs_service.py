"""
LLM Project Docs Service — Import von Project-Docs aus projects.json.

Projects in Claude können angeheftete Dokumente (docs[]) haben. Diese
werden im _ProjectDocs/-Folder als Documents abgelegt, je ein Document
pro Doc-Eintrag.

Starter-Project "How to use Claude" wird via load_project_index bereits
ausgefiltert — dessen Prompting-Guide landet nicht im Archiv.

Idempotent: Dedup via (folder_id, filename). Re-Import aktualisiert
raw_text bestehender Documents.

File-Type: "llm_project_doc" (diskriminiert gegen "chat" und "llm_memory").
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from backend.models.document import Document
from backend.services.llm_import_service import (
    ensure_folder_structure,
    ensure_provider,
)
from backend.services.llm_project_index import (
    load_project_index,
    project_name_to_filename_segment,
)

DOC_FILE_PATH_PREFIX = "llm://claude/project_doc"
DOC_FILE_TYPE = "llm_project_doc"


def _doc_filename(project_name: str, original_filename: str) -> str:
    """
    Baut Filename im Schema {ProjectName}__{OriginalFilename}.

    Doppelte Unterstriche als Trenner, damit das Project-Segment visuell
    klar vom Original-Dateinamen getrennt ist.
    """
    project_segment = project_name_to_filename_segment(project_name)
    return f"{project_segment}__{original_filename}"


def _parse_iso_datetime(value: Any) -> datetime:
    """Parst ISO-8601 String zu UTC datetime. Fallback: jetzt."""
    if not isinstance(value, str):
        return datetime.now(timezone.utc)
    try:
        # Python < 3.11 akzeptiert nur bestimmte ISO-Formate; +00:00 -> Z
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return datetime.now(timezone.utc)


def _upsert_project_doc(
    db: Session,
    folder_id: int,
    filename: str,
    display_name: str,
    file_path: str,
    content: str,
    uploaded_at: datetime,
    dry_run: bool = False,
) -> tuple[Document | None, str]:
    """
    Erstellt oder aktualisiert ein Project-Doc-Document.

    Dedup-Key: (folder_id, filename). Rückgabe analog Memory-Service.
    """
    existing = (
        db.query(Document)
        .filter(Document.folder_id == folder_id, Document.filename == filename)
        .first()
    )

    if existing:
        if existing.raw_text == content:
            return existing, "unchanged"
        if dry_run:
            return existing, "dry_run"
        existing.raw_text = content
        existing.display_name = display_name
        existing.file_path = file_path
        existing.file_type = DOC_FILE_TYPE
        db.flush()
        return existing, "updated"

    if dry_run:
        return None, "dry_run"

    doc = Document(
        folder_id=folder_id,
        filename=filename,
        display_name=display_name,
        file_path=file_path,
        file_type=DOC_FILE_TYPE,
        raw_text=content,
        uploaded_at=uploaded_at,
    )
    db.add(doc)
    db.flush()
    return doc, "created"


def import_project_docs(
    db: Session,
    export_dir: str | Path,
    dry_run: bool = False,
) -> dict[str, Any]:
    """
    Importiert alle Project-Docs aus dem Claude-Export.

    Args:
        db: SQLAlchemy Session.
        export_dir: Pfad zum Claude-Export-Ordner.
        dry_run: Wenn True, nichts committen.

    Returns:
        Stats-Dict mit Counts: created, updated, unchanged, total_seen.
        total_seen = Anzahl Docs, die insgesamt im Export gefunden wurden
        (exkl. Starter-Project).
    """
    ensure_provider(db, "Claude", "claude", is_ongoing=True)
    _chats, _memory, projectdocs_folder = ensure_folder_structure(db, "claude")

    project_index = load_project_index(export_dir)

    stats = {
        "created": 0, "updated": 0, "unchanged": 0, "total_seen": 0,
        "details": [],
    }

    for uuid, project_info in project_index.items():
        project_name = project_info["name"]
        docs = project_info.get("docs") or []

        for doc_entry in docs:
            if not isinstance(doc_entry, dict):
                continue

            original_filename = doc_entry.get("filename") or "Unbenannt.md"
            content = doc_entry.get("content") or ""
            created_at_raw = doc_entry.get("created_at")
            doc_uuid = doc_entry.get("uuid") or ""

            if not content.strip():
                continue

            stats["total_seen"] += 1

            filename = _doc_filename(project_name, original_filename)
            display = f"{project_name} — {original_filename}"
            file_path = f"{DOC_FILE_PATH_PREFIX}/{uuid}/{doc_uuid}"
            uploaded_at = _parse_iso_datetime(created_at_raw)

            _doc, action = _upsert_project_doc(
                db,
                folder_id=projectdocs_folder.id,
                filename=filename,
                display_name=display,
                file_path=file_path,
                content=content,
                uploaded_at=uploaded_at,
                dry_run=dry_run,
            )
            stats[action] = stats.get(action, 0) + 1
            stats["details"].append((f"{project_name}/{original_filename}", action))

    if not dry_run:
        db.commit()

    return stats
