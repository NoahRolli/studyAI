"""Output-Formatierung fuer Delphi-Tools.

Helper, die Tool-Antworten lesbar machen:
- _format_anchor_info: Transparenz-Zeile ueber Anker + Cluster-Modus
- _monthly_histogram: ASCII-Verteilung pro Monat zum Erkennen von
  Bursts vs Outlier-Eintraegen
"""
from datetime import datetime


def _format_anchor_info(info: dict) -> str:
    """Kurze Transparenz-Zeile fuer Tool-Outputs ueber den Anker."""
    name = info.get("anchor_name")
    if not name:
        return "kein Anker im Embedding-Cache gefunden"
    sim = info.get("anchor_similarity", 0.0)
    if info.get("cluster_filter_applied"):
        labels = info.get("cluster_labels") or []
        label = labels[0] if labels else "unbekannt"
        n = info.get("cluster_concept_count", 0)
        c_sim = info.get("cluster_centroid_sim", 0.0)
        return (
            f"Anker '{name}' (sim {sim:.2f}), Cluster '{label}' "
            f"(centroid-sim {c_sim:.2f}, {n} Concepts)"
        )
    return (
        f"Anker '{name}' (sim {sim:.2f}), kein klarer Cluster gefunden "
        f"-> Fallback auf Top-K-Embedding-Match (kann thematisch streuen)"
    )


def _monthly_histogram(
    sources: list[tuple[str, int, datetime, str]],
) -> str:
    """Kompaktes ASCII-Histogramm pro Monat (YYYY-MM -> Anzahl).

    Nur Monate mit Eintraegen werden gelistet. Wenn die Spanne
    Luecken hat sind die explizit als '0' eingetragen, damit Bursts
    sichtbar werden.
    """
    if not sources:
        return ""
    counts: dict[str, int] = {}
    for _, _, created, _ in sources:
        key = created.strftime("%Y-%m")
        counts[key] = counts.get(key, 0) + 1

    # Luecken in der Spanne fuellen damit Bursts sichtbar werden
    keys_sorted = sorted(counts)
    if keys_sorted:
        first_y, first_m = map(int, keys_sorted[0].split("-"))
        last_y, last_m = map(int, keys_sorted[-1].split("-"))
        full: list[str] = []
        y, m = first_y, first_m
        while (y, m) <= (last_y, last_m):
            full.append(f"{y:04d}-{m:02d}")
            m += 1
            if m > 12:
                m = 1
                y += 1
        for k in full:
            counts.setdefault(k, 0)
        keys_sorted = full

    max_count = max(counts.values()) if counts else 1
    lines = ["  Verteilung pro Monat:"]
    for k in keys_sorted:
        n = counts[k]
        bar_width = int(round(20 * n / max_count)) if max_count else 0
        bar = "#" * bar_width
        lines.append(f"    {k}: {n:>4}  {bar}")
    return "\n".join(lines)
