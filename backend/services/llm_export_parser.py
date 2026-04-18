# ClaudeExportParser + ConversationRenderer (Slice 1 von P5.1)
# Plan-Referenz: pallas_llm_archive_plan.md §4 (Parser-Logik)
# Klassifikation lebt separat in llm_classification.py
#
# Befunde aus echter Export-Inspektion (Chat 45, 18.04.2026):
#   - thinking-Blocks haben Feld 'thinking', NICHT 'text' (Plan §1.2 falsch)
#   - tool_use.input ist Dict (oft {"command":..., "description":...})
#   - tool_result.content ist Liste von {"type":"text","text":...}-Dicts
#   - attachments[].extracted_content = Klartext, files[] hat nur UUIDs
#   - token_budget-Blocks ignorieren wir (keine Info)

import json
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path


# ----------------------------------------------------------------------
# Datacontainer für geparste Conversations
# ----------------------------------------------------------------------

@dataclass
class ParsedMessage:
    # Provider-seitige Identifier
    external_uuid: str
    parent_external_uuid: str | None

    # Rolle und chronologische Position
    role: str  # "human" | "assistant"
    turn_index: int

    # Rendered Content
    text: str              # ohne thinking, mit Tool-Summaries inline
    thinking: str | None   # zusammengefügte thinking-Blocks
    has_tools: bool        # True wenn mind. ein tool_use/tool_result vorhanden

    # Raw + Attachments für späteres Re-Rendering
    raw_content: list
    attachments_info: list

    # Timestamp
    created_at: datetime


@dataclass
class ParsedConversation:
    # Provider-seitige Identifier
    external_uuid: str

    # Metadata
    title: str | None
    summary_from_provider: str | None
    provider_created_at: datetime
    provider_updated_at: datetime

    # Messages
    messages: list = field(default_factory=list)

    @property
    def message_count(self):
        return len(self.messages)

    @property
    def has_thinking(self):
        return any(m.thinking for m in self.messages)

    @property
    def has_tools(self):
        return any(m.has_tools for m in self.messages)

    @property
    def first_human_text(self):
        # Für Klassifikation: erster Text einer Human-Message, sonst leer
        for m in self.messages:
            if m.role == "human" and m.text:
                return m.text
        return ""


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------

def _parse_iso(value):
    # Parsed ISO-Timestamp, toleriert 'Z'-Suffix
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value).replace(tzinfo=None)


def _summarize_tool_use(block):
    # Kurze Inline-Summary für tool_use (Entscheidung 2: Option C)
    # Beispiel: [Tool: bash_tool — Entpacke das ZIP-Archiv]
    name = block.get("name", "tool")
    inp = block.get("input") or {}
    desc = ""
    if isinstance(inp, dict):
        # bash_tool→description, web_search→query, str_replace→description
        desc = inp.get("description") or inp.get("query") or inp.get("command", "")
        if isinstance(desc, str):
            desc = desc.replace("\n", " ").strip()[:120]
    return f"[Tool: {name}{' — ' + desc if desc else ''}]"


def _summarize_tool_result(block):
    # Kurze Inline-Summary für tool_result
    # Beispiel: [Tool-Result: bash_tool · 1283 chars]
    name = block.get("name", "tool")
    content = block.get("content")
    size = 0
    if isinstance(content, list):
        for entry in content:
            if isinstance(entry, dict) and isinstance(entry.get("text"), str):
                size += len(entry["text"])
    elif isinstance(content, str):
        size = len(content)
    err = " · ERROR" if block.get("is_error") else ""
    return f"[Tool-Result: {name} · {size} chars{err}]"


def render_message_content(content_blocks):
    # Rendert content[]-Blocks zu (main_text, thinking_text, has_tools)
    text_parts = []
    thinking_parts = []
    has_tools = False

    for block in content_blocks:
        btype = block.get("type")
        if btype == "text":
            t = block.get("text", "")
            if t:
                text_parts.append(t)
        elif btype == "thinking":
            # Wichtig: Feld heisst "thinking", NICHT "text"
            t = block.get("thinking", "") or block.get("text", "")
            if t:
                thinking_parts.append(t)
        elif btype == "tool_use":
            text_parts.append(_summarize_tool_use(block))
            has_tools = True
        elif btype == "tool_result":
            text_parts.append(_summarize_tool_result(block))
            has_tools = True
        # token_budget → ignorieren

    main_text = "\n\n".join(text_parts).strip()
    thinking_text = "\n\n".join(thinking_parts).strip() or None
    return main_text, thinking_text, has_tools


