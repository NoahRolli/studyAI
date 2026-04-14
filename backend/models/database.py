# Datenbankverbindung und Session-Management für SQLAlchemy

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from backend.infra.config import DATABASE_URL

# Engine erstellt die Verbindung zur SQLite-Datenbank
# echo=True zeigt alle SQL-Queries im Terminal (hilfreich zum Debuggen)
from sqlalchemy import event

engine = create_engine(
    DATABASE_URL,
    echo=True,
    connect_args={"timeout": 30},
)

@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()

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