"""Schritt 0 — Datendiagnose fuer Pallas ML Phase 1.

Rein lesend. Verifiziert die Zahlen aus dem Arbeitsplan (24.05.2026)
gegen die aktuelle DB, bevor backend/ml/-Infrastruktur gebaut wird.

Kein Schreibzugriff: Connection ist read-only (mode=ro URI).
Kein Backup noetig.

Aufruf:
    lokal:  python inspect_data.py --db ~/pallas-kopie/pallas.db
    olymp:  python inspect_data.py --db /mnt/tresor/pallas/data/pallas.db
"""

import argparse
import sqlite3
import sys
from pathlib import Path

# Erwartungswerte aus pallas-ml-phase1-arbeitsplan.md (24.05.2026).
# Abweichung => DB hat sich seit dem Planungs-Chat bewegt.
PLAN = {
    "documents_total": 1345,
    "len_buckets": {"<5k": 887, "5k-30k": 333, "30k-100k": 48, ">100k": 77},
    "conversations_total": 1227,
    "pallas_chats": 44,
}

# Schwellwerte
MINI_DOC_CHARS = 500       # Schritt-1-Filter (vorlaeufig)
CHUNK_CHARS = 30_000       # Schritt-2-Chunking-Grenze


def connect_ro(db_path: str) -> sqlite3.Connection:
    """Read-only Connection. Schuetzt die Live-DB vor versehentlichem Schreiben."""
    p = Path(db_path)
    if not p.exists():
        sys.exit(f"FEHLER: DB nicht gefunden: {p}")
    uri = f"file:{p.resolve()}?mode=ro"
    return sqlite3.connect(uri, uri=True)


def delta(label: str, actual: int, expected: int) -> str:
    diff = actual - expected
    mark = "OK" if diff == 0 else f"ABWEICHUNG {diff:+d}"
    return f"  {label:24s} {actual:6d}  (Plan {expected:6d})  [{mark}]"


def section(title: str) -> None:
    print(f"\n{'=' * 60}\n{title}\n{'=' * 60}")


def check_documents(con: sqlite3.Connection) -> None:
    section("DOKUMENTE — documents")
    cur = con.cursor()

    total = cur.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
    print(delta("Dokumente gesamt", total, PLAN["documents_total"]))

    missing = cur.execute(
        "SELECT COUNT(*) FROM documents "
        "WHERE raw_text IS NULL OR raw_text = ''"
    ).fetchone()[0]
    print(f"  {'ohne raw_text':24s} {missing:6d}  "
          f"[{'OK' if missing == 0 else 'PRUEFEN'}]")

    # Embedding-Spalte vorhanden? (Plan: nein -> muss erzeugt werden)
    cols = {row[1] for row in cur.execute("PRAGMA table_info(documents)")}
    has_emb = "embedding" in cols
    print(f"  {'embedding-Spalte':24s} "
          f"{'vorhanden' if has_emb else 'fehlt (erwartet)'}")


def check_length_distribution(con: sqlite3.Connection) -> None:
    section("LAENGENVERTEILUNG — length(raw_text)")
    cur = con.cursor()

    rows = cur.execute("""
        SELECT
          SUM(CASE WHEN n < 5000                  THEN 1 ELSE 0 END),
          SUM(CASE WHEN n >= 5000  AND n < 30000  THEN 1 ELSE 0 END),
          SUM(CASE WHEN n >= 30000 AND n < 100000 THEN 1 ELSE 0 END),
          SUM(CASE WHEN n >= 100000               THEN 1 ELSE 0 END),
          MIN(n), MAX(n), AVG(n), COUNT(*)
        FROM (SELECT length(raw_text) AS n FROM documents
              WHERE raw_text IS NOT NULL)
    """).fetchone()

    b = PLAN["len_buckets"]
    print(delta("< 5k Zeichen",   rows[0] or 0, b["<5k"]))
    print(delta("5k-30k",         rows[1] or 0, b["5k-30k"]))
    print(delta("30k-100k",       rows[2] or 0, b["30k-100k"]))
    print(delta("> 100k",         rows[3] or 0, b[">100k"]))
    print(f"\n  Min {rows[4]}  Schnitt ~{int(rows[6] or 0)}  Max {rows[5]}")

    to_chunk = (rows[2] or 0) + (rows[3] or 0)
    print(f"  Zu chunken (>= {CHUNK_CHARS:,} Zeichen): {to_chunk} Dokumente")


