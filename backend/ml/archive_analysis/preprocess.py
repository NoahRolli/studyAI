"""Schritt 1 — Preprocessing & Filtern.

Liest pallas.db read-only, filtert Mini-Dokumente (< MIN_CHARS) raus,
schreibt den sauberen Arbeitssatz nach ml_phase1.db (Tabelle
archive_documents). Embedding-Spalte bleibt leer und wird in Schritt 3
gefuellt.

Schwellwert MIN_CHARS = 500 ist in Schritt 0 (inspect_data.py) validiert:
unter 500 Zeichen ueberwiegend Bild-Edit-Prompts und Gemini-Canvas-Stubs
ohne Themenstruktur. Ab 500 Zeichen echte kurze Q&A-Chats (Uebersetzungen,
Rechenaufgaben), die wir behalten wollen.

Erwartetes Ergebnis (Plan-Zahlen):
    1345 docs gesamt
    -  91 unter 500 Zeichen (gefiltert)
    = 1254 im Arbeitssatz
    davon 125 mit needs_chunking=1 (>= 30000 Zeichen)
    davon 44 Pallas-Anker (is_pallas_anchor=1)

Aufruf:
    python -m backend.ml.archive_analysis.preprocess \\
        --pallas-db <pfad/zu/pallas.db> \\
        --ml-db <pfad/zu/ml_phase1.db>
"""

import argparse
import sys
from pathlib import Path

# Repo-Root in sys.path, damit 'backend.ml.registry' importierbar ist,
# auch wenn das Modul direkt per `python -m ...` gestartet wird.
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from backend.ml.registry import open_ml_db, init_schema, log_run


# Schwellwerte — final aus Schritt 0 abgeleitet.
MIN_CHARS = 500           # Schritt-1-Filter
CHUNK_CHARS = 30_000      # Schritt-2-Chunking-Grenze (Markierung jetzt)


def section(title: str) -> None:
    print(f"\n{'=' * 60}\n{title}\n{'=' * 60}")


def fetch_candidate_docs(con) -> list[tuple]:
    """Holt alle Pallas-Dokumente mit Anker-Flag in einem Query.

    LEFT JOIN auf llm_conversations: project_name_guess='pallas' setzt
    is_pallas_anchor=1, sonst NULL/leer.
    """
    rows = con.execute("""
        SELECT
            d.id,
            length(d.raw_text) AS n,
            d.display_name,
            d.folder_id,
            CASE WHEN c.project_name_guess = 'pallas' THEN 1 ELSE 0 END
                AS is_anchor
        FROM pallas.documents d
        LEFT JOIN pallas.llm_conversations c ON c.document_id = d.id
        WHERE d.raw_text IS NOT NULL
        ORDER BY d.id
    """).fetchall()
    return rows


def filter_and_insert(con, rows: list[tuple]) -> dict:
    """Wendet den Mini-Doc-Filter an und schreibt den Arbeitssatz.

    Vor dem Insert wird archive_documents geleert — Schritt 1 ist
    idempotent reproduzierbar, jeder Lauf erzeugt einen sauberen
    Stand. Embeddings/Cluster-IDs gehen damit verloren; das ist gewollt,
    weil Schritt-1-Re-Run nur sinnvoll ist, wenn die Filter-Schwelle
    geaendert wurde.
    """
    con.execute("DELETE FROM archive_documents")

    kept: list[tuple] = []
    skipped = 0
    for doc_id, n, display, folder, is_anchor in rows:
        if n < MIN_CHARS:
            skipped += 1
            continue
        needs_chunking = 1 if n >= CHUNK_CHARS else 0
        kept.append((doc_id, n, display, folder, is_anchor, needs_chunking))

    con.executemany("""
        INSERT INTO archive_documents
            (document_id, raw_text_len, display_name, folder_id,
             is_pallas_anchor, needs_chunking)
        VALUES (?, ?, ?, ?, ?, ?)
    """, kept)
    con.commit()

    return {
        "input_total": len(rows),
        "filtered_out": skipped,
        "kept": len(kept),
        "min_chars_threshold": MIN_CHARS,
    }


