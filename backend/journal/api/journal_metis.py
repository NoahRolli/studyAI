# Journal Metis API — Verschluesselter Knowledge-Graph im Journal
# Graph: Merged View aus Journal-Nodes + oeffentlichen Konzept-Nodes (v1)
# Sync: Journal-Eintraege -> Nodes (verschluesselt, mit Cleanup)
# Position, Edge-Review (Confirm/Reject)

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
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
from backend.models.concept import (
    Concept, ConceptSource, ConceptEdge,
    ConceptCluster, ConceptClusterMember,
)
from backend.models.relation import RelationType
from backend.models.folder import Folder
from backend.models.document import Document
from backend.models.module import Module
from backend.models.summary import Summary
from backend.api.concepts_graph import _build_concept_folder_map

router = APIRouter(
    prefix="/api/journal/metis",
    tags=["journal-metis"],
)


class EdgeReview(BaseModel):
    """Schema fuer Edge-Bestaetigung/Ablehnung."""
    reason: Optional[str] = None


def require_journal_key():
    """Prueft ob Journal entsperrt ist, gibt AES-Key zurueck."""
    key = session_manager.get_key()
    if not key:
        raise HTTPException(status_code=403, detail="Journal gesperrt")
    return key


# --- GET /graph — Merged View (Journal + Konzept-Graph v1) ---

