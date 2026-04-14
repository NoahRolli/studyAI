# Ollama Provider: Anbindung an die lokale Ollama API
# Wird über ai_service.py aufgerufen — nie direkt
# Nutzt ollama_connector für dynamische URL (MacBook → Server Fallback)
# Bei Fehler: Cache invalidieren und mit Fallback-URL retry
# Läuft komplett lokal — keine Daten verlassen das Netzwerk

import json
import re
import httpx
from backend.infra.config import OLLAMA_MODEL_LOCAL
from backend.infra.ollama_connector import get_ollama_url, invalidate_cache


class OllamaProvider:
    """AI-Provider für die lokale Ollama-Instanz."""

    def __init__(self, model: str = ""):
        self.model = model or OLLAMA_MODEL_LOCAL

    async def _get_url(self) -> str:
        """Holt die aktuell erreichbare Ollama-URL (gecacht)."""
        return await get_ollama_url()

    async def _chat(self, prompt: str, max_tokens: int = 2000) -> str:
        """
        Sendet eine Anfrage an die Ollama API.
        Bei Fehler: Cache invalidieren und einmal retry.
        """
        for attempt in range(2):
            base_url = await self._get_url()
            try:
                async with httpx.AsyncClient(timeout=120.0) as client:
                    response = await client.post(
                        f"{base_url}/api/chat",
                        json={
                            "model": self.model,
                            "messages": [{"role": "user", "content": prompt}],
                            "stream": False,
                            "think": False,
                            "options": {"num_predict": max_tokens},
                        }
                    )
                    if response.status_code != 200:
                        raise ConnectionError(
                            f"Ollama Fehler {response.status_code} auf {base_url}"
                        )
                    return response.json()["message"]["content"]
            except Exception as e:
                if attempt == 0:
                    invalidate_cache()
                    continue
                raise ConnectionError(
                    f"Ollama nicht erreichbar nach Retry: {e}"
                )
        raise ConnectionError("Ollama: Alle Versuche fehlgeschlagen")

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
        """JSON aus Ollama-Antworten extrahieren."""
        match = re.search(r"```(?:json)?\s*(\[.*?\]|\{.*?\})\s*```", text, re.DOTALL)
        if match:
            return json.loads(match.group(1))
        match = re.search(r"(\[.*\]|\{.*\})", text, re.DOTALL)
        if match:
            return json.loads(match.group(1))
        return json.loads(text.strip())

    async def chat(self, prompt: str, system: str = "",
                   max_tokens: int = 4000) -> str:
        """Chat-Methode für ai_service Fallback-Kette."""
        if system:
            full_prompt = f"{system}\n\n{prompt}"
        else:
            full_prompt = prompt
        return await self._chat(full_prompt, max_tokens)

    async def summarize(self, text: str) -> dict:
        """Generiert eine Zusammenfassung mit Schlüsselbegriffen."""
        prompt = f"""Analysiere den folgenden Text und erstelle:
1. Eine strukturierte Zusammenfassung (maximal 500 Wörter)
2. Eine Liste der 5-10 wichtigsten Fachbegriffe

REGELN für key_terms:
- NUR fachspezifische Substantive oder Fachbegriffe
- KEINE generischen Wörter wie: Test, Daten, System, Methode, Prozess, Funktion, Ergebnis, Information, Struktur, Konzept, Modell, Ansatz, Lösung, Problem, Beispiel, Tabelle, Liste, Wert, Format, Inhalt, Schichten, Filtern, Padding
- KEINE Verben oder Adjektive
- Deutsche und englische Fachbegriffe sind OK
- Bevorzuge etablierte Terminologie

Antworte NUR im JSON-Format, kein anderer Text:
{{"summary": "...", "key_terms": ["Begriff1", "Begriff2", ...]}}

Text:
{text[:4000]}"""
        response_text = await self._chat(prompt)
        try:
            return self._parse_json(response_text)
        except json.JSONDecodeError:
            return {"summary": response_text, "key_terms": []}

    async def explain_term(self, term: str, context: str) -> str:
        """Erklärt einen Fachbegriff im Kontext des Dokuments."""
        prompt = f"""Erkläre den Fachbegriff "{term}" einfach und verständlich.
Beziehe dich dabei auf folgenden Kontext:

{context[:2000]}

Antworte in 2-3 Sätzen, verständlich für Studierende."""
        return await self._chat(prompt, max_tokens=500)

    async def generate_mindmap(self, text: str) -> list[dict]:
        """Generiert eine Mindmap-Struktur aus einem Text."""
        prompt = f"""Erstelle eine hierarchische Mindmap-Struktur aus diesem Text.
Antworte NUR im JSON-Format als Liste von Knoten:
[{{"label": "Hauptthema", "detail": "Kurze Erklärung", "children": [
    {{"label": "Unterthema", "detail": "...", "children": []}}
]}}]

Maximal 3 Ebenen tief, 3-5 Knoten pro Ebene.

Text:
{text[:3000]}"""
        response_text = await self._chat(prompt)
        try:
            return self._parse_json(response_text)
        except json.JSONDecodeError:
            return [{"label": "Fehler beim Parsen", "detail": response_text, "children": []}]

    async def deep_dive(self, node_label: str, node_detail: str,
                        context: str) -> list[dict]:
        """Generiert Unterknoten für einen Mindmap-Knoten."""
        prompt = f"""Für eine Mindmap: Erstelle 3-5 detailliertere Unterknoten
für das Thema "{node_label}" ({node_detail}).

Kontext aus dem Originaldokument:
{context[:2000]}

Antworte NUR im JSON-Format:
[{{"label": "...", "detail": "...", "children": []}}]"""
        response_text = await self._chat(prompt)
        try:
            return self._parse_json(response_text)
        except json.JSONDecodeError:
            return [{"label": "Fehler", "detail": response_text, "children": []}]
