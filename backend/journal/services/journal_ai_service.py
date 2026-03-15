# Journal AI Service — Ollama-Anbindung exklusiv für das Journal
# WICHTIG: Kein Claude, kein Fallback, kein gemeinsamer Code-Pfad
# Alle Journal-Daten bleiben lokal auf dem Rechner
#
# Nutzt llama3.2 für Textanalyse (Mood, Storylines)
# Nutzt nomic-embed-text für Embeddings (Clustering)

import json
import re
import httpx
from backend.journal.infra.journal_config import (
    OLLAMA_BASE_URL,
    OLLAMA_CHAT_MODEL,
)


class JournalAIService:
    """Lokaler AI-Service nur für Journal-Features. Ollama-only."""

    def __init__(self):
        self.base_url = OLLAMA_BASE_URL
        self.chat_model = OLLAMA_CHAT_MODEL

    async def _chat(self, prompt: str, max_tokens: int = 1000) -> str:
        """Sendet einen Prompt an Ollama und gibt die Antwort zurück."""
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": self.chat_model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"num_predict": max_tokens},
                }
            )

            if response.status_code != 200:
                raise ConnectionError(
                    f"Ollama nicht erreichbar (Status {response.status_code}). "
                    "Läuft Ollama? Starte mit: ollama serve"
                )

            return response.json()["response"]

    async def is_available(self) -> bool:
        """Prüft ob Ollama läuft und erreichbar ist."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.base_url}/api/tags")
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

    async def analyze_mood(self, title: str, content: str) -> dict:
        """
        Analysiert die Stimmung eines Journal-Eintrags.
        Gibt zurück: {"score": float, "label": str, "keywords": list}
        - score: -1.0 (sehr negativ) bis 1.0 (sehr positiv)
        - label: z.B. "freudig", "nachdenklich", "traurig"
        - keywords: Stimmungsprägende Wörter aus dem Text
        """
        prompt = f"""Analysiere die Stimmung dieses Tagebucheintrags.

Titel: {title}
Inhalt: {content[:2000]}

Antworte NUR im JSON-Format:
{{"score": 0.5, "label": "nachdenklich", "keywords": ["Wort1", "Wort2"]}}

score: -1.0 (sehr negativ) bis 1.0 (sehr positiv)
label: ein Wort das die Stimmung beschreibt
keywords: 3-5 stimmungsprägende Wörter aus dem Text"""

        response_text = await self._chat(prompt, max_tokens=500)
        try:
            return self._parse_json(response_text)
        except json.JSONDecodeError:
            return {"score": 0.0, "label": "unbekannt", "keywords": []}


# Singleton-Instanz — wird von anderen Services importiert
journal_ai = JournalAIService()