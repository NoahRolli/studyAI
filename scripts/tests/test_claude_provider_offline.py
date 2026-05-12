"""Offline-Test fuer ClaudeProvider — Mock-Anthropic-Client, kein Network.

Testet:
- _convert_tools: Groq -> Anthropic Schema Conversion
- chat_with_tools: kompletter Tool-Use-Loop mit gemocktem Response
  inkl. tool_executor-Aufruf und tool_result-Anbindung
- Edge-Cases: kein Key, max_iterations, leere Antwort, executor crasht
"""
import sys
import os
import asyncio
import types
from pathlib import Path

# Pfad zur Provider-Klasse
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend" / "services"))

# Config-Stub (echte config braucht .env, nicht noetig fuer Tests)
import types as _t
config_mod = _t.ModuleType("backend.infra.config")
config_mod.CLAUDE_API_KEY = "test-key-xxx"
config_mod.CLAUDE_TOOLS_MODEL = "claude-haiku-4-5-20251001"

backend_pkg = _t.ModuleType("backend")
infra_pkg = _t.ModuleType("backend.infra")
sys.modules["backend"] = backend_pkg
sys.modules["backend.infra"] = infra_pkg
sys.modules["backend.infra.config"] = config_mod


# Mock fuer anthropic-SDK — nur die Klassen + Felder die wir brauchen
class _Block:
    """Mock Anthropic content-block (text oder tool_use)."""
    def __init__(self, type: str, **kwargs):
        self.type = type
        for k, v in kwargs.items():
            setattr(self, k, v)


class _Response:
    """Mock Anthropic Response."""
    def __init__(self, content: list, stop_reason: str):
        self.content = content
        self.stop_reason = stop_reason


class _MockMessages:
    """Mock client.messages — gibt scripted Responses zurueck."""
    def __init__(self, scripted: list):
        # scripted: list of (validator_or_None, _Response) Tuples
        self.scripted = list(scripted)
        self.calls = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        if not self.scripted:
            raise RuntimeError("Keine weiteren scripted-Responses!")
        validator, response = self.scripted.pop(0)
        if validator is not None:
            validator(kwargs)
        return response


class _MockClient:
    def __init__(self, scripted):
        self.messages = _MockMessages(scripted)


# anthropic-Modul stubben
anthropic_mod = _t.ModuleType("anthropic")
anthropic_mod.AsyncAnthropic = lambda **kw: None  # wird ueberschrieben pro Test
sys.modules["anthropic"] = anthropic_mod

# Jetzt den Provider laden
import claude_provider as cp


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


# ===== Test 1: _convert_tools =====
section("Test 1: _convert_tools (Schema-Conversion)")

groq_tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Holt das Wetter fuer einen Ort.",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {"type": "string"},
                },
                "required": ["location"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "minimal_tool",
            "description": "",
            "parameters": {},
        },
    },
    # Defekter Eintrag — sollte uebersprungen werden
    {"type": "not_function", "function": {"name": "skip_me"}},
    # Fehlender name
    {"type": "function", "function": {"description": "no name"}},
]

converted = cp.ClaudeProvider._convert_tools(groq_tools)

check("Length: 2 valid tools converted (defekte uebersprungen)", len(converted) == 2,
      f"Got {len(converted)}: {converted}")
check("First tool name preserved", converted[0]["name"] == "get_weather")
check("First tool description preserved", converted[0]["description"] == "Holt das Wetter fuer einen Ort.")
check("First tool input_schema is parameters", converted[0]["input_schema"]["required"] == ["location"])
check("Minimal tool has empty input_schema default", converted[1]["input_schema"]["type"] == "object")


# ===== Test 2: _block_to_dict =====
section("Test 2: _block_to_dict (Response-Block Serialisierung)")

text_block = _Block("text", text="Hallo Welt")
tool_use_block = _Block("tool_use", id="tu_1", name="search", input={"q": "foo"})

td = cp.ClaudeProvider._block_to_dict(text_block)
tud = cp.ClaudeProvider._block_to_dict(tool_use_block)

