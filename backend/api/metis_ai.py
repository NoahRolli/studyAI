# Metis AI Service — Ollama-powered Auto-Link und Auto-Cluster
# Auto-Link: Embeddings + Cosine-Similarity, lernt aus Confirm/Reject
# Auto-Cluster: Ollama gruppiert Nodes thematisch
# Ollama-only — kein Claude, kein externer API-Call

import json
import re
import httpx
import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.models.database import get_db
from backend.models.metis_node import MetisNode
from backend.models.metis_edge import MetisEdge
from backend.models.metis_cluster import MetisCluster, MetisClusterMember
from backend.models.note import Note
from backend.models.summary import Summary
from backend.models.document import Document
from backend.infra.config import OLLAMA_MODEL, OLLAMA_EMBED_MODEL
from backend.infra.ollama_connector import get_ollama_url

router = APIRouter(prefix="/api/metis", tags=["metis-ai"])


# --- Embedding-Funktionen ---

async def _generate_embedding(text: str) -> list[float]:
    """Generiert 768-dim Embedding via nomic-embed-text."""
    base_url = await get_ollama_url()
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{base_url}/api/embeddings",
            json={"model": OLLAMA_EMBED_MODEL, "prompt": text[:2000]},
        )
        if resp.status_code != 200:
            raise ConnectionError(f"Embedding fehlgeschlagen: {resp.status_code}")
        return resp.json()["embedding"]


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Kosinus-Ähnlichkeit zwischen zwei Vektoren (0.0–1.0)."""
    va, vb = np.array(a), np.array(b)
    norm_a, norm_b = np.linalg.norm(va), np.linalg.norm(vb)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(va, vb) / (norm_a * norm_b))


def _get_node_text(node: MetisNode, db: Session) -> str:
    """Holt den Text-Inhalt eines Nodes für Embedding-Berechnung."""
    if node.type == "note":
        note = db.query(Note).filter(Note.id == node.source_id).first()
        if note:
            return f"{note.title}\n{note.content or ''}"[:2000]
    elif node.type == "summary":
        summary = db.query(Summary).filter(
            Summary.id == node.source_id
        ).first()
        if summary:
            doc = db.query(Document).filter(
                Document.id == summary.document_id
            ).first()
            name = doc.filename if doc else "Summary"
            return f"{name}\n{summary.content or ''}"[:2000]
    return ""


# --- Ollama Chat für Clustering ---

async def _ollama_chat(prompt: str) -> str:
    """Sendet Prompt an Ollama, gibt Antwort-Text zurück."""
    base_url = await get_ollama_url()
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{base_url}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {"num_predict": 2000},
                "think": False,
            },
        )
        if resp.status_code != 200:
            raise ConnectionError(f"Ollama nicht erreichbar: {resp.status_code}")
        return resp.json()["response"]


def _parse_json(text: str):
    """Extrahiert JSON aus Ollama-Antworten (Markdown-Backticks etc.)."""
    match = re.search(r"```(?:json)?\s*(\[.*?\]|\{.*?\})\s*```", text, re.DOTALL)
    if match:
        return json.loads(match.group(1))
    match = re.search(r"(\[.*\]|\{.*\})", text, re.DOTALL)
    if match:
        return json.loads(match.group(1))
    return json.loads(text.strip())


# --- API-Endpunkte ---

@router.post("/auto-link")
async def auto_link(db: Session = Depends(get_db)):
    """
    Berechnet Embeddings für stale Nodes, dann Cosine-Similarity.
    Lernt aus Nutzer-Entscheidungen: confirmed bleiben, rejected werden übersprungen.
    """
    nodes = db.query(MetisNode).all()
    if len(nodes) < 2:
        return {"embeddings_updated": 0, "edges_created": 0, "edges_removed": 0}

    # Schritt 1: Stale Embeddings neu berechnen
    updated = 0
    for node in nodes:
        if node.embedding_stale or not node.embedding:
            text = _get_node_text(node, db)
            if not text.strip():
                continue
            embedding = await _generate_embedding(text)
            node.embedding = json.dumps(embedding)
            node.embedding_stale = False
            updated += 1
    db.flush()

    # Schritt 2: Bestehende AI-Edges + Status laden
    threshold = 0.65
    created = 0
    removed = 0

    ai_edges = db.query(MetisEdge).filter(
        MetisEdge.relation_type == "related"
    ).all()
    existing_pairs = {
        (e.source_node_id, e.target_node_id): e for e in ai_edges
    }

    # Rejected Paare merken — nie wieder vorschlagen
    rejected_pairs = set()
    for e in ai_edges:
        if e.status == "rejected":
            rejected_pairs.add((e.source_node_id, e.target_node_id))
            rejected_pairs.add((e.target_node_id, e.source_node_id))

    # Confirmed Paare — nicht entfernen auch wenn Similarity sinkt
    confirmed_pairs = set()
    for e in ai_edges:
        if e.status == "confirmed":
            confirmed_pairs.add((e.source_node_id, e.target_node_id))
            confirmed_pairs.add((e.target_node_id, e.source_node_id))

    # Schritt 3: Alle Paare vergleichen
    valid_pairs = set()
    for i, node_a in enumerate(nodes):
        if not node_a.embedding:
            continue
        emb_a = json.loads(node_a.embedding)
        for node_b in nodes[i + 1:]:
            if not node_b.embedding:
                continue
            emb_b = json.loads(node_b.embedding)
            sim = _cosine_similarity(emb_a, emb_b)

            pair = (node_a.id, node_b.id)
            reverse = (node_b.id, node_a.id)

            if sim >= threshold:
                valid_pairs.add(pair)
                valid_pairs.add(reverse)
                # Rejected Paare überspringen
                if pair in rejected_pairs:
                    continue
                # Neue Edge nur wenn noch keine existiert
                if pair not in existing_pairs and reverse not in existing_pairs:
                    edge = MetisEdge(
                        source_node_id=node_a.id,
                        target_node_id=node_b.id,
                        relation_type="related",
                        strength=round(sim, 3),
                        status="suggested",
                    )
                    db.add(edge)
                    created += 1

    # Schritt 4: Alte Edges aufräumen
    for (src, tgt), edge in existing_pairs.items():
        # Confirmed niemals entfernen
        if edge.status == "confirmed":
            continue
        # Rejected behalten (als Negativbeispiel)
        if edge.status == "rejected":
            continue
        # Suggested unter Threshold entfernen
        if (src, tgt) not in valid_pairs:
            db.delete(edge)
            removed += 1

    db.commit()
    return {
        "embeddings_updated": updated,
        "edges_created": created,
        "edges_removed": removed,
    }


@router.post("/auto-cluster")
async def auto_cluster(db: Session = Depends(get_db)):
    """
    Ollama gruppiert Nodes thematisch in Cluster.
    Ersetzt bestehende Cluster komplett.
    """
    nodes = db.query(MetisNode).all()
    if len(nodes) < 3:
        return {"clusters": []}

    # Node-Titel sammeln für den Prompt
    node_info = []
    for node in nodes:
        text = _get_node_text(node, db)
        title = text.split("\n")[0] if text else f"Node {node.id}"
        node_info.append({"id": node.id, "title": title, "type": node.type})

    titles_text = "\n".join(
        f"- ID {n['id']} ({n['type']}): {n['title']}" for n in node_info
    )

    prompt = f"""Gruppiere die folgenden Wissenselemente in thematische Cluster.
