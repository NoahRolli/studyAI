"""Schritt 3 — Embedding mit bge-m3.

Holt die Chunk-Texte per substr() aus pallas.documents.raw_text,
schickt sie batchweise an Ollama (/api/embed mit model=bge-m3),
schreibt 1024-dim Embeddings als BLOB nach archive_chunks.embedding.

Resume-faehig: bearbeitet nur Chunks mit embedding IS NULL.
Bei Abbruch einfach neu starten.

Aufruf auf Olymp:
    nohup python3 backend/ml/archive_analysis/embed.py \\
        --pallas-db <pfad>/pallas-phase1-snapshot.db \\
        --ml-db <pfad>/ml_phase1.db \\
        > logs/embed-$(date +%Y%m%d-%H%M%S).log 2>&1 &

Optional --limit N fuer Sub-Sample-Test (z.B. --limit 10).
"""

import argparse
import json
import sqlite3
import struct
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from backend.ml.registry import open_ml_db, init_schema, log_run


# Konfiguration
OLLAMA_URL = "http://127.0.0.1:11434/api/embed"
MODEL = "bge-m3"
EMBEDDING_DIM = 1024
BATCH_SIZE = 16              # Chunks pro HTTP-Request
PROGRESS_EVERY = 10          # Alle N Batches eine Progress-Zeile
REQUEST_TIMEOUT = 120        # Sekunden pro Batch (bge-m3 + 16 Chunks ~5-10s)


def section(title: str) -> None:
    print(f"\n{'=' * 60}\n{title}\n{'=' * 60}", flush=True)


def fetch_pending_chunks(con, limit: int | None) -> list[tuple[int, int, int, int]]:
    """Holt alle Chunks ohne Embedding.

    Gibt zurueck: [(chunk_id, document_id, char_start, char_end), ...].
    Sortiert nach (document_id, chunk_idx) fuer deterministische Reihenfolge.
    """
    q = """
        SELECT id, document_id, char_start, char_end
        FROM archive_chunks
        WHERE embedding IS NULL
        ORDER BY document_id, chunk_idx
    """
    if limit:
        q += f" LIMIT {int(limit)}"
    return con.execute(q).fetchall()


def fetch_chunk_texts(con, chunk_meta: list[tuple]) -> list[str]:
    """Holt fuer eine Liste von Chunks die Texte aus pallas.documents.

    substr(text, char_start+1, char_end-char_start) -- SQLite ist 1-indexed
    in substr() und nimmt (start, laenge), nicht (start, end).
    """
    texts: list[str] = []
    for chunk_id, doc_id, cs, ce in chunk_meta:
        row = con.execute(
            "SELECT substr(raw_text, ?, ?) FROM pallas.documents WHERE id = ?",
            (cs + 1, ce - cs, doc_id),
        ).fetchone()
        if row is None or row[0] is None:
            raise RuntimeError(
                f"Chunk {chunk_id} verweist auf document_id {doc_id}, "
                f"das in pallas.documents nicht (mehr) existiert."
            )
        texts.append(row[0])
    return texts