def _attachments_info(message):
    # Sammelt Metadata zu Attachments + Files (Binaries nur als Hinweis)
    out = []
    for a in message.get("attachments", []) or []:
        ec = a.get("extracted_content") or ""
        out.append({
            "kind": "attachment",
            "file_name": a.get("file_name"),
            "file_type": a.get("file_type"),
            "file_size": a.get("file_size"),
            "extracted_content_preview": ec[:500] if ec else None,
            "extracted_content_len": len(ec) if ec else 0,
        })
    for f in message.get("files", []) or []:
        out.append({
            "kind": "file",  # Binary, im Export nur als UUID präsent
            "file_name": f.get("file_name"),
            "file_uuid": f.get("file_uuid"),
        })
    return out


def render_threaded_text(convo):
    # Erzeugt Threaded-Plaintext für Document.content (§4.2.c)
    lines = []
    for msg in convo.messages:
        role_label = "Human" if msg.role == "human" else "Assistant"
        ts = msg.created_at.strftime("%Y-%m-%d %H:%M:%S")
        lines.append(f"=== {role_label} [{ts}] ===")
        lines.append(msg.text if msg.text else "[leere Nachricht]")
        for att in msg.attachments_info:
            fn = att.get("file_name") or "?"
            kind = att.get("kind", "attachment")
            label = "Attachment" if kind == "attachment" else "Datei"
            lines.append(f"[{label}: {fn}]")
            preview = att.get("extracted_content_preview")
            if preview:
                lines.append(preview)
        lines.append("")  # Leerzeile zwischen Messages
    return "\n".join(lines).rstrip() + "\n"


# ----------------------------------------------------------------------
# Parser
# ----------------------------------------------------------------------

class ClaudeExportParser:
    # Liest die drei JSON-Files aus einem entpackten Claude-Export

    def __init__(self, export_dir):
        self.export_dir = Path(export_dir)
        if not self.export_dir.is_dir():
            raise FileNotFoundError(
                f"Export-Verzeichnis nicht gefunden: {export_dir}"
            )

    def load_conversations(self):
        with (self.export_dir / "conversations.json").open(encoding="utf-8") as f:
            return json.load(f)

    def load_projects(self):
        path = self.export_dir / "projects.json"
        if not path.exists():
            return []
        with path.open(encoding="utf-8") as f:
            return json.load(f)

    def load_memories(self):
        path = self.export_dir / "memories.json"
        if not path.exists():
            return {}
        with path.open(encoding="utf-8") as f:
            return json.load(f)

    def parse_conversations(self, raw=None):
        if raw is None:
            raw = self.load_conversations()
        out = []
        for c in raw:
            parsed = self._parse_one(c)
            if parsed is not None:
                out.append(parsed)
        return out

    def _parse_one(self, c):
        msgs_raw = c.get("chat_messages", []) or []
        if not msgs_raw:
            return None  # §4.3: leere Conversation überspringen

        # Sortierung nach created_at zur Sicherheit (§4.3)
        msgs_sorted = sorted(msgs_raw, key=lambda m: m.get("created_at", ""))

        messages = []
        for idx, m in enumerate(msgs_sorted):
            text, thinking, has_tools = render_message_content(
                m.get("content", [])
            )
            attachments = _attachments_info(m)

            # Fallback: text leer + Attachment vorhanden → ersten Preview
            # reinziehen, damit Embedding/Summary etwas sehen (§4.3)
            if not text and attachments:
                for att in attachments:
                    p = att.get("extracted_content_preview")
                    if p:
                        text = p
                        break

            messages.append(ParsedMessage(
                external_uuid=m.get("uuid", ""),
                parent_external_uuid=m.get("parent_message_uuid") or None,
                role=m.get("sender", "assistant"),
                turn_index=idx,
                text=text,
                thinking=thinking,
                has_tools=has_tools,
                raw_content=m.get("content", []),
                attachments_info=attachments,
                created_at=_parse_iso(m.get("created_at", c["created_at"])),
            ))

        return ParsedConversation(
            external_uuid=c["uuid"],
            title=(c.get("name") or "").strip() or None,
            summary_from_provider=(c.get("summary") or "").strip() or None,
            provider_created_at=_parse_iso(c["created_at"]),
            provider_updated_at=_parse_iso(c["updated_at"]),
            messages=messages,
        )
