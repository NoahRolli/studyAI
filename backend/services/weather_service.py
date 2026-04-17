# Weather Service — Wetterdaten von Open-Meteo API (gratis, kein Key)
# Basel Koordinaten: 47.5596, 7.5886
# Forecast fuer heute/morgen, Archive fuer vergangene Tage

import httpx
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

BASEL_LAT = 47.5596
BASEL_LON = 7.5886

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"

# WMO Weather Codes → Beschreibung
WMO_CODES = {
    0: ("clear", "Klar", "Clear"),
    1: ("mostly_clear", "Meist klar", "Mostly clear"),
    2: ("partly_cloudy", "Teilweise bewölkt", "Partly cloudy"),
    3: ("overcast", "Bewölkt", "Overcast"),
    45: ("fog", "Nebel", "Fog"),
    48: ("fog", "Reifnebel", "Rime fog"),
    51: ("drizzle", "Nieselregen", "Light drizzle"),
    53: ("drizzle", "Nieselregen", "Moderate drizzle"),
    55: ("drizzle", "Starker Niesel", "Dense drizzle"),
    61: ("rain", "Leichter Regen", "Light rain"),
    63: ("rain", "Regen", "Moderate rain"),
    65: ("rain", "Starker Regen", "Heavy rain"),
    71: ("snow", "Leichter Schnee", "Light snow"),
    73: ("snow", "Schnee", "Moderate snow"),
    75: ("snow", "Starker Schnee", "Heavy snow"),
    80: ("showers", "Leichte Schauer", "Light showers"),
    81: ("showers", "Schauer", "Moderate showers"),
    82: ("showers", "Starke Schauer", "Heavy showers"),
    95: ("thunderstorm", "Gewitter", "Thunderstorm"),
    96: ("thunderstorm", "Gewitter mit Hagel", "Thunderstorm with hail"),
    99: ("thunderstorm", "Starkes Gewitter", "Severe thunderstorm"),
}


async def fetch_weather(date_str: str) -> dict | None:
    """Holt Wetterdaten fuer Basel an einem bestimmten Datum."""
    today = datetime.now().strftime("%Y-%m-%d")
    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")

    # Forecast fuer heute/morgen, Archive fuer vergangene Tage
    if date_str >= today:
        url = FORECAST_URL
        params = {
            "latitude": BASEL_LAT, "longitude": BASEL_LON,
            "daily": "temperature_2m_max,temperature_2m_min,"
                     "precipitation_sum,weathercode,windspeed_10m_max",
            "start_date": date_str, "end_date": date_str,
            "timezone": "Europe/Zurich",
        }
    else:
        url = ARCHIVE_URL
        params = {
            "latitude": BASEL_LAT, "longitude": BASEL_LON,
            "daily": "temperature_2m_max,temperature_2m_min,"
                     "precipitation_sum,weathercode,windspeed_10m_max",
            "start_date": date_str, "end_date": date_str,
            "timezone": "Europe/Zurich",
        }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

        daily = data.get("daily", {})
        if not daily or not daily.get("time"):
            return None

        code = daily.get("weathercode", [None])[0]
        wmo = WMO_CODES.get(code, ("unknown", "Unbekannt", "Unknown"))

        return {
            "date": date_str,
            "temp_max": daily.get("temperature_2m_max", [None])[0],
            "temp_min": daily.get("temperature_2m_min", [None])[0],
            "precipitation": daily.get("precipitation_sum", [None])[0],
            "wind_max": daily.get("windspeed_10m_max", [None])[0],
            "weather_code": code,
            "weather_key": wmo[0],
            "weather_de": wmo[1],
            "weather_en": wmo[2],
        }
    except Exception as e:
        logger.error(f"Weather fetch fehlgeschlagen: {e}")
        return None
