# CLI-Script: Importiert einen Gemini-Export (Google Takeout) in Pallas
# Plan-Referenz: handoff_chat55.md §1 (Gemini-Konversations-Parser)
#
# Usage:
#   python scripts/import_gemini_export.py /path/to/Gemini-Apps
#       → Verzeichnis mit MeineAktivitäten.html
#   python scripts/import_gemini_export.py /path/to/MeineAktivitäten.html
#       → direkt die HTML-Datei
#
# Modifiers:
#   --dry-run: alles parsen + DB-Operationen vorbereiten, aber rollback statt commit
#   --limit N: nur die ersten N Conversations (für schnelle Tests)
#
# Memory- und Project-Docs-Import gibt es bei Gemini-Takeout nicht:
#   - Memory wird separat über import_gemini_memory.py importiert
#     (Custom Instructions als Markdown-Block, Chat 54)
#   - Project-Docs existieren in Gemini nicht

import argparse
import sys
from pathlib import Path

# Pallas-Repo zum sys.path hinzufügen
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

import backend.models.registry  # noqa: F401
from backend.models.database import SessionLocal
from backend.services.llm_export_parser import GeminiExportParser
from backend.services.llm_import_service import (
    LLMImporter, ensure_provider, ensure_folder_structure,
)


def parse_args():
    p = argparse.ArgumentParser(
        description="Importiert einen Gemini-Export (Google Takeout) in Pallas"
    )
    p.add_argument("source", type=Path,
                   help="Pfad zum Gemini-Apps Verzeichnis ODER zur MeineAktivitäten.html")
    p.add_argument("--dry-run", action="store_true",
                   help="DB-Änderungen rollback statt commit")
    p.add_argument("--limit", type=int, default=None,
                   help="Nur die ersten N Conversations importieren (Test)")
    return p.parse_args()


def main():
    args = parse_args()

    if args.dry_run:
        print("DRY-RUN: alle DB-Änderungen werden rückgängig gemacht")

    # 1) Parser initialisieren und Conversations parsen
    print(f"\n[Conversations] Lade Gemini-Export aus {args.source} …")
    parser = GeminiExportParser(args.source)
    parsed = parser.parse_conversations()
    print(f"[Conversations] Geparst: {len(parsed)} Conversations "
          f"({parser._last_skipped} Activities geskippt)")

    if args.limit:
        parsed = parsed[:args.limit]
        print(f"[Conversations] Limit aktiv: nur erste {args.limit}")

    # 2) DB-Session aufbauen, Provider und Folder-Struktur sicherstellen
    db = SessionLocal()
    try:
        provider = ensure_provider(
            db, name="Gemini", slug="gemini", is_ongoing=False,
        )
        chats_folder, _memory_folder, _projectdocs_folder = ensure_folder_structure(
            db, provider_slug=provider.slug,
        )
        if not args.dry_run:
            db.commit()
        print(f"[Conversations] Provider: {provider.name} (id={provider.id})")
        print(f"[Conversations] Chats-Folder: id={chats_folder.id}, "
              f"metis_enabled={chats_folder.metis_enabled}")

        # 3) Import durchführen
        importer = LLMImporter(
            db=db, provider=provider, chats_folder=chats_folder,
            dry_run=args.dry_run,
        )
        stats = importer.import_conversations(parsed)

        # 4) Finaler Commit oder Rollback
        if not args.dry_run:
            db.commit()
        else:
            db.rollback()

        # 5) Summary-Output
        print()
        print("=" * 50)
        print("Gemini Conversations Import:")
        print(f"  created              {stats.created}")
        print(f"  updated              {stats.updated}")
        print(f"  skipped              {stats.skipped}")
        print(f"  errors               {stats.errors}")
        print("=" * 50)

    finally:
        db.close()


if __name__ == "__main__":
    main()
