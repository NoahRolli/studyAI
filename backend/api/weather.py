# Weather API — Wetter + Mondphase fuer Journal-Kalender
# Auto-Fetch bei erstem Abruf, danach aus DB-Cache
# Toggle via localStorage im Frontend (kein Backend-State)

import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from backend.models.database import get_db
from backend.models.weather import WeatherEntry
from backend.services.weather_service import fetch_weather
from backend.services.moon_service import get_moon_phase

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/weather", tags=["weather"])


@router.get("/{date}")
async def get_weather(date: str, db: Session = Depends(get_db)):
    """Wetter + Mondphase fuer ein Datum. Cached in DB."""
    # Mondphase immer berechnen (kein Cache noetig)
    moon = get_moon_phase(date)

    # Wetter aus Cache holen
    entry = db.query(WeatherEntry).filter(
        WeatherEntry.date == date
    ).first()

    if entry:
        return {
            "date": date, "cached": True,
            "temp_max": entry.temp_max, "temp_min": entry.temp_min,
            "precipitation": entry.precipitation,
            "wind_max": entry.wind_max,
            "weather_code": entry.weather_code,
            "weather_key": entry.weather_key,
            "moon": moon,
        }

    # Nicht im Cache — fetchen
    data = await fetch_weather(date)
    if not data:
        return {"date": date, "cached": False, "error": "Fetch fehlgeschlagen", "moon": moon}

    # In DB speichern
    entry = WeatherEntry(
        date=date,
        temp_max=data["temp_max"],
        temp_min=data["temp_min"],
        precipitation=data["precipitation"],
        wind_max=data["wind_max"],
        weather_code=data["weather_code"],
        weather_key=data["weather_key"],
    )
    db.add(entry)
    db.commit()

    return {
        "date": date, "cached": False,
        "temp_max": data["temp_max"], "temp_min": data["temp_min"],
        "precipitation": data["precipitation"],
        "wind_max": data["wind_max"],
        "weather_code": data["weather_code"],
        "weather_key": data["weather_key"],
        "moon": moon,
    }


@router.get("/range/{start}/{end}")
async def get_weather_range(
    start: str, end: str,
    db: Session = Depends(get_db),
):
    """Wetter + Mond fuer einen Datumsbereich. Fehlende Tage werden gefetcht."""
    # Alle Tage im Bereich generieren
    start_dt = datetime.strptime(start, "%Y-%m-%d")
    end_dt = datetime.strptime(end, "%Y-%m-%d")
    dates = []
    current = start_dt
    while current <= end_dt:
        dates.append(current.strftime("%Y-%m-%d"))
        current += timedelta(days=1)

    # Vorhandene aus DB laden
    existing = db.query(WeatherEntry).filter(
        WeatherEntry.date.in_(dates)
    ).all()
    cache_map = {e.date: e for e in existing}

    results = []
    for d in dates:
        moon = get_moon_phase(d)
        if d in cache_map:
            e = cache_map[d]
            results.append({
                "date": d, "temp_max": e.temp_max, "temp_min": e.temp_min,
                "precipitation": e.precipitation, "wind_max": e.wind_max,
                "weather_code": e.weather_code, "weather_key": e.weather_key,
                "moon": moon,
            })
        else:
            # Nur vergangene + heute fetchen, nicht Zukunft
            today = datetime.now(ZoneInfo("Europe/Zurich")).strftime("%Y-%m-%d")
            if d <= today:
                data = await fetch_weather(d)
                if data:
                    entry = WeatherEntry(
                        date=d, temp_max=data["temp_max"],
                        temp_min=data["temp_min"],
                        precipitation=data["precipitation"],
                        wind_max=data["wind_max"],
                        weather_code=data["weather_code"],
                        weather_key=data["weather_key"],
                    )
                    db.add(entry)
                    results.append({**data, "moon": moon})
                    continue
            # Kein Wetter verfuegbar
            results.append({"date": d, "moon": moon})

    db.commit()
    return results
