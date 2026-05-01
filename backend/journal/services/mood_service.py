# Mood Service — Stimmungsanalyse mit Cache
# Prüft vor jeder Analyse ob ein gültiger Cache existiert
# Cache wird invalidiert wenn: Inhalt geändert oder Sprache gewechselt
#
# Ablauf: Hash berechnen → Cache prüfen → nur bei Miss analysieren
# Ergebnisse werden in mood_cache Tabelle persistiert

import hashlib
from sqlalchemy.orm import Session
from backend.journal.services.journal_ai_service import journal_ai
from backend.journal.models.mood_cache import MoodCache

from backend.journal.services.fuzzy_mood import fuzzify, dominant_mood
from backend.journal.services.embedding_service import embed_and_store, load_embedding
from backend.journal.services.clustering_service import assign_entry_to_cluster
from backend.journal.services.session_service import session_manager
def _compute_hash(title: str, content: str) -> str:
    """SHA-256 Hash über Titel + Inhalt — für Cache-Invalidierung."""
    combined = f"{title}|||{content}"
    return hashlib.sha256(combined.encode("utf-8")).hexdigest()


def _cache_to_dict(cache: MoodCache) -> dict:
    """Konvertiert einen MoodCache-Eintrag in ein API-Response-Dict."""
    return {
        "entry_id": cache.entry_id,
        "score": cache.score,
        "label": cache.label,
        "keywords": cache.keywords.split(",") if cache.keywords else [],
        "fuzzy": fuzzify(cache.score),
        "fuzzy_label": dominant_mood(cache.score),
    }


def _clamp_score(score: float) -> float:
    """Begrenzt den Score auf den Bereich -1.0 bis 1.0."""
    try:
        return max(-1.0, min(1.0, float(score)))
    except (TypeError, ValueError):
        return 0.0


async def _ensure_embedding(entry_id: int, title: str, content: str, db: Session) -> None:
    """
    Stellt sicher dass ein Embedding fuer den Eintrag existiert.
    Schluckt Fehler nicht-blockierend - Mood-Flow soll bei Embed-Fehler nicht crashen.
    Idempotent: kein Re-Embed bei unveraendertem Hash.
    """
    key = session_manager.get_key()
    if not key:
        return  # Keine Session, kein Encrypt moeglich - skip
    try:
        await embed_and_store(entry_id, title, content, key, db)
    except Exception:
        # Bewusst geschluckt: Embedding-Fehler darf Mood nicht blockieren
        # CLI-Script kann fehlende Embeddings spaeter nachholen
        return

    # Inkrementelle Cluster-Zuordnung: neuer Entry waehlt naechsten Cluster
    # Falls noch keine Cluster existieren oder kein Cluster nahe genug -> None
    try:
        embedding = load_embedding(entry_id, key, db)
        if embedding is not None:
            assign_entry_to_cluster(entry_id, embedding, key, db)
    except Exception:
        # Auch hier defensiv: Cluster-Fehler darf Mood nicht blockieren
        pass


async def analyze_entry_mood(
    entry_id: int,
    title: str,
    content: str,
    language: str,
    db: Session,
) -> dict:
    """
    Analysiert die Stimmung eines Eintrags — mit Cache.
    1. Hash berechnen
    2. Cache prüfen (gleicher Hash + gleiche Sprache = Hit)
    3. Bei Miss: Ollama analysieren, Cache speichern
    Inhalts-Sprache wird via langdetect erkannt (UI-Sprache als Fallback).
    """
    from backend.journal.services.language_detect import detect_content_language
    language = detect_content_language(content, fallback=language)  # type: ignore[arg-type]
    content_hash = _compute_hash(title, content)

    # Cache-Lookup
    cached = db.query(MoodCache).filter(
        MoodCache.entry_id == entry_id
    ).first()

    # Cache Hit — Hash und Sprache stimmen überein
    if cached and cached.content_hash == content_hash and cached.language == language:
        await _ensure_embedding(entry_id, title, content, db)
        return _cache_to_dict(cached)

    # Cache Miss — Ollama analysieren
    if not await journal_ai.is_available():
        return {
            "entry_id": entry_id,
            "score": 0.0,
            "label": "nicht verfügbar",
            "keywords": [],
            "error": "Ollama nicht erreichbar",
        }

    result = await journal_ai.analyze_mood(title, content, language)
    score = _clamp_score(result.get("score", 0.0))
    label = result.get("label", "unbekannt")
    keywords = result.get("keywords", [])
    keywords_str = ",".join(keywords) if keywords else ""

    # Cache schreiben oder aktualisieren
    if cached:
        cached.content_hash = content_hash
        cached.score = score
        cached.label = label
        cached.keywords = keywords_str
        cached.language = language
    else:
        cached = MoodCache(
            entry_id=entry_id,
            content_hash=content_hash,
            score=score,
            label=label,
            keywords=keywords_str,
            language=language,
        )
        db.add(cached)

    db.commit()

    await _ensure_embedding(entry_id, title, content, db)

    return {
        "entry_id": entry_id,
        "score": score,
        "label": label,
        "keywords": keywords,
        "fuzzy": fuzzify(score),
        "fuzzy_label": dominant_mood(score),
    }


async def analyze_multiple_entries(
    entries: list[dict],
    language: str,
    db: Session,
) -> list[dict]:
    """
    Analysiert mehrere Einträge — gecachte werden übersprungen.
    Nur Einträge mit neuem/geändertem Inhalt werden via Ollama analysiert.
    """
    results = []
    for entry in entries:
        mood = await analyze_entry_mood(
            entry_id=entry["id"],
            title=entry["title"],
            content=entry["content"],
            language=language,
            db=db,
        )
        results.append(mood)
    return results