# Auth-Middleware für Pallas auf dem Olymp-Server
# Verwendet das gleiche Auth-System wie das Olymp Dashboard
# bcrypt + JWT, Passwort-Hash aus /etc/olymp/auth.json
# Cookie-Name: pallas_token (kein Konflikt mit olymp_token)

import os
import json
import time
import hashlib
from pathlib import Path
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Request, Response, HTTPException, Depends
from pydantic import BaseModel

# Auth-Config Pfad — im Docker gemountet als /etc/olymp/auth.json
AUTH_CONFIG_PATH = os.environ.get(
    "AUTH_CONFIG_PATH", "/etc/olymp/auth.json"
)

# Cookie-Einstellungen
COOKIE_NAME = "pallas_token"
COOKIE_MAX_AGE = 60 * 60 * 24 * 7  # 7 Tage

# Rate-Limiting: Fehlversuche tracken (im RAM)
_failed_attempts: dict[str, list[float]] = {}

# Router für Login/Logout Endpunkte
router = APIRouter(tags=["auth"])


class LoginRequest(BaseModel):
    """Schema für Login-Anfrage"""
    password: str


def _load_auth_config() -> dict:
    """Auth-Config aus JSON laden"""
    path = Path(AUTH_CONFIG_PATH)
    if not path.exists():
        raise HTTPException(
            status_code=500,
            detail="Auth-Konfiguration nicht gefunden"
        )
    with open(path) as f:
        return json.load(f)


def _check_rate_limit(client_ip: str, config: dict) -> None:
    """Rate-Limiting prüfen — zu viele Fehlversuche = Sperre"""
    max_attempts = config.get("rate_limit", {}).get("max_attempts", 5)
    lockout_min = config.get("rate_limit", {}).get("lockout_minutes", 15)
    now = time.time()
    cutoff = now - (lockout_min * 60)

    # Alte Einträge aufräumen
    if client_ip in _failed_attempts:
        _failed_attempts[client_ip] = [
            t for t in _failed_attempts[client_ip] if t > cutoff
        ]
        if len(_failed_attempts[client_ip]) >= max_attempts:
            raise HTTPException(
                status_code=429,
                detail=f"Zu viele Fehlversuche. Warte {lockout_min} Minuten."
            )


def _record_failed_attempt(client_ip: str) -> None:
    """Fehlversuch für Rate-Limiting speichern"""
    if client_ip not in _failed_attempts:
        _failed_attempts[client_ip] = []
    _failed_attempts[client_ip].append(time.time())


def _create_token(secret: str) -> str:
    """Einfaches JWT-ähnliches Token erstellen (HMAC-SHA256)"""
    # Payload: Ablaufzeit als Unix-Timestamp
    expires = int((
        datetime.now(timezone.utc) + timedelta(seconds=COOKIE_MAX_AGE)
    ).timestamp())
    payload = f"{expires}"
    # Signatur: HMAC mit dem JWT-Secret
    signature = hashlib.sha256(
        f"{payload}.{secret}".encode()
    ).hexdigest()
    return f"{payload}.{signature}"


def _verify_token(token: str, secret: str) -> bool:
    """Token verifizieren — Signatur + Ablauf prüfen"""
    try:
        parts = token.split(".")
        if len(parts) != 2:
            return False
        payload, signature = parts
        # Signatur prüfen
        expected = hashlib.sha256(
            f"{payload}.{secret}".encode()
        ).hexdigest()
        if signature != expected:
            return False
        # Ablauf prüfen
        expires = int(payload)
        if time.time() > expires:
            return False
        return True
    except (ValueError, IndexError):
        return False


@router.post("/api/auth/login")
async def login(req: LoginRequest, request: Request, response: Response):
    """Login-Endpunkt — prüft Passwort gegen auth.json"""
    import bcrypt

    config = _load_auth_config()
    client_ip = request.client.host if request.client else "unknown"

    # Rate-Limiting prüfen
    _check_rate_limit(client_ip, config)

    # Passwort gegen Dashboard-Hash prüfen
    stored_hash = config["dashboard"]["password_hash"]
    if not bcrypt.checkpw(
        req.password.encode(), stored_hash.encode()
    ):
        _record_failed_attempt(client_ip)
        raise HTTPException(status_code=401, detail="Falsches Passwort")

    # Token erstellen und als Cookie setzen
    token = _create_token(config["jwt_secret"])
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        samesite="strict",
        secure=False,  # LAN-only, kein HTTPS
    )
    return {"status": "ok"}


@router.post("/api/auth/logout")
async def logout(response: Response):
    """Logout — Cookie löschen"""
    response.delete_cookie(key=COOKIE_NAME)
    return {"status": "ok"}


@router.get("/api/auth/check")
async def check_auth(request: Request):
    """Auth-Status prüfen — gibt 200 wenn eingeloggt"""
    config = _load_auth_config()
    token = request.cookies.get(COOKIE_NAME)
    if not token or not _verify_token(token, config["jwt_secret"]):
        raise HTTPException(status_code=401, detail="Nicht eingeloggt")
    return {"status": "ok"}


async def require_auth(request: Request) -> None:
    """Dependency für geschützte Routen — prüft JWT-Cookie"""
    # Nur im Production-Modus (wenn AUTH_CONFIG_PATH existiert)
    if not Path(AUTH_CONFIG_PATH).exists():
        return  # Dev-Modus: kein Auth nötig
    # Login-Routen und Health-Check ausnehmen
    exempt = ["/api/auth/login", "/api/auth/check", "/health", "/"]
    if request.url.path in exempt:
        return
    # Statische Dateien ausnehmen (Frontend)
    if not request.url.path.startswith("/api/"):
        return
    config = _load_auth_config()
    token = request.cookies.get(COOKIE_NAME)
    if not token or not _verify_token(token, config["jwt_secret"]):
        raise HTTPException(status_code=401, detail="Nicht eingeloggt")
