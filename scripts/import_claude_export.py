# CLI-Script: Importiert einen Claude-Export in Pallas
# Plan-Referenz: pallas_llm_archive_plan.md §4.1, §9
#
# Usage:
#   python scripts/import_claude_export.py /path/to/export
#       → nur Conversations (Default, Slice 1a)
#   python scripts/import_claude_export.py /path/to/export --memories
#       → nur Memory-Import (Slice 1b)
#   python scripts/import_claude_export.py /path/to/export --project-docs
#       → nur Project-Docs-Import (Slice 1b)
#   python scripts/import_claude_export.py /path/to/export --all
#       → Conversations + Memory + Project-Docs
#   python scripts/import_claude_export.py /path/to/export --memories --project-docs
#       → ohne Conversations (z.B. Olymp-Szenario, wo Conversations schon drin sind)
#
# Modifiers:
#   --dry-run: alles parsen + DB-Operationen vorbereiten, aber rollback statt commit
#   --limit N: nur die ersten N Conversations (für schnelle Tests; ignoriert Memory/Docs)

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
from backend.services.llm_memory_service import import_memories
from backend.services.llm_project_docs_service import import_project_docs


def parse_args():
    p = argparse.ArgumentParser(
        description="Importiert einen Claude-Export in Pallas (P5.1 Slice 1a + 1b)"
    )
    p.add_argument("export_dir", type=Path,
                   help="Pfad zum entpackten Claude-Export-Verzeichnis")
    # Kategorie-Flags (additiv). Wenn keines gesetzt ist → Default = nur Conversations.
    p.add_argument("--conversations", action="store_true",
                   help="Conversations importieren (Default, wenn keine Kategorie gesetzt)")
    p.add_argument("--memories", action="store_true",
                   help="Memory-Import (memories.json)")
    p.add_argument("--project-docs", action="store_true",
                   help="Project-Docs-Import (projects.json)")
    p.add_argument("--all", action="store_true",
                   help="Alle drei Kategorien (Shortcut für --conversations --memories --project-docs)")
    # Modifiers
    p.add_argument("--dry-run", action="store_true",
                   help="DB-Änderungen rollback statt commit")
    p.add_argument("--limit", type=int, default=None,
                   help="Nur die ersten N Conversations importieren (Test; ignoriert Memory/Docs)")
    return p.parse_args()


def _resolve_categories(args) -> tuple[bool, bool, bool]:
    """Ermittelt, welche Kategorien laufen sollen. Default = nur Conversations."""
    if args.all:
        return True, True, True
    # Wenn mindestens ein Kategorie-Flag gesetzt ist, nur die gesetzten.
    any_flag = args.conversations or args.memories or args.project_docs
    if any_flag:
        return args.conversations, args.memories, args.project_docs
    # Sonst: Default-Verhalten wie vor Slice 1b.
    return True, False, False


def run_conversations(db, args) -> dict:
    """Führt den Conversations-Import aus und gibt ein Stats-Dict zurück."""
    print(f"\n[Conversations] Lade Export aus {args.export_dir} …")
    parser = ClaudeExportParser(args.export_dir)
    parsed = parser.parse_conversations()
    print(f"[Conversations] Geparst: {len(parsed)} Conversations (leere geskippt)")

    if args.limit:
        parsed = parsed[:args.limit]
        print(f"[Conversations] Limit aktiv: nur erste {args.limit}")

    provider = ensure_provider(db, name="Claude", slug="claude", is_ongoing=True)
    chats_folder, _memory, _projectdocs = ensure_folder_structure(
        db, provider_slug=provider.slug,
    )
    if not args.dry_run:
        db.commit()
    print(f"[Conversations] Provider: {provider.name} (id={provider.id})")
    print(f"[Conversations] Chats-Folder: id={chats_folder.id}, metis_enabled={chats_folder.metis_enabled}")

    importer = LLMImporter(
        db=db, provider=provider, chats_folder=chats_folder,
        dry_run=args.dry_run,
    )
    stats = importer.import_conversations(parsed)
    return {
        "created": stats.created,
        "updated": stats.updated,
        "skipped": stats.skipped,
        "errors": stats.errors,
    }


def _print_stats_block(title: str, stats: dict) -> None:
    """Einheitlicher Output-Block pro Kategorie."""
    print()
    print("=" * 50)
    print(f"{title}:")
    for key, value in stats.items():
        if key == "details":
            continue  # zu verbose für CLI-Summary
        print(f"  {key:<20} {value}")
    print("=" * 50)


def main():
    args = parse_args()
    do_convs, do_mem, do_docs = _resolve_categories(args)

    if args.dry_run:
        print("DRY-RUN: alle DB-Änderungen werden rückgängig gemacht")

    print(f"Kategorien: conversations={do_convs}, memories={do_mem}, project_docs={do_docs}")

    db = SessionLocal()
    try:
        all_stats: dict[str, dict] = {}

        if do_convs:
            all_stats["Conversations"] = run_conversations(db, args)
            _print_stats_block("Conversations Import", all_stats["Conversations"])

        if do_mem:
            print("\n[Memories] Starte Memory-Import …")
            all_stats["Memories"] = import_memories(
                db=db, provider_slug="claude", source_dir=args.export_dir, dry_run=args.dry_run,
            )
            _print_stats_block("Memory Import", all_stats["Memories"])

        if do_docs:
            print("\n[ProjectDocs] Starte Project-Docs-Import …")
            all_stats["ProjectDocs"] = import_project_docs(
            )
            _print_stats_block("Project-Docs Import", all_stats["ProjectDocs"])

        # Finaler Commit, falls nicht dry-run. Services committen teils selbst,
        # doppelter Commit ist aber ein no-op.
        if not args.dry_run:
            db.commit()
        else:
            db.rollback()

        # Gesamt-Summary, wenn mehr als eine Kategorie lief
        if len(all_stats) > 1:
            print()
            print("#" * 50)
            print("Gesamt-Summary:")
            for cat_name, cat_stats in all_stats.items():
                created = cat_stats.get("created", 0)
                updated = cat_stats.get("updated", 0)
                print(f"  {cat_name:<15} created={created}, updated={updated}")
            print("#" * 50)
    finally:
        db.close()


if __name__ == "__main__":
    main()
