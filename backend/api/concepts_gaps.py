# Structural Gap Detection — Luecken im Wissens-Graph finden
# 1. Isolierte Konzepte (Sources vorhanden, wenige/keine Edges)
# 2. Unverbundene Cluster (kein Edge zwischen Clustern)
# 3. Hub-Kandidaten (viele Sources, wenige Edges)
# Reines Zaehlen, kein AI noetig

import logging
from collections import defaultdict
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.models.database import get_db
from backend.models.concept import (
    Concept, ConceptSource, ConceptEdge,
    ConceptCluster, ConceptClusterMember,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/concepts", tags=["concepts"])


def _get_edge_counts(db: Session) -> dict[int, int]:
    """Zaehlt nicht-abgelehnte Edges pro Konzept (in + out)."""
    edges = db.query(ConceptEdge).filter(
        ConceptEdge.status != "rejected"
    ).all()
    counts: dict[int, int] = defaultdict(int)
    for e in edges:
        counts[e.source_concept_id] += 1
        counts[e.target_concept_id] += 1
    return counts


def _get_source_counts(db: Session) -> dict[int, int]:
    """Zaehlt Sources pro Konzept."""
    results = db.query(
        ConceptSource.concept_id,
        func.count(ConceptSource.id).label("cnt")
    ).group_by(ConceptSource.concept_id).all()
    return {r.concept_id: r.cnt for r in results}


@router.get("/structural-gaps")
def get_structural_gaps(
    db: Session = Depends(get_db),
    min_sources: int = Query(1, ge=0, description="Min Sources fuer Isolierte"),
    max_edges: int = Query(1, ge=0, description="Max Edges fuer Isolierte"),
):
    """Findet strukturelle Luecken im Wissens-Graph."""
    edge_counts = _get_edge_counts(db)
    source_counts = _get_source_counts(db)
    concepts = db.query(Concept).all()
    concept_map = {c.id: c.name for c in concepts}

    # === 1. Isolierte Konzepte ===
    # Konzepte mit Sources aber wenigen/keinen Edges
    isolated = []
    for c in concepts:
        sc = source_counts.get(c.id, 0)
        ec = edge_counts.get(c.id, 0)
        if sc >= min_sources and ec <= max_edges:
            isolated.append({
                "id": c.id,
                "name": c.name,
                "source_count": sc,
                "edge_count": ec,
                "description": c.description,
            })
    isolated.sort(key=lambda x: x["source_count"], reverse=True)

    # === 2. Hub-Kandidaten ===
    # Konzepte mit vielen Sources aber ueberproportional wenigen Edges
    # Ratio: source_count / (edge_count + 1) — hoeher = schlechtere Vernetzung
    hubs = []
    for c in concepts:
        sc = source_counts.get(c.id, 0)
        ec = edge_counts.get(c.id, 0)
        if sc >= 2:  # Mindestens 2 Sources
            ratio = sc / (ec + 1)
            if ratio >= 1.5:  # 50% mehr Sources als Edges
                hubs.append({
                    "id": c.id,
                    "name": c.name,
                    "source_count": sc,
                    "edge_count": ec,
                    "gap_ratio": round(ratio, 1),
                })
    hubs.sort(key=lambda x: x["gap_ratio"], reverse=True)

    # === 3. Unverbundene Cluster ===
    # Cluster-Paare ohne Edge dazwischen
    clusters = db.query(ConceptCluster).all()
    cluster_members: dict[int, set[int]] = {}
    for cl in clusters:
        members = db.query(ConceptClusterMember.concept_id).filter(
            ConceptClusterMember.cluster_id == cl.id
        ).all()
        cluster_members[cl.id] = {m.concept_id for m in members}

    # Alle nicht-abgelehnte Edges als Set von Concept-Paaren
    active_edges = db.query(ConceptEdge).filter(
        ConceptEdge.status != "rejected"
    ).all()
    edge_pairs = {
        (e.source_concept_id, e.target_concept_id)
        for e in active_edges
    } | {
        (e.target_concept_id, e.source_concept_id)
        for e in active_edges
    }

    # Cluster-Paare pruefen
    disconnected = []
    cluster_ids = list(cluster_members.keys())
    cluster_name_map = {cl.id: cl.label for cl in clusters}

    for i, cid_a in enumerate(cluster_ids):
        for cid_b in cluster_ids[i + 1:]:
            members_a = cluster_members[cid_a]
            members_b = cluster_members[cid_b]
            # Gibt es mindestens eine Edge zwischen den Clustern?
            has_bridge = any(
                (a, b) in edge_pairs
                for a in members_a for b in members_b
            )
            if not has_bridge and members_a and members_b:
                disconnected.append({
                    "cluster_a": {
                        "id": cid_a,
                        "label": cluster_name_map.get(cid_a, "?"),
                        "size": len(members_a),
                    },
                    "cluster_b": {
                        "id": cid_b,
                        "label": cluster_name_map.get(cid_b, "?"),
                        "size": len(members_b),
                    },
                    "suggestion": _suggest_bridge(
                        members_a, members_b, source_counts, concept_map
                    ),
                })

    return {
        "isolated": isolated[:50],
        "hub_candidates": hubs[:30],
        "disconnected_clusters": disconnected[:20],
        "stats": {
            "total_concepts": len(concepts),
            "total_edges": sum(edge_counts.values()) // 2,
            "total_clusters": len(clusters),
            "isolated_count": len(isolated),
            "hub_count": len(hubs),
            "disconnected_count": len(disconnected),
        },
    }


def _suggest_bridge(
    members_a: set[int], members_b: set[int],
    source_counts: dict[int, int],
    concept_map: dict[int, str],
) -> dict:
    """Schlaegt die besten Bruecken-Kandidaten zwischen zwei Clustern vor.
    Nimmt das Konzept mit den meisten Sources aus jedem Cluster."""
    best_a = max(members_a, key=lambda x: source_counts.get(x, 0), default=None)
    best_b = max(members_b, key=lambda x: source_counts.get(x, 0), default=None)
    if best_a and best_b:
        return {
            "from": {"id": best_a, "name": concept_map.get(best_a, "?")},
            "to": {"id": best_b, "name": concept_map.get(best_b, "?")},
        }
    return {}
