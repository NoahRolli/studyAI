# Konzept-Extraktion aus LLM-Chat-Messages (P5.1 Slice 1c)
# Iteriert über llm_messages, schreibt ConceptSource(source_type="chat_message").
# Resume-fähig via extracted_at (Option A: bei Parse-Error trotzdem markiert).
# Semaphore(4) für parallele LLM-Calls, eigene DB-Session pro Message.

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from backend.models.database import SessionLocal
from backend.models.llm import LLMMessage
from backend.api.concepts_ai import (
    ai_chat_with_provider,
    parse_json_response,
    get_or_create_concept,
    link_source,
)

logger = logging.getLogger(__name__)

# Mindestlänge — kürzere Messages ("ok", "thanks") werden nicht extrahiert,
# nur extracted_at gesetzt. Spart Tokens.
MIN_TEXT_LENGTH = 30

# Prompt — angelehnt an extract_keywords_ollama, aber für Chat-Messages
EXTRACTION_PROMPT = (
    "Extract 2 to 6 key concepts from this chat message.\n\n"
    "RULES:\n"
    "- Only domain-specific nouns or noun phrases "
    "(e.g. 'machine learning', 'knowledge graph', 'OAuth 2.0', "
    "'Fuzzy Logic', 'Ontologie', 'Wissensrepräsentation')\n"
    "- NO generic words: test, example, system, data, function, "
    "method, process, node, graph, file, code, type, value, "
    "list, table, result, input, output, error, object, class, "
    "module, component, page, button, text, name, title, content, "
    "format, structure, model, database, server, client, user, "
    "application, interface, feature, tool, option, setting, "
    "version, update, change, problem, solution, approach\n"
    "- NO verbs or adjectives\n"
    "- NO single characters, IDs, variable names, or file paths\n"
    "- German academic terms are welcome\n"
    "- Prefer established terminology over invented phrases\n"
    "- If the message has no extractable domain concepts, return []\n"
    "Return ONLY a JSON array of objects: "
    '[{{"name": "concept", "relevance": 0.7}}, ...]\n'
    "Relevance: 0.0-1.0, how central the concept is to the message.\n\n"
    "Message: {text}"
)


@dataclass
class ExtractStats:
    """Akkumulierte Statistik eines Batch-Runs."""
    processed: int = 0           # Messages durchgegangen
    skipped_short: int = 0       # zu kurz, direkt extracted_at
    skipped_empty: int = 0       # text leer
    concepts_created: int = 0    # neue Konzepte (best-effort)
    sources_linked: int = 0      # ConceptSources angelegt
    parse_errors: int = 0        # LLM-Output kein valides JSON
    llm_errors: int = 0          # LLM-Call selbst fehlgeschlagen
    providers_used: dict = field(default_factory=dict)

    def summary(self) -> str:
        return (f"processed={self.processed} skip_short={self.skipped_short} "
                f"skip_empty={self.skipped_empty} created={self.concepts_created} "
                f"linked={self.sources_linked} parse_err={self.parse_errors} "
                f"llm_err={self.llm_errors} providers={dict(self.providers_used)}")


async def extract_concepts_for_message(
    text: str,
    semaphore: asyncio.Semaphore,
) -> tuple[list[dict], str | None, str | None]:
    """
    Reine Extraktion ohne DB-Zugriff.
    Returns: (concepts, provider_name, error_kind)
      concepts:      Liste {"name": str, "relevance": float}
      provider_name: z.B. "groq" oder "ollama_local:gemma4:e2b" oder None
      error_kind:    None | "llm" | "parse"
    """
    prompt = EXTRACTION_PROMPT.format(text=text[:3000])
    async with semaphore:
        try:
            response, provider = await ai_chat_with_provider(prompt, page="metis")
        except Exception as exc:
            logger.warning(f"LLM-Call fehlgeschlagen: {exc}")
            return [], None, "llm"

    parsed = parse_json_response(response)
    if not isinstance(parsed, list):
        return [], provider, "parse"

    concepts = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        if not isinstance(name, str) or not (2 < len(name.strip()) < 80):
            continue
        relevance = item.get("relevance", 0.5)
        try:
            relevance = float(relevance)
        except (TypeError, ValueError):
            relevance = 0.5
        relevance = max(0.0, min(1.0, relevance))
        concepts.append({"name": name.strip(), "relevance": relevance})

    return concepts, provider, None


