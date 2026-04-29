# Topics API — Endpoints fuer Insights-Topics-Tab
#
# GET  /api/journal/insights/topics              — Liest aktuellen DB-Stand
# POST /api/journal/insights/topics/recompute    — Full Recluster + Re-Label
#
# Beide Endpoints brauchen entsperrtes Journal.
# Pattern uebernommen aus insights.py:
#   require_unlocked()              # wirft 403 wenn locked
#   key = session_manager.get_key() # holt bytes-Key
#
# Recompute-Pipeline analog zu backend/scripts/journal_recluster.py:
#   1. cluster_all_entries(key, db, threshold)
#   2. regenerate_all_labels(key, db, language)

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.journal.models.journal_database import get_journal_db
from backend.journal.api.dependencies import require_unlocked
from backend.journal.services.session_service import session_manager
from backend.journal.services.clustering_service import (
    cluster_all_entries,
    regenerate_all_labels,
)
from backend.journal.services.topic_query_service import get_topics_overview


router = APIRouter(prefix="/api/journal/insights", tags=["journal-topics"])


class RecomputeRequest(BaseModel):
    threshold: float = Field(
        default=0.65,
        ge=0.40,
        le=0.95,
        description="Cosine-Sim-Threshold fuer Cluster-Merging.",
    )
    language: str = Field(
        default="de",
        description="Sprache fuer Label-Generation (de/en).",
    )


@router.get("/topics")
async def get_topics(db: Session = Depends(get_journal_db)):
    """
    Liefert aktuellen Cluster-Stand inkl. Labels und Mood-Aggregat.
    Read-only — Recompute geht ueber POST /topics/recompute.
    """
    require_unlocked()
    key = session_manager.get_key()
    return get_topics_overview(key, db)


@router.post("/topics/recompute")
async def recompute_topics(
    payload: RecomputeRequest,
    db: Session = Depends(get_journal_db),
):
    """
    Full Recluster + Re-Label aller Eintraege.

    Sync-Aufruf — bei vielen Eintraegen kann das 30+ Sekunden dauern.
    Frontend zeigt Loading-Spinner. Bei Timeout: CLI nutzen.
    """
    require_unlocked()
    key = session_manager.get_key()

    cluster_result = await cluster_all_entries(key, db, threshold=payload.threshold)

    if cluster_result["status"] == "insufficient_data":
        return {
            "status": "insufficient_data",
            "embedding_count": cluster_result.get("embedding_count", 0),
            "message": (
                "Zu wenige Eintraege fuer Clustering. "
                "Mindestens 2 embedded Eintraege noetig."
            ),
        }

    label_count = await regenerate_all_labels(key, db, language=payload.language)

    overview = get_topics_overview(key, db)

    return {
        "status": "ok",
        "threshold_used": payload.threshold,
        "embedding_count": cluster_result["embedding_count"],
        "cluster_count": cluster_result["cluster_count"],
        "labels_generated": label_count,
        "overview": overview,
    }
