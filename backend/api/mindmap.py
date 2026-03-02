# API-Endpunkte für die interaktive Mindmap
# Generiert Mindmaps aus Zusammenfassungen und ermöglicht Deep Dive (Reinzoomen)

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.models.database import get_db
from backend.models.summary import Summary
from backend.services.mindmap_service import (
    create_mindmap_from_summary,
    expand_node,
    get_mindmap_tree,
)

# Router-Objekt — wird in main.py registriert
router = APIRouter(prefix="/api", tags=["mindmap"])


# POST /api/summaries/{id}/mindmap — Mindmap aus Zusammenfassung generieren
@router.post("/summaries/{summary_id}/mindmap")
async def generate_mindmap(summary_id: int, db: Session = Depends(get_db)):
    summary = db.query(Summary).filter(Summary.id == summary_id).first()
    if not summary:
        raise HTTPException(status_code=404, detail="Zusammenfassung nicht gefunden.")

    if not summary.content:
        raise HTTPException(status_code=400, detail="Zusammenfassung ist leer.")

    try:
        tree = await create_mindmap_from_summary(
            summary_id=summary_id,
            text=summary.content,
            db=db,
        )
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Mindmap-Generierung fehlgeschlagen: {e}"
        )

    return {
        "summary_id": summary_id,
        "tree": tree,
        "message": "Mindmap erfolgreich generiert."
    }


# GET /api/summaries/{id}/mindmap — Gespeicherte Mindmap abrufen
@router.get("/summaries/{summary_id}/mindmap")
def get_mindmap(summary_id: int, db: Session = Depends(get_db)):
    summary = db.query(Summary).filter(Summary.id == summary_id).first()
    if not summary:
        raise HTTPException(status_code=404, detail="Zusammenfassung nicht gefunden.")

    tree = get_mindmap_tree(summary_id, db)

    if not tree:
        raise HTTPException(
            status_code=404,
            detail="Keine Mindmap vorhanden. Zuerst POST .../mindmap aufrufen."
        )

    return {
        "summary_id": summary_id,
        "tree": tree,
    }


# POST /api/mindmap/nodes/{id}/expand — Knoten reinzoomen (Deep Dive)
@router.post("/mindmap/nodes/{node_id}/expand")
async def expand_mindmap_node(node_id: int, db: Session = Depends(get_db)):
    # Originaltext aus der verknüpften Zusammenfassung als Kontext holen
    from backend.models.mindmap_node import MindmapNode

    node = db.query(MindmapNode).filter(MindmapNode.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Knoten nicht gefunden.")

    # Kontext aus der Zusammenfassung laden
    summary = db.query(Summary).filter(Summary.id == node.summary_id).first()
    context = summary.content if summary else ""

    try:
        children = await expand_node(node_id, context, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Deep Dive fehlgeschlagen: {e}"
        )

    return {
        "node_id": node_id,
        "children": children,
        "message": "Knoten erfolgreich erweitert."
    }