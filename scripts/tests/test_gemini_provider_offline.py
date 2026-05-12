"""Offline-Test fuer GeminiProvider — Mock-google-genai-Client, kein Network.

Testet:
- _convert_tools: Groq -> Google FunctionDeclaration Conversion
- _extract_function_calls: Aus Mock-Response Function-Calls finden
- chat_with_tools: kompletter Tool-Use-Loop mit gemocktem Response
- Edge-Cases: kein Key, max_iterations, executor crasht, leere Response
"""
import sys
import asyncio
import types
from pathlib import Path

# Config-Stub
config_mod = types.ModuleType("backend.infra.config")
config_mod.GEMINI_API_KEY = "test-key-xxx"
config_mod.GEMINI_TOOLS_MODEL = "gemini-2.5-flash"
sys.modules["backend"] = types.ModuleType("backend")
sys.modules["backend.infra"] = types.ModuleType("backend.infra")
sys.modules["backend.infra.config"] = config_mod


# ====== Mock-google-genai SDK ======
class _FunctionCall:
    def __init__(self, name, args):
        self.name = name
        self.args = args


class _FunctionResponse:
    def __init__(self, name, response):
        self.name = name
        self.response = response


class _Part:
    def __init__(self, text=None, function_call=None, function_response=None):
        self.text = text
        self.function_call = function_call
        self.function_response = function_response


class _Content:
    def __init__(self, role, parts):
        self.role = role
        self.parts = parts


class _Candidate:
    def __init__(self, content):
        self.content = content


class _Response:
    def __init__(self, text=None, function_calls=None):
        # text-attribute mimicked
        self.text = text or ""
        # candidates[0].content.parts
        parts = []
        if text:
            parts.append(_Part(text=text))
        if function_calls:
            for fc_dict in function_calls:
                parts.append(_Part(
                    function_call=_FunctionCall(fc_dict["name"], fc_dict["args"])
                ))
        self.candidates = [_Candidate(_Content("model", parts))]


class _FunctionDeclaration:
    def __init__(self, name, description, parameters):
        self.name = name
        self.description = description
        self.parameters = parameters


class _Tool:
    def __init__(self, function_declarations):
        self.function_declarations = function_declarations


class _GenerateContentConfig:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


# Mock-Module: google.genai + google.genai.types
genai_types_mod = types.ModuleType("google.genai.types")
genai_types_mod.Part = _Part
genai_types_mod.Content = _Content
genai_types_mod.FunctionCall = _FunctionCall
genai_types_mod.FunctionResponse = _FunctionResponse
genai_types_mod.Tool = _Tool
genai_types_mod.FunctionDeclaration = _FunctionDeclaration
genai_types_mod.GenerateContentConfig = _GenerateContentConfig

# Mock-Client mit scripted Responses
class _MockAioModels:
    def __init__(self, scripted):
        self.scripted = list(scripted)
        self.calls = []

    async def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        if not self.scripted:
            raise RuntimeError("Keine weiteren scripted-Responses!")
        validator, response = self.scripted.pop(0)
        if validator is not None:
            validator(kwargs)
        return response


class _MockAio:
    def __init__(self, scripted):
        self.models = _MockAioModels(scripted)


class _MockClient:
    def __init__(self, scripted):
        self.aio = _MockAio(scripted)


class _MockGenaiModule:
    Client = _MockClient

# Module mounten
genai_mod = types.ModuleType("google.genai")
genai_mod.Client = _MockClient
genai_mod.types = genai_types_mod
google_mod = types.ModuleType("google")
google_mod.genai = genai_mod
sys.modules["google"] = google_mod
sys.modules["google.genai"] = genai_mod
sys.modules["google.genai.types"] = genai_types_mod


# Provider laden
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend" / "services"))
import gemini_provider as gp


# ====== Test-Framework ======
def section(t):
    print("\n" + "=" * 70)
    print(t)
    print("=" * 70)


passed = 0
failed = 0


def check(name, cond, detail=""):
    global passed, failed
    if cond:
        print(f"  [OK ] {name}")
        passed += 1
    else:
        print(f"  [FAIL] {name}")
        if detail:
            print(f"    {detail}")
        failed += 1


# ====== Test 1: _convert_tools ======
section("Test 1: _convert_tools (Schema-Conversion)")

