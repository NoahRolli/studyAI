# FastAPI Entry Point — startet den Server und konfiguriert die App

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.models.database import engine, Base

# Erstellt alle Tabellen in der SQLite-Datenbank beim Server-Start
# (nur wenn sie noch nicht existieren)
Base.metadata.create_all(bind=engine)

# FastAPI App initialisieren
app = FastAPI(title="StudyAI", version="0.1.0")

# CORS-Middleware: Erlaubt dem React-Frontend (Port 5173) auf die API zuzugreifen
# Ohne CORS würde der Browser die Requests blockieren
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Einfacher Test-Endpunkt — zeigt ob die API läuft
@app.get("/")
def root():
    return {"message": "StudyAI API läuft!", "version": "0.1.0"}


# Health-Check Endpunkt — nützlich für späteres Monitoring
@app.get("/health")
def health():
    return {"status": "ok"}