# Journal Metis API — Verschlüsselter Knowledge-Graph im Journal
# Sync: Journal-Einträge → Nodes (verschlüsselt, mit Cleanup)
# Auto-Link: Embeddings + Cosine-Similarity (Ollama)
# Auto-Cluster: Themen-Clustering (Ollama)
# Graph: Merged View aus Journal-Nodes + öffentlichen Metis-Nodes

import json
import re
import httpx
import numpy as np
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
from backend.infra.config import OLLAMA_MODEL, OLLAMA_EMBED_MODEL
from backend.infra.ollama_connector import get_ollama_url

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


# --- Ollama Hilfsfunktionen ---

async def _generate_embedding(text: str) -> list[float]:
    """Generiert Embedding via nomic-embed-text."""
    base_url = await get_ollama_url()
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{base_url}/api/embeddings",
            json={"model": OLLAMA_EMBED_MODEL, "prompt": text[:2000]},
        )
        if resp.status_code != 200:
            raise ConnectionError(f"Embedding failed: {resp.status_code}")
        return resp.json()["embedding"]


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Kosinus-Ähnlichkeit zwischen zwei Vektoren."""
    va, vb = np.array(a), np.array(b)
    norm_a, norm_b = np.linalg.norm(va), np.linalg.norm(vb)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(va, vb) / (norm_a * norm_b))


async def _ollama_chat(prompt: str) -> str:
    """Sendet Prompt an Ollama, gibt Antwort zurück."""
    base_url = await get_ollama_url()
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{base_url}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {"num_predict": 2000},
            },
        )
        if resp.status_code != 200:
            raise ConnectionError(f"Ollama error: {resp.status_code}")
        return resp.json()["response"]


def _parse_json(text: str):
    """Extrahiert JSON aus Ollama-Antworten."""
    match = re.search(
        r"```(?:json)?\s*(\[.*?\]|\{.*?\})\s*```", text, re.DOTALL
    )
    if match:
        return json.loads(match.group(1))
    match = re.search(r"(\[.*\]|\{.*\})", text, re.DOTALL)
    if match:
        return json.loads(match.group(1))
    return json.loads(text.strip())


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

    # 5. Öffentliche Edges
    pub_edges_raw = main_db.query(MetisEdge).all()
    pub_edges = [{
        "id": f"p-{e.id}",
        "source": f"p-{e.source_node_id}",
        "target": f"p-{e.target_node_id}",
        "relation_type": e.relation_type,
        "strength": e.strength,
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
    entries = journal_db.query(JournalEntry).filter(JournalEntry.is_deleted == 0).all()
    entry_ids = {e.id for e in entries}
    created = 0
    removed = 0

    # Verwaiste Nodes entfernen (Entry wurde gelöscht)
    existing_nodes = journal_db.query(JournalMetisNode).filter(
        JournalMetisNode.type == "entry"
    ).all()
    for node in existing_nodes:
        if node.source_id not in entry_ids:
            # Edges entfernen die diesen Node referenzieren
            journal_db.query(JournalMetisEdge).filter(
                (JournalMetisEdge.source_node_id == node.id) |
                (JournalMetisEdge.target_node_id == node.id)
            ).delete(synchronize_session=False)
            # Cluster-Memberships entfernen
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
    return {
        "created": created,
        "removed": removed,
        "total": len(entries),
    }


# --- POST /auto-link — Embeddings + Similarity ---

@router.post("/auto-link")
async def auto_link(
    journal_db: Session = Depends(get_journal_db),
):
    key = require_journal_key()
    nodes = journal_db.query(JournalMetisNode).all()
    if len(nodes) < 2:
        return {"embeddings_updated": 0, "edges_created": 0}

    # Stale Embeddings neu berechnen
    updated = 0
    for node in nodes:
        if node.embedding_stale or not node.embedding:
            # Label entschlüsseln für Embedding
            label = ""
            if node.encrypted_label and node.label_iv:
                try:
                    label = decrypt_text(
                        node.label_iv + node.encrypted_label, key
                    )
                except Exception:
                    label = ""
            if not label.strip():
                continue
            embedding = await _generate_embedding(label)
            node.embedding = json.dumps(embedding)
            node.embedding_stale = False
            updated += 1
    journal_db.flush()

    # Similarity-Matrix
    threshold = 0.65
    created = 0
    removed = 0

    ai_edges = journal_db.query(JournalMetisEdge).filter(
        JournalMetisEdge.relation_type == "similarity"
    ).all()
    existing_pairs = {
        (e.source_node_id, e.target_node_id): e for e in ai_edges
    }

    valid_pairs = set()
    for i, na in enumerate(nodes):
        if not na.embedding:
            continue
        emb_a = json.loads(na.embedding)
        for nb in nodes[i + 1:]:
            if not nb.embedding:
                continue
            emb_b = json.loads(nb.embedding)
            sim = _cosine_similarity(emb_a, emb_b)
            pair = (na.id, nb.id)
            reverse = (nb.id, na.id)
            if sim >= threshold:
                valid_pairs.add(pair)
                valid_pairs.add(reverse)
                if (pair not in existing_pairs
                        and reverse not in existing_pairs):
                    edge = JournalMetisEdge(
                        source_node_id=na.id,
                        target_node_id=nb.id,
                        relation_type="similarity",
                        strength=round(sim, 3),
                    )
                    journal_db.add(edge)
                    created += 1

    # Alte Edges unter Threshold entfernen
    for (src, tgt), edge in existing_pairs.items():
        if (src, tgt) not in valid_pairs:
            journal_db.delete(edge)
            removed += 1

    journal_db.commit()
    return {
        "embeddings_updated": updated,
        "edges_created": created,
        "edges_removed": removed,
    }


# --- POST /auto-cluster — Ollama Themen-Clustering ---

@router.post("/auto-cluster")
async def auto_cluster(
    journal_db: Session = Depends(get_journal_db),
):
    key = require_journal_key()
    nodes = journal_db.query(JournalMetisNode).all()
    if len(nodes) < 3:
        return {"clusters": []}

    # Labels entschlüsseln
    node_info = []
    for node in nodes:
        label = ""
        if node.encrypted_label and node.label_iv:
            try:
                label = decrypt_text(
                    node.label_iv + node.encrypted_label, key
                )
            except Exception:
                label = f"Node {node.id}"
        node_info.append({"id": node.id, "label": label})

    titles_text = "\n".join(
        f"- ID {n['id']}: {n['label']}" for n in node_info
    )

    prompt = f"""Gruppiere die folgenden Journal-Einträge thematisch.

