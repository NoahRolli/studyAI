#!/bin/bash
# Pallas Deployment Script — MacBook → Olymp Server
# Baut das Frontend, kopiert alles auf den Server, startet den Container
# Ausführen auf dem MacBook: bash deploy.sh

set -e

echo "=== Pallas Deployment auf Olymp ==="
echo ""

# 1. Frontend bauen
echo "[1/4] Frontend bauen..."
cd frontend
npm run build
cd ..

# 2. Dateien auf den Server kopieren
echo "[2/4] Dateien auf Olymp kopieren..."

# Projekt-Verzeichnis auf dem Server sicherstellen
ssh olymp "mkdir -p ~/pallas/frontend-dist"

# Frontend-Build kopieren
scp -r frontend/dist/* olymp:~/pallas/frontend-dist/

# Backend kopieren
scp -r backend olymp:~/pallas/

# Docker-Dateien kopieren
scp Dockerfile olymp:~/pallas/
scp docker-compose.yml olymp:~/pallas/
scp docker-compose.override.yml olymp:~/pallas/

# 3. Container auf dem Server bauen und starten
echo "[3/4] Docker Container bauen und starten..."
ssh olymp "cd ~/pallas && docker compose up -d --build"

# 4. Status prüfen
echo "[4/4] Status prüfen..."
ssh olymp "docker ps --filter name=pallas"

echo ""
echo "=== Deployment abgeschlossen ==="
echo "Pallas erreichbar unter: http://192.168.0.10:8001"
