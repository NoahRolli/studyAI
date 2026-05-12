# Gemini Provider: Anbindung an die Google Gemini API.
#
# Aktueller Use-Case: Tool-Use im Delphi-Fallback. Gemini hat einen
# generoesen Free-Tier (15 RPM, 1500/Tag bei gemini-2.5-flash) und
# ist nicht hinter Cloudflare — funktioniert wenn Groq blockt.
#
# Architektur (parallel zu claude_provider.py):
# - Async-native via Client().aio (Pallas-Backend ist durchgaengig async)
# - Lazy Client-Init: crasht nicht beim Import wenn Key fehlt
# - Tool-Schema-Converter: Groq/OpenAI -> Google FunctionDeclaration
# - Tool-Use-Loop: bis max_iterations, ruft tool_executor pro
#   function_call-Part des Modells, fuegt function_response-Parts zurueck

import logging
from google import genai
from google.genai import types as gtypes
from backend.infra.config import GEMINI_API_KEY, GEMINI_TOOLS_MODEL

logger = logging.getLogger(__name__)


class GeminiProvider:
    """AI-Provider für die Gemini API (Tool-Use, Free-Tier-tauglich)."""

    def __init__(self):
        # Client wird erst beim ersten Aufruf erstellt
        self._client: genai.Client | None = None

    @property
    def api_key(self) -> str:
        """Exponiert den API-Key fuer Pre-Checks im ai_service Fallback-Pfad."""
        return GEMINI_API_KEY or ""

    def _get_client(self) -> genai.Client:
        """Erstellt den genai.Client beim ersten Aufruf (Lazy Init)."""
        if self._client is None:
            if not GEMINI_API_KEY:
                raise ValueError(
                    "GEMINI_API_KEY ist nicht gesetzt. "
                    "Bitte in docker-compose.override.yml oder .env eintragen. "
                    "Key holen auf https://aistudio.google.com (kostenlos)."
                )
            self._client = genai.Client(api_key=GEMINI_API_KEY)
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

        config_kwargs = {"max_output_tokens": max_tokens}
        if system:
            config_kwargs["system_instruction"] = system

        response = await client.aio.models.generate_content(
            model=GEMINI_TOOLS_MODEL,
            contents=prompt,
            config=gtypes.GenerateContentConfig(**config_kwargs),
        )
        return response.text or ""

    # ---------- Tool-Use-Schleife ----------
    async def chat_with_tools(
        self,
        messages: list[dict],
        tools: list[dict],
        tool_executor,  # async callable (name, args) -> str
        max_tokens: int = 4000,
        max_iterations: int = 3,
    ) -> str:
        """Tool-Use-Loop mit Gemini API.

        Args:
            messages: Liste mit role+content (system wird extrahiert).
            tools: Groq/OpenAI-Format Tool-Schemas (werden konvertiert).
            tool_executor: async callable, bekommt (name, args)-Dict,
                gibt String zurueck.
            max_tokens: Pro Iteration.
            max_iterations: Stop-Bedingung gegen Endlos-Loops.

        Returns:
            Finale Antwort-Text des Modells nach Tool-Aufloesung.
        """
        client = self._get_client()

        # System aus messages extrahieren
        system_prompt = ""
        contents: list[gtypes.Content] = []
        for m in messages:
            role = m.get("role")
            content = m.get("content", "")
            if role == "system":
                system_prompt = content
            elif role == "user":
                contents.append(
                    gtypes.Content(role="user", parts=[gtypes.Part(text=content)])
                )
            elif role == "assistant":
                # Sollte selten vorkommen beim Initial-Call, aber defensiv
                contents.append(
                    gtypes.Content(role="model", parts=[gtypes.Part(text=content)])
                )

        gemini_tools = self._convert_tools(tools)

        for iteration in range(max_iterations):
            config_kwargs = {
                "max_output_tokens": max_tokens,
                "tools": [gemini_tools],
            }
            if system_prompt:
                config_kwargs["system_instruction"] = system_prompt

            response = await client.aio.models.generate_content(
                model=GEMINI_TOOLS_MODEL,
                contents=contents,
                config=gtypes.GenerateContentConfig(**config_kwargs),
            )

            # Pruefe ob das Modell Function-Calls macht
            function_calls = self._extract_function_calls(response)
            if not function_calls:
                # Keine Tool-Calls -> finale Antwort
                return response.text or ""

            # Modell will Tools aufrufen:
            # 1) Assistant-Response (mit function_calls) an history anhaengen
            # 2) Tools ausfuehren
            # 3) function_response-Parts als user-content anhaengen
            # 4) Naechste Iteration

            # 1) Model-Response als Content-Block anhaengen
            assistant_parts = []
            for fc in function_calls:
                assistant_parts.append(
                    gtypes.Part(function_call=gtypes.FunctionCall(
                        name=fc["name"],
                        args=fc["args"],
                    ))
                )
            # Text-Parts aus der Response auch erhalten (falls vorhanden)
            text_part = (response.text or "").strip()
            if text_part:
                assistant_parts.insert(0, gtypes.Part(text=text_part))
            contents.append(
                gtypes.Content(role="model", parts=assistant_parts)
            )

            # 2+3) Tool-Calls ausfuehren, results als function_response
            tool_response_parts = []
            for fc in function_calls:
                tool_name = fc["name"]
                tool_input = fc["args"] or {}
                try:
                    result = await tool_executor(tool_name, tool_input)
                except Exception as e:
                    logger.exception(f"Tool {tool_name} crashte in Gemini-Pfad")
                    result = f"Tool-Fehler: {type(e).__name__}: {e}"

                tool_response_parts.append(
                    gtypes.Part(function_response=gtypes.FunctionResponse(
                        name=tool_name,
                        response={"result": result},
                    ))
                )

            contents.append(
                gtypes.Content(role="user", parts=tool_response_parts)
            )

        # max_iterations erreicht — finaler Call ohne Tools fuer Antwort
        logger.warning(
            f"Gemini chat_with_tools: max_iterations={max_iterations} "
            "erreicht, finale Antwort ohne weitere Tool-Calls"
        )
        config_kwargs = {"max_output_tokens": max_tokens}
        if system_prompt:
            config_kwargs["system_instruction"] = system_prompt
        final = await client.aio.models.generate_content(
            model=GEMINI_TOOLS_MODEL,
            contents=contents,
            config=gtypes.GenerateContentConfig(**config_kwargs),
        )
        return final.text or ""

    # ---------- Helper ----------
    @staticmethod
    def _convert_tools(groq_tools: list[dict]) -> "gtypes.Tool":
        """Konvertiert Groq/OpenAI-Schemas in Google FunctionDeclarations.

        Google verlangt eine Wrapper-Struktur:
            Tool(function_declarations=[FunctionDeclaration(...)])
        Wir bauen genau eine Tool-Instanz mit allen Function-Decls.

        Groq:        {"type": "function", "function": {"name", "description", "parameters"}}
        Google:      FunctionDeclaration(name, description, parameters)
        """
        declarations = []
        for t in groq_tools:
            if t.get("type") != "function":
                continue
            fn = t.get("function") or {}
            name = fn.get("name")
            if not name:
                continue
            params = fn.get("parameters") or {}
            # Defensive: Gemini braucht zwingend type=object
            if not params or "type" not in params:
                params = {"type": "object", "properties": {}, **params}
            declarations.append(
                gtypes.FunctionDeclaration(
                    name=name,
                    description=fn.get("description", ""),
                    parameters=params,
                )
            )
        return gtypes.Tool(function_declarations=declarations)

    @staticmethod
    def _extract_function_calls(response) -> list[dict]:
        """Extrahiert function_calls aus einer Gemini-Response.

        Returns list of {"name": str, "args": dict} dicts. Leer wenn
        das Modell keinen function_call gemacht hat.
        """
        results = []
        # response.candidates[0].content.parts -> Liste von Parts
        candidates = getattr(response, "candidates", None) or []
        if not candidates:
            return results
        content = getattr(candidates[0], "content", None)
        if content is None:
            return results
        parts = getattr(content, "parts", None) or []
        for p in parts:
            fc = getattr(p, "function_call", None)
            if fc is None:
                continue
            # fc.args ist ein MapComposite — to dict
            args = dict(fc.args) if fc.args else {}
            results.append({"name": fc.name, "args": args})
        return results
