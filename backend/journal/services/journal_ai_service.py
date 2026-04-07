# Journal AI Service — Ollama-Anbindung exklusiv für das Journal
# WICHTIG: Kein Claude, kein Fallback, kein gemeinsamer Code-Pfad
# Alle Journal-Daten bleiben lokal auf dem Rechner
# Nutzt ollama_connector für dynamische URL (MacBook → Server Fallback)
#
# Nutzt llama3.2 für Textanalyse (Mood, Storylines, Titel-Generierung)

import json
import re
import httpx
from backend.journal.infra.journal_config import OLLAMA_CHAT_MODEL
from backend.infra.ollama_connector import get_ollama_url


class JournalAIService:
    """Lokaler AI-Service nur für Journal-Features. Ollama-only."""

    def __init__(self):
        self.chat_model = OLLAMA_CHAT_MODEL

    async def _get_url(self) -> str:
        """Holt die aktuell erreichbare Ollama-URL (gecacht)."""
        return await get_ollama_url()

    async def _chat(self, prompt: str, max_tokens: int = 1000) -> str:
        """Sendet einen Prompt an Ollama und gibt die Antwort zurück."""
        base_url = await self._get_url()
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{base_url}/api/chat",
                json={
                    "model": self.chat_model,
                    "messages": [{"role": "user", "content": prompt}],
                    "stream": False,
                    "think": False,
                    "options": {"num_predict": max_tokens},
                },
            )

            if response.status_code != 200:
                raise ConnectionError(
                    f"Ollama nicht erreichbar (Status {response.status_code}). "
                    "Läuft Ollama? Starte mit: ollama serve"
                )

            return response.json()["message"]["content"]

    async def is_available(self) -> bool:
        """Prüft ob Ollama läuft und erreichbar ist."""
        try:
            base_url = await self._get_url()
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{base_url}/api/tags")
                return response.status_code == 200
        except Exception:
            return False

    def _parse_json(self, text: str):
        """
        Extrahiert JSON aus Ollama-Antworten.
        Drei Strategien: Codeblock → erstes JSON im Text → Rohtext.
        """
        # Strategie 1: JSON aus Markdown-Codeblock
        match = re.search(
            r"```(?:json)?\s*(\[.*?\]|\{.*?\})\s*```", text, re.DOTALL
        )
        if match:
            return json.loads(match.group(1))

        # Strategie 2: Erstes JSON-Array oder -Objekt im Text
        match = re.search(r"(\[.*\]|\{.*\})", text, re.DOTALL)
        if match:
            return json.loads(match.group(1))

        # Strategie 3: Rohtext direkt
        return json.loads(text.strip())

    async def analyze_mood(
        self, title: str, content: str, language: str = "de"
    ) -> dict:
        """
        Analysiert die Stimmung eines Journal-Eintrags.
        Gibt zurück: {"score": float, "label": str, "keywords": list}
        """
        if language == "de":
            prompt = f"""Analysiere die Stimmung dieses Tagebucheintrags präzise.

Titel: {title}
Inhalt: {content[:2000]}

Antworte NUR im JSON-Format:
{{"score": 0.3, "label": "zuversichtlich", "keywords": ["Wort1", "Wort2"]}}

Regeln:
- score: -1.0 (verzweifelt) bis 1.0 (euphorisch), 0.0 = neutral
- label: EIN präzises Wort. NICHT "neutral" oder "gemischt" verwenden.
  Gute Beispiele: zuversichtlich, melancholisch, dankbar, erschöpft,
  aufgeregt, besorgt, gelassen, frustriert, inspiriert, einsam,
  nostalgisch, entschlossen, überfordert, erleichtert, sehnsüchtig
- keywords: 3-5 stimmungsprägende Wörter direkt aus dem Text"""
        else:
            prompt = f"""Analyze the mood of this journal entry precisely.

Title: {title}
Content: {content[:2000]}

Respond ONLY in JSON format:
{{"score": 0.3, "label": "hopeful", "keywords": ["word1", "word2"]}}

Rules:
- score: -1.0 (desperate) to 1.0 (euphoric), 0.0 = neutral
- label: ONE precise word. Do NOT use "neutral" or "mixed".
  Good examples: hopeful, melancholic, grateful, exhausted,
  excited, anxious, serene, frustrated, inspired, lonely,
  nostalgic, determined, overwhelmed, relieved, longing
- keywords: 3-5 mood-defining words directly from the text"""

        response_text = await self._chat(prompt, max_tokens=500)
        try:
            return self._parse_json(response_text)
        except json.JSONDecodeError:
            fallback = "unbekannt" if language == "de" else "unknown"
            return {"score": 0.0, "label": fallback, "keywords": []}

    async def generate_title(
        self, content: str, language: str = "de"
    ) -> str:
        """
        Generiert einen kurzen Titel aus dem Inhalt eines Eintrags.
        Wird aufgerufen wenn der User das Titel-Feld leer lässt.
        """
        if not await self.is_available():
            return "Ohne Titel" if language == "de" else "Untitled"

        if language == "de":
            prompt = f"""Generiere einen kurzen Titel für diesen Tagebucheintrag.
Der Titel soll den Kern des Eintrags in maximal 6 Wörtern zusammenfassen.
Antworte NUR mit dem Titel, kein anderer Text, keine Anführungszeichen.

Eintrag:
{content[:1000]}"""
        else:
            prompt = f"""Generate a short title for this journal entry.
The title should capture the core in 6 words max.
Respond ONLY with the title, no other text, no quotes.

Entry:
{content[:1000]}"""

        fallback = "Ohne Titel" if language == "de" else "Untitled"
        try:
            result = await self._chat(prompt, max_tokens=30)
            title = result.strip().strip('"').strip("'").split("\n")[0]
            if not title or len(title) > 100:
                return fallback
            return title
        except Exception:
            return fallback


# Singleton-Instanz — wird von anderen Services importiert
journal_ai = JournalAIService()
