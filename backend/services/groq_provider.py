# Groq Provider — Cloud-basierte LLM-Inferenz via Groq API
# OpenAI-kompatible API, extrem schnelle Inferenz (LPU Hardware)
# Wird für Non-Journal Features genutzt (Summarize, Concepts, Auto-Link)
# Journal-Daten gehen NIEMALS über diesen Provider
# Bei 429 Rate Limit → GroqRateLimitError für Auto-Fallback

import json
import re
import httpx
import logging
from typing import Callable, Awaitable
from backend.infra.config import GROQ_API_KEY, GROQ_MODEL, GROQ_BASE_URL

logger = logging.getLogger(__name__)


class GroqRateLimitError(Exception):
    """Wird bei 429 Rate Limit geworfen — Caller kann auf Ollama fallbacken."""
    pass


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
                logger.warning("Groq 429 Rate Limit — Fallback wird ausgeloest")
                raise GroqRateLimitError(
                    "Groq Rate Limit erreicht (429)"
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

    async def chat_with_tools(
        self,
        messages: list[dict],
        tools: list[dict],
        tool_executor: Callable[[str, dict], Awaitable[str]],
        max_tokens: int = 4000,
        max_iterations: int = 3,
    ) -> str:
        """Tool-Use-Loop gegen Groq Tool-Use API (OpenAI-Format).

        messages: [{role, content}] — Caller baut System+User selbst auf
        tools: JSON-Schemas im OpenAI-Tools-Format
        tool_executor: async (name, args) -> str. Caller injiziert Closures
                       fuer DB-Sessions oder anderen Kontext.
        max_iterations: Schutz vor Tool-Endlosschleifen (LLM darf max
                        N-mal Tools aufrufen, dann muss er antworten).

        Wirft GroqRateLimitError bei 429, ConnectionError bei anderen
        HTTP-Fehlern. Caller (ai_service) macht Fallback-Routing.
        """
        if not self.api_key:
            raise ConnectionError("GROQ_API_KEY nicht gesetzt.")

        # Working copy — wir extenden die Liste mit assistant- und tool-Turns
        msgs = list(messages)

        async with httpx.AsyncClient(timeout=60.0) as client:
            for iteration in range(max_iterations):
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "messages": msgs,
                        "tools": tools,
                        "tool_choice": "auto",
                        "max_tokens": max_tokens,
                        "temperature": 0.3,
                    },
                )
                if response.status_code == 429:
                    raise GroqRateLimitError("Groq Rate Limit erreicht (429)")
                if response.status_code != 200:
                    logger.error(
                        f"Groq Tool-Use Fehler {response.status_code}: {response.text}"
                    )
                    raise ConnectionError(
                        f"Groq API Fehler (Status {response.status_code})"
                    )

                data = response.json()
                choice = data["choices"][0]
                msg = choice["message"]
                finish = choice.get("finish_reason", "stop")

                # Kein Tool-Call -> fertige Antwort
                if finish != "tool_calls":
                    return msg.get("content") or ""

                # Tool-Calls ausfuehren und als tool-Turns anhaengen
                tool_calls = msg.get("tool_calls") or []
                if not tool_calls:
                    # Defensiv: finish_reason sagt tool_calls aber keine da
                    return msg.get("content") or ""

                # Assistant-Turn mit Tool-Calls in History aufnehmen
                msgs.append({
                    "role": "assistant",
                    "content": msg.get("content") or "",
                    "tool_calls": tool_calls,
                })

                # Pro Tool-Call: ausfuehren, Result als role=tool anhaengen
                for tc in tool_calls:
                    fn = tc.get("function", {})
                    fn_name = fn.get("name", "")
                    fn_args_raw = fn.get("arguments", "{}")
                    try:
                        fn_args = json.loads(fn_args_raw)
                    except json.JSONDecodeError:
                        fn_args = {}
                    logger.info(
                        f"Groq Tool-Call iter={iteration}: "
                        f"{fn_name}({fn_args})"
                    )
                    result = await tool_executor(fn_name, fn_args)
                    msgs.append({
                        "role": "tool",
                        "tool_call_id": tc.get("id", ""),
                        "name": fn_name,
                        "content": result,
                    })

            # Max iterations erreicht — letzter Versuch ohne tools
            logger.warning(
                f"Groq Tool-Use: max_iterations={max_iterations} erreicht, "
                "fordere finale Antwort ohne Tool-Aufrufe an"
            )
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.model,
                    "messages": msgs,
                    "max_tokens": max_tokens,
                    "temperature": 0.3,
                },
            )
            if response.status_code == 200:
                return response.json()["choices"][0]["message"].get("content") or ""
            raise ConnectionError(
                f"Groq finale Antwort fehlgeschlagen ({response.status_code})"
            )

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
        match = re.search(r'```(?:json)?\s*([\s\S]*?)```', text)
        if match:
            try:
                return json.loads(match.group(1).strip())
            except json.JSONDecodeError:
                pass
        for opener, closer in [('{', '}'), ('[', ']')]:
            start = text.find(opener)
            end = text.rfind(closer)
            if start != -1 and end > start:
                try:
                    return json.loads(text[start:end + 1])
                except json.JSONDecodeError:
                    pass
        match = re.search(r'(\{[\s\S]*?\}|\[[\s\S]*?\])', text)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass
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
