# Metis Sync Service — synchronisiert Notes + Summaries mit dem Knowledge-Graph
# Erstellt fehlende Nodes, entfernt verwaiste, parst WikiLinks zu Edges.
# Wird von metis.py aufgerufen, nicht direkt als Router registriert.

import re
from sqlalchemy.orm import Session
from backend.models.note import Note
from backend.models.summary import Summary
from backend.models.metis_node import MetisNode
from backend.models.metis_edge import MetisEdge


def sync_nodes(db: Session) -> dict:
    """
    Synchronisiert Notes + Summaries mit Metis-Nodes.
    Erstellt fehlende Nodes, entfernt verwaiste.
    Gibt Statistik zurück: { added, removed }
    """
    added = 0
    removed = 0

    # --- Notes synchronisieren ---
    all_notes = db.query(Note).all()
    note_ids = {n.id for n in all_notes}

    # Bestehende Note-Nodes laden
    existing_note_nodes = (
        db.query(MetisNode)
        .filter(MetisNode.type == "note")
        .all()
    )
    existing_note_ids = {n.source_id for n in existing_note_nodes}

    # Fehlende Notes als Nodes anlegen
    for note_id in note_ids - existing_note_ids:
        node = MetisNode(type="note", source_id=note_id)
        db.add(node)
        added += 1

    # Verwaiste Note-Nodes entfernen (Note wurde gelöscht)
    for node in existing_note_nodes:
        if node.source_id not in note_ids:
            db.delete(node)
            removed += 1

    # --- Summaries synchronisieren ---
    all_summaries = db.query(Summary).all()
    summary_ids = {s.id for s in all_summaries}

    # Bestehende Summary-Nodes laden
    existing_summary_nodes = (
        db.query(MetisNode)
        .filter(MetisNode.type == "summary")
        .all()
    )
    existing_summary_ids = {n.source_id for n in existing_summary_nodes}

    # Fehlende Summaries als Nodes anlegen
    for summary_id in summary_ids - existing_summary_ids:
        node = MetisNode(type="summary", source_id=summary_id)
        db.add(node)
        added += 1

    # Verwaiste Summary-Nodes entfernen
    for node in existing_summary_nodes:
        if node.source_id not in summary_ids:
            db.delete(node)
            removed += 1

    db.flush()
    return {"added": added, "removed": removed}


def sync_wikilinks(db: Session) -> int:
    """
    Parst [[WikiLinks]] aus allen Notes und erstellt Metis-Edges.
    Gibt Anzahl neu erstellter WikiLink-Edges zurück.
    """
    created = 0
    # Regex für [[Titel]] — greift den Text zwischen den Klammern
    wikilink_pattern = re.compile(r"\[\[([^\]]+)\]\]")

    # Alle Notes mit ihren Metis-Nodes laden
    notes = db.query(Note).all()
    # Lookup: Note-Titel → Note-ID
    title_to_id = {n.title: n.id for n in notes}
    # Lookup: (type, source_id) → MetisNode-ID
    node_lookup = {}
    all_nodes = db.query(MetisNode).filter(MetisNode.type == "note").all()
    for node in all_nodes:
        node_lookup[node.source_id] = node.id

    # Bestehende WikiLink-Edges laden (um Duplikate zu vermeiden)
    existing_wikilinks = set()
    wl_edges = (
        db.query(MetisEdge)
        .filter(MetisEdge.relation_type == "wikilink")
        .all()
    )
    for edge in wl_edges:
        existing_wikilinks.add((edge.source_node_id, edge.target_node_id))

    # Durch alle Notes iterieren und WikiLinks extrahieren
    for note in notes:
        if not note.content:
            continue
        source_node_id = node_lookup.get(note.id)
        if not source_node_id:
            continue

        # Alle [[Titel]] im Content finden
        matches = wikilink_pattern.findall(note.content)
        for linked_title in matches:
            target_note_id = title_to_id.get(linked_title)
            if not target_note_id:
                continue
            target_node_id = node_lookup.get(target_note_id)
            if not target_node_id:
                continue
            # Kein Self-Link
            if source_node_id == target_node_id:
                continue
            # Bereits vorhanden?
            if (source_node_id, target_node_id) in existing_wikilinks:
                continue

            edge = MetisEdge(
                source_node_id=source_node_id,
                target_node_id=target_node_id,
                relation_type="wikilink",
                strength=1.0,
            )
            db.add(edge)
            existing_wikilinks.add((source_node_id, target_node_id))
            created += 1

    db.flush()
    return created
