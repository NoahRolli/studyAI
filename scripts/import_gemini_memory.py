"""
Import Gemini Custom Instructions (+ optional Saved Info) in Pallas.

Gemini hat strukturell etwas andere Daten als ChatGPT:
- Custom Instructions (Pflicht): die Verhaltens-Anweisungen aus Settings
- Saved Info (optional): falls vorhanden, analog zu ChatGPT-Memory

Beide werden als llm_memory-Documents in LLM-Archiv/Gemini/_Memory/
abgelegt, idempotent (Re-Import = Update).

Beispiele:
  python scripts/import_gemini_memory.py --custom-instructions ~/llm-exports/gemini/custom_instructions.md
  python scripts/import_gemini_memory.py --saved-info ~/llm-exports/gemini/saved_info.md
  python scripts/import_gemini_memory.py --all ~/llm-exports/gemini --dry-run
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


PROVIDER_SLUG = "gemini"
DEFAULT_DIR = Path.home() / "llm-exports" / "gemini"


def _print_stats(label: str, stats: dict) -> None:
    print(f"\n[{label}] Stats:")
    for key in ("created", "updated", "unchanged", "skipped_no_name"):
        if key in stats:
            print(f"  {key}: {stats[key]}")
    if stats.get("details"):
        for name, action in stats["details"]:
            print(f"  - {name}: {action}")


def main() -> int:
    p = argparse.ArgumentParser(description="Gemini Custom Instructions & Saved Info Import")
    p.add_argument("--custom-instructions", type=Path, default=None,
                   help="Pfad zur custom_instructions.md (Default: ~/llm-exports/gemini/custom_instructions.md)")
    p.add_argument("--saved-info", type=Path, default=None,
                   help="Pfad zur saved_info.md (optional, analog zu Memory)")
    p.add_argument("--all", type=Path, default=None,
                   help="Verzeichnis mit beiden Files")
    p.add_argument("--dry-run", action="store_true",
                   help="Nichts committen, nur Stats anzeigen")
    args = p.parse_args()

    ci_path = args.custom_instructions
    saved_path = args.saved_info

    if args.all:
        ci_path = ci_path or args.all / "custom_instructions.md"
        saved_path = saved_path or args.all / "saved_info.md"

    if not ci_path and not saved_path:
        ci_path = DEFAULT_DIR / "custom_instructions.md"
        saved_path = DEFAULT_DIR / "saved_info.md"
        print(f"Keine Flags gesetzt — nutze Default-Pfade unter {DEFAULT_DIR}")

    print(f"Provider: {PROVIDER_SLUG}")
    print(f"Custom Instructions: {ci_path or '(skip)'}")
    print(f"Saved Info:          {saved_path or '(skip)'}")
    print(f"Dry-Run:             {args.dry_run}\n")

    db = SessionLocal()
    try:
        if ci_path and ci_path.exists():
            print(f"[Custom Instructions] Importiere {ci_path} …")
            stats = import_custom_instructions(
                db=db,
                provider_slug=PROVIDER_SLUG,
                source_path=ci_path,
                dry_run=args.dry_run,
            )
            _print_stats("Custom Instructions", stats)
        elif ci_path:
            print(f"[Custom Instructions] Datei nicht gefunden, übersprungen: {ci_path}")

        if saved_path and saved_path.exists():
            print(f"\n[Saved Info] Importiere {saved_path} …")
            stats = import_memories(
                db=db,
                provider_slug=PROVIDER_SLUG,
                source_dir=saved_path,
                dry_run=args.dry_run,
            )
            _print_stats("Saved Info", stats)
        elif saved_path:
            print(f"[Saved Info] Datei nicht gefunden, übersprungen: {saved_path}")

        if args.dry_run:
            print("\nDRY-RUN — keine Änderungen committed.")
        else:
            print("\nFertig.")

    finally:
        db.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
