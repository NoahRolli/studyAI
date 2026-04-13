# Insights Service — Erkennt Muster in Journal-Daten
# Kombiniert Mood-Scores, Medikamenten-Einnahmen, Wochentage, Themen
# Fuzzy Logic: Scores werden in unscharfe Kategorien übersetzt
# Reine Mathematik + Fuzzy — kein AI nötig für Korrelationen

from datetime import datetime
from collections import defaultdict
from backend.journal.services.fuzzy_mood import (
    fuzzify_series, fuzzy_for_prompt, dominant_mood, MOOD_COLORS,
)


def analyze_medication_mood(
    moods: list[dict],
    intake_logs: list[dict],
) -> list[dict]:
    """
    Korrelation Medikament <> Stimmung.
    Vergleicht Mood an Tagen mit vs. ohne Einnahme pro Medikament.
    Inkl. Fuzzy-Verteilung für natürlichere Darstellung.
    """
    if not moods or not intake_logs:
        return []

    mood_by_date: dict[str, float] = {}
    for m in moods:
        if m.get("date") and m.get("score") is not None:
            mood_by_date[m["date"]] = m["score"]

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
        with_med = [mood_by_date[d] for d in dates_taken if d in mood_by_date]
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
            "fuzzy_with": fuzzify_series(with_med),
            "fuzzy_without": fuzzify_series(without_med),
        })

    return sorted(results, key=lambda x: abs(x["difference"]), reverse=True)


def analyze_weekday_mood(moods: list[dict]) -> list[dict]:
    """Stimmung nach Wochentag — mit Fuzzy-Verteilung pro Tag."""
    if not moods:
        return []

    day_names = ["monday", "tuesday", "wednesday", "thursday",
                 "friday", "saturday", "sunday"]
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
            "fuzzy": fuzzify_series(scores),
            "dominant": dominant_mood(avg),
        })

    return sorted(results, key=lambda x: x["weekday_index"])


def analyze_writing_patterns(entries: list[dict], moods: list[dict]) -> dict:
    """Schreib-Muster — Korrelation Schreibhäufigkeit <> Stimmung."""
    if not entries or not moods:
        return {}

    mood_by_date: dict[str, float] = {}
    for m in moods:
        if m.get("date") and m.get("score") is not None:
            mood_by_date[m["date"]] = m["score"]

    entries_per_day: dict[str, int] = defaultdict(int)
    for e in entries:
        if e.get("date"):
            entries_per_day[e["date"]] += 1

    dates_with = [mood_by_date[d] for d in entries_per_day if d in mood_by_date]
    all_mood_dates = set(mood_by_date.keys())
    entry_dates = set(entries_per_day.keys())
    dates_without = [mood_by_date[d] for d in (all_mood_dates - entry_dates)]

    lengths = [len(e.get("content", "")) for e in entries]
    avg_length = round(sum(lengths) / len(lengths)) if lengths else 0

    return {
        "total_entries": len(entries),
        "avg_length": avg_length,
        "avg_mood_writing_days": round(sum(dates_with) / len(dates_with), 2) if dates_with else None,
        "avg_mood_silent_days": round(sum(dates_without) / len(dates_without), 2) if dates_without else None,
        "writing_days": len(entry_dates),
        "fuzzy_writing_days": fuzzify_series(dates_with) if dates_with else {},
        "fuzzy_silent_days": fuzzify_series(dates_without) if dates_without else {},
    }


def analyze_keyword_mood(moods: list[dict]) -> list[dict]:
    """Themen <> Stimmung — Keywords mit Fuzzy-Verteilung."""
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
            "fuzzy": fuzzify_series(scores),
            "dominant": dominant_mood(avg),
        })

    return sorted(results, key=lambda x: abs(x["avg_mood"]), reverse=True)


def build_fuzzy_prompt_context(moods: list[dict]) -> str:
    """
    Erzeugt Fuzzy-Kontext für den AI-Summary-Prompt in Insights.
    Statt "Ø Score 0.42" → "Stimmungsverteilung: Gut (0.65), Neutral (0.25)"
    """
    scores = [m["score"] for m in moods
              if m.get("score") is not None]
    return fuzzy_for_prompt(scores)
