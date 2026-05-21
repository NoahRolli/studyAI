#!/usr/bin/env python3
"""Sport-Tracker — Daten-Migration: Muskelgruppen-Werte zu Schluesseln.

Wandelt bestehende muscle_groups-Eintraege von deutschen Klartext-Werten
('Brust', 'Ruecken', ...) in stabile englische Schluessel ('chest', 'back', ...).
Idempotent: bereits migrierte Eintraege (Schluessel) bleiben unangetastet.

Usage:
    python3 -m scripts.sport_migrate_muscle_keys

Hintergrund:
    Das Muskelgruppen-Feature speicherte zunaechst deutsche Woerter direkt.
    i18n braucht stabile sprachunabhaengige Schluessel. Dieses Skript zieht
    bestehende Daten auf das neue Schema nach.
"""
import sys
import json
import sqlite3
from pathlib import Path

# Pallas-Root in sys.path
_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from backend.infra.config import DB_PATH  # noqa: E402


# Mapping deutscher Klartext -> stabiler Schluessel.
# Nur die deutschen Werte, weil das Feature ausschliesslich auf Deutsch
# gespeichert hat. Schluessel auf sich selbst ist unten als no-op abgedeckt.
DE_TO_KEY = {
    "Brust": "chest",
    "Rücken": "back",
    "Schultern": "shoulders",
    "Bizeps": "biceps",
    "Trizeps": "triceps",
    "Beine": "legs",
    "Core": "core",
    "Ganzkörper": "fullbody",
}

# Gueltige Zielschluessel — alles was hier schon drinsteht, ist bereits migriert.
VALID_KEYS = set(DE_TO_KEY.values())


def map_value(v: str) -> str | None:
    """Einen einzelnen Muskelgruppen-Wert auf den Schluessel mappen.

    Returns:
        Den Schluessel, oder None wenn der Wert unbekannt ist (wird verworfen).
    """
    if v in VALID_KEYS:
        return v  # bereits ein Schluessel — idempotent
    return DE_TO_KEY.get(v)


def main():
    print(f"DB Path: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)

    try:
        rows = conn.execute(
            "SELECT id, muscle_groups FROM sport_entries "
            "WHERE muscle_groups IS NOT NULL"
        ).fetchall()
        print(f"\nsport_entries mit muscle_groups: {len(rows)}")

        changed = 0
        unchanged = 0
        skipped_bad = 0
        dropped_values: set[str] = set()

        for entry_id, raw in rows:
            try:
                parsed = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                print(f"  ! id={entry_id}: kaputtes JSON, uebersprungen")
                skipped_bad += 1
                continue
            if not isinstance(parsed, list):
                skipped_bad += 1
                continue

            new_list = []
            for v in parsed:
                key = map_value(str(v))
                if key is None:
                    dropped_values.add(str(v))
                    continue
                if key not in new_list:
                    new_list.append(key)

            if new_list == parsed:
                unchanged += 1
                continue

            new_raw = json.dumps(new_list) if new_list else None
            conn.execute(
                "UPDATE sport_entries SET muscle_groups = ? WHERE id = ?",
                (new_raw, entry_id),
            )
            print(f"  + id={entry_id}: {parsed} -> {new_list}")
            changed += 1

        conn.commit()

        print()
        print("=" * 60)
        print("VERIFICATION")
        print("=" * 60)
        print(f"changed:        {changed}")
        print(f"unchanged:      {unchanged} (bereits Schluessel)")
        print(f"skipped (bad):  {skipped_bad}")
        if dropped_values:
            print(f"WARN unbekannte Werte verworfen: {sorted(dropped_values)}")

        print()
        print("Migration done successfully.")
        return 0

    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
