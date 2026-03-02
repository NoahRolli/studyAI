# Pydantic Schemas für die Journal API
# Definieren was rein und raus geht — zentral für alle Endpunkte

from pydantic import BaseModel
from typing import Optional


# Passwort-Eingabe (für Setup und Unlock)
class PasswordInput(BaseModel):
    password: str


# Neuen Eintrag erstellen
class EntryCreate(BaseModel):
    title: str
    content: str
    date: str  # ISO-Format, z.B. "2026-03-01"


# Eintrag aktualisieren (alle Felder optional)
class EntryUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    date: Optional[str] = None