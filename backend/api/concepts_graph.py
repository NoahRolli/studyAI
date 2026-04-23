# Konzept-Graph API — Graph-Endpoint fuer Metis-Sphäre
# Liefert Nodes mit Folder-Info, Edges, Clusters
# Ausgelagert aus concepts.py fuer Uebersichtlichkeit

from sqlalchemy import func
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
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
from backend.models.llm import LLMMessage, LLMConversation

router = APIRouter(prefix="/api/concepts", tags=["concepts-graph"])


def _build_concept_folder_map(db: Session) -> dict[int, tuple[int, str]]:
    """Ordnet jedem Konzept seinen Ordner zu: concept_id -> (folder_id, folder_name).
    Pfad: ConceptSource(summary) -> Summary -> Document -> Folder."""
    # Summary-ID -> Folder-ID
    sum_folder: dict[int, int] = {}
    rows = db.query(
        Summary.id, Document.folder_id, Module.folder_id
    ).join(Document, Summary.document_id == Document.id
    ).outerjoin(Module, Document.module_id == Module.id).all()
    for sum_id, doc_fid, mod_fid in rows:
        fid = doc_fid or mod_fid
        if fid:
            sum_folder[sum_id] = fid

    # Folder-Labels laden
    all_fids = set(sum_folder.values())
    folder_labels: dict[int, str] = {}
    if all_fids:
        for f in db.query(Folder).filter(Folder.id.in_(all_fids)).all():
            folder_labels[f.id] = f.name

    # Chat-Message-ID -> Folder-ID
    # Pfad: LLMMessage -> LLMConversation -> Document -> Folder
    msg_folder: dict[int, int] = {}
    msg_rows = db.query(
        LLMMessage.id, Document.folder_id, Module.folder_id
    ).join(LLMConversation, LLMMessage.conversation_id == LLMConversation.id
    ).join(Document, LLMConversation.document_id == Document.id
    ).outerjoin(Module, Document.module_id == Module.id).all()
    for msg_id, doc_fid, mod_fid in msg_rows:
        fid = doc_fid or mod_fid
        if fid:
            msg_folder[msg_id] = fid

    # Folder-Labels auch fuer chat_message-Folder laden
    msg_fids = set(msg_folder.values()) - all_fids
    if msg_fids:
        for f in db.query(Folder).filter(Folder.id.in_(msg_fids)).all():
            folder_labels[f.id] = f.name

    # Konzept -> (folder_id, folder_name) — Summary zuerst, dann Chat
    sources = db.query(ConceptSource).filter(
        ConceptSource.source_type == "summary"
    ).all()
    result: dict[int, tuple[int, str]] = {}
    for s in sources:
        if s.concept_id not in result and s.source_id in sum_folder:
            fid = sum_folder[s.source_id]
            result[s.concept_id] = (fid, folder_labels.get(fid, ""))

    # Chat-Message-Sources: nur wenn Konzept noch nicht gemappt ist
    chat_sources = db.query(ConceptSource).filter(
        ConceptSource.source_type == "chat_message"
    ).all()
    for cs in chat_sources:
        if cs.concept_id not in result and cs.source_id in msg_folder:
            fid = msg_folder[cs.source_id]
            result[cs.concept_id] = (fid, folder_labels.get(fid, ""))
    return result


def _edge_to_dict(e: ConceptEdge, type_map: dict) -> dict:
    """Edge als Dict mit Typ-Info serialisieren."""
    rt = type_map.get(e.relation_type_id)
    return {
        "id": e.id, "source": e.source_concept_id,
        "target": e.target_concept_id,
        "relation_type": {
            "id": rt.id, "name": rt.name,
            "label_de": rt.label_de, "label_en": rt.label_en,
        } if rt else None,
        "strength": e.strength, "origin": e.origin,
        "status": e.status, "confidence": e.confidence,
        "reason": e.reason,
    }