@router.get("/graph")
def get_merged_graph(
    journal_db: Session = Depends(get_journal_db),
    main_db: Session = Depends(get_db),
):
    key = require_journal_key()

    # 1. Journal-Nodes entschluesseln
    j_nodes = journal_db.query(JournalMetisNode).all()
    journal_nodes = []
    for n in j_nodes:
        label = ""
        if n.encrypted_label and n.label_iv:
            try:
                label = decrypt_text(n.label_iv + n.encrypted_label, key)
            except Exception:
                label = "???"
        memberships = journal_db.query(JournalMetisClusterMember).filter(
            JournalMetisClusterMember.node_id == n.id
        ).all()
        journal_nodes.append({
            "id": f"j-{n.id}", "type": n.type,
            "source_id": n.source_id, "label": label,
            "pos_x": n.pos_x, "pos_y": n.pos_y,
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
        "status": e.status, "realm": "journal",
    } for e in j_edges]

    # 3. Journal-Clusters
    j_clusters = journal_db.query(JournalMetisCluster).all()
    journal_clusters = []
    for c in j_clusters:
        label = ""
        if c.encrypted_label and c.label_iv:
            try:
                label = decrypt_text(c.label_iv + c.encrypted_label, key)
            except Exception:
                label = "???"
        members = journal_db.query(JournalMetisClusterMember).filter(
            JournalMetisClusterMember.cluster_id == c.id
        ).all()
        journal_clusters.append({
            "id": f"j-{c.id}", "label": label, "color": c.color,
            "node_ids": [f"j-{m.node_id}" for m in members],
            "realm": "journal",
        })

    # 4. Oeffentliche Konzept-Nodes mit Folder-Mapping
    folder_ids = {r[0] for r in main_db.query(Folder.id).filter(
        Folder.metis_enabled == True).all()}
    doc_direct = {r[0] for r in main_db.query(Document.id).filter(
        Document.folder_id.in_(folder_ids)).all()} if folder_ids else set()
    doc_via_mod = {r[0] for r in main_db.query(Document.id).join(
        Module, Document.module_id == Module.id).filter(
        Module.folder_id.in_(folder_ids)).all()} if folder_ids else set()
    enabled_doc_ids = doc_direct | doc_via_mod
    enabled_sum_ids = {r[0] for r in main_db.query(Summary.id).filter(
        Summary.document_id.in_(enabled_doc_ids)).all()
    } if enabled_doc_ids else set()
    note_cids = {r[0] for r in main_db.query(ConceptSource.concept_id).filter(
        ConceptSource.source_type == "note").all()}
    sum_cids = {r[0] for r in main_db.query(ConceptSource.concept_id).filter(
        ConceptSource.source_type == "summary",
        ConceptSource.source_id.in_(enabled_sum_ids)).all()
    } if enabled_sum_ids else set()
    visible_ids = note_cids | sum_cids

    # Folder-Mapping aus V1 importieren
    concept_folders = _build_concept_folder_map(main_db)

    concepts = main_db.query(
        Concept, func.count(ConceptSource.id).label("sc")
    ).outerjoin(ConceptSource).filter(
        Concept.id.in_(visible_ids)
    ).group_by(Concept.id).all() if visible_ids else []

    # Unique Folders sammeln fuer Response
    seen_folders: dict[int, str] = {}
    pub_nodes = []
    for c, _ in concepts:
        finfo = concept_folders.get(c.id)
        fid = finfo[0] if finfo else None
        fname = finfo[1] if finfo else None
        if fid and fid not in seen_folders:
            seen_folders[fid] = fname or ""
        pub_nodes.append({
            "id": f"p-{c.id}", "type": "note",
            "source_id": c.id, "label": c.name,
            "pos_x": None, "pos_y": None,
            "cluster_ids": [], "realm": "public",
            "folder_id": fid, "folder_name": fname,
        })
    pub_node_ids = {c.id for c, _ in concepts}

    # 5. Oeffentliche Edges (concept_edges)
    edges = main_db.query(ConceptEdge).filter(
        ConceptEdge.status != "rejected",
        ConceptEdge.source_concept_id.in_(pub_node_ids),
        ConceptEdge.target_concept_id.in_(pub_node_ids),
    ).all() if pub_node_ids else []
    type_map = {t.id: t for t in main_db.query(RelationType).all()}
    pub_edges = []
    for e in edges:
        rt = type_map.get(e.relation_type_id)
        pub_edges.append({
            "id": f"p-{e.id}",
            "source": f"p-{e.source_concept_id}",
            "target": f"p-{e.target_concept_id}",
            "relation_type": rt.name if rt else "related_to",
            "strength": e.strength,
            "status": e.status, "realm": "public",
        })

    # 6. Oeffentliche Clusters (concept_clusters)
    clusters = main_db.query(ConceptCluster).all()
    pub_clusters = []
    for cl in clusters:
        cids = [m.concept_id for m in cl.members if m.concept_id in pub_node_ids]
        if cids:
            pub_clusters.append({
                "id": f"p-{cl.id}", "label": cl.label,
                "color": None,
                "node_ids": [f"p-{cid}" for cid in cids],
                "realm": "public",
            })

    # Folders-Array fuer Frontend (echte Ordner)
    folders_list = [{"id": fid, "name": fname}
                    for fid, fname in seen_folders.items()]

    return {
        "nodes": journal_nodes + pub_nodes,
        "edges": journal_edges + pub_edges,
        "clusters": journal_clusters + pub_clusters,
        "folders": folders_list,
    }


# --- POST /sync — mit Cleanup fuer geloeschte Entries ---

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

    # Verwaiste Nodes entfernen (Entry geloescht)
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
            title = decrypt_text(entry.iv + entry.encrypted_title, key)
        except Exception:
            title = f"Entry #{entry.id}"
        encrypted = encrypt_text(title, key)
        iv = encrypted[:12]
        cipher = encrypted[12:]
        node = JournalMetisNode(
            type="entry", source_id=entry.id,
            encrypted_label=cipher, label_iv=iv,
            embedding_stale=True,
        )
        journal_db.add(node)
        created += 1

    journal_db.commit()
    return {"created": created, "removed": removed, "total": len(entries)}


# --- PUT /nodes/:id/position ---

@router.put("/nodes/{node_id}/position")
def update_node_position(
    node_id: int, data: dict,
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
    """Journal-Edge bestaetigen."""
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
