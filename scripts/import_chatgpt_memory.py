"""
Import ChatGPT Memory + Custom Instructions in Pallas.

Memory-Format:    Markdown-Datei mit dem zusammengeführten Memory-Inhalt
                  (z.B. ~/llm-exports/chatgpt/memory.md)
CI-Format:        Markdown-Datei mit Custom-Instructions-Inhalt
                  (z.B. ~/llm-exports/chatgpt/custom_instructions.md)

Beide Files werden als llm_memory-Documents in
LLM-Archiv/ChatGPT/_Memory/ angelegt, idempotent (Re-Import = Update).

Beispiele:
  python scripts/import_chatgpt_memory.py --memory ~/llm-exports/chatgpt/memory.md
  python scripts/import_chatgpt_memory.py --custom-instructions ~/llm-exports/chatgpt/custom_instructions.md
  python scripts/import_chatgpt_memory.py --all ~/llm-exports/chatgpt --dry-run
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Project-Root auf sys.path damit "backend.*" importierbar ist
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.models import registry  # noqa: F401
from backend.models.database import SessionLocal
from backend.services.llm_memory_service import (
    import_custom_instructions,
    import_memories,
)


PROVIDER_SLUG = "chatgpt"
DEFAULT_DIR = Path.home() / "llm-exports" / "chatgpt"


def _print_stats(label: str, stats: dict) -> None:
    print(f"\n[{label}] Stats:")
    for key in ("created", "updated", "unchanged", "skipped_no_name"):
        if key in stats:
            print(f"  {key}: {stats[key]}")
    if stats.get("details"):
        for name, action in stats["details"]:
            print(f"  - {name}: {action}")


def main() -> int:
    p = argparse.ArgumentParser(description="ChatGPT Memory & Custom Instructions Import")
    p.add_argument("--memory", type=Path, default=None,
                   help="Pfad zur memory.md (Default: ~/llm-exports/chatgpt/memory.md)")
    p.add_argument("--custom-instructions", type=Path, default=None,
                   help="Pfad zur custom_instructions.md (Default: ~/llm-exports/chatgpt/custom_instructions.md)")
    p.add_argument("--all", type=Path, default=None,
                   help="Verzeichnis mit beiden Files (Shortcut für --memory + --custom-instructions)")
    p.add_argument("--dry-run", action="store_true",
                   help="Nichts committen, nur Stats anzeigen")
    args = p.parse_args()

    # Resolve --all in einzelne Pfade
    memory_path = args.memory
    ci_path = args.custom_instructions

    if args.all:
        memory_path = memory_path or args.all / "memory.md"
        ci_path = ci_path or args.all / "custom_instructions.md"

    if not memory_path and not ci_path:
        # Keine Flags → Default-Verzeichnis annehmen
        memory_path = DEFAULT_DIR / "memory.md"
        ci_path = DEFAULT_DIR / "custom_instructions.md"
        print(f"Keine Flags gesetzt — nutze Default-Pfade unter {DEFAULT_DIR}")

    print(f"Provider: {PROVIDER_SLUG}")
    print(f"Memory:              {memory_path or '(skip)'}")
    print(f"Custom Instructions: {ci_path or '(skip)'}")
    print(f"Dry-Run:             {args.dry_run}\n")

    db = SessionLocal()
    try:
        if memory_path and memory_path.exists():
            print(f"[Memory] Importiere {memory_path} …")
            stats = import_memories(
                db=db,
                provider_slug=PROVIDER_SLUG,
                source_dir=memory_path,
                dry_run=args.dry_run,
            )
            _print_stats("Memory", stats)
        elif memory_path:
            print(f"[Memory] Datei nicht gefunden, übersprungen: {memory_path}")

        if ci_path and ci_path.exists():
            print(f"\n[Custom Instructions] Importiere {ci_path} …")
            stats = import_custom_instructions(
                db=db,
                provider_slug=PROVIDER_SLUG,
                source_path=ci_path,
                dry_run=args.dry_run,
            )
            _print_stats("Custom Instructions", stats)
        elif ci_path:
            print(f"[Custom Instructions] Datei nicht gefunden, übersprungen: {ci_path}")

        if args.dry_run:
            print("\nDRY-RUN — keine Änderungen committed.")
        else:
            print("\nFertig.")

    finally:
        db.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