@router.get("/graph")
def get_concept_graph(db: Session = Depends(get_db)):
    """Graph gefiltert nach metis_enabled Ordnern, mit Folder-Info pro Node."""
    # Sichtbare Concept-IDs: Notes immer, Summaries nur aus aktiven Ordnern
    folder_ids = {r[0] for r in db.query(Folder.id).filter(
        Folder.metis_enabled == True).all()}
    doc_direct = {r[0] for r in db.query(Document.id).filter(
        Document.folder_id.in_(folder_ids)).all()} if folder_ids else set()
    doc_via_mod = {r[0] for r in db.query(Document.id).join(
        Module, Document.module_id == Module.id).filter(
        Module.folder_id.in_(folder_ids)).all()} if folder_ids else set()
    enabled_doc_ids = doc_direct | doc_via_mod
    enabled_sum_ids = {r[0] for r in db.query(Summary.id).filter(
        Summary.document_id.in_(enabled_doc_ids)).all()
    } if enabled_doc_ids else set()

    # Chat-Messages: via LLMConversation.document_id
    enabled_msg_ids = {r[0] for r in db.query(LLMMessage.id).join(
        LLMConversation, LLMMessage.conversation_id == LLMConversation.id
    ).filter(LLMConversation.document_id.in_(enabled_doc_ids)).all()
    } if enabled_doc_ids else set()

    note_cids = {r[0] for r in db.query(ConceptSource.concept_id).filter(
        ConceptSource.source_type == "note").all()}
    sum_cids = {r[0] for r in db.query(ConceptSource.concept_id).filter(
        ConceptSource.source_type == "summary",
        ConceptSource.source_id.in_(enabled_sum_ids)).all()
    } if enabled_sum_ids else set()
    chat_cids = {r[0] for r in db.query(ConceptSource.concept_id).filter(
        ConceptSource.source_type == "chat_message",
        ConceptSource.source_id.in_(enabled_msg_ids)).all()
    } if enabled_msg_ids else set()
    visible_ids = note_cids | sum_cids | chat_cids

    concepts = db.query(
        Concept, func.count(ConceptSource.id).label("sc")
    ).outerjoin(ConceptSource).filter(
        Concept.id.in_(visible_ids)
    ).group_by(Concept.id).all() if visible_ids else []

    # Folder-Mapping fuer alle sichtbaren Konzepte
    concept_folders = _build_concept_folder_map(db)

    nodes = []
    node_ids = set()
    for c, sc in concepts:
        finfo = concept_folders.get(c.id)
        nodes.append({
            "id": c.id, "name": c.name,
            "description": c.description, "source_count": sc,
            "folder_id": finfo[0] if finfo else None,
            "folder_name": finfo[1] if finfo else None,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        })
        node_ids.add(c.id)

    # Edges zwischen sichtbaren Nodes
    edges = db.query(ConceptEdge).filter(
        ConceptEdge.status != "rejected",
        ConceptEdge.source_concept_id.in_(node_ids),
        ConceptEdge.target_concept_id.in_(node_ids),
    ).all() if node_ids else []
    type_map = {t.id: t for t in db.query(RelationType).all()}
    edge_list = [_edge_to_dict(e, type_map) for e in edges]

    # Cluster mit sichtbaren Members
    clusters = db.query(ConceptCluster).all()
    cluster_list = []
    for cl in clusters:
        cids = [m.concept_id for m in cl.members if m.concept_id in node_ids]
        if cids:
            cluster_list.append({
                "id": cl.id, "label": cl.label,
                "description": cl.description, "node_ids": cids,
            })

    # Folder-Liste fuer Sphäre (nur aktive mit Konzepten)
    folder_set: dict[int, str] = {}
    for n in nodes:
        if n["folder_id"] and n["folder_id"] not in folder_set:
            folder_set[n["folder_id"]] = n["folder_name"] or ""
    folders = [{"id": fid, "name": fname} for fid, fname in folder_set.items()]

    return {
        "nodes": nodes, "edges": edge_list,
        "clusters": cluster_list, "folders": folders,
    }
