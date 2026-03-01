# Journal Database Setup
# Komplett separate SQLite-Datenbank für das Journal.
# Liegt NICHT in der Pallas-Haupt-DB — bewusste Isolation.
# Gleiche Struktur wie backend/models/database.py, aber eigenständig.

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from backend.journal.infra.journal_config import JOURNAL_DATABASE_URL

# SQLAlchemy Engine für die Journal-DB
# check_same_thread=False ist nötig für SQLite mit FastAPI (mehrere Threads)
engine = create_engine(
    JOURNAL_DATABASE_URL,
    connect_args={"check_same_thread": False},
)

# Session-Factory — erstellt DB-Sessions für API-Requests
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Basis-Klasse für alle Journal-Models
# Alle Journal-Models erben von DIESEM Base, nicht vom Pallas-Base
Base = declarative_base()


def get_db():
    """
    FastAPI Dependency — gibt eine DB-Session pro Request.
    Wird in den Journal-API-Routen als Depends(get_db) verwendet.
    Session wird nach dem Request automatisch geschlossen.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()