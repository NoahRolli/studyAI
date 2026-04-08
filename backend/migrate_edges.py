# Einmalige Migration: concept_edges vereinheitlichen
# - Alte Spalten (relation_type, ai_generated, confirmed) → neue (relation_type_id, origin, status, reason, reviewed_at)
# - relations-Tabelle migrieren (3 confirmed → concept_edges)
# - metis_edges droppen
# Auf Olymp ausführen: python3 backend/migrate_edges.py

import sqlite3
import sys
from datetime import datetime

DB_PATH = "/mnt/tresor/pallas/data/pallas.db"

# Mapping: alter String → relation_type_id
TYPE_MAP = {
    "related": 8,      # related_to
    "builds_on": 4,
    "contradicts": 6,
    "part_of": 3,
}

def migrate():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = OFF")
    cur = conn.cursor()

    # --- Schritt 1: concept_edges umbauen ---
    print("Schritt 1: concept_edges neue Spalten hinzufügen...")

    # Prüfen ob neue Spalten schon existieren
    cols = [r[1] for r in cur.execute("PRAGMA table_info(concept_edges)")]

    if "relation_type_id" not in cols:
        cur.execute("ALTER TABLE concept_edges ADD COLUMN relation_type_id INTEGER REFERENCES relation_types(id)")
    if "origin" not in cols:
        cur.execute("ALTER TABLE concept_edges ADD COLUMN origin VARCHAR NOT NULL DEFAULT 'ai_auto_link'")
    if "status" not in cols:
        cur.execute("ALTER TABLE concept_edges ADD COLUMN status VARCHAR NOT NULL DEFAULT 'suggested'")
    if "reason" not in cols:
        cur.execute("ALTER TABLE concept_edges ADD COLUMN reason TEXT")
    if "reviewed_at" not in cols:
        cur.execute("ALTER TABLE concept_edges ADD COLUMN reviewed_at DATETIME")

    # relation_type String → relation_type_id FK
    print("Schritt 2: relation_type String → relation_type_id mappen...")
    for old_type, new_id in TYPE_MAP.items():
        cur.execute(
            "UPDATE concept_edges SET relation_type_id = ? WHERE relation_type = ?",
            (new_id, old_type)
        )
    # Fallback: alles ohne Mapping → related_to
    cur.execute(
        "UPDATE concept_edges SET relation_type_id = 8 WHERE relation_type_id IS NULL"
    )

    # confirmed Boolean → status String
    print("Schritt 3: confirmed → status mappen...")
    cur.execute("UPDATE concept_edges SET status = 'confirmed' WHERE confirmed = 1")
    cur.execute("UPDATE concept_edges SET status = 'rejected' WHERE confirmed = 0")
    cur.execute("UPDATE concept_edges SET status = 'suggested' WHERE confirmed IS NULL")

    # ai_generated → origin
    print("Schritt 4: ai_generated → origin mappen...")
    cur.execute("UPDATE concept_edges SET origin = 'ai_auto_link' WHERE ai_generated = 1")
    cur.execute("UPDATE concept_edges SET origin = 'manual' WHERE ai_generated = 0")

    affected = cur.execute("SELECT count(*) FROM concept_edges").fetchone()[0]
    print(f"  → {affected} concept_edges migriert")

    # --- Schritt 5: relations → concept_edges (nur confirmed) ---
    print("Schritt 5: confirmed relations migrieren...")
    rels = cur.execute(
        "SELECT source_type, source_id, target_type, target_id, "
        "relation_type_id, reason FROM relations WHERE status = 'confirmed'"
    ).fetchall()

    migrated = 0
    for src_type, src_id, tgt_type, tgt_id, rel_type_id, reason in rels:
        # Konzepte finden die mit beiden Quellen verknüpft sind
        src_concepts = cur.execute(
            "SELECT DISTINCT concept_id FROM concept_sources "
            "WHERE source_type = ? AND source_id = ?",
            (src_type, src_id)
        ).fetchall()
        tgt_concepts = cur.execute(
            "SELECT DISTINCT concept_id FROM concept_sources "
            "WHERE source_type = ? AND source_id = ?",
            (tgt_type, tgt_id)
        ).fetchall()

        if not src_concepts or not tgt_concepts:
            print(f"  Übersprungen: {src_type}:{src_id} → {tgt_type}:{tgt_id} (kein Konzept)")
            continue

        # Erstes Konzept jeder Seite verknüpfen
        src_cid = src_concepts[0][0]
        tgt_cid = tgt_concepts[0][0]
        if src_cid == tgt_cid:
            print(f"  Übersprungen: gleiches Konzept {src_cid}")
            continue

        # Prüfen ob Edge schon existiert
        exists = cur.execute(
            "SELECT id FROM concept_edges "
            "WHERE source_concept_id = ? AND target_concept_id = ?",
            (src_cid, tgt_cid)
        ).fetchone()

        if exists:
            # Bestehende Edge auf confirmed upgraden
            cur.execute(
                "UPDATE concept_edges SET status = 'confirmed', origin = 'manual', "
                "reason = ?, reviewed_at = ? WHERE id = ?",
                (reason, datetime.utcnow().isoformat(), exists[0])
            )
        else:
            cur.execute(
                "INSERT INTO concept_edges "
                "(source_concept_id, target_concept_id, relation_type_id, "
                "strength, origin, status, reason, reviewed_at) "
                "VALUES (?, ?, ?, 1.0, 'manual', 'confirmed', ?, ?)",
                (src_cid, tgt_cid, rel_type_id, reason, datetime.utcnow().isoformat())
            )
        migrated += 1

    print(f"  → {migrated} relations migriert")

    # --- Schritt 6: Alte Spalten und Tabellen aufräumen ---
    print("Schritt 6: Alte Tabellen droppen...")

    # concept_edges: alte Spalten entfernen via Tabelle neu bauen
    print("  concept_edges neu bauen (ohne alte Spalten)...")
    cur.execute("""
        CREATE TABLE concept_edges_new (
            id INTEGER PRIMARY KEY,
            source_concept_id INTEGER NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
            target_concept_id INTEGER NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
            relation_type_id INTEGER NOT NULL REFERENCES relation_types(id),
            strength FLOAT NOT NULL DEFAULT 0.5,
            origin VARCHAR NOT NULL DEFAULT 'ai_auto_link',
            status VARCHAR NOT NULL DEFAULT 'suggested',
            reason TEXT,
            reviewed_at DATETIME,
            created_at DATETIME,
            UNIQUE (source_concept_id, target_concept_id)
        )
    """)
    cur.execute("""
        INSERT INTO concept_edges_new
            (id, source_concept_id, target_concept_id, relation_type_id,
             strength, origin, status, reason, reviewed_at, created_at)
        SELECT id, source_concept_id, target_concept_id, relation_type_id,
               strength, origin, status, reason, reviewed_at, created_at
        FROM concept_edges
    """)
    cur.execute("DROP TABLE concept_edges")
    cur.execute("ALTER TABLE concept_edges_new RENAME TO concept_edges")
    cur.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_uq_concept_edge "
        "ON concept_edges(source_concept_id, target_concept_id)"
    )

    # Alte Tabellen droppen
    cur.execute("DROP TABLE IF EXISTS metis_edges")
    cur.execute("DROP TABLE IF EXISTS relations")
    print("  → metis_edges + relations gelöscht")

    conn.execute("PRAGMA foreign_keys = ON")
    conn.commit()
    conn.close()
    print("\nMigration abgeschlossen!")

if __name__ == "__main__":
    migrate()