def verify_result(con) -> dict:
    """Plausibilitaets-Checks gegen Plan-Zahlen aus Schritt 0."""
    cur = con.cursor()

    total = cur.execute(
        "SELECT COUNT(*) FROM archive_documents"
    ).fetchone()[0]
    needs_chunking = cur.execute(
        "SELECT COUNT(*) FROM archive_documents WHERE needs_chunking = 1"
    ).fetchone()[0]
    anchors = cur.execute(
        "SELECT COUNT(*) FROM archive_documents WHERE is_pallas_anchor = 1"
    ).fetchone()[0]
    anchors_lost = cur.execute("""
        SELECT COUNT(*)
        FROM pallas.llm_conversations c
        JOIN pallas.documents d ON d.id = c.document_id
        WHERE c.project_name_guess = 'pallas'
          AND length(d.raw_text) < ?
    """, (MIN_CHARS,)).fetchone()[0]
    min_len = cur.execute(
        "SELECT MIN(raw_text_len) FROM archive_documents"
    ).fetchone()[0]
    max_len = cur.execute(
        "SELECT MAX(raw_text_len) FROM archive_documents"
    ).fetchone()[0]

    return {
        "arbeitssatz_total": total,
        "needs_chunking": needs_chunking,
        "pallas_anchors_kept": anchors,
        "pallas_anchors_lost_by_filter": anchors_lost,
        "min_raw_text_len": min_len,
        "max_raw_text_len": max_len,
    }


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Pallas ML Phase 1 — Schritt 1: Preprocessing"
    )
    ap.add_argument("--pallas-db", required=True,
                    help="Pfad zur pallas.db (read-only)")
    ap.add_argument("--ml-db", required=True,
                    help="Pfad zur ml_phase1.db (wird angelegt falls fehlt)")
    args = ap.parse_args()

    print("Pallas ML Phase 1 — Schritt 1: Preprocessing & Filtern")
    print(f"  Pallas-DB (RO):  {args.pallas_db}")
    print(f"  ML-DB (RW):      {args.ml_db}")
    print(f"  Min-Schwelle:    {MIN_CHARS} Zeichen")
    print(f"  Chunk-Grenze:    {CHUNK_CHARS} Zeichen")

    con = open_ml_db(args.ml_db, args.pallas_db)
    try:
        init_schema(con)

        section("KANDIDATEN LESEN")
        rows = fetch_candidate_docs(con)
        print(f"  {len(rows)} Dokumente aus pallas.documents geholt")

        section("FILTER ANWENDEN")
        stats = filter_and_insert(con, rows)
        print(f"  Gesamt eingelesen:     {stats['input_total']}")
        print(f"  Gefiltert (< {MIN_CHARS}):    {stats['filtered_out']}")
        print(f"  Im Arbeitssatz:        {stats['kept']}")

        section("VERIFIKATION")
        v = verify_result(con)
        for k, val in v.items():
            print(f"  {k:34s} {val}")

        run_id = log_run(
            con,
            step="phase1_step1_preprocess",
            params={"min_chars": MIN_CHARS, "chunk_chars": CHUNK_CHARS},
            result={**stats, **v},
        )
        print(f"\n  pipeline_runs entry: id={run_id}")

        section("ABGLEICH PLAN")
        plan_kept = 1345 - 91
        plan_chunk = 125
        plan_anchors = 44
        diff_kept = v["arbeitssatz_total"] - plan_kept
        diff_chunk = v["needs_chunking"] - plan_chunk
        diff_anchors = v["pallas_anchors_kept"] - plan_anchors
        print(f"  Arbeitssatz   {v['arbeitssatz_total']:5d}  "
              f"(Plan {plan_kept})  diff {diff_kept:+d}")
        print(f"  needs_chunk   {v['needs_chunking']:5d}  "
              f"(Plan {plan_chunk})  diff {diff_chunk:+d}")
        print(f"  Anker         {v['pallas_anchors_kept']:5d}  "
              f"(Plan {plan_anchors})  diff {diff_anchors:+d}")
        if v["pallas_anchors_lost_by_filter"] > 0:
            print(f"\n  HINWEIS: {v['pallas_anchors_lost_by_filter']} "
                  f"Pallas-Anker liegen unter {MIN_CHARS} Zeichen und "
                  f"fielen durch den Filter. Beim Anker-Check in "
                  f"Schritt 5 beruecksichtigen.")
    finally:
        con.close()

    print("\nFertig.")


if __name__ == "__main__":
    main()
