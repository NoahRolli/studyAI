#!/usr/bin/env python3
"""Test-Script: einen einzelnen Folder-Batch durch den neuen Prompt schicken.

Misst Coverage des neuen _build_prompt + _parse_batch_response Pfads
fuer EINEN Batch — ohne DB-Writes, ohne SSE, ohne destructive ops.

Usage (im Container):
    docker exec -w /app -e PYTHONPATH=/app pallas python3 /tmp/test_one_batch.py [folder_id]

Wenn folder_id weggelassen wird, testet F6 (Pallas).

Output:
    - Anzahl Concepts im Batch
    - LLM-Provider
    - Rohe Cluster aus dem Parsen
    - Missing-Liste (sollten in Misc landen)
    - Coverage in %
    - Sample-Output (erste 3 Cluster)
"""
import sys
import asyncio
import json
import time

# Pfade fuer Imports
sys.path.insert(0, "/app")

from backend.models.database import SessionLocal
from backend.models.concept import Concept
from backend.api.concepts_ai import ai_chat_with_provider, parse_json_response
from backend.api.concepts_cluster import (
    _build_concept_folder_map, _build_folder_batches,
)
from backend.api.concepts_cluster_helpers import (
    _build_prompt, _parse_batch_response,
)


async def main():
    target_folder = sys.argv[1] if len(sys.argv) > 1 else "Pallas"

    print(f"=== Test-Run fuer Folder: '{target_folder}' ===\n")

    db = SessionLocal()
    try:
        # Concepts + Folder-Map + Batches bauen (wie im echten Stream)
        t0 = time.time()
        concepts = db.query(Concept).all()
        name_to_id = {c.name: c.id for c in concepts}
        print(f"Concepts geladen: {len(concepts)} ({time.time()-t0:.2f}s)")

        t0 = time.time()
        concept_folder = _build_concept_folder_map(db)
        print(f"Folder-Map gebaut: {len(concept_folder)} Eintraege ({time.time()-t0:.2f}s)")

        t0 = time.time()
        batches = _build_folder_batches(concepts, concept_folder, db)
        print(f"Batches gebaut: {len(batches)} ({time.time()-t0:.2f}s)\n")

        # Ziel-Batch finden
        target_batch = None
        target_idx = None
        for idx, (folder_hint, batch) in enumerate(batches):
            if folder_hint and target_folder.lower() in folder_hint.lower():
                target_batch = batch
                target_idx = idx
                print(f"Match: Batch {idx}, Folder='{folder_hint}', Size={len(batch)}")
                # Ersten Match nehmen (groesster, da _build_folder_batches grouped)
                break

        if target_batch is None:
            print(f"FEHLER: Kein Batch mit Folder='{target_folder}' gefunden")
            print("Verfuegbare Folder-Hints:")
            for idx, (fh, b) in enumerate(batches):
                print(f"  [{idx}] '{fh}' (size={len(b)})")
            return

        # Zusaetzliche Sub-Batches des gleichen Folders mit aufnehmen
        # waere zu viel — wir testen nur den ersten
        folder_hint = batches[target_idx][0]
        print(f"\n--- Test-Batch ---")
        print(f"Folder: '{folder_hint}'")
        print(f"Size: {len(target_batch)}")
        print(f"Concepts (erste 10): {target_batch[:10]}")
        if len(target_batch) > 10:
            print(f"... + {len(target_batch)-10} weitere\n")

        # Prompt bauen + LLM Call
        prompt = _build_prompt(folder_hint, target_batch)
        print(f"Prompt-Laenge: {len(prompt)} Zeichen")
        print(f"\n--- Prompt-Preview (erste 400 Zeichen) ---")
        print(prompt[:400])
        print("...\n")

        print("LLM-Call laeuft ...")
        t0 = time.time()
        raw, provider = await ai_chat_with_provider(
            prompt, page="metis", disable_groq=True,
        )
        llm_elapsed = time.time() - t0
        print(f"LLM done: provider={provider}, elapsed={llm_elapsed:.1f}s")
        print(f"Response-Laenge: {len(raw)} Zeichen")

        # Roh-Response zeigen (gekuerzt)
        print(f"\n--- Raw Response (erste 600 Zeichen) ---")
        print(raw[:600])
        if len(raw) > 600:
            print(f"... + {len(raw)-600} weitere Zeichen")

        # Parsen
        parsed = parse_json_response(raw)
        print(f"\n--- Parsed Type: {type(parsed).__name__} ---")
        if isinstance(parsed, list):
            print(f"Parsed Items: {len(parsed)}")
        elif parsed is None:
            print("FEHLER: parse_json_response returned None")
            return

        # Helper anwenden
        batch_clusters, missing = _parse_batch_response(
            parsed, target_batch, name_to_id,
        )

        # Resultat-Statistik
        n_input = len(target_batch)
        n_assigned = n_input - len(missing)
        coverage = 100.0 * n_assigned / max(n_input, 1)
        n_clusters_regular = sum(
            1 for k in batch_clusters.keys()
            if not k.startswith("_misc") and k != "misc"
        )
        n_clusters_misc = sum(
            1 for k in batch_clusters.keys()
            if k.startswith("_misc") or k == "misc"
        )

        print(f"\n=== RESULTAT ===")
        print(f"Input concepts:       {n_input}")
        print(f"Assigned:             {n_assigned}")
        print(f"Missing:              {len(missing)}")
        print(f"Coverage:             {coverage:.1f}%")
        print(f"Regulaere Cluster:    {n_clusters_regular}")
        print(f"Misc-Cluster (LLM):   {n_clusters_misc}")
        print(f"LLM-Provider:         {provider}")
        print(f"LLM-Zeit:             {llm_elapsed:.1f}s")

        # Cluster-Sample
        print(f"\n--- Cluster-Sample (alle, max 10 Members je) ---")
        for i, (label, members) in enumerate(batch_clusters.items()):
            if i >= 8:
                print(f"... + {len(batch_clusters)-i} weitere Cluster")
                break
            display_members = members[:10]
            suffix = f" ... +{len(members)-10}" if len(members) > 10 else ""
            print(f"  [{label}] ({len(members)}): {display_members}{suffix}")

        if missing:
            print(f"\n--- Missing Concepts (wuerden in _Misc_{folder_hint} landen) ---")
            for name in missing[:20]:
                print(f"  - {name}")
            if len(missing) > 20:
                print(f"  ... +{len(missing)-20} weitere")

        # Ampel
        print(f"\n=== AMPEL ===")
        if coverage >= 95.0:
            print("GRUEN: Coverage >= 95%. Bereit fuer Full-Run.")
        elif coverage >= 80.0:
            print("GELB: Coverage 80-95%. Misc-Fallback faengt den Rest, "
                  "aber Prompt evtl. weiter verschaerfen.")
        else:
            print("ROT: Coverage < 80%. LLM dropt immer noch viel. "
                  "Prompt-Iteration noetig oder Plan C (HDBSCAN).")

    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