Einträge:
{titles_text}

Antworte NUR im JSON-Format:
[{{"label": "Thema", "description": "Kurz", "node_ids": [1, 2]}}]

Regeln:
- 2-5 Cluster
- Jedes Element in genau einem Cluster
- Clusternamen kurz und aussagekräftig"""

    try:
        response = await _ollama_chat(prompt)
        clusters_data = _parse_json(response)
    except Exception:
        return {"clusters": [], "error": "Clustering fehlgeschlagen"}

    # Alte Cluster entfernen
    journal_db.query(JournalMetisClusterMember).delete()
    journal_db.query(JournalMetisCluster).delete()
    journal_db.flush()

    colors = ["#00d4ff", "#7dd4a3", "#d4a574", "#d4cc7d", "#888888"]
    valid_ids = {n.id for n in nodes}
    result = []

    for i, cdata in enumerate(clusters_data):
        if not isinstance(cdata, dict):
            continue
        label_text = cdata.get("label", f"Cluster {i + 1}")
        desc_text = cdata.get("description", "")
        # Verschlüsseln
        enc_label = encrypt_text(label_text, key)
        enc_desc = encrypt_text(desc_text, key) if desc_text else None

        cluster = JournalMetisCluster(
            encrypted_label=enc_label[12:],
            label_iv=enc_label[:12],
            encrypted_description=enc_desc[12:] if enc_desc else None,
            description_iv=enc_desc[:12] if enc_desc else None,
            color=colors[i % len(colors)],
        )
        journal_db.add(cluster)
        journal_db.flush()

        member_ids = []
        for nid in cdata.get("node_ids", []):
            if nid in valid_ids:
                member = JournalMetisClusterMember(
                    cluster_id=cluster.id, node_id=nid,
                )
                journal_db.add(member)
                member_ids.append(nid)

        result.append({
            "id": cluster.id,
            "label": label_text,
            "node_ids": member_ids,
        })

    journal_db.commit()
    return {"clusters": result}


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