def embed_batch(texts: list[str]) -> list[list[float]]:
    """Ein POST an Ollama, gibt eine Liste von Embeddings zurueck.

    Erwartet response.embeddings[i] mit 1024 floats fuer texts[i].
    """
    body = json.dumps({"model": MODEL, "input": texts}).encode("utf-8")
    req = urllib.request.Request(
        OLLAMA_URL,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    embeddings = data.get("embeddings")
    if embeddings is None or len(embeddings) != len(texts):
        raise RuntimeError(
            f"Ollama-Response unerwartet: {len(embeddings) if embeddings else 0} "
            f"Embeddings fuer {len(texts)} Texte. Body-Anfang: {str(data)[:200]}"
        )
    if len(embeddings[0]) != EMBEDDING_DIM:
        raise RuntimeError(
            f"Embedding-Dim {len(embeddings[0])} != erwartet {EMBEDDING_DIM}. "
            f"Falsches Modell?"
        )
    return embeddings


def pack_embedding(vec: list[float]) -> bytes:
    """1024 floats -> 4096 Bytes als little-endian float32."""
    return struct.pack(f"<{EMBEDDING_DIM}f", *vec)


def store_embeddings(con, chunk_ids: list[int], vectors: list[list[float]]) -> None:
    """Schreibt Embeddings transaktional in archive_chunks."""
    rows = [(pack_embedding(v), cid) for cid, v in zip(chunk_ids, vectors)]
    con.executemany(
        "UPDATE archive_chunks SET embedding = ? WHERE id = ?",
        rows,
    )
    con.commit()


def format_eta(remaining_batches: int, sec_per_batch: float) -> str:
    """Sekunden -> 'Xh YMm' oder 'YMm' fuer Anzeige."""
    if sec_per_batch <= 0:
        return "?"
    secs = remaining_batches * sec_per_batch
    if secs > 3600:
        return f"{int(secs // 3600)}h {int((secs % 3600) // 60)}m"
    if secs > 60:
        return f"{int(secs // 60)}m {int(secs % 60)}s"
    return f"{int(secs)}s"


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Pallas ML Phase 1 — Schritt 3: Embedding mit bge-m3"
    )
    ap.add_argument("--pallas-db", required=True)
    ap.add_argument("--ml-db", required=True)
    ap.add_argument("--limit", type=int, default=None,
                    help="Sub-Sample-Test: nur erste N Chunks embedden")
    ap.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    args = ap.parse_args()

    print("Pallas ML Phase 1 — Schritt 3: Embedding")
    print(f"  Pallas-DB (RO):  {args.pallas_db}")
    print(f"  ML-DB (RW):      {args.ml_db}")
    print(f"  Ollama:          {OLLAMA_URL}")
    print(f"  Modell:          {MODEL} (dim={EMBEDDING_DIM})")
    print(f"  Batch-Size:      {args.batch_size}")
    if args.limit:
        print(f"  LIMIT:           {args.limit} Chunks (Sub-Sample)")

    con = open_ml_db(args.ml_db, args.pallas_db)
    try:
        init_schema(con)

        section("PENDING CHUNKS")
        pending = fetch_pending_chunks(con, args.limit)
        total_pending = len(pending)
        print(f"  Chunks ohne Embedding: {total_pending}")
        if total_pending == 0:
            print("\n  Nichts zu tun. Alle Chunks bereits embedded.")
            return

        n_batches = (total_pending + args.batch_size - 1) // args.batch_size
        print(f"  Batches:               {n_batches} a {args.batch_size}")

        section("EMBEDDING")
        t_start = time.monotonic()
        n_done = 0
        n_failed = 0
        failed_batches: list[tuple[int, str]] = []

        for batch_idx in range(n_batches):
            batch_meta = pending[
                batch_idx * args.batch_size : (batch_idx + 1) * args.batch_size
            ]
            chunk_ids = [m[0] for m in batch_meta]

            try:
                texts = fetch_chunk_texts(con, batch_meta)
                vectors = embed_batch(texts)
                store_embeddings(con, chunk_ids, vectors)
                n_done += len(batch_meta)
            except (urllib.error.URLError, RuntimeError, sqlite3.Error) as e:
                n_failed += len(batch_meta)
                failed_batches.append((batch_idx, str(e)[:200]))
                print(f"  ! Batch {batch_idx} failed: {str(e)[:200]}",
                      flush=True)
                continue

            if (batch_idx + 1) % PROGRESS_EVERY == 0 or batch_idx == n_batches - 1:
                elapsed = time.monotonic() - t_start
                sec_per_batch = elapsed / (batch_idx + 1)
                eta = format_eta(n_batches - batch_idx - 1, sec_per_batch)
                pct = 100 * (batch_idx + 1) / n_batches
                print(
                    f"  batch {batch_idx + 1:>4d}/{n_batches}  "
                    f"({pct:5.1f}%)  "
                    f"done={n_done}  failed={n_failed}  "
                    f"elapsed={elapsed:.0f}s  "
                    f"avg={sec_per_batch:.2f}s/batch  "
                    f"eta={eta}",
                    flush=True,
                )

        elapsed = time.monotonic() - t_start
        section("ERGEBNIS")
        print(f"  Erfolgreich embedded:  {n_done}")
        print(f"  Failed:                {n_failed}")
        print(f"  Laufzeit:              {elapsed:.0f}s "
              f"({elapsed / 60:.1f} min)")

        # Verifikation: wieviele Chunks haben jetzt ein Embedding?
        total_with_emb = con.execute(
            "SELECT COUNT(*) FROM archive_chunks WHERE embedding IS NOT NULL"
        ).fetchone()[0]
        total_chunks = con.execute(
            "SELECT COUNT(*) FROM archive_chunks"
        ).fetchone()[0]
        print(f"  Embedded in DB:        {total_with_emb} / {total_chunks}")

        run_id = log_run(
            con,
            step="phase1_step3_embed",
            params={
                "model": MODEL,
                "batch_size": args.batch_size,
                "limit": args.limit,
            },
            result={
                "embedded": n_done,
                "failed": n_failed,
                "elapsed_sec": round(elapsed, 1),
                "batches_total": n_batches,
                "failed_batches": failed_batches[:20],  # cap fuer Audit-Log
                "total_with_embedding_after": total_with_emb,
                "total_chunks": total_chunks,
            },
        )
        print(f"\n  pipeline_runs entry: id={run_id}")

        if n_failed > 0:
            print(f"\n  HINWEIS: {n_failed} Chunks fehlgeschlagen. "
                  f"Skript erneut starten -- Resume-Logik nimmt sie wieder auf.")
    finally:
        con.close()

    print("\nFertig.")


if __name__ == "__main__":
    main()
