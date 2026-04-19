"""
LLM Project Index — Loader für projects.json aus dem Claude-Export.

Stellt einen zentralen Helper bereit, der projects.json einmal parst und
ein Dict {uuid: {name, docs}} zurückgibt. Wird sowohl vom Memory-Import
als auch vom Project-Docs-Import verwendet, damit projects.json nur
einmal gelesen wird.

Der Starter-Project "How to use Claude" (UUID 019a15ca-...) wird gefiltert,
da er nur Anthropic-Default-Content enthält und kein echter User-Inhalt ist.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

# Anthropic-Default-Starter-Project, wird ignoriert
STARTER_PROJECT_UUID = "019a15ca-0ba2-7290-911d-68e908eee1d5"


def load_project_index(export_dir: str | Path) -> dict[str, dict[str, Any]]:
    """
    Lädt projects.json und gibt ein Dict {uuid: {name, docs}} zurück.

    Args:
        export_dir: Pfad zum Claude-Export-Ordner (enthält projects.json).

    Returns:
        Dict mit UUID als Key und {name: str, docs: list} als Value.
        Starter-Project "How to use Claude" wird ausgefiltert.

    Raises:
        FileNotFoundError: Wenn projects.json nicht existiert.
        ValueError: Wenn projects.json nicht das erwartete Listen-Format hat.
    """
    export_path = Path(export_dir)
    projects_file = export_path / "projects.json"

    if not projects_file.exists():
        raise FileNotFoundError(f"projects.json nicht gefunden: {projects_file}")

    with open(projects_file, encoding="utf-8") as f:
        raw = json.load(f)

    if not isinstance(raw, list):
        raise ValueError(
            f"projects.json muss eine Liste sein, ist aber {type(raw).__name__}"
        )

    index: dict[str, dict[str, Any]] = {}
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        uuid = entry.get("uuid")
        if not uuid or uuid == STARTER_PROJECT_UUID:
            continue
        index[uuid] = {
            "name": entry.get("name", "Unbenannt"),
            "docs": entry.get("docs") or [],
        }

    return index


def project_name_to_filename_segment(name: str) -> str:
    """
    Wandelt einen Projekt-Namen in ein filename-taugliches Segment um.

    Behält Original-Gross/Kleinschreibung bei (Noah-Präferenz).
    Ersetzt nur Leerzeichen durch Unterstriche, damit Filenames robust sind.
    """
    return name.strip().replace(" ", "_")
