# Claude Provider: Anbindung an die Anthropic Claude API.
#
# Aktueller Use-Case: Tool-Use-Fallback in Delphi wenn Groq nicht
# erreichbar ist (Cloudflare-Block, 429, etc.). Anthropic ist nicht
# hinter Cloudflare und bleibt erreichbar.
#
# Architektur:
# - Async-native via AsyncAnthropic (Pallas-Backend ist durchgaengig
#   async; sync-Calls in async-def wuerden den Event-Loop blockieren)
# - Lazy Client-Init: crasht nicht beim Import wenn Key fehlt
# - Tool-Schema-Converter: konvertiert Groq/OpenAI-Format
#   ({"type": "function", "function": {...}}) in Anthropic-Format
#   ({"name": ..., "description": ..., "input_schema": {...}})
#   damit delphi_tool_schemas.py unangetastet bleibt
# - Tool-Use-Loop: bis max_iterations, ruft tool_executor pro
#   tool_use-Block des Modells, fuegt tool_result-Blocks rein

import json
import logging
from anthropic import AsyncAnthropic
from backend.infra.config import CLAUDE_API_KEY, CLAUDE_TOOLS_MODEL

logger = logging.getLogger(__name__)


class ClaudeProvider:
    """AI-Provider für die Claude API von Anthropic (Tool-Use-Fallback)."""

    def __init__(self):
        # Client wird erst beim ersten Aufruf erstellt — App crasht
        # nicht beim Import wenn der Key fehlt
        self._client: AsyncAnthropic | None = None

    @property
    def api_key(self) -> str:
        """Exponiert den API-Key fuer Pre-Checks im ai_service Fallback-Pfad."""
        return CLAUDE_API_KEY or ""

    def _get_client(self) -> AsyncAnthropic:
        """Erstellt den AsyncAnthropic Client beim ersten Aufruf (Lazy Init)."""
        if self._client is None:
            if not CLAUDE_API_KEY:
                raise ValueError(
                    "CLAUDE_API_KEY ist nicht gesetzt. "
                    "Bitte in docker-compose.override.yml oder .env eintragen."
                )
            self._client = AsyncAnthropic(api_key=CLAUDE_API_KEY)
        return self._client

    # ---------- Generischer Chat fuer Drop-in-Fallback ----------
    async def chat(
        self,
        prompt: str,
        system: str = "",
        max_tokens: int = 4000,
    ) -> str:
        """Generischer Chat-Call ohne Tools. Drop-in fuer chat_with_fallback."""
        client = self._get_client()
        kwargs = {
            "model": CLAUDE_TOOLS_MODEL,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            kwargs["system"] = system
        message = await client.messages.create(**kwargs)
        # Antwort kann mehrere content-Blocks haben (selten bei reinem chat).
        # Wir konkatenieren alle text-Blocks.
        parts = [b.text for b in message.content if getattr(b, "type", None) == "text"]
        return "\n".join(parts) if parts else ""

    # ---------- Tool-Use-Schleife ----------
    async def chat_with_tools(
        self,
        messages: list[dict],
        tools: list[dict],
        tool_executor,  # async callable (name, args) -> str
        max_tokens: int = 4000,
        max_iterations: int = 3,
    ) -> str:
        """Tool-Use-Loop mit Anthropic API.

        Args:
            messages: Liste mit role+content (system kann als erstes
                drinstehen oder via system-kwarg; wir extrahieren es).
            tools: Groq/OpenAI-Format Tool-Schemas (werden konvertiert).
            tool_executor: async callable, bekommt (name, args)-Dict,
                gibt String zurueck.
            max_tokens: Pro Iteration.
            max_iterations: Stop-Bedingung gegen Endlos-Loops.

        Returns:
            Finale Antwort-Text des Modells nach Tool-Aufloesung.
        """
        client = self._get_client()

        # System aus messages extrahieren (Anthropic erwartet das als kwarg,
        # nicht als role im messages-Array)
        system_prompt = ""
        api_messages: list[dict] = []
        for m in messages:
            if m.get("role") == "system":
                system_prompt = m.get("content", "")
            else:
                api_messages.append(m)

        anthropic_tools = self._convert_tools(tools)

        for iteration in range(max_iterations):
            kwargs = {
                "model": CLAUDE_TOOLS_MODEL,
                "max_tokens": max_tokens,
                "messages": api_messages,
                "tools": anthropic_tools,
            }
            if system_prompt:
                kwargs["system"] = system_prompt

            response = await client.messages.create(**kwargs)

            stop_reason = getattr(response, "stop_reason", None)
            # Falls Modell keine Tools mehr will, fertig
            if stop_reason != "tool_use":
                # Aggregiere alle text-Blocks
                parts = [
                    b.text for b in response.content
                    if getattr(b, "type", None) == "text"
                ]
                return "\n".join(parts) if parts else ""

            # Modell will Tool(s) callen. Wir muessen:
            # 1. Assistant-Message (mit tool_use-Blocks) als-ist anhaengen
            # 2. Tools ausfuehren
            # 3. User-Message mit tool_result-Blocks anhaengen
            # 4. Naechste Iteration

            # 1) Assistant-Message anhaengen — content komplett, nicht nur text
            api_messages.append({
                "role": "assistant",
                "content": [self._block_to_dict(b) for b in response.content],
            })

            # 2+3) Tool-Calls ausfuehren, results sammeln
            tool_results = []
            for block in response.content:
                if getattr(block, "type", None) != "tool_use":
                    continue
                tool_name = block.name
                tool_input = block.input or {}
                tool_use_id = block.id
                try:
                    result = await tool_executor(tool_name, tool_input)
                except Exception as e:
                    logger.exception(f"Tool {tool_name} crashte in Claude-Pfad")
                    result = f"Tool-Fehler: {type(e).__name__}: {e}"

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_use_id,
                    "content": result,
                })

            api_messages.append({
                "role": "user",
                "content": tool_results,
            })

        # max_iterations erreicht — letzten Versuch ohne Tools, damit
        # das Modell zumindest eine Antwort gibt
        logger.warning(
            f"Claude chat_with_tools: max_iterations={max_iterations} "
            "erreicht, finale Antwort ohne weitere Tool-Calls"
        )
        kwargs = {
            "model": CLAUDE_TOOLS_MODEL,
            "max_tokens": max_tokens,
            "messages": api_messages,
        }
        if system_prompt:
            kwargs["system"] = system_prompt
        final = await client.messages.create(**kwargs)
        parts = [
            b.text for b in final.content
            if getattr(b, "type", None) == "text"
        ]
        return "\n".join(parts) if parts else ""

    # ---------- Helper ----------
    @staticmethod
    def _convert_tools(groq_tools: list[dict]) -> list[dict]:
        """Konvertiert Groq/OpenAI-Tool-Schema in Anthropic-Format.

        Groq:        {"type": "function", "function": {"name", "description", "parameters"}}
        Anthropic:   {"name", "description", "input_schema"}
        """
        out: list[dict] = []
        for t in groq_tools:
            if t.get("type") != "function":
                continue
            fn = t.get("function") or {}
            name = fn.get("name")
            if not name:
                continue
            # Defensive: leeres dict {} ist truthy-false, aber gueltiger Wert.
            # Anthropic erwartet zwingend ein input_schema mit "type": "object".
            schema = fn.get("parameters") or {}
            if "type" not in schema:
                schema = {"type": "object", "properties": {}, **schema}
            out.append({
                "name": name,
                "description": fn.get("description", ""),
                "input_schema": schema,
            })
        return out

    @staticmethod
    def _block_to_dict(block) -> dict:
        """Wandelt ein Anthropic-Response-Block in ein dict um (fuer messages-History).

        SDK-Objekte sind Pydantic-Models und nicht direkt JSON-serialisierbar
        in der messages-Array, deswegen das manuelle Mapping.
        """
        btype = getattr(block, "type", None)
        if btype == "text":
            return {"type": "text", "text": block.text}
        if btype == "tool_use":
            return {
                "type": "tool_use",
                "id": block.id,
                "name": block.name,
                "input": block.input or {},
            }
        # Defensive: alles andere als String dumpen
        try:
            return block.model_dump() if hasattr(block, "model_dump") else dict(block)
        except Exception:
            return {"type": btype or "unknown", "raw": str(block)}
