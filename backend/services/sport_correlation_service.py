# Sport-Korrelation Service
# Berechnet statistische Effekte zwischen Sport-Aktivität und Mood/Body-Score
# Reine Logik — keine DB-Zugriffe, alle Daten werden injiziert
# Liefert: Sport vs Ruhe, nach Intensität, Zeitversatz (Lag-Effekt)

from __future__ import annotations
from datetime import date, timedelta
from math import sqrt
from typing import Any


def _mean(xs: list[float]) -> float:
    # Arithmetischer Mittelwert, 0.0 bei leerer Liste
    return sum(xs) / len(xs) if xs else 0.0


def _stdev(xs: list[float]) -> float:
    # Stichproben-Standardabweichung (n-1)
    if len(xs) < 2:
        return 0.0
    m = _mean(xs)
    return sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1))


def _cohens_d(a: list[float], b: list[float]) -> float | None:
    # Effektstärke d nach Cohen (pooled SD)
    # None bei zu wenig Daten für stabile Aussage
    if len(a) < 5 or len(b) < 5:
        return None
    sa, sb = _stdev(a), _stdev(b)
    na, nb = len(a), len(b)
    pooled_var = ((na - 1) * sa * sa + (nb - 1) * sb * sb) / (na + nb - 2)
    if pooled_var <= 0:
        return None
    return (_mean(a) - _mean(b)) / sqrt(pooled_var)


def _effect_label(d: float | None) -> str:
    # Cohen'sche Faustregel: klein/mittel/gross
    if d is None:
        return "insufficient"
    ad = abs(d)
    if ad < 0.2:
        return "none"
    if ad < 0.5:
        return "small"
    if ad < 0.8:
        return "medium"
    return "large"


def _group_stats(values: list[float]) -> dict[str, Any]:
    # Standard-Kennzahlen einer Gruppe
    return {
        "mean": round(_mean(values), 2) if values else None,
        "n": len(values),
        "sd": round(_stdev(values), 2) if len(values) >= 2 else None,
    }


def _compare(a: list[float], b: list[float]) -> dict[str, Any]:
    # Vergleich zweier Gruppen mit Effektstärke
    d = _cohens_d(a, b)
    return {
        "group_a": _group_stats(a),
        "group_b": _group_stats(b),
        "delta": round(_mean(a) - _mean(b), 2) if a and b else None,
        "cohens_d": round(d, 2) if d is not None else None,
        "effect": _effect_label(d),
    }


def compute_correlation(
    sport_by_date: dict[date, int],
    mood_by_date: dict[date, float],
    body_by_date: dict[date, float],
    start: date,
    end: date,
) -> dict[str, Any]:
    # sport_by_date: date -> max intensity (1-5) an diesem Tag
    # mood_by_date / body_by_date: date -> Tagesdurchschnitt des Scores
    # start/end: inklusiver Zeitraum für die Analyse

    all_days: list[date] = []
    cur = start
    while cur <= end:
        all_days.append(cur)
        cur += timedelta(days=1)

    # Sport vs Ruhe — Scores am selben Tag
    mood_sport: list[float] = []
    mood_rest: list[float] = []
    body_sport: list[float] = []
    body_rest: list[float] = []

    # Nach Intensitäts-Bucket — nur Mood (Body analog, aber redundant in UI)
    by_intensity: dict[str, list[float]] = {"low": [], "mid": [], "high": []}
    by_intensity_body: dict[str, list[float]] = {"low": [], "mid": [], "high": []}

    for d_ in all_days:
        intensity = sport_by_date.get(d_)
        mood = mood_by_date.get(d_)
        body = body_by_date.get(d_)

        if intensity is not None:
            if mood is not None:
                mood_sport.append(mood)
            if body is not None:
                body_sport.append(body)
            bucket = "low" if intensity <= 2 else ("mid" if intensity == 3 else "high")
            if mood is not None:
                by_intensity[bucket].append(mood)
            if body is not None:
                by_intensity_body[bucket].append(body)
        else:
            if mood is not None:
                mood_rest.append(mood)
            if body is not None:
                body_rest.append(body)

    # Zeitversatz A: Mood/Body am Tag NACH Sport vs Tag NACH Ruhe
    mood_lag_sport: list[float] = []
    mood_lag_rest: list[float] = []
    body_lag_sport: list[float] = []
    body_lag_rest: list[float] = []

    for d_ in all_days:
        next_day = d_ + timedelta(days=1)
        next_mood = mood_by_date.get(next_day)
        next_body = body_by_date.get(next_day)
        if next_mood is None and next_body is None:
            continue
        if d_ in sport_by_date:
            if next_mood is not None:
                mood_lag_sport.append(next_mood)
            if next_body is not None:
                body_lag_sport.append(next_body)
        else:
            if next_mood is not None:
                mood_lag_rest.append(next_mood)
            if next_body is not None:
                body_lag_rest.append(next_body)

    return {
        "range": {"start": start.isoformat(), "end": end.isoformat(), "days": len(all_days)},
        "coverage": {
            "sport_days": sum(1 for d_ in all_days if d_ in sport_by_date),
            "mood_days": sum(1 for d_ in all_days if d_ in mood_by_date),
            "body_days": sum(1 for d_ in all_days if d_ in body_by_date),
        },
        "same_day": {
            "mood": _compare(mood_sport, mood_rest),
            "body": _compare(body_sport, body_rest),
        },
        "by_intensity": {
            "mood": {k: _group_stats(v) for k, v in by_intensity.items()},
            "body": {k: _group_stats(v) for k, v in by_intensity_body.items()},
        },
        "lag_next_day": {
            "mood": _compare(mood_lag_sport, mood_lag_rest),
            "body": _compare(body_lag_sport, body_lag_rest),
        },
    }
