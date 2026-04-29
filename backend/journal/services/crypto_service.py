# Journal Crypto Service
# Verantwortlich für AES-256-GCM Verschlüsselung/Entschlüsselung
# und die Ableitung des AES-Keys aus dem Passwort via Argon2id.
#
# Jedes verschlüsselte Feld enthält: IV + Ciphertext + AuthTag (als bytes)
# So kann jedes Feld unabhängig entschlüsselt werden.

import os
from pathlib import Path
from argon2.low_level import hash_secret_raw, Type
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from backend.journal.infra.journal_config import (
    ARGON2_MEMORY_COST,
    ARGON2_TIME_COST,
    ARGON2_PARALLELISM,
    AES_KEY_LENGTH,
    AES_IV_LENGTH,
    ARGON2_SALT_LENGTH,
)

# Pfad zur Salt-Datei (wird beim Setup erstellt)
_SALT_FILE = Path(__file__).parent.parent / "journal_key.salt"


# ============================================
# Key-Ableitung
# ============================================

def derive_key(password: str) -> bytes:
    """
    Leitet einen AES-256 Schlüssel aus dem Passwort ab.
    Verwendet Argon2id als Key Derivation Function (KDF).

    Der Salt wird beim ersten Aufruf generiert und gespeichert.
    So ergibt das gleiche Passwort immer den gleichen Key.
    """
    if _SALT_FILE.exists():
        salt = _SALT_FILE.read_bytes()
    else:
        salt = os.urandom(ARGON2_SALT_LENGTH)
        _SALT_FILE.write_bytes(salt)

    return hash_secret_raw(
        secret=password.encode("utf-8"),
        salt=salt,
        time_cost=ARGON2_TIME_COST,
        memory_cost=ARGON2_MEMORY_COST,
        parallelism=ARGON2_PARALLELISM,
        hash_len=AES_KEY_LENGTH,
        type=Type.ID,
    )


# ============================================
# Verschlüsselung & Entschlüsselung
# ============================================

def encrypt_text(plaintext: str, key: bytes) -> bytes:
    """
    Verschlüsselt einen Klartext mit AES-256-GCM.
    Jeder Aufruf generiert einen eigenen IV.

    Args:
        plaintext: Der zu verschlüsselnde Text
        key: 32-byte AES-256 Schlüssel

    Returns:
        bytes: IV (12 bytes) + Ciphertext + AuthTag (16 bytes)
    """
    iv = os.urandom(AES_IV_LENGTH)
    aesgcm = AESGCM(key)
    ciphertext_with_tag = aesgcm.encrypt(iv, plaintext.encode("utf-8"), None)
    return iv + ciphertext_with_tag


def decrypt_text(encrypted_data: bytes, key: bytes) -> str:
    """
    Entschlüsselt einen AES-256-GCM verschlüsselten Text.

    Args:
        encrypted_data: bytes mit IV (12 bytes) + Ciphertext + AuthTag
        key: 32-byte AES-256 Schlüssel

    Returns:
        Entschlüsselter Klartext

    Raises:
        ValueError: Wenn Entschlüsselung fehlschlägt
    """
    try:
        iv = encrypted_data[:AES_IV_LENGTH]
        ciphertext_with_tag = encrypted_data[AES_IV_LENGTH:]
        aesgcm = AESGCM(key)
        plaintext = aesgcm.decrypt(iv, ciphertext_with_tag, None)
        return plaintext.decode("utf-8")
    except Exception as e:
        raise ValueError(
            "Entschlüsselung fehlgeschlagen — falsches Passwort oder beschädigte Daten"
        ) from e

def encrypt_bytes(plaintext: bytes, key: bytes) -> bytes:
    """
    Verschluesselt rohe Bytes mit AES-256-GCM.
    Pendant zu encrypt_text fuer binaere Daten (z.B. numpy-Embeddings).
    Jeder Aufruf generiert einen eigenen IV.

    Args:
        plaintext: Die zu verschluesselnden Bytes
        key: 32-byte AES-256 Schluessel

    Returns:
        bytes: IV (12 bytes) + Ciphertext + AuthTag (16 bytes)
    """
    iv = os.urandom(AES_IV_LENGTH)
    aesgcm = AESGCM(key)
    ciphertext_with_tag = aesgcm.encrypt(iv, plaintext, None)
    return iv + ciphertext_with_tag


def decrypt_bytes(encrypted_data: bytes, key: bytes) -> bytes:
    """
    Entschluesselt AES-256-GCM Bytes.
    Pendant zu decrypt_text fuer binaere Daten (z.B. numpy-Embeddings).

    Args:
        encrypted_data: bytes mit IV (12 bytes) + Ciphertext + AuthTag
        key: 32-byte AES-256 Schluessel

    Returns:
        Entschluesselte Bytes (NICHT decoded — caller muss interpretieren)

    Raises:
        ValueError: Wenn Entschluesselung fehlschlaegt
    """
    try:
        iv = encrypted_data[:AES_IV_LENGTH]
        ciphertext_with_tag = encrypted_data[AES_IV_LENGTH:]
        aesgcm = AESGCM(key)
        return aesgcm.decrypt(iv, ciphertext_with_tag, None)
    except Exception as e:
        raise ValueError(
            "Entschluesselung fehlgeschlagen — falscher Key oder beschaedigte Daten"
        ) from e