check("Text-Block: type+text", td == {"type": "text", "text": "Hallo Welt"})
check("Tool-Use-Block: alle Felder",
      tud == {"type": "tool_use", "id": "tu_1", "name": "search", "input": {"q": "foo"}})


# ===== Test 3: chat (no tools) — happy path =====
section("Test 3: chat() generisch ohne Tools")

async def test_simple_chat():
    provider = cp.ClaudeProvider()
    # Client injecten
    response = _Response(content=[_Block("text", text="Antwort von Claude")],
                         stop_reason="end_turn")
    provider._client = _MockClient([(None, response)])
    answer = await provider.chat("Hi", system="Sei nett.", max_tokens=100)
    check("chat() Antwort korrekt extrahiert", answer == "Antwort von Claude")
    call = provider._client.messages.calls[0]
    check("chat() sendet system-kwarg", call.get("system") == "Sei nett.")
    check("chat() sendet messages mit user", call["messages"] == [{"role": "user", "content": "Hi"}])
    check("chat() sendet model", call["model"] == "claude-haiku-4-5-20251001")

asyncio.run(test_simple_chat())


# ===== Test 4: chat_with_tools — Tool-Use-Loop =====
section("Test 4: chat_with_tools - kompletter Tool-Use-Loop")

async def test_tool_loop():
    provider = cp.ClaudeProvider()

    # Iteration 1: Modell sagt "ich will git_first_commit aufrufen"
    iter1 = _Response(
        content=[
            _Block("text", text="Ich pruefe deinen Kalender..."),
            _Block("tool_use", id="tu_a", name="git_first_commit", input={"repo": "pallas"}),
        ],
        stop_reason="tool_use",
    )
    # Iteration 2: Modell hat das Tool-Result bekommen, gibt finale Antwort
    iter2 = _Response(
        content=[_Block("text", text="Du hast am 2025-05-01 angefangen.")],
        stop_reason="end_turn",
    )

    def validator2(kwargs):
        # Im zweiten Call muessen die Messages: user + assistant + user(tool_result) enthalten
        msgs = kwargs["messages"]
        assert len(msgs) == 3, f"Erwarte 3 messages in iter2, got {len(msgs)}"
        assert msgs[0]["role"] == "user"
        assert msgs[1]["role"] == "assistant"
        assert msgs[2]["role"] == "user"
        # tool_result block
        tr = msgs[2]["content"][0]
        assert tr["type"] == "tool_result"
        assert tr["tool_use_id"] == "tu_a"
        assert "2025-05-01" in tr["content"]

    provider._client = _MockClient([
        (None, iter1),
        (validator2, iter2),
    ])

    executor_calls = []

    async def fake_executor(name, args):
        executor_calls.append((name, args))
        if name == "git_first_commit":
            return "Erster Commit: 2025-05-01"
        return f"Unknown tool: {name}"

    answer = await provider.chat_with_tools(
        messages=[
            {"role": "system", "content": "Du bist Delphi."},
            {"role": "user", "content": "Wann habe ich mit Pallas angefangen?"},
        ],
        tools=[{
            "type": "function",
            "function": {
                "name": "git_first_commit",
                "description": "Erster Commit",
                "parameters": {"type": "object", "properties": {"repo": {"type": "string"}}},
            },
        }],
        tool_executor=fake_executor,
        max_iterations=3,
    )

    check("Finale Antwort korrekt", answer == "Du hast am 2025-05-01 angefangen.")
    check("Executor wurde 1x aufgerufen", len(executor_calls) == 1,
          f"Got {len(executor_calls)} calls")
    check("Executor bekam richtigen Tool-Namen + Args",
          executor_calls[0] == ("git_first_commit", {"repo": "pallas"}))

    # System wurde korrekt extrahiert (nicht in messages)
    iter1_call = provider._client.messages.calls[0]
    check("System extrahiert als kwarg", iter1_call.get("system") == "Du bist Delphi.")
    check("Messages enthalten kein system-role",
          all(m["role"] != "system" for m in iter1_call["messages"]))
    check("Tools sind im Anthropic-Format konvertiert",
          iter1_call["tools"][0]["name"] == "git_first_commit")
    check("Tools haben input_schema (nicht parameters)",
          "input_schema" in iter1_call["tools"][0])