def check_mini_docs(con: sqlite3.Connection) -> None:
    section(f"MINI-DOKUMENTE — die 20 kuerzesten (Filter ~{MINI_DOC_CHARS} Zeichen)")
    cur = con.cursor()

    under = cur.execute(
        "SELECT COUNT(*) FROM documents "
        "WHERE length(raw_text) < ?", (MINI_DOC_CHARS,)
    ).fetchone()[0]
    print(f"  Dokumente unter {MINI_DOC_CHARS} Zeichen: {under}\n")

    rows = cur.execute("""
        SELECT length(raw_text) AS n, display_name
        FROM documents WHERE raw_text IS NOT NULL
        ORDER BY n ASC LIMIT 20
    """).fetchall()
    for n, name in rows:
        name = (name or "<kein display_name>")[:55]
        print(f"  {n:6d} Zeichen  {name}")
    print(f"\n  -> Filter-Schwellwert hier final festlegen (Schritt 1).")


def check_pallas_anchor(con: sqlite3.Connection) -> None:
    section("PALLAS-ANKER — Validierungsset fuer Schritt 5")
    cur = con.cursor()

    total = cur.execute("SELECT COUNT(*) FROM llm_conversations").fetchone()[0]
    print(delta("Conversations gesamt", total, PLAN["conversations_total"]))

    by_guess = cur.execute("""
        SELECT COALESCE(project_name_guess, '<NULL>') AS g, COUNT(*) AS c
        FROM llm_conversations GROUP BY g ORDER BY c DESC
    """).fetchall()
    print("\n  project_name_guess-Verteilung:")
    for g, c in by_guess:
        print(f"    {g:20s} {c:5d}")

    pallas = cur.execute("""
        SELECT c.document_id, d.display_name
        FROM llm_conversations c
        JOIN documents d ON d.id = c.document_id
        WHERE c.project_name_guess = 'pallas'
        ORDER BY d.display_name
    """).fetchall()
    print(f"\n  Pallas-Anker-Chats (Plan: {PLAN['pallas_chats']}): "
          f"{len(pallas)} gefunden")
    for doc_id, name in pallas:
        name = (name or "<kein display_name>")[:50]
        print(f"    doc {doc_id:5d}  {name}")

    # Anker als verlaesslich nur wenn raw_text lang genug fuer Embedding
    short_anchors = cur.execute("""
        SELECT COUNT(*) FROM llm_conversations c
        JOIN documents d ON d.id = c.document_id
        WHERE c.project_name_guess = 'pallas'
          AND length(d.raw_text) < ?
    """, (MINI_DOC_CHARS,)).fetchone()[0]
    if short_anchors:
        print(f"\n  ACHTUNG: {short_anchors} Anker-Chats sind < {MINI_DOC_CHARS} "
              f"Zeichen -> fielen durch den Mini-Doc-Filter. "
              f"Beim Anker-Check beruecksichtigen.")


def main() -> None:
    ap = argparse.ArgumentParser(description="Pallas ML Phase 1 — Datendiagnose")
    ap.add_argument("--db", required=True, help="Pfad zur pallas.db")
    args = ap.parse_args()

    print(f"Pallas ML Phase 1 — Schritt 0: Datendiagnose")
    print(f"DB (read-only): {args.db}")

    con = connect_ro(args.db)
    try:
        check_documents(con)
        check_length_distribution(con)
        check_mini_docs(con)
        check_pallas_anchor(con)
    finally:
        con.close()

    print(f"\n{'=' * 60}")
    print("Fertig. Bei Abweichungen: Arbeitsplan-Zahlen vor Schritt 1 anpassen.")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
