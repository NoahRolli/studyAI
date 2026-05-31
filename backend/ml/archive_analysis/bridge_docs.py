"""Schritt 6 — Fehleranalyse / thematische Bruecken.

Berechnet pro Dokument die Cosine-Silhouette s(i) auf denselben mean-centered
topic_embeddings wie das Clustering (Schritt 4). Dokumente mit niedrigem/negativem
s(i) liegen zwischen Clustern = die thematischen Bruecken-Chats.

Schreibt s(i) + naechsten Fremd-Cluster pro Doc nach archive_documents und den
Cluster-Mittelwert nach clusters. Laeuft rein lokal auf ml_phase1.db (numpy).
"""
import argparse
import sqlite3

import numpy as np

from backend.ml.registry import log_run


def load(con):
    rows = con.execute(
        "SELECT document_id, cluster_id, topic_embedding, display_name, topic_summary "
        "FROM archive_documents "
        "WHERE cluster_id IS NOT NULL AND topic_embedding IS NOT NULL "
        "ORDER BY document_id"
    ).fetchall()
    doc_ids = np.array([r[0] for r in rows])
    labels = np.array([r[1] for r in rows])
    X = np.array([np.frombuffer(r[2], dtype=np.float32) for r in rows], dtype=np.float64)
    names = [r[3] for r in rows]
    summaries = [r[4] for r in rows]
    return doc_ids, labels, X, names, summaries


def cosine_distance_matrix(X):
    """Mean-Centering (wie Schritt 4) + Cosine-Distanz."""
    Xc = X - X.mean(axis=0)
    norms = np.linalg.norm(Xc, axis=1, keepdims=True)
    Xn = Xc / np.clip(norms, 1e-12, None)
    D = 1.0 - (Xn @ Xn.T)
    np.fill_diagonal(D, 0.0)
    return D


def per_doc_silhouette(D, labels):
    """Wie silhouette_cosine, aber s(i) pro Doc + naechster Fremd-Cluster.
    Singletons -> s=0, nearest=-1."""
    n = len(labels)
    uniq = np.unique(labels)
    masks = {c: (labels == c) for c in uniq}
    sizes = {c: int(m.sum()) for c, m in masks.items()}
    s = np.zeros(n)
    nearest = np.full(n, -1, dtype=int)
    for i in range(n):
        ci = labels[i]
        if sizes[ci] <= 1:
            continue
        a = D[i, masks[ci]].sum() / (sizes[ci] - 1)
        best_b, best_c = None, -1
        for c in uniq:
            if c == ci:
                continue
            b_c = D[i, masks[c]].mean()
            if best_b is None or b_c < best_b:
                best_b, best_c = b_c, c
        nearest[i] = best_c
        s[i] = (best_b - a) / max(a, best_b) if max(a, best_b) > 0 else 0.0
    return s, nearest


def main():
    ap = argparse.ArgumentParser(description="Schritt 6 — thematische Bruecken")
    ap.add_argument("--ml-db", default="data/ml_phase1.db")
    ap.add_argument("--top", type=int, default=25, help="wie viele Bruecken-Docs zeigen")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    con = sqlite3.connect(args.ml_db)
    doc_ids, labels, X, names, summaries = load(con)
    print(f"{len(doc_ids)} Docs geladen, {len(np.unique(labels))} Cluster")

    D = cosine_distance_matrix(X)
    s, nearest = per_doc_silhouette(D, labels)

    labelmap = dict(con.execute("SELECT cluster_id, label FROM clusters").fetchall())
    multi = nearest >= 0
    print(f"Mean Silhouette: {s[multi].mean():+.4f}  |  "
          f"negativ (s<0): {int((s[multi] < 0).sum())}  |  "
          f"nahe Null (|s|<0.02): {int((np.abs(s[multi]) < 0.02).sum())}")

    print(f"\n=== Top {args.top} Bruecken-Docs (niedrigstes s) ===")
    order = np.argsort(s)
    shown = 0
    for idx in order:
        if nearest[idx] < 0:
            continue
        own = labelmap.get(int(labels[idx]), "?")
        near = labelmap.get(int(nearest[idx]), "?")
        disp = names[idx] if names[idx] and names[idx] != "?" else (summaries[idx] or "")[:70]
        print(f"s={s[idx]:+.3f}  doc {int(doc_ids[idx]):>5}  "
              f"[{own} -> {near}]  {disp[:70]}")
        shown += 1
        if shown >= args.top:
            break

    if args.dry_run:
        print("\nDry-run fertig (nichts geschrieben).")
        return

    acols = {r[1] for r in con.execute("PRAGMA table_info(archive_documents)")}
    if "silhouette" not in acols:
        con.execute("ALTER TABLE archive_documents ADD COLUMN silhouette REAL")
    if "nearest_cluster_id" not in acols:
        con.execute("ALTER TABLE archive_documents ADD COLUMN nearest_cluster_id INTEGER")
    ccols = {r[1] for r in con.execute("PRAGMA table_info(clusters)")}
    if "mean_silhouette" not in ccols:
        con.execute("ALTER TABLE clusters ADD COLUMN mean_silhouette REAL")

    for did, sv, nc in zip(doc_ids, s, nearest):
        con.execute(
            "UPDATE archive_documents SET silhouette=?, nearest_cluster_id=? "
            "WHERE document_id=?",
            (float(sv), int(nc) if nc >= 0 else None, int(did)),
        )
    for c in np.unique(labels):
        con.execute("UPDATE clusters SET mean_silhouette=? WHERE cluster_id=?",
                    (float(s[labels == c].mean()), int(c)))
    con.commit()
    log_run(con, "step6_bridge_docs",
            {"top": args.top},
            {"docs": int(len(doc_ids)), "mean_silhouette": float(s[multi].mean()),
             "negative": int((s[multi] < 0).sum())})
    print(f"\nFertig. s(i) + nearest_cluster_id fuer {len(doc_ids)} Docs geschrieben.")


if __name__ == "__main__":
    main()