asyncio.run(test_tool_loop())


# ===== Test 5: max_iterations Schutz =====
section("Test 5: max_iterations Schutz (Endlos-Loop-Vermeidung)")

async def test_max_iter():
    provider = cp.ClaudeProvider()
    # Modell macht immer Tool-Calls — soll nach max_iterations stoppen
    looping = _Response(
        content=[_Block("tool_use", id="tu_x", name="git_first_commit", input={})],
        stop_reason="tool_use",
    )
    # 2 Iterationen + 1 finaler Forced-Call ohne Tools
    final_no_tools = _Response(
        content=[_Block("text", text="Konnte nicht abschliessen.")],
        stop_reason="end_turn",
    )
    provider._client = _MockClient([
        (None, looping),
        (None, looping),
        (None, final_no_tools),
    ])

    async def fake_exec(name, args):
        return "always result"

    answer = await provider.chat_with_tools(
        messages=[{"role": "user", "content": "test"}],
        tools=[{"type": "function", "function": {"name": "git_first_commit", "description": "", "parameters": {}}}],
        tool_executor=fake_exec,
        max_iterations=2,
    )

    check("Finale Antwort nach max_iter erreicht", answer == "Konnte nicht abschliessen.")
    check("Genau 3 API-Calls (2 iter + 1 forced final)",
          len(provider._client.messages.calls) == 3,
          f"Got {len(provider._client.messages.calls)} calls")
    check("Letzter Call hat KEINE tools mehr",
          "tools" not in provider._client.messages.calls[-1])

asyncio.run(test_max_iter())


# ===== Test 6: Executor crasht — graceful =====
section("Test 6: tool_executor crasht — wird als Tool-Fehler gemeldet")

async def test_executor_crash():
    provider = cp.ClaudeProvider()
    iter1 = _Response(
        content=[_Block("tool_use", id="tu_c", name="crash_tool", input={})],
        stop_reason="tool_use",
    )
    iter2 = _Response(
        content=[_Block("text", text="Tool fehlgeschlagen, kann nicht antworten.")],
        stop_reason="end_turn",
    )

    def validator2(kwargs):
        tr = kwargs["messages"][2]["content"][0]
        assert "Tool-Fehler" in tr["content"], f"Expected error message, got: {tr['content']}"

    provider._client = _MockClient([
        (None, iter1),
        (validator2, iter2),
    ])

    async def crashing_exec(name, args):
        raise ValueError("simuliert kaputt")

    answer = await provider.chat_with_tools(
        messages=[{"role": "user", "content": "test"}],
        tools=[{"type": "function", "function": {"name": "crash_tool", "description": "", "parameters": {}}}],
        tool_executor=crashing_exec,
    )

    check("Provider crashte nicht trotz Executor-Exception", isinstance(answer, str))

asyncio.run(test_executor_crash())


# ===== Test 7: Kein Key — graceful Error =====
section("Test 7: ohne API-Key crasht NICHT beim Import, aber beim Call")

config_mod.CLAUDE_API_KEY = ""

async def test_no_key():
    # _get_client wird gerufen — sollte ValueError geben wenn kein Key.
    # Wir muessen das in cp importierte CLAUDE_API_KEY patchen (nicht
    # nur config_mod), weil claude_provider beim Import den Wert
    # bereits in sein Namespace gezogen hat.
    cp.CLAUDE_API_KEY = ""
    provider = cp.ClaudeProvider()
    provider._client = None
    try:
        provider._get_client()
        check("_get_client sollte raisen, hat aber nicht", False)
    except ValueError as e:
        check("_get_client raises ValueError mit klarer Message", "CLAUDE_API_KEY" in str(e))
    except Exception as e:
        check(f"Falsche Exception-Klasse {type(e).__name__}", False, str(e))
    finally:
        cp.CLAUDE_API_KEY = "test-key-xxx"

asyncio.run(test_no_key())
config_mod.CLAUDE_API_KEY = "test-key-xxx"


# ===== Summary =====
print("\n" + "=" * 70)
print(f"{passed} passed, {failed} failed")
print("=" * 70)
sys.exit(0 if failed == 0 else 1)
