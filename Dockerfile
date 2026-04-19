# Pallas Docker-Container für den Olymp-Server
# Multi-Stage Build: Python 3.12 (nicht 3.14, wegen PyMuPDF-Kompatibilität)
# Frontend wird vorab gebaut und als Static Files reinkopiert

FROM python:3.12-slim

WORKDIR /app

# System-Dependencies für Pillow, cryptography, bcrypt
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Python Dependencies installieren
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Backend-Code kopieren
COPY backend/ ./backend/

# CLI-Scripts (z.B. import_claude_export.py)
COPY scripts/ ./scripts/

# Gebautes Frontend kopieren (wird vor docker build vom MacBook reinkopiert)
COPY frontend-dist/ ./frontend/

# Port 8001 für Pallas
EXPOSE 8001

# Uvicorn starten — Host 0.0.0.0 damit Docker den Port weiterleiten kann
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8001"]
