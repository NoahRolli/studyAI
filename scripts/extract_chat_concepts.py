#!/usr/bin/env python3
# CLI für Konzept-Extraktion aus LLM-Chat-Messages (P5.1 Slice 1c)
# Beispiele:
#   python scripts/extract_chat_concepts.py --dry-run --limit 5
#   python scripts/extract_chat_concepts.py --resume
#   python scripts/extract_chat_concepts.py --force --provider ollama_local
#
# Default: --resume (nur unbearbeitete Messages), --concurrency 4

import argparse
import asyncio
import logging
import sys
from pathlib import Path

# Projekt-Root in sys.path (falls Script direkt aufgerufen wird)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.models.database import SessionLocal
from backend.infra.model_router import set_page_override, get_active_provider
from backend.services.llm_concept_extractor import (
    batch_extract,
    get_pending_message_ids,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extrahiert Konzepte aus llm_messages."
    )
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Maximal N Messages verarbeiten (default: alle)",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Nichts persistieren, nur Stats zeigen",
    )
    parser.add_argument(
        "--force", action="store_true",
        help="Alle Messages, ignoriert extracted_at (default: --resume)",
    )
    parser.add_argument(
        "--concurrency", type=int, default=4,
        help="Parallele LLM-Calls (default: 4)",
    )
    parser.add_argument(
        "--provider", default=None,
        choices=["ollama_local", "ollama_server", "groq"],
        help="Provider-Override für diese Page (default: Router-Setting)",
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true",
        help="Mehr Logs (DEBUG-Level für extractor)",
    )
    return parser.parse_args()


def setup_logging(verbose: bool) -> None:
    """Konfiguriert Logging — kompakt, ohne SQLAlchemy/httpx-Spam."""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
    )
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)


async def run(args: argparse.Namespace) -> int:
    """Hauptlogik. Returns exit code (0 = ok, 1 = nichts zu tun, 2 = fehler)."""
    if args.provider:
        set_page_override("metis", args.provider)
    logging.info(f"Provider für 'metis': {get_active_provider('metis')}")

    db = SessionLocal()
    try:
        ids = get_pending_message_ids(
            db, limit=args.limit, force=args.force
        )
    finally:
        db.close()

    if not ids:
        logging.info("Keine pending Messages — nichts zu tun.")
        return 1

    mode = "DRY-RUN" if args.dry_run else "LIVE"
    logging.info(
        f"{mode} | {len(ids)} Messages | concurrency={args.concurrency}"
    )

    stats = await batch_extract(
        ids, concurrency=args.concurrency, dry_run=args.dry_run
    )

    print("\n" + "=" * 60)
    print("EXTRACT SUMMARY")
    print("=" * 60)
    print(stats.summary())
    print("=" * 60)

    # Hard-Error wenn ALLE Messages an LLM-Errors gestorben sind
    if stats.processed > 0 and stats.llm_errors == stats.processed:
        logging.error("Alle Messages mit LLM-Errors — Provider down?")
        return 2
    return 0


def main() -> int:
    args = parse_args()
    setup_logging(args.verbose)
    try:
        return asyncio.run(run(args))
    except KeyboardInterrupt:
        logging.warning("Abgebrochen durch User (CTRL+C)")
        return 130


if __name__ == "__main__":
    sys.exit(main())
