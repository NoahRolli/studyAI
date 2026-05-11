"""Diagnose: Embedding-basierte Folder-Inferenz fuer Concepts ohne Folder-Mapping.

Korrigierte Version (Chat 72, Run 2):
- Folder-Resolution mit Module-Fallback (COALESCE(d.folder_id, m.folder_id))
- Plurality-Voting fuer Concepts mit mehreren Folder-Sources

Misst: koennen die ~14659 Concepts ohne Summary-Source via Cosine-Sim zu
Folder-Centroiden plausibel zugeordnet werden?
"""
import backend.models.registry
import json
import random
from collections import Counter, defaultdict

import numpy as np
from sqlalchemy import text

from backend.models.database import SessionLocal
from backend.models.concept import Concept

SIM_THRESHOLDS = [0.3, 0.4, 0.5, 0.6, 0.7]
MIN_CONCEPTS_PER_FOLDER = 3


def parse_embedding(raw):
    if raw is None:
        return None
    try:
        vec = json.loads(raw) if isinstance(raw, str) else raw
    except (json.JSONDecodeError, TypeError):
        return None
    arr = np.array(vec, dtype=np.float32)
    return arr if arr.size > 0 else None


def main():
    db = SessionLocal()
    try:
        # === Step 1: Plurality-Folder-Mapping mit Module-Fallback ===
        print("=" * 70)
        print("Step 1: Building folder map (plurality + module fallback)")
        print("=" * 70)

        sql = """
        SELECT cs.concept_id,
               COALESCE(d.folder_id, m.folder_id) AS resolved_folder
        FROM concept_sources cs
        JOIN summaries s ON s.id = cs.source_id
        JOIN documents d ON d.id = s.document_id
        LEFT JOIN modules m ON m.id = d.module_id
        WHERE cs.source_type = 'summary'
          AND COALESCE(d.folder_id, m.folder_id) IS NOT NULL
        """
        rows = db.execute(text(sql)).fetchall()
        print(f"  Summary-source rows with resolved folder: {len(rows)}")

        votes = defaultdict(Counter)
        for cid, fid in rows:
            votes[cid][fid] += 1

        concept_to_folder = {}
        for cid, c in votes.items():
            mx = max(c.values())
            winners = sorted(fid for fid, n in c.items() if n == mx)
            concept_to_folder[cid] = winners[0]
        print(f"  Concepts mapped via plurality: {len(concept_to_folder)}")

        # Folder-Namen
        folder_names = {fid: n for fid, n in db.execute(text(
            "SELECT id, name FROM folders"
        )).fetchall()}

        # === Step 2: Folder-Centroide ===
        print()
        print("=" * 70)
        print("Step 2: Building folder centroids")
        print("=" * 70)

        mapped_cids = list(concept_to_folder.keys())
        folder_embs = defaultdict(list)
        batch = 500
        n_with_emb = 0
        for i in range(0, len(mapped_cids), batch):
            sub = mapped_cids[i:i + batch]
            for cid, emb in db.query(Concept.id, Concept.embedding).filter(
                Concept.id.in_(sub)
            ).all():
                vec = parse_embedding(emb)
                if vec is None:
                    continue
                n_with_emb += 1
                folder_embs[concept_to_folder[cid]].append(vec)
        print(f"  Mapped concepts with embedding: {n_with_emb}")

        folder_centroids = {}
        for fid, vecs in folder_embs.items():
            if len(vecs) < MIN_CONCEPTS_PER_FOLDER:
                continue
            centroid = np.mean(np.stack(vecs), axis=0)
            norm = float(np.linalg.norm(centroid))
            if norm < 1e-6:
                continue
            folder_centroids[fid] = centroid / norm

        print(f"  Folder centroids built: {len(folder_centroids)} "
              f"(min {MIN_CONCEPTS_PER_FOLDER} concepts each)")
        print()
        print("  Folder centroid sizes:")
        for fid, n in sorted(
            ((f, len(folder_embs[f])) for f in folder_centroids),
            key=lambda x: -x[1]
        ):
            name = folder_names.get(fid, "?")[:42]
            print(f"    Folder {fid:4d} '{name:42s}' -- {n:5d} concepts")

        # === Step 3: Inferenz fuer No-Folder Concepts ===
        print()
        print("=" * 70)
        print("Step 3: Inferring folder for no-folder concepts")
        print("=" * 70)

        all_cids = [c for c, in db.query(Concept.id).filter(
            Concept.embedding.isnot(None)
        ).all()]
        no_folder_cids = [c for c in all_cids if c not in concept_to_folder]
        print(f"  No-folder concepts (with embedding): {len(no_folder_cids)}")

        centroid_ids = sorted(folder_centroids.keys())
        centroid_matrix = np.stack([folder_centroids[fid] for fid in centroid_ids])

        results = []
        for i in range(0, len(no_folder_cids), batch):
            sub = no_folder_cids[i:i + batch]
            for cid, emb in db.query(Concept.id, Concept.embedding).filter(
                Concept.id.in_(sub)
            ).all():
                vec = parse_embedding(emb)
                if vec is None:
                    continue
                norm = float(np.linalg.norm(vec))
                if norm < 1e-6:
                    continue
                sims = centroid_matrix @ (vec / norm)
                top_idx = int(np.argmax(sims))
                results.append((cid, centroid_ids[top_idx], float(sims[top_idx])))
        print(f"  Inferred for {len(results)} concepts")

        # === Step 4: Sim-Verteilung ===
        print()
        print("=" * 70)
        print("Step 4: Top-1 similarity distribution")
        print("=" * 70)

        sims_arr = np.array([r[2] for r in results])
        print(f"  min/mean/median/max: "
              f"{sims_arr.min():.3f} / {sims_arr.mean():.3f} / "
              f"{np.median(sims_arr):.3f} / {sims_arr.max():.3f}")
        print()
        print("  Threshold analysis:")
        for thr in SIM_THRESHOLDS:
            n = int((sims_arr >= thr).sum())
            pct = 100.0 * n / len(sims_arr) if results else 0
            print(f"    sim >= {thr:.2f}: {n:5d} ({pct:5.1f}%)")

        # === Step 5: Folder-Verteilung ===
        print()
        print("=" * 70)
        print("Step 5: Inferred folder distribution (Top-1)")
        print("=" * 70)

        hits = Counter(r[1] for r in results)
        for fid, count in hits.most_common(15):
            name = folder_names.get(fid, "?")[:42]
            print(f"    Folder {fid:4d} '{name:42s}' -- {count:5d} concepts")

        # === Step 6: Random Sample (über alle sim-Buckets) ===
        print()
        print("=" * 70)
        print("Step 6: Random sample by sim-bucket (5 per bucket)")
        print("=" * 70)

        buckets = [
            ("sim < 0.3", lambda s: s < 0.3),
            ("0.3 <= sim < 0.4", lambda s: 0.3 <= s < 0.4),
            ("0.4 <= sim < 0.5", lambda s: 0.4 <= s < 0.5),
            ("0.5 <= sim < 0.6", lambda s: 0.5 <= s < 0.6),
            ("sim >= 0.6", lambda s: s >= 0.6),
        ]
        random.seed(42)
        sample_cids = []
        sample_meta = {}
        for label, pred in buckets:
            sub = [r for r in results if pred(r[2])]
            if not sub:
                print(f"  {label}: empty")
                continue
            picks = random.sample(sub, min(5, len(sub)))
            print(f"  {label}: {len(sub)} concepts")
            for r in picks:
                sample_cids.append(r[0])
                sample_meta[r[0]] = (label, r[1], r[2])

        names = dict(db.query(Concept.id, Concept.name).filter(
            Concept.id.in_(sample_cids)
        ).all())
        for cid in sample_cids:
            label, fid, sim = sample_meta[cid]
            cn = names.get(cid, "?")[:38]
            fn = folder_names.get(fid, "?")[:28]
            print(f"    [{label}] cid={cid:5d} sim={sim:.3f} '{cn:38s}' "
                  f"-> F{fid} '{fn}'")

        # === Step 7: Targeted Sample ===
        print()
        print("=" * 70)
        print("Step 7: Targeted sample (pallas-related keywords)")
        print("=" * 70)

        result_by_cid = {r[0]: (r[1], r[2]) for r in results}
        targets = ["pallas", "metis", "delphi", "ontology", "ollama",
                   "fastapi", "groq", "claude", "embedding", "cluster",
                   "journal", "ethik", "kant"]
        for kw in targets:
            matches = db.execute(text(
                "SELECT id, name FROM concepts WHERE LOWER(name) LIKE :p LIMIT 5"
            ), {"p": f"%{kw}%"}).fetchall()
            if not matches:
                continue
            print(f"\n  Keyword '{kw}':")
            for cid, cname in matches:
                cn = cname[:30]
                if cid in result_by_cid:
                    fid, sim = result_by_cid[cid]
                    fn = folder_names.get(fid, "?")[:25]
                    print(f"    cid={cid:5d} sim={sim:.3f} '{cn:30s}' "
                          f"-> F{fid} '{fn}' (no-summary)")
                elif cid in concept_to_folder:
                    fid = concept_to_folder[cid]
                    fn = folder_names.get(fid, "?")[:25]
                    print(f"    cid={cid:5d}            '{cn:30s}' "
                          f"-> F{fid} '{fn}' (via-summary)")
                else:
                    print(f"    cid={cid:5d}            '{cn:30s}' "
                          f"-> (no embedding)")

        print()
        print("=" * 70)
        print("Diagnose complete.")
        print("=" * 70)

    finally:
        db.close()


if __name__ == "__main__":
    main()
