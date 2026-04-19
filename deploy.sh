#!/bin/bash
# Pallas Deployment Script — MacBook → Olymp Server
# Baut das Frontend, kopiert alles auf den Server, startet den Container
# Nutzt rsync statt scp (stabiler über VPN, resume bei Abbruch)
# Ausführen auf dem MacBook: bash deploy.sh

set -e

echo "=== Pallas Deployment auf Olymp ==="
echo ""

# 1. Frontend bauen
echo "[1/4] Frontend bauen..."
cd frontend
npm run build
cd ..

# 2. Dateien auf den Server kopieren (rsync = komprimiert, resume-fähig)
echo "[2/4] Dateien auf Olymp kopieren..."

ssh olymp "mkdir -p ~/pallas/frontend-dist"

# Frontend-Build
rsync -az --delete -e "ssh -p 2222" frontend/dist/ prometheus@192.168.0.10:~/pallas/frontend-dist/

# Backend (nur .py Dateien, keine __pycache__)
rsync -az --delete --exclude='__pycache__' --exclude='*.pyc' \
  -e "ssh -p 2222" backend/ prometheus@192.168.0.10:~/pallas/backend/

# CLI-Scripts (z.B. import_claude_export.py)
rsync -az --delete --exclude='__pycache__' --exclude='*.pyc' \
  -e "ssh -p 2222" scripts/ prometheus@192.168.0.10:~/pallas/scripts/

# Docker-Dateien
rsync -az -e "ssh -p 2222" Dockerfile docker-compose.yml \
  prometheus@192.168.0.10:~/pallas/

# 3. Container auf dem Server bauen und starten
echo "[3/4] Docker Container bauen und starten..."
ssh olymp "cd ~/pallas && docker compose up -d --build"

# 4. Status prüfen
echo "[4/4] Status prüfen..."
ssh olymp "docker ps --filter name=pallas"

echo ""
echo "=== Deployment abgeschlossen ==="
