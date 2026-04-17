# WeatherEntry — Taeglich gecachte Wetterdaten fuer Basel
# Gespeichert in pallas.db (nicht journal.db — Wetter ist oeffentlich)
# Mondphase wird bei jedem Abruf berechnet (kein Cache noetig)

from sqlalchemy import Column, Integer, Float, String, DateTime, Boolean
from datetime import datetime, timezone
from backend.models.database import Base


class WeatherEntry(Base):
    """Wetterdaten fuer ein Datum — maximal ein Eintrag pro Tag."""
    __tablename__ = "weather_entries"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(String, nullable=False, unique=True, index=True)  # YYYY-MM-DD
    temp_max = Column(Float, nullable=True)
    temp_min = Column(Float, nullable=True)
    precipitation = Column(Float, nullable=True)  # mm
    wind_max = Column(Float, nullable=True)  # km/h
    weather_code = Column(Integer, nullable=True)  # WMO Code
    weather_key = Column(String, nullable=True)  # clear/rain/snow etc.
    fetched_at = Column(DateTime, nullable=False,
                        default=lambda: datetime.now(timezone.utc))