async def process_message(
    msg_id: int,
    semaphore: asyncio.Semaphore,
    stats: ExtractStats,
    dry_run: bool,
) -> None:
    """
    Verarbeitet eine einzelne Message in eigener DB-Session.
    Atomar: entweder alles committet oder Rollback bei Crash.
    """
    db: Session = SessionLocal()
    try:
        msg = db.query(LLMMessage).filter(LLMMessage.id == msg_id).first()
        if msg is None:
            logger.warning(f"Message {msg_id} nicht gefunden")
            return

        text = (msg.text or "").strip()

        # Leere Messages: extracted_at setzen, raus
        if not text:
            stats.skipped_empty += 1
            if not dry_run:
                msg.extracted_at = datetime.now(timezone.utc)
                db.commit()
            stats.processed += 1
            return

        # Sehr kurze Messages: nicht extrahieren, aber als erledigt markieren
        if len(text) < MIN_TEXT_LENGTH:
            stats.skipped_short += 1
            if not dry_run:
                msg.extracted_at = datetime.now(timezone.utc)
                db.commit()
            stats.processed += 1
            return

        # LLM-Call (außerhalb der DB-Session-kritischen Region)
        concepts, provider, error_kind = await extract_concepts_for_message(
            text, semaphore
        )

        if provider:
            stats.providers_used[provider] = (
                stats.providers_used.get(provider, 0) + 1
            )

        if error_kind == "llm":
            stats.llm_errors += 1
            # extracted_at NICHT setzen — bei nächstem --resume retry
            stats.processed += 1
            return

        if error_kind == "parse":
            stats.parse_errors += 1
            if not dry_run:  # Option A: markieren, kein Endlos-Retry
                msg.extracted_at = datetime.now(timezone.utc)
                db.commit()
            stats.processed += 1
            return

        # Konzepte verlinken
        for c in concepts:
            concept = get_or_create_concept(db, c["name"])
            if concept is None:
                continue
            # Tracking ob neu (best-effort: Concept.id war vor flush None)
            was_new = concept.embedding_stale and concept.id is not None
            link_source(db, concept, "chat_message", msg.id, c["relevance"])
            stats.sources_linked += 1
            if was_new:
                stats.concepts_created += 1

        if not dry_run:
            msg.extracted_at = datetime.now(timezone.utc)
            db.commit()
        else:
            db.rollback()

        stats.processed += 1

    except Exception as exc:
        logger.error(f"Unerwarteter Fehler bei msg {msg_id}: {exc}", exc_info=True)
        db.rollback()
    finally:
        db.close()


def get_pending_message_ids(
    db: Session,
    limit: int | None = None,
    force: bool = False,
) -> list[int]:
    """
    Holt IDs aller noch nicht extrahierten Messages.
    force=True ignoriert extracted_at (alle Messages).
    """
    query = db.query(LLMMessage.id)
    if not force:
        query = query.filter(LLMMessage.extracted_at.is_(None))
    query = query.order_by(LLMMessage.id)
    if limit:
        query = query.limit(limit)
    return [row[0] for row in query.all()]


async def batch_extract(
    message_ids: list[int],
    concurrency: int = 4,
    dry_run: bool = False,
) -> ExtractStats:
    """
    Orchestrator: parallel über alle message_ids,
    eigene DB-Session pro Message.
    """
    stats = ExtractStats()
    semaphore = asyncio.Semaphore(concurrency)

    tasks = [
        process_message(mid, semaphore, stats, dry_run)
        for mid in message_ids
    ]

    # Progress-Logging alle 50 abgeschlossene Messages
    completed = 0
    for coro in asyncio.as_completed(tasks):
        await coro
        completed += 1
        if completed % 50 == 0:
            logger.info(f"Progress: {completed}/{len(message_ids)} — {stats.summary()}")

    return stats
