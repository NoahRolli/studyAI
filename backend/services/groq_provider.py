# Groq Provider — Cloud-basierte LLM-Inferenz via Groq API
# OpenAI-kompatible API, extrem schnelle Inferenz (LPU Hardware)
# Wird für Non-Journal Features genutzt (Summarize, Concepts, Auto-Link)
# Journal-Daten gehen NIEMALS über diesen Provider

import json
import re
import httpx
import logging
from backend.infra.config import GROQ_API_KEY, GROQ_MODEL, GROQ_BASE_URL

logger = logging.getLogger(__name__)


class GroqProvider:
    """AI-Provider für Groq Cloud API (OpenAI-kompatibel)."""

    def __init__(self):
        self.model = GROQ_MODEL
        self.base_url = GROQ_BASE_URL
        self.api_key = GROQ_API_KEY

    async def chat(self, prompt: str, system: str = "", max_tokens: int = 2000) -> str:
        """Sendet Chat-Anfrage an Groq. Gibt Antwort-Text zurück."""
        if not self.api_key:
            raise ConnectionError(
                "GROQ_API_KEY nicht gesetzt. "
                "Registriere auf console.groq.com und setze Env-Variable."
            )
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.model,
                    "messages": messages,
                    "max_tokens": max_tokens,
                    "temperature": 0.3,
                },
            )
            if response.status_code == 429:
                raise ConnectionError(
                    "Groq Rate Limit erreicht. Warte oder wechsle auf Ollama."
                )
            if response.status_code != 200:
                logger.error(f"Groq Fehler {response.status_code}: {response.text}")
                raise ConnectionError(f"Groq API Fehler (Status {response.status_code})")

            data = response.json()
            return data["choices"][0]["message"]["content"]

    async def is_available(self) -> bool:
        """Prüft ob Groq API erreichbar und Key gültig ist."""
        if not self.api_key:
            return False
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(
                    f"{self.base_url}/models",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                )
                return response.status_code == 200
        except Exception:
            return False

    def parse_json(self, text: str):
        """
        Extrahiert JSON aus Groq-Antworten.
        Drei Strategien: Codeblock → erstes JSON → Rohtext.
        """
        # Strategie 1: JSON aus Markdown-Codeblock
        match = re.search(r'```(?:json)?\s*([\s\S]*?)```', text)
        if match:
            try:
                return json.loads(match.group(1).strip())
            except json.JSONDecodeError:
                pass
        # Strategie 2: Erstes JSON-Array oder -Objekt
        match = re.search(r'(\[[\s\S]*\]|\{[\s\S]*\})', text)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass
        # Strategie 3: Rohtext als JSON
        try:
            return json.loads(text.strip())
        except json.JSONDecodeError:
            logger.warning(f"Groq JSON-Parsing fehlgeschlagen: {text[:200]}")
            return None
