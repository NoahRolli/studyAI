"""Schritt 4.5 — LLM-Topic-Extraktion.

Erzeugt pro Dokument eine themenfokussierte englische Kurz-Zusammenfassung
via Ollama (gemma4:e2b). Diese Summary ersetzt den Rohtext als Clustering-
Input und eliminiert das Chat-Format-Signal, das bge-m3 auf Rohtexten
dominiert (siehe Befund 1-6, Chat 80).

Modi:
  --sample N : N zufaellige Docs (stratifiziert), Summaries werden nur
               ausgegeben, KEIN DB-Write. Fuer manuelle Qualitaetspruefung.
  (default)  : Full-Run mit Resume (WHERE topic_summary IS NULL), schreibt
               topic_summary + Metadaten in archive_documents.

Aufruf:
  python -m backend.ml.archive_analysis.topic_extract \
      --ml-db <PALLAS_DATA_DIR>/ml_phase1.db \
      --pallas-db <PALLAS_DATA_DIR>/pallas-phase1-snapshot.db \
      --sample 20
"""
import argparse
import json
import random
import sys
import time
import urllib.request
from datetime import datetime, timezone

from backend.ml.registry import open_ml_db, log_run

OLLAMA_URL = "http://127.0.0.1:11434/api/generate"
DEFAULT_MODEL = "gemma4:e2b"

PROMPT = (
    "Identify the subject matter of the document below. "
    "Respond with one or two dense sentences in English that name the topic "
    "and its domain or field. Do not describe the conversation or its "
    "participants. Do not list steps. State only what it is about.\n\n"
    "DOCUMENT:\n{body}\n\nTOPIC:"
)

HEAD_CHARS = 8000
TAIL_CHARS = 2000
MIN_SUMMARY_CHARS = 50
UNSURE_MARKERS = ("unclear", "cannot determine", "not enough", "unsure")


def truncate(text):
    """Lange Docs auf Kopf+Schwanz kuerzen (gemma4:e2b Context-Limit)."""
    if len(text) <= HEAD_CHARS + TAIL_CHARS:
        return text
    return text[:HEAD_CHARS] + "\n...\n" + text[-TAIL_CHARS:]


def clean(summary):
    """Fuehrendes Label und Whitespace entfernen."""
    s = summary.strip()
    if s.upper().startswith("TOPIC:"):
        s = s[6:].strip()
    return s


def summarize(model, text):
    """Einzelnen Topic-Summary via Ollama generieren. temperature=0."""
    payload = {
        "model": model,
        "prompt": PROMPT.format(body=truncate(text)),
        "stream": False,
        "think": False,
        "options": {"temperature": 0},
    }
    req = urllib.request.Request(
        OLLAMA_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    return clean(body.get("response", ""))


def is_degenerate(summary):
    """Summary unbrauchbar -> Fallback auf display_name."""
    if len(summary) < MIN_SUMMARY_CHARS:
        return True
    low = summary.lower()
    return any(m in low for m in UNSURE_MARKERS)


def ensure_columns(con):
    """Idempotentes ALTER (create_all legt keine neuen Spalten an)."""
    cols = {r[1] for r in con.execute("PRAGMA table_info(archive_documents)")}
    add = {
        "topic_summary": "TEXT",
        "topic_embedding": "BLOB",
        "topic_summary_model": "TEXT",
        "topic_summary_at": "TIMESTAMP",
    }
    for name, typ in add.items():
        if name not in cols:
            con.execute(
                f"ALTER TABLE archive_documents ADD COLUMN {name} {typ}"
            )
    con.commit()


def fetch_doc(con, document_id):
    """raw_text + display_name aus attached pallas-DB (RO)."""
    row = con.execute(
        "SELECT raw_text, display_name FROM pallas.documents WHERE id = ?",
        (document_id,),
    ).fetchone()
    return (row[0] or "", row[1] or "") if row else ("", "")


def stratified_ids(con, n):
    """Repraesentatives Sample: lange Docs + Pallas-Anker + Rest."""
    rows = con.execute(
        "SELECT document_id, is_pallas_anchor, needs_chunking "
        "FROM archive_documents"
    ).fetchall()
    random.shuffle(rows)
    longs = [r[0] for r in rows if r[2]][: max(1, n // 4)]
    anchors = [r[0] for r in rows if r[1] and r[0] not in longs][: max(1, n // 6)]
    picked = longs + anchors
    for r in rows:
        if len(picked) >= n:
            break
        if r[0] not in picked:
            picked.append(r[0])
    return picked[:n]


def run_sample(con, model, n):
    """Summaries generieren und ausgeben, ohne DB-Write."""
    ids = stratified_ids(con, n)
    print(f"Sample: {len(ids)} Docs, Modell={model}\n")
    for doc_id in ids:
        raw, name = fetch_doc(con, doc_id)
        summary = summarize(model, raw) if raw.strip() else ""
        fb = is_degenerate(summary)
        print(f"[{doc_id}] len={len(raw)}  display_name={name!r}")
        print(f"    summary : {summary!r}")
        print(f"    fallback: {'JA -> display_name' if fb else 'nein'}\n")


def run_full(con, model, limit):
    """Full-Run mit Resume und Per-Doc-Commit."""
    ensure_columns(con)
    q = "SELECT document_id FROM archive_documents WHERE topic_summary IS NULL"
    if limit:
        q += f" LIMIT {int(limit)}"
    rows = con.execute(q).fetchall()
    total = len(rows)
    print(f"Full-Run: {total} Docs offen, Modell={model}")
    done, t0 = 0, time.time()
    for (doc_id,) in rows:
        raw, name = fetch_doc(con, doc_id)
        summary = summarize(model, raw) if raw.strip() else ""
        if is_degenerate(summary):
            summary = name or summary
        con.execute(
            "UPDATE archive_documents SET topic_summary=?, "
            "topic_summary_model=?, topic_summary_at=? WHERE document_id=?",
            (summary, model, datetime.now(timezone.utc).isoformat(), doc_id),
        )
        con.commit()
        done += 1
        if done % 25 == 0 or done == total:
            rate = done / (time.time() - t0)
            eta = (total - done) / rate if rate else 0
            print(
                f"  {done}/{total}  {rate:.2f} doc/s  eta={eta/60:.1f}min",
                flush=True,
            )
    log_run(con, "topic_extract", {"model": model},
            {"summarized": done, "total": total})
    print("Fertig.")


def main():
    p = argparse.ArgumentParser(description="Schritt 4.5 Topic-Extraktion")
    p.add_argument("--ml-db", required=True)
    p.add_argument("--pallas-db", required=True)
    p.add_argument("--model", default=DEFAULT_MODEL)
    p.add_argument("--sample", type=int, default=0)
    p.add_argument("--limit", type=int, default=0)
    args = p.parse_args()

    con = open_ml_db(args.ml_db, args.pallas_db)
    try:
        if args.sample:
            run_sample(con, args.model, args.sample)
        else:
            run_full(con, args.model, args.limit)
    finally:
        con.close()


if __name__ == "__main__":
    sys.exit(main())
