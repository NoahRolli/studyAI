# Journal Metis AI — Embedding + Clustering via Ollama
# Auto-Link: Embeddings + Cosine-Similarity, lernt aus Confirm/Reject
# Auto-Cluster: Themen-Clustering (Ollama)
# Hilfsfunktionen: Embedding, Cosine, Ollama-Chat, JSON-Parser

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
from backend.journal.services.crypto_service import encrypt_text, decrypt_text
from backend.journal.services.session_service import session_manager
from backend.infra.config import OLLAMA_MODEL, OLLAMA_EMBED_MODEL
from backend.infra.ollama_connector import get_ollama_url

router = APIRouter(
    prefix="/api/journal/metis",
    tags=["journal-metis"],
)


def _require_key():
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
                "think": False,
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


# --- POST /auto-link — Embeddings + Similarity ---

@router.post("/auto-link")
async def auto_link(
    journal_db: Session = Depends(get_journal_db),
):
    """Embeddings berechnen, Similarity-Edges erstellen. Lernt aus Reviews."""
    key = _require_key()
    nodes = journal_db.query(JournalMetisNode).all()
    if len(nodes) < 2:
        return {"embeddings_updated": 0, "edges_created": 0, "edges_removed": 0}

    # Stale Embeddings neu berechnen
    updated = 0
    for node in nodes:
        if node.embedding_stale or not node.embedding:
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

    # Bestehende AI-Edges + Status laden
    threshold = 0.65
    created = 0
    removed = 0

    ai_edges = journal_db.query(JournalMetisEdge).filter(
        JournalMetisEdge.relation_type == "similarity"
    ).all()
    existing_pairs = {
        (e.source_node_id, e.target_node_id): e for e in ai_edges
    }

    # Rejected/Confirmed Paare sammeln
    rejected_pairs = set()
    confirmed_pairs = set()
    for e in ai_edges:
        pair = (e.source_node_id, e.target_node_id)
        rev = (e.target_node_id, e.source_node_id)
        if e.status == "rejected":
            rejected_pairs.add(pair)
            rejected_pairs.add(rev)
        elif e.status == "confirmed":
            confirmed_pairs.add(pair)
            confirmed_pairs.add(rev)

    # Similarity berechnen
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
                # Rejected überspringen
                if pair in rejected_pairs:
                    continue
                if pair not in existing_pairs and reverse not in existing_pairs:
                    edge = JournalMetisEdge(
                        source_node_id=na.id,
                        target_node_id=nb.id,
                        relation_type="similarity",
                        strength=round(sim, 3),
                        status="suggested",
                    )
                    journal_db.add(edge)
                    created += 1

    # Alte Edges aufräumen (confirmed/rejected behalten)
    for (src, tgt), edge in existing_pairs.items():
        if edge.status in ("confirmed", "rejected"):
            continue
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
    """Ollama gruppiert Journal-Einträge thematisch."""
    key = _require_key()
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
