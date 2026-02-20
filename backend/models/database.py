# Datenbankverbindung und Session-Management für SQLAlchemy

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from backend.infra.config import DATABASE_URL

# Engine erstellt die Verbindung zur SQLite-Datenbank
# echo=True zeigt alle SQL-Queries im Terminal (hilfreich zum Debuggen)
engine = create_engine(DATABASE_URL, echo=True)

# SessionLocal erstellt neue Datenbank-Sessions für jede Anfrage
SessionLocal = sessionmaker(bind=engine)


# Basisklasse für alle Models — jedes Model erbt von Base
class Base(DeclarativeBase):
    pass


# Dependency für FastAPI: Gibt eine DB-Session pro Request
# "yield" hält die Session offen, "finally" schliesst sie danach sauber
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()