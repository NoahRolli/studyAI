# Metis API — Knowledge-Graph Endpunkte
# Sync, Graph-Abfrage, Node-Position, Edge CRUD.
# AI-Endpunkte (Auto-Link, Auto-Cluster) sind in metis_ai.py.

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from backend.models.database import get_db
from backend.models.metis_node import MetisNode
from backend.models.metis_edge import MetisEdge
from backend.models.metis_cluster import MetisCluster, MetisClusterMember
from backend.models.note import Note
from backend.models.summary import Summary
from backend.models.document import Document
from backend.api.metis_sync import sync_nodes, sync_wikilinks

router = APIRouter(prefix="/api/metis", tags=["metis"])


# --- Pydantic Schemas ---

class PositionUpdate(BaseModel):
    """Schema für Node-Position Update (Pin)."""
    pos_x: Optional[float] = None
    pos_y: Optional[float] = None


class EdgeCreate(BaseModel):
    """Schema für manuelles Edge-Erstellen."""
    source_node_id: int
    target_node_id: int
    relation_type: str = "related"
    strength: float = 0.5


# --- Hilfs-Funktionen ---

def _node_to_dict(node: MetisNode, db: Session) -> dict:
    """Konvertiert einen MetisNode zu einem Dict mit Quell-Titel."""
    title = ""
    if node.type == "note":
        note = db.query(Note).filter(Note.id == node.source_id).first()
        title = note.title if note else "(gelöscht)"
    elif node.type == "summary":
        summary = db.query(Summary).filter(
            Summary.id == node.source_id
        ).first()
        if summary:
            doc = db.query(Document).filter(
                Document.id == summary.document_id
            ).first()
            title = doc.filename if doc else f"Summary #{node.source_id}"
        else:
            title = "(gelöscht)"

    return {
        "id": node.id,
        "type": node.type,
        "source_id": node.source_id,
        "title": title,
        "pos_x": node.pos_x,
        "pos_y": node.pos_y,
        "embedding_stale": node.embedding_stale,
        "cluster_ids": [m.cluster_id for m in node.cluster_memberships],
    }


def _edge_to_dict(edge: MetisEdge) -> dict:
    """Konvertiert eine MetisEdge zu einem Dict."""
    return {
        "id": edge.id,
        "source_node_id": edge.source_node_id,
        "target_node_id": edge.target_node_id,
        "relation_type": edge.relation_type,
        "strength": edge.strength,
    }


def _cluster_to_dict(cluster: MetisCluster) -> dict:
    """Konvertiert einen MetisCluster zu einem Dict."""
    return {
        "id": cluster.id,
        "label": cluster.label,
        "description": cluster.description,
        "color": cluster.color,
        "node_ids": [m.node_id for m in cluster.members],
    }


# --- Endpunkte ---

@router.get("/graph")
def get_graph(db: Session = Depends(get_db)):
    """Kompletter Knowledge-Graph: Nodes + Edges + Clusters."""
    nodes = db.query(MetisNode).all()
    edges = db.query(MetisEdge).all()
    clusters = db.query(MetisCluster).all()

    return {
        "nodes": [_node_to_dict(n, db) for n in nodes],
        "edges": [_edge_to_dict(e) for e in edges],
        "clusters": [_cluster_to_dict(c) for c in clusters],
    }


@router.post("/sync")
def sync_graph(db: Session = Depends(get_db)):
    """Synchronisiert Notes + Summaries mit dem Graph."""
    node_stats = sync_nodes(db)
    wikilinks_synced = sync_wikilinks(db)
    db.commit()

    return {
        "nodes_added": node_stats["added"],
        "nodes_removed": node_stats["removed"],
        "wikilinks_synced": wikilinks_synced,
    }


@router.put("/nodes/{node_id}/position")
def update_position(
    node_id: int,
    data: PositionUpdate,
    db: Session = Depends(get_db),
):
    """Node-Position speichern (Pin). Null = zurück zu Auto-Layout."""
    node = db.query(MetisNode).filter(MetisNode.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node nicht gefunden")

    node.pos_x = data.pos_x
    node.pos_y = data.pos_y
    db.commit()
    return {"ok": True}


@router.post("/edges")
def create_edge(data: EdgeCreate, db: Session = Depends(get_db)):
    """Manuell eine Edge zwischen zwei Nodes erstellen."""
    # Prüfen ob beide Nodes existieren
    source = db.query(MetisNode).filter(
        MetisNode.id == data.source_node_id
    ).first()
    target = db.query(MetisNode).filter(
        MetisNode.id == data.target_node_id
    ).first()
    if not source or not target:
        raise HTTPException(status_code=404, detail="Node nicht gefunden")

    # Duplikat-Prüfung
    existing = (
        db.query(MetisEdge)
        .filter(
            MetisEdge.source_node_id == data.source_node_id,
            MetisEdge.target_node_id == data.target_node_id,
            MetisEdge.relation_type == data.relation_type,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Edge existiert bereits")

    edge = MetisEdge(
        source_node_id=data.source_node_id,
        target_node_id=data.target_node_id,
        relation_type=data.relation_type,
        strength=data.strength,
    )
    db.add(edge)
    db.commit()
    db.refresh(edge)
    return _edge_to_dict(edge)


@router.delete("/edges/{edge_id}")
def delete_edge(edge_id: int, db: Session = Depends(get_db)):
    """Edge löschen."""
    edge = db.query(MetisEdge).filter(MetisEdge.id == edge_id).first()
    if not edge:
        raise HTTPException(status_code=404, detail="Edge nicht gefunden")

    db.delete(edge)
    db.commit()
    return {"ok": True}
