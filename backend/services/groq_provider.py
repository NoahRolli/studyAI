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

    async def chat(self, prompt: str, system: str = "",
                   max_tokens: int = 4000) -> str:
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
                logger.error(
                    f"Groq Fehler {response.status_code}: {response.text}"
                )
                raise ConnectionError(
                    f"Groq API Fehler (Status {response.status_code})"
                )

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
        Vier Strategien — robuster bei langen Summaries:
        1. JSON aus Markdown-Codeblock
        2. Greedy: erstes Opener bis letztes Closer
        3. Nicht-greedy Regex als Fallback
        4. Rohtext direkt
        """
        # Strategie 1: JSON aus Markdown-Codeblock
        match = re.search(r'```(?:json)?\s*([\s\S]*?)```', text)
        if match:
            try:
                return json.loads(match.group(1).strip())
            except json.JSONDecodeError:
                pass
        # Strategie 2: Greedy — erstes { bis letztes }
        for opener, closer in [('{', '}'), ('[', ']')]:
            start = text.find(opener)
            end = text.rfind(closer)
            if start != -1 and end > start:
                try:
                    return json.loads(text[start:end + 1])
                except json.JSONDecodeError:
                    pass
        # Strategie 3: Nicht-greedy Regex
        match = re.search(r'(\{[\s\S]*?\}|\[[\s\S]*?\])', text)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass
        # Strategie 4: Rohtext direkt
        try:
            return json.loads(text.strip())
        except json.JSONDecodeError:
            logger.warning(
                f"Groq JSON-Parsing fehlgeschlagen: {text[:200]}"
            )
            return None

    async def summarize(self, text: str) -> dict:
        """Generiert Zusammenfassung mit Schlüsselbegriffen."""
        prompt = f"""Analysiere den folgenden Text und erstelle:
1. Eine ausführliche, strukturierte Zusammenfassung (800-1500 Wörter)
2. Eine Liste der 5-10 wichtigsten Fachbegriffe

REGELN fuer key_terms:
- NUR fachspezifische Substantive oder Fachbegriffe
- KEINE generischen Woerter wie: Test, Daten, System, Methode, Prozess, Funktion, Ergebnis, Information, Struktur, Konzept, Modell, Ansatz, Loesung, Problem, Beispiel, Tabelle, Liste, Wert, Format, Inhalt
- KEINE Verben oder Adjektive
- Deutsche und englische Fachbegriffe sind OK
- Bevorzuge etablierte Terminologie

WICHTIG: Antworte NUR mit einem JSON-Objekt. Kein Text davor oder danach.
Format: {{"summary": "Deine Zusammenfassung hier...", "key_terms": ["Begriff1", "Begriff2"]}}

Text:
{text[:8000]}"""
        response_text = await self.chat(prompt)
        try:
            result = self.parse_json(response_text)
            if isinstance(result, dict) and "summary" in result:
                return result
            return {"summary": response_text, "key_terms": []}
        except Exception:
            return {"summary": response_text, "key_terms": []}

    async def explain_term(self, term: str, context: str) -> str:
        """Erklaert einen Fachbegriff im Kontext."""
        prompt = f"""Erklaere den Fachbegriff "{term}" einfach und verstaendlich.
Beziehe dich dabei auf folgenden Kontext:

{context[:2000]}

Antworte in 2-3 Saetzen, verstaendlich fuer Studierende."""
        return await self.chat(prompt, max_tokens=500)

    async def generate_mindmap(self, text: str) -> list[dict]:
        """Generiert eine Mindmap-Struktur aus Text."""
        prompt = f"""Erstelle eine hierarchische Mindmap-Struktur aus diesem Text.
Antworte NUR im JSON-Format als Liste von Knoten:
[{{"label": "Hauptthema", "detail": "Kurze Erklaerung", "children": [
    {{"label": "Unterthema", "detail": "...", "children": []}}
]}}]

Maximal 3 Ebenen tief, 3-5 Knoten pro Ebene.

Text:
{text[:3000]}"""
        response_text = await self.chat(prompt)
        try:
            result = self.parse_json(response_text)
            if isinstance(result, list):
                return result
            return [{"label": "Fehler", "detail": response_text,
                     "children": []}]
        except Exception:
            return [{"label": "Fehler", "detail": response_text,
                     "children": []}]

    async def deep_dive(self, node_label: str, node_detail: str,
                        context: str) -> list[dict]:
        """Generiert Unterknoten fuer einen Mindmap-Knoten."""
        prompt = f"""Fuer eine Mindmap: Erstelle 3-5 detailliertere Unterknoten
fuer das Thema "{node_label}" ({node_detail}).

Kontext aus dem Originaldokument:
{context[:2000]}

Antworte NUR im JSON-Format:
[{{"label": "...", "detail": "...", "children": []}}]"""
        response_text = await self.chat(prompt)
        try:
            result = self.parse_json(response_text)
            if isinstance(result, list):
                return result
            return [{"label": "Fehler", "detail": response_text,
                     "children": []}]
        except Exception:
            return [{"label": "Fehler", "detail": response_text,
                     "children": []}]
