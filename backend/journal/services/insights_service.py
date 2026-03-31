# Insights Service — Erkennt Muster in Journal-Daten
# Kombiniert Mood-Scores, Medikamenten-Einnahmen, Wochentage, Themen
# Reine Mathematik — kein AI nötig für Korrelationen
#
# Jede Analyse-Funktion bekommt entschlüsselte Daten und gibt
# strukturierte Ergebnisse zurück. Ollama-only für AI-Summary.

from datetime import datetime
from collections import defaultdict


def analyze_medication_mood(
    moods: list[dict],
    intake_logs: list[dict],
) -> list[dict]:
    """
    Korrelation Medikament ↔ Stimmung.
    Vergleicht Ø-Mood an Tagen mit vs. ohne Einnahme pro Medikament.
    """
    if not moods or not intake_logs:
        return []

    # Mood nach Datum indexieren
    mood_by_date: dict[str, float] = {}
    for m in moods:
        if m.get("date") and m.get("score") is not None:
            mood_by_date[m["date"]] = m["score"]

    # Einnahme-Tage pro Medikament sammeln
    taken_dates: dict[str, set[str]] = defaultdict(set)
    med_names: dict[str, str] = {}
    for log in intake_logs:
        if log.get("status") == "taken":
            key = str(log["medication_id"])
            taken_dates[key].add(log["date"])
            med_names[key] = log.get("med_name", f"Med {key}")

    all_dates = set(mood_by_date.keys())
    results = []

    for med_id, dates_taken in taken_dates.items():
        # Tage MIT Einnahme die auch einen Mood-Score haben
        with_med = [mood_by_date[d] for d in dates_taken if d in mood_by_date]
        # Tage OHNE Einnahme
        without_dates = all_dates - dates_taken
        without_med = [mood_by_date[d] for d in without_dates if d in mood_by_date]

        if len(with_med) < 2 or len(without_med) < 1:
            continue

        avg_with = sum(with_med) / len(with_med)
        avg_without = sum(without_med) / len(without_med)
        diff = round(avg_with - avg_without, 2)

        results.append({
            "medication": med_names.get(med_id, f"Med {med_id}"),
            "avg_mood_with": round(avg_with, 2),
            "avg_mood_without": round(avg_without, 2),
            "difference": diff,
            "days_with": len(with_med),
            "days_without": len(without_med),
            "trend": "positive" if diff > 0.1 else "negative" if diff < -0.1 else "neutral",
        })

    return sorted(results, key=lambda x: abs(x["difference"]), reverse=True)


def analyze_weekday_mood(moods: list[dict]) -> list[dict]:
    """
    Stimmung nach Wochentag — erkennt wann es dir gut/schlecht geht.
    """
    if not moods:
        return []

    # Wochentag-Namen (Montag=0)
    day_names = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    by_day: dict[int, list[float]] = defaultdict(list)

    for m in moods:
        if m.get("date") and m.get("score") is not None:
            try:
                dt = datetime.strptime(m["date"], "%Y-%m-%d")
                by_day[dt.weekday()].append(m["score"])
            except ValueError:
                continue

    results = []
    for day_idx in range(7):
        scores = by_day.get(day_idx, [])
        if not scores:
            continue
        avg = round(sum(scores) / len(scores), 2)
        results.append({
            "weekday": day_names[day_idx],
            "weekday_index": day_idx,
            "avg_mood": avg,
            "entry_count": len(scores),
        })

    return sorted(results, key=lambda x: x["weekday_index"])


def analyze_writing_patterns(entries: list[dict], moods: list[dict]) -> dict:
    """
    Schreib-Muster — Korrelation zwischen Schreibhäufigkeit und Stimmung.
    """
    if not entries or not moods:
        return {}

    mood_by_date: dict[str, float] = {}
    for m in moods:
        if m.get("date") and m.get("score") is not None:
            mood_by_date[m["date"]] = m["score"]

    # Einträge pro Tag zählen
    entries_per_day: dict[str, int] = defaultdict(int)
    for e in entries:
        if e.get("date"):
            entries_per_day[e["date"]] += 1

    # Tage mit vs. ohne Einträge vergleichen
    dates_with = [mood_by_date[d] for d in entries_per_day if d in mood_by_date]
    all_mood_dates = set(mood_by_date.keys())
    entry_dates = set(entries_per_day.keys())
    dates_without = [mood_by_date[d] for d in (all_mood_dates - entry_dates)]

    # Durchschnittliche Textlänge
    lengths = [len(e.get("content", "")) for e in entries]
    avg_length = round(sum(lengths) / len(lengths)) if lengths else 0

    return {
        "total_entries": len(entries),
        "avg_length": avg_length,
        "avg_mood_writing_days": round(sum(dates_with) / len(dates_with), 2) if dates_with else None,
        "avg_mood_silent_days": round(sum(dates_without) / len(dates_without), 2) if dates_without else None,
        "writing_days": len(entry_dates),
    }


def analyze_keyword_mood(moods: list[dict]) -> list[dict]:
    """
    Themen ↔ Stimmung — welche Keywords korrelieren mit guter/schlechter Stimmung.
    Nutzt die Keywords aus dem Mood-Cache.
    """
    if not moods:
        return []

    keyword_scores: dict[str, list[float]] = defaultdict(list)

    for m in moods:
        score = m.get("score")
        keywords = m.get("keywords", [])
        if score is None or not keywords:
            continue
        for kw in keywords:
            kw_clean = kw.strip().lower()
            if kw_clean:
                keyword_scores[kw_clean].append(score)

    results = []
    for kw, scores in keyword_scores.items():
        if len(scores) < 2:
            continue
        avg = round(sum(scores) / len(scores), 2)
        results.append({
            "keyword": kw,
            "avg_mood": avg,
            "count": len(scores),
        })

    return sorted(results, key=lambda x: x["avg_mood"])