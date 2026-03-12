# Journal Password Service
# Verantwortlich für Passwort-Hashing und Verifizierung mit Argon2id.
# Das Passwort wird NIE gespeichert — nur der Hash.
# Kein Passwort-Reset möglich: ohne Passwort sind die Daten verloren.

import os
from pathlib import Path
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from backend.journal.infra.journal_config import (
    ARGON2_MEMORY_COST,
    ARGON2_TIME_COST,
    ARGON2_PARALLELISM,
    ARGON2_HASH_LENGTH,
    ARGON2_SALT_LENGTH,
)

# Argon2id Hasher mit den Parametern aus journal_config.py
# Argon2id kombiniert die Stärken von Argon2i (Side-Channel-Schutz)
# und Argon2d (GPU-Cracking-Schutz)
_hasher = PasswordHasher(
    memory_cost=ARGON2_MEMORY_COST,
    time_cost=ARGON2_TIME_COST,
    parallelism=ARGON2_PARALLELISM,
    hash_len=ARGON2_HASH_LENGTH,
    salt_len=ARGON2_SALT_LENGTH,
)

# Pfad zur Hash-Datei (im journal-Verzeichnis, neben journal.db)
# Der Hash wird als Datei gespeichert, nicht in der DB
# So kann das Journal auch ohne initialisierte DB geprüft werden
_HASH_FILE = Path(__file__).parent.parent / "journal_password.hash"


def hash_password(password: str) -> str:
    """
    Erstellt einen Argon2id-Hash und speichert ihn in der Hash-Datei.
    Wird beim erstmaligen Journal-Setup aufgerufen.
    Der Hash enthält Salt, Parameter und den eigentlichen Hash.
    """
    hashed = _hasher.hash(password)
    # Hash in Datei schreiben (überschreibt falls vorhanden)
    _HASH_FILE.write_text(hashed)
    return hashed


def verify_password(password: str, stored_hash: str) -> bool:
    """
    Prüft ob ein Passwort zum gespeicherten Hash passt.
    Wird beim Journal-Unlock aufgerufen.
    Returns:
        True wenn korrekt, False wenn falsch
    """
    try:
        return _hasher.verify(stored_hash, password)
    except VerifyMismatchError:
        return False


def is_password_set() -> bool:
    """
    Prüft ob bereits ein Passwort gesetzt wurde.
    Schaut ob die Hash-Datei existiert und nicht leer ist.
    """
    return _HASH_FILE.exists() and _HASH_FILE.stat().st_size > 0


def get_stored_hash() -> str:
    """
    Liest den gespeicherten Argon2id-Hash aus der Datei.
    Wird beim Unlock aufgerufen um das Passwort zu verifizieren.
    """
    if not _HASH_FILE.exists():
        raise FileNotFoundError("Kein Passwort-Hash gefunden. Zuerst /setup aufrufen.")
    return _HASH_FILE.read_text().strip()