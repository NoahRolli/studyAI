# Journal Metis API — Verschlüsselter Knowledge-Graph im Journal
# Graph: Merged View aus Journal-Nodes + öffentlichen Metis-Nodes
# Sync: Journal-Einträge → Nodes (verschlüsselt, mit Cleanup)
# Position, Edge-Review (Confirm/Reject)

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from backend.journal.models.journal_database import get_journal_db
from backend.journal.models.journal_metis_node import JournalMetisNode
from backend.journal.models.journal_metis_edge import JournalMetisEdge
from backend.journal.models.journal_metis_cluster import (
    JournalMetisCluster, JournalMetisClusterMember,
)
from backend.journal.models.journal_entry import JournalEntry
from backend.journal.services.crypto_service import encrypt_text, decrypt_text
from backend.journal.services.session_service import session_manager
from backend.models.database import get_db
from backend.models.metis_node import MetisNode
from backend.models.metis_edge import MetisEdge
from backend.models.metis_cluster import MetisCluster, MetisClusterMember
from backend.models.note import Note
from backend.models.summary import Summary

router = APIRouter(
    prefix="/api/journal/metis",
    tags=["journal-metis"],
)


class EdgeReview(BaseModel):
    """Schema für Edge-Bestätigung/Ablehnung."""
    reason: Optional[str] = None


def require_journal_key():
    """Prüft ob Journal entsperrt ist, gibt AES-Key zurück."""
    key = session_manager.get_key()
    if not key:
        raise HTTPException(status_code=403, detail="Journal gesperrt")
    return key


# --- GET /graph — Merged View ---

@router.get("/graph")
def get_merged_graph(
    journal_db: Session = Depends(get_journal_db),
    main_db: Session = Depends(get_db),
):
    key = require_journal_key()

    # 1. Journal-Nodes entschlüsseln
    j_nodes = journal_db.query(JournalMetisNode).all()
    journal_nodes = []
    for n in j_nodes:
        label = ""
        if n.encrypted_label and n.label_iv:
            try:
                label = decrypt_text(
                    n.label_iv + n.encrypted_label, key
                )
            except Exception:
                label = "???"
        memberships = journal_db.query(
            JournalMetisClusterMember
        ).filter(
            JournalMetisClusterMember.node_id == n.id
        ).all()
        journal_nodes.append({
            "id": f"j-{n.id}",
            "type": n.type,
            "source_id": n.source_id,
            "label": label,
            "pos_x": n.pos_x,
            "pos_y": n.pos_y,
            "cluster_ids": [m.cluster_id for m in memberships],
            "realm": "journal",
        })

    # 2. Journal-Edges (rejected rausfiltern)
    j_edges = journal_db.query(JournalMetisEdge).filter(
        JournalMetisEdge.status != "rejected"
    ).all()
    journal_edges = [{
        "id": f"j-{e.id}",
        "source": f"j-{e.source_node_id}",
        "target": f"j-{e.target_node_id}",
        "relation_type": e.relation_type,
        "strength": e.strength,
        "status": e.status,
        "realm": "journal",
    } for e in j_edges]

    # 3. Journal-Clusters
    j_clusters = journal_db.query(JournalMetisCluster).all()
    journal_clusters = []
    for c in j_clusters:
        label = ""
        if c.encrypted_label and c.label_iv:
            try:
                label = decrypt_text(
                    c.label_iv + c.encrypted_label, key
                )
            except Exception:
                label = "???"
        members = journal_db.query(
            JournalMetisClusterMember
        ).filter(
            JournalMetisClusterMember.cluster_id == c.id
        ).all()
        journal_clusters.append({
            "id": f"j-{c.id}",
            "label": label,
            "color": c.color,
            "node_ids": [f"j-{m.node_id}" for m in members],
            "realm": "journal",
        })

    # 4. Öffentliche Metis-Nodes
    pub_nodes_raw = main_db.query(MetisNode).all()
    pub_nodes = []
    for n in pub_nodes_raw:
        label = ""
        if n.type == "note":
            note = main_db.query(Note).filter(
                Note.id == n.source_id
            ).first()
            label = note.title if note else f"Note #{n.source_id}"
        elif n.type == "summary":
            summary = main_db.query(Summary).filter(
                Summary.id == n.source_id
            ).first()
            label = (summary.content[:50] if summary
                     else f"Summary #{n.source_id}")
        memberships = main_db.query(MetisClusterMember).filter(
            MetisClusterMember.node_id == n.id
        ).all()
        pub_nodes.append({
            "id": f"p-{n.id}",
            "type": n.type,
            "source_id": n.source_id,
            "label": label,
            "pos_x": n.pos_x,
            "pos_y": n.pos_y,
            "cluster_ids": [f"p-{m.cluster_id}" for m in memberships],
            "realm": "public",
        })

    # 5. Öffentliche Edges (rejected rausfiltern)
    pub_edges_raw = main_db.query(MetisEdge).filter(
        MetisEdge.status != "rejected"
    ).all()
    pub_edges = [{
        "id": f"p-{e.id}",
        "source": f"p-{e.source_node_id}",
        "target": f"p-{e.target_node_id}",
        "relation_type": e.relation_type,
        "strength": e.strength,
        "status": e.status,
        "realm": "public",
    } for e in pub_edges_raw]

    # 6. Öffentliche Clusters
    pub_clusters_raw = main_db.query(MetisCluster).all()
    pub_clusters = []
    for c in pub_clusters_raw:
        members = main_db.query(MetisClusterMember).filter(
            MetisClusterMember.cluster_id == c.id
        ).all()
        pub_clusters.append({
            "id": f"p-{c.id}",
            "label": c.label,
            "color": c.color,
            "node_ids": [f"p-{m.node_id}" for m in members],
            "realm": "public",
        })

    return {
        "nodes": journal_nodes + pub_nodes,
        "edges": journal_edges + pub_edges,
        "clusters": journal_clusters + pub_clusters,
    }