Jedes Element hat eine ID, einen Typ (note/summary) und einen Titel.

Elemente:
{titles_text}

Antworte NUR im JSON-Format:
[{{"label": "Clustername", "description": "Kurzbeschreibung", "node_ids": [1, 2, 3]}}]

Regeln:
- 2-5 Cluster
- Jedes Element in genau einem Cluster
- Clusternamen kurz und aussagekräftig
- Beschreibung maximal ein Satz"""

    try:
        response = await _ollama_chat(prompt)
        clusters_data = _parse_json(response)
    except Exception:
        return {"clusters": [], "error": "Ollama Clustering fehlgeschlagen"}

    # Bestehende Cluster entfernen
    db.query(MetisClusterMember).delete()
    db.query(MetisCluster).delete()
    db.flush()

    # Cluster-Farben (rotierend aus Metis-Palette)
    colors = ["#7dd4a3", "#d4a574", "#d4cc7d", "#888888", "#7dd8e8"]

    # Neue Cluster anlegen
    result = []
    valid_node_ids = {n.id for n in nodes}
    for i, cdata in enumerate(clusters_data):
        if not isinstance(cdata, dict):
            continue
        cluster = MetisCluster(
            label=cdata.get("label", f"Cluster {i + 1}"),
            description=cdata.get("description"),
            color=colors[i % len(colors)],
        )
        db.add(cluster)
        db.flush()

        member_ids = []
        for nid in cdata.get("node_ids", []):
            if nid in valid_node_ids:
                member = MetisClusterMember(
                    cluster_id=cluster.id, node_id=nid,
                )
                db.add(member)
                member_ids.append(nid)

        result.append({
            "id": cluster.id,
            "label": cluster.label,
            "description": cluster.description,
            "color": cluster.color,
            "node_ids": member_ids,
        })

    db.commit()
    return {"clusters": result}
