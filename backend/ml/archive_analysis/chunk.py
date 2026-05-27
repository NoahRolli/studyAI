"""Schritt 2 — Chunking.

Schneidet alle Dokumente aus archive_documents in ueberlappende Stuecke
und schreibt die Positionen (kein Text!) nach archive_chunks. Embeddings
bleiben NULL und werden in Schritt 3 (Olymp-Job mit bge-m3) gefuellt.

Logik:
- chunk_size = 8000 Zeichen (komfortabel unter bge-m3-Limit von ~25-30k)
- overlap = 800 Zeichen (10%) — faengt Satz-Schnittstellen ab
- Schrittweite = chunk_size - overlap = 7200

Auch Dokumente unter chunk_size bekommen genau einen Chunk-Eintrag
(char_start=0, char_end=raw_text_len). Uniform fuer Schritt 3.

Erwartet: 1129 kurze Docs * 1 Chunk + ~800-1300 Chunks aus den 125 langen
Docs = ~2000-2500 Chunks gesamt.

Aufruf:
    python -m backend.ml.archive_analysis.chunk \\
        --pallas-db <pfad/zu/pallas.db> \\
        --ml-db <pfad/zu/ml_phase1.db>
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from backend.ml.registry import open_ml_db, init_schema, log_run


CHUNK_SIZE = 8000
OVERLAP = 800
STEP = CHUNK_SIZE - OVERLAP   # = 7200


def section(title: str) -> None:
    print(f"\n{'=' * 60}\n{title}\n{'=' * 60}")


def make_chunks(text_len: int) -> list[tuple[int, int]]:
    """Erzeugt [(char_start, char_end), ...] fuer ein Dokument der gegebenen Laenge.

    Kontrakt:
    - text_len < CHUNK_SIZE   -> genau ein Chunk [(0, text_len)]
    - text_len == CHUNK_SIZE  -> genau ein Chunk [(0, CHUNK_SIZE)]
    - text_len  > CHUNK_SIZE  -> mehrere Chunks mit STEP=7200, letzter
      Chunk endet exakt bei text_len (kein Ueberhang).

    Beispiele:
        make_chunks(5000)  -> [(0, 5000)]
        make_chunks(8000)  -> [(0, 8000)]
        make_chunks(20000) -> [(0, 8000), (7200, 15200), (14400, 20000)]
    """
    if text_len <= 0:
        return []
    if text_len <= CHUNK_SIZE:
        return [(0, text_len)]

    chunks: list[tuple[int, int]] = []
    start = 0
    while True:
        end = start + CHUNK_SIZE
        if end >= text_len:
            chunks.append((start, text_len))
            break
        chunks.append((start, end))
        start += STEP
    return chunks


def fetch_documents(con) -> list[tuple[int, int]]:
    """Holt (document_id, raw_text_len) aller Eintraege im Arbeitssatz."""
    rows = con.execute("""
        SELECT document_id, raw_text_len
        FROM archive_documents
        ORDER BY document_id
    """).fetchall()
    return rows


def chunk_and_insert(con, docs: list[tuple[int, int]]) -> dict:
    """Wendet make_chunks() auf jedes Doc an und insertet in archive_chunks.

    Vor Insert wird archive_chunks geleert -- Schritt 2 ist reproduzierbar.
    Wenn Chunks neu berechnet werden, gehen bereits berechnete Embeddings
    verloren. Das ist gewollt: Re-Run von Schritt 2 macht nur Sinn, wenn
    CHUNK_SIZE/OVERLAP geaendert wurde, und dann sind alte Embeddings eh
    falsch.
    """
    con.execute("DELETE FROM archive_chunks")

    rows: list[tuple] = []
    for doc_id, text_len in docs:
        ranges = make_chunks(text_len)
        for idx, (cs, ce) in enumerate(ranges):
            rows.append((doc_id, idx, cs, ce, ce - cs))

    con.executemany("""
        INSERT INTO archive_chunks
            (document_id, chunk_idx, char_start, char_end, chunk_text_len)
        VALUES (?, ?, ?, ?, ?)
    """, rows)
    con.commit()

    docs_with_one_chunk = sum(1 for _, n in docs if n <= CHUNK_SIZE)
    docs_with_many_chunks = len(docs) - docs_with_one_chunk

    return {
        "documents_processed": len(docs),
        "docs_single_chunk": docs_with_one_chunk,
        "docs_multi_chunk": docs_with_many_chunks,
        "chunks_total": len(rows),
        "chunk_size": CHUNK_SIZE,
        "overlap": OVERLAP,
    }


def verify_result(con) -> dict:
    """Plausibilitaets-Checks nach dem Insert."""
    cur = con.cursor()

    chunks_total = cur.execute(
        "SELECT COUNT(*) FROM archive_chunks"
    ).fetchone()[0]

    # Hat jedes Dokument mindestens einen Chunk?
    docs_without_chunks = cur.execute("""
        SELECT COUNT(*) FROM archive_documents a
        WHERE NOT EXISTS (
            SELECT 1 FROM archive_chunks c WHERE c.document_id = a.document_id
        )
    """).fetchone()[0]

    # Laengen-Statistik der Chunks
    min_len, max_len, avg_len = cur.execute("""
        SELECT MIN(chunk_text_len), MAX(chunk_text_len), AVG(chunk_text_len)
        FROM archive_chunks
    """).fetchone()

    # Doc mit den meisten Chunks (Sanity: laengstes Doc sollte gewinnen)
    max_chunks_row = cur.execute("""
        SELECT c.document_id, COUNT(*) AS n_chunks, d.raw_text_len
        FROM archive_chunks c
        JOIN archive_documents d ON d.document_id = c.document_id
        GROUP BY c.document_id
        ORDER BY n_chunks DESC LIMIT 1
    """).fetchone()

    # Sanity: Chunks decken Original ab (Anker- und End-Positionen)
    bad_start = cur.execute(
        "SELECT COUNT(*) FROM archive_chunks WHERE chunk_idx = 0 "
        "AND char_start != 0"
    ).fetchone()[0]
    bad_end = cur.execute("""
        SELECT COUNT(*)
        FROM archive_chunks c
        JOIN archive_documents d ON d.document_id = c.document_id
        WHERE c.chunk_idx = (
            SELECT MAX(chunk_idx) FROM archive_chunks
            WHERE document_id = c.document_id
        )
        AND c.char_end != d.raw_text_len
    """).fetchone()[0]

    return {
        "chunks_total": chunks_total,
        "documents_without_chunks": docs_without_chunks,
        "min_chunk_len": min_len,
        "max_chunk_len": max_len,
        "avg_chunk_len": round(avg_len, 1) if avg_len else 0,
        "longest_doc_id": max_chunks_row[0] if max_chunks_row else None,
        "longest_doc_n_chunks": max_chunks_row[1] if max_chunks_row else 0,
        "longest_doc_text_len": max_chunks_row[2] if max_chunks_row else 0,
        "chunks_with_bad_start": bad_start,
        "chunks_with_bad_end": bad_end,
    }


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Pallas ML Phase 1 — Schritt 2: Chunking"
    )
    ap.add_argument("--pallas-db", required=True)
    ap.add_argument("--ml-db", required=True)
    args = ap.parse_args()

    print("Pallas ML Phase 1 — Schritt 2: Chunking")
    print(f"  Pallas-DB (RO):  {args.pallas_db}")
    print(f"  ML-DB (RW):      {args.ml_db}")
    print(f"  chunk_size:      {CHUNK_SIZE}")
    print(f"  overlap:         {OVERLAP}")
    print(f"  step:            {STEP}")

    con = open_ml_db(args.ml_db, args.pallas_db)
    try:
        init_schema(con)

        section("DOKUMENTE LESEN")
        docs = fetch_documents(con)
        print(f"  {len(docs)} Dokumente aus archive_documents")
        if not docs:
            print("\n  Arbeitssatz leer. Schritt 1 (preprocess) erst laufen lassen.")
            return

        section("CHUNKS BERECHNEN UND SCHREIBEN")
        stats = chunk_and_insert(con, docs)
        for k, val in stats.items():
            print(f"  {k:28s} {val}")

        section("VERIFIKATION")
        v = verify_result(con)
        for k, val in v.items():
            print(f"  {k:28s} {val}")

        run_id = log_run(
            con,
            step="phase1_step2_chunk",
            params={"chunk_size": CHUNK_SIZE, "overlap": OVERLAP},
            result={**stats, **v},
        )
        print(f"\n  pipeline_runs entry: id={run_id}")

        section("SANITY")
        problems = []
        if v["documents_without_chunks"] > 0:
            problems.append(
                f"{v['documents_without_chunks']} Dokumente ohne Chunks")
        if v["chunks_with_bad_start"] > 0:
            problems.append(
                f"{v['chunks_with_bad_start']} Chunks mit chunk_idx=0 "
                f"aber char_start != 0")
        if v["chunks_with_bad_end"] > 0:
            problems.append(
                f"{v['chunks_with_bad_end']} letzte Chunks enden nicht "
                f"auf raw_text_len")
        if v["max_chunk_len"] > CHUNK_SIZE:
            problems.append(
                f"Chunk laenger als chunk_size: max={v['max_chunk_len']}")

        if problems:
            print("  PROBLEME GEFUNDEN:")
            for p in problems:
                print(f"    - {p}")
        else:
            print("  Alle Sanity-Checks OK.")
    finally:
        con.close()

    print("\nFertig.")


if __name__ == "__main__":
    main()
