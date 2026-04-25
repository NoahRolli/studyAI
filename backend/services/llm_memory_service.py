"""
LLM Memory Service — Provider-agnostischer Memory-Import.

Unterstützt aktuell:
- Claude (memories.json: globaler Block + Project-Memories)
- ChatGPT (memory.md als ein Block)
- Gemini (custom_instructions.md als ein Block — Saved Info optional analog)

Idempotent: Re-Import aktualisiert bestehende Documents anhand des Filenames
(Dedup-Key per (folder_id, filename)). Keine Duplikate.

File-Type: "llm_memory" (diskriminiert gegen "chat" aus llm_import_service).
Custom Instructions teilen denselben file_type, sind aber per Filename und
display_name eindeutig identifizierbar (z.B. "ChatGPT_CustomInstructions.md").
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

# ----------------------------------------------------------------------
# Provider-Display-Mapping (für non-capitalize-Provider wie ChatGPT)
# ----------------------------------------------------------------------

PROVIDER_DISPLAY_NAMES = {
    "claude": "Claude",
    "chatgpt": "ChatGPT",
    "gemini": "Gemini",
}

PROVIDER_IS_ONGOING = {
    "claude": True,
    "chatgpt": False,
    "gemini": False,
}

MEMORY_FILE_TYPE = "llm_memory"


# ----------------------------------------------------------------------
# Naming-Helper (provider-agnostisch)
# ----------------------------------------------------------------------

def _memory_file_path(provider_slug: str, suffix: str) -> str:
    """Erzeugt fake-URI: llm://{slug}/memory/{suffix}"""
    return f"llm://{provider_slug}/memory/{suffix}"


def _global_memory_filename(provider_slug: str) -> str:
    """Filename für Global-Memory: {Display}_Memory_Global.md"""
    display = PROVIDER_DISPLAY_NAMES.get(provider_slug, provider_slug.capitalize())
    return f"{display}_Memory_Global.md"


def _global_memory_display(provider_slug: str) -> str:
    """Display-Name für Global-Memory: {Display} Memory — Global"""
    display = PROVIDER_DISPLAY_NAMES.get(provider_slug, provider_slug.capitalize())
    return f"{display} Memory — Global"


def _custom_instructions_filename(provider_slug: str) -> str:
    """Filename für Custom Instructions: {Display}_CustomInstructions.md"""
    display = PROVIDER_DISPLAY_NAMES.get(provider_slug, provider_slug.capitalize())
    return f"{display}_CustomInstructions.md"


def _custom_instructions_display(provider_slug: str) -> str:
    """Display-Name für Custom Instructions: {Display} — Custom Instructions"""
    display = PROVIDER_DISPLAY_NAMES.get(provider_slug, provider_slug.capitalize())
    return f"{display} — Custom Instructions"


def _project_memory_filename(provider_slug: str, project_name: str) -> str:
    """Filename für Project-Memory (nur Claude): {Display}_Memory_{name}.md"""
    display = PROVIDER_DISPLAY_NAMES.get(provider_slug, provider_slug.capitalize())
    segment = project_name_to_filename_segment(project_name)
    return f"{display}_Memory_{segment}.md"


# ----------------------------------------------------------------------
# Format-Parser pro Provider (Strategy-Pattern)
# ----------------------------------------------------------------------

def _parse_claude_memories(source_dir: str | Path) -> tuple[str, dict[str, str]]:
    """
    Lädt memories.json aus dem Claude-Export.

    Format: Liste mit einem Element. Keys:
    - conversations_memory (str) — globaler Block
    - project_memories (dict {uuid: text})
    - account_uuid (str)

    Returns:
        Tuple (global_str, project_dict). global_str ist "" wenn nicht vorhanden.
    """
    src = Path(source_dir)
    memories_file = src / "memories.json"

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


def _parse_markdown_block(source_path: str | Path) -> str:
    """
    Lädt eine Markdown-Datei als einen Block.
    Genutzt für ChatGPT-Memory und Gemini-Custom-Instructions.

    Returns:
        Inhalt der Datei als String. Leer wenn Datei fehlt oder leer.
    """
    src = Path(source_path)
    if not src.exists():
        raise FileNotFoundError(f"Markdown-Datei nicht gefunden: {src}")

    content = src.read_text(encoding="utf-8")
    return content.strip()


# ----------------------------------------------------------------------
# DB-Layer (provider-agnostisch — unverändert vom Original)
# ----------------------------------------------------------------------

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


# ----------------------------------------------------------------------
# Orchestrator: Memory-Import
# ----------------------------------------------------------------------