groq_tools = [
    {
        "type": "function",
        "function": {
            "name": "git_first_commit",
            "description": "Erster Commit",
            "parameters": {
                "type": "object",
                "properties": {"repo": {"type": "string"}},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "no_params_tool",
            "description": "",
            "parameters": {},
        },
    },
    {"type": "not_function", "function": {"name": "skip"}},
    {"type": "function", "function": {"description": "no name"}},
]

converted = gp.GeminiProvider._convert_tools(groq_tools)
check("Returns Tool instance", isinstance(converted, _Tool))
check("2 valid declarations", len(converted.function_declarations) == 2,
      f"Got {len(converted.function_declarations)}")
check("First decl name preserved", converted.function_declarations[0].name == "git_first_commit")
check("First decl parameters preserved",
      converted.function_declarations[0].parameters["required"] == ["repo"]
      if "required" in converted.function_declarations[0].parameters
      else converted.function_declarations[0].parameters["properties"]["repo"]["type"] == "string")
check("Second decl gets default schema",
      converted.function_declarations[1].parameters["type"] == "object")


# ====== Test 2: _extract_function_calls ======
section("Test 2: _extract_function_calls")

# Response ohne Function-Calls -> empty
resp_no_fc = _Response(text="Hi there")
fcs = gp.GeminiProvider._extract_function_calls(resp_no_fc)
check("No function_calls -> empty list", fcs == [])

# Response mit einem Function-Call
resp_with_fc = _Response(function_calls=[{"name": "tool_a", "args": {"x": 1}}])
fcs = gp.GeminiProvider._extract_function_calls(resp_with_fc)
check("Single function_call extracted", len(fcs) == 1)
check("function_call name correct", fcs[0]["name"] == "tool_a")
check("function_call args correct", fcs[0]["args"] == {"x": 1})

# Response mit mehreren Function-Calls (parallel calls)
resp_multi = _Response(function_calls=[
    {"name": "tool_a", "args": {"x": 1}},
    {"name": "tool_b", "args": {"y": 2}},
])
fcs = gp.GeminiProvider._extract_function_calls(resp_multi)
check("Multiple function_calls extracted", len(fcs) == 2)


# ====== Test 3: chat() generisch ======
section("Test 3: chat() generisch ohne Tools")

async def test_chat():
    provider = gp.GeminiProvider()
    response = _Response(text="Hello from Gemini")
    provider._client = _MockClient([(None, response)])
    answer = await provider.chat("Hi", system="Be helpful.", max_tokens=100)
    check("chat() Antwort korrekt", answer == "Hello from Gemini")
    call = provider._client.aio.models.calls[0]
    check("chat() sendet model", call["model"] == "gemini-2.5-flash")
    check("chat() sendet contents",
          call.get("contents") == "Hi" or (isinstance(call.get("contents"), list) and call["contents"]))
    # system_instruction sollte in config sein
    cfg = call["config"]
    check("chat() config hat system_instruction", cfg.system_instruction == "Be helpful.")
    check("chat() config hat max_output_tokens", cfg.max_output_tokens == 100)

asyncio.run(test_chat())


# ====== Test 4: chat_with_tools - Tool-Use-Loop ======
section("Test 4: chat_with_tools - kompletter Tool-Use-Loop")

async def test_tool_loop():
    provider = gp.GeminiProvider()

    # Iter 1: Modell will git_first_commit aufrufen
    iter1 = _Response(function_calls=[
        {"name": "git_first_commit", "args": {"repo": "pallas"}}
    ])
    # Iter 2: Modell hat Tool-Result und antwortet final
    iter2 = _Response(text="Du hast am 2025-05-01 angefangen.")

    def validator2(kwargs):
        # contents sollten user-prompt, model-response (mit fc), user-response (mit fr) enthalten
        cs = kwargs["contents"]
        assert len(cs) == 3, f"Expected 3 contents in iter2, got {len(cs)}"
        # 0: user-prompt, 1: model-fc, 2: user-function-response
        assert cs[0].role == "user"
        assert cs[1].role == "model"
        assert cs[2].role == "user"
        # iter2's user has function_response part
        fr_part = cs[2].parts[0]
        assert fr_part.function_response is not None
        assert "2025-05-01" in str(fr_part.function_response.response)

    provider._client = _MockClient([
        (None, iter1),
        (validator2, iter2),
    ])

    executor_calls = []

    async def fake_executor(name, args):
        executor_calls.append((name, args))
        return "Erster Commit: 2025-05-01"

    answer = await provider.chat_with_tools(
        messages=[
            {"role": "system", "content": "Du bist Delphi."},
            {"role": "user", "content": "Wann habe ich mit Pallas angefangen?"},
        ],
        tools=[{
            "type": "function",
            "function": {
                "name": "git_first_commit",
                "description": "First commit",
                "parameters": {"type": "object", "properties": {"repo": {"type": "string"}}},
            },
        }],
        tool_executor=fake_executor,
    )

    check("Finale Antwort korrekt", answer == "Du hast am 2025-05-01 angefangen.")
    check("Executor 1x aufgerufen", len(executor_calls) == 1)
    check("Executor bekam richtige Args",
          executor_calls[0] == ("git_first_commit", {"repo": "pallas"}))

    iter1_call = provider._client.aio.models.calls[0]
    check("System ist in config.system_instruction",
          iter1_call["config"].system_instruction == "Du bist Delphi.")
    # contents sollten kein system-role enthalten
    contents_iter1 = iter1_call["contents"]
    for c in contents_iter1:
        if hasattr(c, "role"):
            assert c.role != "system", "system sollte nicht in contents sein"
    check("Tools sind im Gemini-Format konvertiert",
          isinstance(iter1_call["config"].tools[0], _Tool))

asyncio.run(test_tool_loop())


# ====== Test 5: max_iterations ======
section("Test 5: max_iterations Schutz")

async def test_max_iter():
    provider = gp.GeminiProvider()
    looping = _Response(function_calls=[
        {"name": "git_first_commit", "args": {}}
    ])
    final = _Response(text="Konnte nicht abschliessen.")
    provider._client = _MockClient([
        (None, looping),
        (None, looping),
        (None, final),
    ])

    async def fake_exec(name, args):
        return "always result"

    answer = await provider.chat_with_tools(
        messages=[{"role": "user", "content": "test"}],
        tools=[{"type": "function", "function": {"name": "git_first_commit", "description": "", "parameters": {}}}],
        tool_executor=fake_exec,
        max_iterations=2,
    )

    check("Final answer nach max_iter", answer == "Konnte nicht abschliessen.")
    check("3 Calls (2 iter + 1 forced final)",
          len(provider._client.aio.models.calls) == 3)
    # Letzter Call hat KEINE tools
    last_call = provider._client.aio.models.calls[-1]
    has_tools = hasattr(last_call["config"], "tools") and last_call["config"].tools
    check("Letzter Call hat KEINE tools",
          not has_tools, f"Last config: {last_call['config'].__dict__}")

asyncio.run(test_max_iter())


# ====== Test 6: Executor-Crash ======
section("Test 6: tool_executor crasht — als Tool-Fehler gemeldet")

async def test_crash():
    provider = gp.GeminiProvider()
    iter1 = _Response(function_calls=[{"name": "crash_tool", "args": {}}])
    iter2 = _Response(text="Tool fehlgeschlagen.")

    def validator2(kwargs):
        cs = kwargs["contents"]
        fr_part = cs[-1].parts[0]
        assert "Tool-Fehler" in str(fr_part.function_response.response), \
            f"Expected error in fr, got: {fr_part.function_response.response}"

    provider._client = _MockClient([
        (None, iter1),
        (validator2, iter2),
    ])

    async def crash_exec(name, args):
        raise ValueError("simuliert kaputt")

    answer = await provider.chat_with_tools(
        messages=[{"role": "user", "content": "test"}],
        tools=[{"type": "function", "function": {"name": "crash_tool", "description": "", "parameters": {}}}],
        tool_executor=crash_exec,
    )
    check("Provider crashte nicht", isinstance(answer, str))

asyncio.run(test_crash())


# ====== Test 7: Kein Key ======
section("Test 7: ohne API-Key crasht nicht beim Import")

async def test_no_key():
    gp.GEMINI_API_KEY = ""
    provider = gp.GeminiProvider()
    provider._client = None
    try:
        provider._get_client()
        check("_get_client sollte raisen", False)
    except ValueError as e:
        check("_get_client raises ValueError", "GEMINI_API_KEY" in str(e))
    except Exception as e:
        check(f"Falsche Exception {type(e).__name__}", False, str(e))
    finally:
        gp.GEMINI_API_KEY = "test-key-xxx"

asyncio.run(test_no_key())


# ====== Summary ======
print("\n" + "=" * 70)
print(f"{passed} passed, {failed} failed")
print("=" * 70)
sys.exit(0 if failed == 0 else 1)
