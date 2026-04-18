# CLI-Script: Importiert einen Claude-Export in Pallas
# Plan-Referenz: pallas_llm_archive_plan.md §4.1, §9
#
# Usage:
#   python scripts/import_claude_export.py /path/to/export
#   python scripts/import_claude_export.py /path/to/export --dry-run
#   python scripts/import_claude_export.py /path/to/export --limit 10
#
# --dry-run: alles parsen + DB-Operationen vorbereiten, aber rollback statt commit
# --limit N: nur die ersten N Conversations (für schnelle Tests)

import argparse
import sys
from pathlib import Path

# Pallas-Repo zum sys.path hinzufügen (Script läuft aus scripts/, Imports brauchen Repo-Root)
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

import backend.models.registry  # noqa: F401
from backend.models.database import SessionLocal
from backend.services.llm_export_parser import ClaudeExportParser
from backend.services.llm_import_service import (
    LLMImporter, ensure_provider, ensure_folder_structure,
)


def parse_args():
    p = argparse.ArgumentParser(
        description="Importiert einen Claude-Export in Pallas (Slice 1 von P5.1)"
    )
    p.add_argument("export_dir", type=Path,
                   help="Pfad zum entpackten Claude-Export-Verzeichnis")
    p.add_argument("--dry-run", action="store_true",
                   help="DB-Änderungen rollback statt commit")
    p.add_argument("--limit", type=int, default=None,
                   help="Nur die ersten N Conversations importieren (Test)")
    return p.parse_args()


def main():
    args = parse_args()

    # 1. Export laden + parsen
    print(f"Lade Export aus {args.export_dir} …")
    parser = ClaudeExportParser(args.export_dir)
    parsed = parser.parse_conversations()
    print(f"Geparst: {len(parsed)} Conversations (leere geskippt)")

    if args.limit:
        parsed = parsed[:args.limit]
        print(f"Limit aktiv: nur erste {args.limit}")

    if args.dry_run:
        print("DRY-RUN: alle DB-Änderungen werden rückgängig gemacht")

    # 2. DB-Session öffnen
    db = SessionLocal()
    try:
        # 3. Provider + Folder-Struktur sicherstellen
        provider = ensure_provider(
            db, name="Claude", slug="claude", is_ongoing=True,
        )
        chats_folder, _memory, _projectdocs = ensure_folder_structure(
            db, provider_slug=provider.slug,
        )
        if not args.dry_run:
            db.commit()
        print(f"Provider: {provider.name} (id={provider.id})")
        print(f"Chats-Folder: id={chats_folder.id}, metis_enabled={chats_folder.metis_enabled}")

        # 4. Importer durchlaufen
        importer = LLMImporter(
            db=db, provider=provider, chats_folder=chats_folder,
            dry_run=args.dry_run,
        )
        stats = importer.import_conversations(parsed)

        # 5. Stats ausgeben
        print()
        print("=" * 50)
        print("Import abgeschlossen:")
        print(f"  Neu erstellt:  {stats.created}")
        print(f"  Aktualisiert:  {stats.updated}")
        print(f"  Übersprungen:  {stats.skipped}  (idempotent, unverändert)")
        print(f"  Fehler:        {stats.errors}")
        print("=" * 50)
    finally:
        db.close()


if __name__ == "__main__":
    main()
