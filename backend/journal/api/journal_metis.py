# Journal Metis API — Verschlüsselter Knowledge-Graph im Journal
# Sync: Journal-Einträge → Nodes (verschlüsselt)
# Graph: Merged View aus Journal-Nodes + öffentlichen Metis-Nodes (read-only)

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
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
import json

router = APIRouter(
    prefix="/api/journal/metis",
    tags=["journal-metis"],
)


def require_journal_key():
    """Prüft ob Journal entsperrt ist, gibt AES-Key zurück."""
    key = session_manager.get_key()
    if not key:
        raise HTTPException(status_code=403, detail="Journal gesperrt")
    return key


# --- GET /graph — Merged View (Journal + öffentliche Metis) ---
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
        # Cluster-Zuordnung
        memberships = journal_db.query(JournalMetisClusterMember).filter(
            JournalMetisClusterMember.node_id == n.id
        ).all()
        cluster_ids = [m.cluster_id for m in memberships]

        journal_nodes.append({
            "id": f"j-{n.id}",
            "type": n.type,
            "source_id": n.source_id,
            "label": label,
            "pos_x": n.pos_x,
            "pos_y": n.pos_y,
            "cluster_ids": cluster_ids,
            "realm": "journal",
        })

    # 2. Journal-Edges
    j_edges = journal_db.query(JournalMetisEdge).all()
    journal_edges = [{
        "id": f"j-{e.id}",
        "source": f"j-{e.source_node_id}",
        "target": f"j-{e.target_node_id}",
        "relation_type": e.relation_type,
        "strength": e.strength,
        "realm": "journal",
    } for e in j_edges]

    # 3. Journal-Clusters entschlüsseln
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
        member_ids = [
            f"j-{m.node_id}" for m in journal_db.query(
                JournalMetisClusterMember
            ).filter(
                JournalMetisClusterMember.cluster_id == c.id
            ).all()
        ]
        journal_clusters.append({
            "id": f"j-{c.id}",
            "label": label,
            "color": c.color,
            "node_ids": member_ids,
            "realm": "journal",
        })

    # 4. Öffentliche Metis-Nodes (read-only)
    pub_nodes_db = main_db.query(MetisNode).all()
    pub_nodes = []
    for n in pub_nodes_db:
        # Label aus Note/Summary holen
        label = ""
        if n.type == "note":
            note = main_db.query(Note).filter(Note.id == n.source_id).first()
            label = note.title if note else f"Note #{n.source_id}"
        elif n.type == "summary":
            summary = main_db.query(Summary).filter(
                Summary.id == n.source_id
            ).first()
            label = summary.title if summary else f"Summary #{n.source_id}"

        memberships = main_db.query(MetisClusterMember).filter(
            MetisClusterMember.node_id == n.id
        ).all()
        cluster_ids = [f"p-{m.cluster_id}" for m in memberships]

        pub_nodes.append({
            "id": f"p-{n.id}",
            "type": n.type,
            "source_id": n.source_id,
            "label": label,
            "pos_x": n.pos_x,
            "pos_y": n.pos_y,
            "cluster_ids": cluster_ids,
            "realm": "public",
        })

    # 5. Öffentliche Edges
    pub_edges_db = main_db.query(MetisEdge).all()
    pub_edges = [{
        "id": f"p-{e.id}",
        "source": f"p-{e.source_node_id}",
        "target": f"p-{e.target_node_id}",
        "relation_type": e.relation_type,
        "strength": e.strength,
        "realm": "public",
    } for e in pub_edges_db]

    # 6. Öffentliche Clusters
    pub_clusters_db = main_db.query(MetisCluster).all()
    pub_clusters = []
    for c in pub_clusters_db:
        member_ids = [
            f"p-{m.node_id}" for m in main_db.query(
                MetisClusterMember
            ).filter(
                MetisClusterMember.cluster_id == c.id
            ).all()
        ]
        pub_clusters.append({
            "id": f"p-{c.id}",
            "label": c.label,
            "color": c.color,
            "node_ids": member_ids,
            "realm": "public",
        })

    return {
        "nodes": journal_nodes + pub_nodes,
        "edges": journal_edges + pub_edges,
        "clusters": journal_clusters + pub_clusters,
    }


# --- POST /sync — Journal-Einträge als Nodes synchronisieren ---
@router.post("/sync")
def sync_journal_nodes(
    journal_db: Session = Depends(get_journal_db),
):
    key = require_journal_key()

    entries = journal_db.query(JournalEntry).all()
    created = 0

    for entry in entries:
        # Prüfen ob Node schon existiert
        existing = journal_db.query(JournalMetisNode).filter(
            JournalMetisNode.type == "entry",
            JournalMetisNode.source_id == entry.id,
        ).first()
        if existing:
            continue

        # Titel entschlüsseln für Label
        try:
            title = decrypt_text(
                entry.iv + entry.encrypted_title, key
            )
        except Exception:
            title = f"Entry #{entry.id}"

        # Label verschlüsseln
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
    return {"created": created, "total": len(entries)}


# --- PUT /nodes/:id/position — Node-Position speichern ---
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
