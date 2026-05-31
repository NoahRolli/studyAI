"""Schritt 4 — Clustering auf Topic-Embeddings.

Average-Link agglomeratives Clustering (Cosine-Distanz) ueber die in
Schritt 4.6 erzeugten topic_embedding-Vektoren, mit vorgeschaltetem
Mean-Centering (Entfernen der dominanten gemeinsamen Komponente). Ohne
das Centering kettet Average-Link ~900 Docs zu einem Mega-Cluster
zusammen; mit Centering zerfaellt der in sinnvolle Themen-Cluster (Befund
Chat 81). Konsistent mit Metis (average-link cosine), nur das Centering
als Standard-Embedding-Postprocessing davor.

Hinweis: Der Mean-Vektor wird nicht persistiert — Phase 1 ist ein
einmaliger Lauf, Re-Runs sind 'rm ml_phase1.db' + Pipeline neu.

Zweistufig:
  --k 0  (default) : nur Diagnose. Baut Linkage, speichert sie, druckt pro
                     Cut Cluster-Groesse, Singletons, Anker-Streuung und
                     Silhouette-Score. Kein cluster_id-Write.
  --k N            : zusaetzlich cluster_id bei N Clustern schreiben.

Aufruf:
  python -m backend.ml.archive_analysis.cluster_topics \
      --ml-db data/ml_phase1.db \
      --pallas-db data/pallas-snapshot.db
"""
import argparse
import json
import struct
import sys
from datetime import datetime, timezone

import numpy as np
from scipy.cluster.hierarchy import linkage, fcluster

from backend.ml.registry import open_ml_db, log_run

DIM = 1024
DIAG_KS = [30, 40, 50, 60, 75, 90]


def load_vectors(con):
    """topic_embedding-BLOBs -> (doc_ids, matrix, anchor_mask)."""
    rows = con.execute(
        "SELECT document_id, is_pallas_anchor, topic_embedding "
        "FROM archive_documents WHERE topic_embedding IS NOT NULL "
        "ORDER BY document_id"
    ).fetchall()
    doc_ids, anchors, vecs = [], [], []
    for doc_id, is_anchor, blob in rows:
        doc_ids.append(doc_id)
        anchors.append(bool(is_anchor))
        vecs.append(struct.unpack(f"<{DIM}f", blob))
    return doc_ids, np.asarray(vecs, dtype=np.float64), np.asarray(anchors)


def silhouette_cosine(D, labels):
    """Mean Silhouette ueber cosine-Distanzmatrix D. Singletons -> 0."""
    n = len(labels)
    uniq = np.unique(labels)
    masks = {c: (labels == c) for c in uniq}
    sizes = {c: int(m.sum()) for c, m in masks.items()}
    s = np.zeros(n)
    for i in range(n):
        ci = labels[i]
        if sizes[ci] <= 1:
            continue
        a = D[i, masks[ci]].sum() / (sizes[ci] - 1)
        b = min(D[i, masks[c]].mean() for c in uniq if c != ci)
        s[i] = (b - a) / max(a, b) if max(a, b) > 0 else 0.0
    return float(s.mean())


def ensure_schema(con):
    con.execute(
        "CREATE TABLE IF NOT EXISTS cluster_linkage ("
        "id INTEGER PRIMARY KEY, method TEXT, metric TEXT, n_docs INT, "
        "doc_ids TEXT, linkage TEXT, created_at TIMESTAMP)"
    )
    cols = {r[1] for r in con.execute("PRAGMA table_info(archive_documents)")}
    if "cluster_id" not in cols:
        con.execute("ALTER TABLE archive_documents ADD COLUMN cluster_id INT")
    con.commit()


def save_linkage(con, doc_ids, Z):
    con.execute("DELETE FROM cluster_linkage")
    con.execute(
        "INSERT INTO cluster_linkage "
        "(method, metric, n_docs, doc_ids, linkage, created_at) "
        "VALUES (?,?,?,?,?,?)",
        ("average-centered", "cosine", len(doc_ids), json.dumps(doc_ids),
         json.dumps(Z.tolist()), datetime.now(timezone.utc).isoformat()),
    )
    con.commit()


def diagnose(Z, D, anchors, n):
    """Pro Cut: #Cluster, groesster, Singletons, Anker-Streuung, Silhouette."""
    print(f"\nAnker gesamt: {int(anchors.sum())} | Docs: {n}")
    print(f"{'k':>5} {'groesster':>10} {'singletons':>11} "
          f"{'anker_max':>10} {'anker_cl':>9} {'silhouette':>11}")
    for k in DIAG_KS:
        if k > n:
            continue
        labels = fcluster(Z, t=k, criterion="maxclust")
        sizes = np.bincount(labels)[1:]
        a_labels = labels[anchors]
        counts = np.bincount(a_labels) if len(a_labels) else np.array([0])
        sil = silhouette_cosine(D, labels)
        print(f"{k:>5} {int(sizes.max()):>10} {int((sizes == 1).sum()):>11} "
              f"{int(counts.max()):>10} {int((counts > 0).sum()):>9} "
              f"{sil:>11.3f}")


def commit_clusters(con, doc_ids, Z, k):
    labels = fcluster(Z, t=k, criterion="maxclust")
    for doc_id, lab in zip(doc_ids, labels):
        con.execute(
            "UPDATE archive_documents SET cluster_id=? WHERE document_id=?",
            (int(lab), doc_id),
        )
    con.commit()
    n_clusters = int(len(set(labels)))
    print(f"\ncluster_id geschrieben fuer k={k} ({n_clusters} Cluster).")
    return n_clusters


def run(con, k):
    ensure_schema(con)
    doc_ids, X, anchors = load_vectors(con)
    n = len(doc_ids)
    print(f"Geladen: {n} Topic-Vektoren ({X.shape[1]}-dim)")
    X = X - X.mean(axis=0)
    Xn = X / np.linalg.norm(X, axis=1, keepdims=True)
    D = 1.0 - Xn @ Xn.T
    np.fill_diagonal(D, 0.0)
    Z = linkage(X, method="average", metric="cosine")
    save_linkage(con, doc_ids, Z)
    print("Linkage gebaut + gespeichert "
          "(method=average, metric=cosine, mean-centered).")
    diagnose(Z, D, anchors, n)
    result = {"n_docs": n, "linkage": "saved", "mean_centered": True}
    if k > 0:
        result["committed_k"] = commit_clusters(con, doc_ids, Z, k)
    log_run(con, "cluster_topics",
            {"method": "average-centered", "k": k}, result)


def main():
    p = argparse.ArgumentParser(description="Schritt 4 Topic-Clustering")
    p.add_argument("--ml-db", required=True)
    p.add_argument("--pallas-db", required=True)
    p.add_argument("--k", type=int, default=0)
    args = p.parse_args()
    con = open_ml_db(args.ml_db, args.pallas_db)
    try:
        run(con, args.k)
    finally:
        con.close()


if __name__ == "__main__":
    sys.exit(main())
