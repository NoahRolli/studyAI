# FastAPI Entry Point — startet den Server und konfiguriert die App
# Serviert im Production-Modus auch das gebaute Frontend als Static Files
import os
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from backend.models.database import engine, Base
from backend.api.modules import router as modules_router
from backend.api.documents import router as documents_router
from backend.api.summaries import router as summaries_router
from backend.api.mindmap import router as mindmap_router
from backend.api.folders import router as folders_router
from backend.api.calendar import router as calendar_router
from backend.api.notes import router as notes_router
from backend.journal.api.auth import router as journal_auth_router
from backend.journal.api.entries import router as journal_entries_router
from backend.journal.api.analytics import router as journal_analytics_router
from backend.journal.api.medications import router as journal_medications_router
from backend.journal.models.journal_database import engine as journal_engine
from backend.journal.models.journal_database import JournalBase
from backend.journal.api.calendar import router as journal_calendar_router
from backend.journal.api.insights import router as journal_insights_router
from backend.auth.auth_middleware import router as auth_router
from backend.auth.auth_middleware import require_auth
from backend.api.ollama_status import router as ollama_status_router
from backend.api.notes_ai import router as notes_ai_router# WICHTIG: Alle Models importieren, damit SQLAlchemy sie kennt
from backend.api.metis import router as metis_router
from backend.api.metis_ai import router as metis_ai_router
from backend.models.module import Module  # noqa: F401
from backend.models.document import Document  # noqa: F401
from backend.models.summary import Summary  # noqa: F401
from backend.models.mindmap_node import MindmapNode  # noqa: F401
from backend.models.folder import Folder  # noqa: F401
from backend.models.calendar_event import CalendarEvent  # noqa: F401
from backend.models.note import Note  # noqa: F401
from backend.models.metis_node import MetisNode  # noqa: F401
from backend.models.metis_edge import MetisEdge  # noqa: F401
from backend.models.metis_cluster import MetisCluster  # noqa: F401
from backend.models.metis_cluster import MetisClusterMember  # noqa: F401
from backend.journal.models.journal_entry import JournalEntry  # noqa: F401
from backend.journal.models.medication import Medication  # noqa: F401
from backend.journal.models.medication import IntakeLog  # noqa: F401
from backend.journal.models.medication import MedicationSettings  # noqa: F401
from backend.journal.models.mood_cache import MoodCache  # noqa: F401
from backend.journal.models.storyline import StorylineCache  # noqa: F401

# Erstellt alle Tabellen in beiden Datenbanken beim Server-Start
Base.metadata.create_all(bind=engine)
JournalBase.metadata.create_all(bind=journal_engine)

# FastAPI App initialisieren
app = FastAPI(title="Pallas", version="0.1.0")

# CORS-Middleware: Erlaubt Frontend-Zugriff
# Dev: localhost:5173, Production: Server-IP auf Port 8001
CORS_ORIGINS = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:5173"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Auth-Middleware — prüft JWT-Cookie bei jedem API-Request
# Wird nur aktiv wenn /etc/olymp/auth.json existiert (Production)
@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    """Auth für alle API-Routen erzwingen (Production-Modus)"""
    auth_response = await require_auth(request)
    if auth_response is not None:
        return auth_response
    return await call_next(request)


# Prüfe ob Frontend vorhanden ist (Production-Modus)
FRONTEND_DIR = Path(__file__).parent.parent / "frontend"
_HAS_FRONTEND = (
    (FRONTEND_DIR / "index.html").exists()
    and (FRONTEND_DIR / "assets").exists()
)


# Root-Endpunkt — Frontend in Production, API-Info in Dev
@app.get("/")
def root():
    if _HAS_FRONTEND:
        return FileResponse(str(FRONTEND_DIR / "index.html"))
    return {"message": "Pallas API läuft!", "version": "0.1.0"}


# Health-Check Endpunkt
@app.get("/health")
def health():
    return {"status": "ok"}


# API-Routen registrieren
app.include_router(auth_router)
app.include_router(modules_router)
app.include_router(documents_router)
app.include_router(summaries_router)
app.include_router(mindmap_router)
app.include_router(folders_router)
app.include_router(calendar_router)
app.include_router(notes_router)
app.include_router(journal_auth_router)
app.include_router(journal_entries_router)
app.include_router(journal_analytics_router)
app.include_router(journal_medications_router)
app.include_router(journal_calendar_router)
app.include_router(journal_insights_router)
app.include_router(ollama_status_router)
app.include_router(notes_ai_router)
app.include_router(metis_router)
app.include_router(metis_ai_router)

# Static Files — gebautes Frontend servieren (nur in Production)
if _HAS_FRONTEND:
    # Statische Assets (JS, CSS, Bilder) direkt servieren
    app.mount(
        "/assets",
        StaticFiles(directory=str(FRONTEND_DIR / "assets")),
        name="static-assets",
    )

    # Catch-All Route — alles was kein API-Call ist geht ans Frontend
    # Wichtig für React Router (Client-Side Routing)
    @app.get("/{path:path}")
    async def serve_frontend(path: str):
        """Frontend servieren — SPA Catch-All für React Router"""
        # Prüfen ob die Datei direkt existiert (z.B. favicon.ico)
        file_path = FRONTEND_DIR / path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        # Sonst immer index.html zurückgeben (React Router übernimmt)
        return FileResponse(str(FRONTEND_DIR / "index.html"))
