"""
LLM Memory Service — Import von memories.json aus dem Claude-Export.

Liest conversations_memory (global) und project_memories (pro Projekt) aus
und legt je ein Document pro Memory-Eintrag im _Memory/-Folder an.

Idempotent: Re-Import aktualisiert bestehende Documents anhand des Filenames
(Dedup-Key). Keine Duplikate.

File-Type: "llm_memory" (diskriminiert gegen "chat" aus llm_import_service).
"""

from __future__ import annotations

import json
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

# Fake-URI-Präfix analog zu Conversations (llm://claude/{uuid})
MEMORY_FILE_PATH_PREFIX = "llm://claude/memory"
MEMORY_FILE_TYPE = "llm_memory"
GLOBAL_MEMORY_FILENAME = "Claude_Memory_Global.md"
GLOBAL_MEMORY_DISPLAY = "Claude Memory — Global"


def _parse_memories_json(export_dir: str | Path) -> tuple[str, dict[str, str]]:
    """
    Lädt memories.json und gibt (global_memory, project_memories) zurück.

    memories.json ist eine Liste mit genau einem Element, das drei Keys hat:
    conversations_memory (str), project_memories (dict), account_uuid (str).

    Returns:
        Tuple (global_str, project_dict). global_str ist "" wenn nicht vorhanden.
        project_dict ist {uuid: memory_text}.
    """
    export_path = Path(export_dir)
    memories_file = export_path / "memories.json"

    if not memories_file.exists():
        raise FileNotFoundError(f"memories.json nicht gefunden: {memories_file}")

    with open(memories_file, encoding="utf-8") as f:
        raw = json.load(f)

    if not isinstance(raw, list) or not raw:
        raise ValueError("memories.json muss eine nicht-leere Liste sein")

    entry = raw[0]
    if not isinstance(entry, dict):
        raise ValueError("memories.json[0] muss ein Dict sein")

    global_memory = entry.get("conversations_memory") or ""
    project_memories = entry.get("project_memories") or {}

    if not isinstance(global_memory, str):
        global_memory = ""
    if not isinstance(project_memories, dict):
        project_memories = {}

    return global_memory, project_memories


def _memory_filename_for_project(project_name: str) -> str:
    """Erzeugt Filename für Project-Memory: Claude_Memory_{name}.md"""
    segment = project_name_to_filename_segment(project_name)
    return f"Claude_Memory_{segment}.md"


def _upsert_memory_document(
    db: Session,
    folder_id: int,
    filename: str,
    display_name: str,
    file_path: str,
    content: str,
    dry_run: bool = False,
) -> tuple[Document | None, str]:
    """
    Erstellt oder aktualisiert ein Memory-Document.

    Dedup-Key: (folder_id, filename). Wenn vorhanden → Update raw_text.
    Wenn neu → Document anlegen.

    Returns:
        Tuple (document_or_none, action). action ist "created", "updated",
        "unchanged" oder "dry_run".
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
        existing.file_type = MEMORY_FILE_TYPE
        db.flush()
        return existing, "updated"

    if dry_run:
        return None, "dry_run"

    doc = Document(
        folder_id=folder_id,
        filename=filename,
        display_name=display_name,
        file_path=file_path,
        file_type=MEMORY_FILE_TYPE,
        raw_text=content,
        uploaded_at=datetime.now(timezone.utc),
    )
    db.add(doc)
    db.flush()
    return doc, "created"


def import_memories(
    db: Session,
    export_dir: str | Path,
    dry_run: bool = False,
) -> dict[str, Any]:
    """
    Haupt-Einstiegspunkt: Importiert alle Memories aus dem Export.

    Args:
        db: SQLAlchemy Session.
        export_dir: Pfad zum Claude-Export-Ordner.
        dry_run: Wenn True, nichts committen.

    Returns:
        Stats-Dict mit Counts: created, updated, unchanged, skipped_no_name.
    """
    # Provider + Folder-Struktur sicherstellen (idempotent)
    ensure_provider(db, "Claude", "claude", is_ongoing=True)
    _chats, memory_folder, _pd = ensure_folder_structure(db, "claude")

    # Project-Index laden (UUID → Name)
    project_index = load_project_index(export_dir)

    # Memories laden
    global_memory, project_memories = _parse_memories_json(export_dir)

    stats = {
        "created": 0, "updated": 0, "unchanged": 0, "skipped_no_name": 0,
        "details": [],
    }

    # Global-Memory — immer genau ein Document
    if global_memory.strip():
        _doc, action = _upsert_memory_document(
            db,
            folder_id=memory_folder.id,
            filename=GLOBAL_MEMORY_FILENAME,
            display_name=GLOBAL_MEMORY_DISPLAY,
            file_path=f"{MEMORY_FILE_PATH_PREFIX}/global",
            content=global_memory,
            dry_run=dry_run,
        )
        stats[action] = stats.get(action, 0) + 1
        stats["details"].append(("global", action))

    # Project-Memories — ein Document pro UUID
    for uuid, memory_text in project_memories.items():
        if not isinstance(memory_text, str) or not memory_text.strip():
            continue

        project_info = project_index.get(uuid)
        if not project_info:
            # UUID existiert in memories.json aber nicht in projects.json
            # (z.B. gelöschtes Project) — skip mit Warnung im Stats-Dict
            stats["skipped_no_name"] += 1
            stats["details"].append((uuid, "skipped_no_name"))
            continue

        name = project_info["name"]
        filename = _memory_filename_for_project(name)
        display = f"Claude Memory — {name}"
        file_path = f"{MEMORY_FILE_PATH_PREFIX}/project/{uuid}"

        _doc, action = _upsert_memory_document(
            db,
            folder_id=memory_folder.id,
            filename=filename,
            display_name=display,
            file_path=file_path,
            content=memory_text,
            dry_run=dry_run,
        )
        stats[action] = stats.get(action, 0) + 1
        stats["details"].append((name, action))

    if not dry_run:
        db.commit()

    return stats