def import_memories(
    db: Session,
    provider_slug: str,
    source_dir: str | Path,
    dry_run: bool = False,
) -> dict[str, Any]:
    """
    Provider-agnostischer Memory-Import.

    Args:
        db: SQLAlchemy Session.
        provider_slug: "claude", "chatgpt" oder "gemini".
        source_dir: Pfad zum Export-Ordner (Claude) ODER zur memory.md (andere).
                    Bei "claude" wird memories.json drin erwartet.
                    Bei "chatgpt" wird memory.md drin erwartet.
                    Bei "gemini" — analog (Saved Info, optional).
        dry_run: Wenn True, nichts committen.

    Returns:
        Stats-Dict mit Counts: created, updated, unchanged, skipped_no_name, details.
    """
    display = PROVIDER_DISPLAY_NAMES.get(provider_slug, provider_slug.capitalize())
    is_ongoing = PROVIDER_IS_ONGOING.get(provider_slug, False)

    # Provider + Folder-Struktur sicherstellen (idempotent)
    ensure_provider(db, display, provider_slug, is_ongoing=is_ongoing)
    _chats, memory_folder, _pd = ensure_folder_structure(
        db, provider_slug, display_name=display,
    )

    stats: dict[str, Any] = {
        "created": 0, "updated": 0, "unchanged": 0, "skipped_no_name": 0,
        "details": [],
    }

    # ----- Claude-Pfad: globaler Block + Project-Memories aus memories.json
    if provider_slug == "claude":
        project_index = load_project_index(source_dir)
        global_memory, project_memories = _parse_claude_memories(source_dir)

        # Global-Memory — immer genau ein Document
        if global_memory.strip():
            _doc, action = _upsert_memory_document(
                db,
                folder_id=memory_folder.id,
                filename=_global_memory_filename(provider_slug),
                display_name=_global_memory_display(provider_slug),
                file_path=_memory_file_path(provider_slug, "global"),
                content=global_memory,
                dry_run=dry_run,
            )
            stats[action] = stats.get(action, 0) + 1
            stats["details"].append(("global", action))

        # Project-Memories
        for uuid, memory_text in project_memories.items():
            if not isinstance(memory_text, str) or not memory_text.strip():
                continue

            project_info = project_index.get(uuid)
            if not project_info:
                stats["skipped_no_name"] += 1
                stats["details"].append((uuid, "skipped_no_name"))
                continue

            name = project_info["name"]
            _doc, action = _upsert_memory_document(
                db,
                folder_id=memory_folder.id,
                filename=_project_memory_filename(provider_slug, name),
                display_name=f"{display} Memory — {name}",
                file_path=_memory_file_path(provider_slug, f"project/{uuid}"),
                content=memory_text,
                dry_run=dry_run,
            )
            stats[action] = stats.get(action, 0) + 1
            stats["details"].append((name, action))

    # ----- ChatGPT/Gemini-Pfad: ein Markdown-Block als Global-Memory
    elif provider_slug in ("chatgpt", "gemini"):
        # source_dir kann ein Pfad zur Datei oder zum Ordner sein
        src = Path(source_dir)
        if src.is_dir():
            md_file = src / "memory.md"
        else:
            md_file = src

        content = _parse_markdown_block(md_file)
        if content:
            _doc, action = _upsert_memory_document(
                db,
                folder_id=memory_folder.id,
                filename=_global_memory_filename(provider_slug),
                display_name=_global_memory_display(provider_slug),
                file_path=_memory_file_path(provider_slug, "global"),
                content=content,
                dry_run=dry_run,
            )
            stats[action] = stats.get(action, 0) + 1
            stats["details"].append(("global", action))

    else:
        raise ValueError(f"Unbekannter provider_slug: {provider_slug}")

    if not dry_run:
        db.commit()

    return stats


# ----------------------------------------------------------------------
# Orchestrator: Custom-Instructions-Import
# ----------------------------------------------------------------------

def import_custom_instructions(
    db: Session,
    provider_slug: str,
    source_path: str | Path,
    dry_run: bool = False,
) -> dict[str, Any]:
    """
    Importiert ein Custom-Instructions-Markdown als separates Document.

    Liegt im selben _Memory/-Folder wie die regulären Memories,
    wird aber per Filename ({Display}_CustomInstructions.md) abgegrenzt.

    Args:
        db: SQLAlchemy Session.
        provider_slug: "chatgpt" oder "gemini" (Claude hat kein CI-Konzept).
        source_path: Pfad zur custom_instructions.md.
        dry_run: Wenn True, nichts committen.

    Returns:
        Stats-Dict mit Counts: created, updated, unchanged.
    """
    display = PROVIDER_DISPLAY_NAMES.get(provider_slug, provider_slug.capitalize())
    is_ongoing = PROVIDER_IS_ONGOING.get(provider_slug, False)

    ensure_provider(db, display, provider_slug, is_ongoing=is_ongoing)
    _chats, memory_folder, _pd = ensure_folder_structure(
        db, provider_slug, display_name=display,
    )

    content = _parse_markdown_block(source_path)
    stats: dict[str, Any] = {
        "created": 0, "updated": 0, "unchanged": 0, "details": [],
    }

    if not content:
        return stats

    _doc, action = _upsert_memory_document(
        db,
        folder_id=memory_folder.id,
        filename=_custom_instructions_filename(provider_slug),
        display_name=_custom_instructions_display(provider_slug),
        file_path=_memory_file_path(provider_slug, "custom-instructions"),
        content=content,
        dry_run=dry_run,
    )
    stats[action] = stats.get(action, 0) + 1
    stats["details"].append(("custom_instructions", action))

    if not dry_run:
        db.commit()

    return stats