# --- POST /sync — mit Cleanup für gelöschte Entries ---

@router.post("/sync")
def sync_journal_nodes(
    journal_db: Session = Depends(get_journal_db),
):
    key = require_journal_key()
    entries = journal_db.query(JournalEntry).filter(
        JournalEntry.is_deleted == 0
    ).all()
    entry_ids = {e.id for e in entries}
    created = 0
    removed = 0

    # Verwaiste Nodes entfernen (Entry gelöscht)
    existing_nodes = journal_db.query(JournalMetisNode).filter(
        JournalMetisNode.type == "entry"
    ).all()
    for node in existing_nodes:
        if node.source_id not in entry_ids:
            journal_db.query(JournalMetisEdge).filter(
                (JournalMetisEdge.source_node_id == node.id) |
                (JournalMetisEdge.target_node_id == node.id)
            ).delete(synchronize_session=False)
            journal_db.query(JournalMetisClusterMember).filter(
                JournalMetisClusterMember.node_id == node.id
            ).delete(synchronize_session=False)
            journal_db.delete(node)
            removed += 1

    # Fehlende Entries als Nodes anlegen
    existing_source_ids = {
        n.source_id for n in journal_db.query(JournalMetisNode).filter(
            JournalMetisNode.type == "entry"
        ).all()
    }
    for entry in entries:
        if entry.id in existing_source_ids:
            continue
        try:
            title = decrypt_text(
                entry.iv + entry.encrypted_title, key
            )
        except Exception:
            title = f"Entry #{entry.id}"
        encrypted = encrypt_text(title, key)
        iv = encrypted[:12]
        cipher = encrypted[12:]
        node = JournalMetisNode(
            type="entry",
            source_id=entry.id,
            encrypted_label=cipher,
            label_iv=iv,
            embedding_stale=True,
        )
        journal_db.add(node)
        created += 1

    journal_db.commit()
    return {"created": created, "removed": removed, "total": len(entries)}


# --- PUT /nodes/:id/position ---

@router.put("/nodes/{node_id}/position")
def update_node_position(
    node_id: int,
    data: dict,
    journal_db: Session = Depends(get_journal_db),
):
    require_journal_key()
    node = journal_db.query(JournalMetisNode).filter(
        JournalMetisNode.id == node_id
    ).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node nicht gefunden")
    node.pos_x = data.get("pos_x")
    node.pos_y = data.get("pos_y")
    journal_db.commit()
    return {"ok": True}


# --- Edge Review (Confirm/Reject) ---

@router.put("/edges/{edge_id}/confirm")
def confirm_journal_edge(
    edge_id: int,
    data: EdgeReview = EdgeReview(),
    journal_db: Session = Depends(get_journal_db),
):
    """Journal-Edge bestätigen."""
    require_journal_key()
    edge = journal_db.query(JournalMetisEdge).filter(
        JournalMetisEdge.id == edge_id
    ).first()
    if not edge:
        raise HTTPException(status_code=404, detail="Edge nicht gefunden")
    edge.status = "confirmed"
    edge.reason = data.reason
    edge.reviewed_at = datetime.now(timezone.utc)
    journal_db.commit()
    return {"ok": True, "status": "confirmed"}


@router.put("/edges/{edge_id}/reject")
def reject_journal_edge(
    edge_id: int,
    data: EdgeReview = EdgeReview(),
    journal_db: Session = Depends(get_journal_db),
):
    """Journal-Edge ablehnen — verschwindet aus dem Graph."""
    require_journal_key()
    edge = journal_db.query(JournalMetisEdge).filter(
        JournalMetisEdge.id == edge_id
    ).first()
    if not edge:
        raise HTTPException(status_code=404, detail="Edge nicht gefunden")
    edge.status = "rejected"
    edge.reason = data.reason
    edge.reviewed_at = datetime.now(timezone.utc)
    journal_db.commit()
    return {"ok": True, "status": "rejected"}
