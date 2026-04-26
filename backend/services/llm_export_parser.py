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


# ----------------------------------------------------------------------
# GeminiExportParser (Slice für P5.1 Multi-Provider, Chat 55)
# ----------------------------------------------------------------------
# Eingabe: Google Takeout HTML-Export (MeineAktivitäten.html)
#   ~/llm-exports/gemini/takeout/Gemini-Apps/MeineAktivitäten.html
#
# HTML-Struktur (verifiziert anhand Sample, 26.04.2026):
#   <div class="outer-cell">                       # Eine Activity-Card
#     <div class="header-cell">Gemini-Apps</div>
#     <div class="content-cell mdl-cell--6-col">  # Haupt-Content
#       Eingegebener Prompt: <USER_TEXT><br>
#       [optional: "N Datei(en) angehängt." + <a>filename</a>]
#       <DD.MM.YYYY, HH:MM:SS MES?Z><br>
#       <ASSISTANT_HTML>
#     </div>
#   </div>
#
# Eine outer-cell == eine Activity == eine Conversation mit 2 Messages.
# Synthetische UUIDs: sha256(content[:500] + timestamp_iso)[:32] — idempotent.

import hashlib
import re

from bs4 import BeautifulSoup, NavigableString


# CSS-Klassen-Marker (bei Format-Änderung hier zentral anpassen)
ACTIVITY_CELL_CLASS = "outer-cell"
CONTENT_CELL_MAIN_CLASS = "mdl-cell--6-col"

# Text-Marker
PROMPT_PREFIX = "Eingegebener Prompt:"
ATTACHMENT_PATTERN = re.compile(r"\d+\s+Datei(?:en)?\s+angeh[äa]ngt\.?", re.IGNORECASE)

# Timestamp: "18.04.2026, 17:38:51 MESZ" / MEZ / UTC / GMT
TIMESTAMP_PATTERN = re.compile(
    r"(\d{1,2}\.\d{1,2}\.\d{4}),\s*(\d{1,2}:\d{2}:\d{2})\s*(MESZ|MEZ|UTC|GMT)"
)


def _parse_gemini_timestamp(date_str, time_str):
    # "18.04.2026" + "17:38:51" → naive datetime (analog Claude-Parser)
    return datetime.strptime(f"{date_str} {time_str}", "%d.%m.%Y %H:%M:%S")


def _synthetic_uuid(content, timestamp_iso):
    # Idempotent: gleiche Eingabe → gleiche UUID
    raw = f"{content[:500]}|{timestamp_iso}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def _gemini_html_to_plaintext(node):
    # Konvertiert ein BS4-Node-Tree zu strukturiertem Plaintext.
    # Block-Tags (h1-h6, p, li) erzeugen Zeilenumbrüche.
    if node is None:
        return ""

    block_tags = {"h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "br", "div"}
    parts = []

    def walk(element):
        if isinstance(element, NavigableString):
            text = str(element).replace("\xa0", " ").replace("\u200b", "")
            parts.append(text)
            return
        if not hasattr(element, "name") or not element.name:
            return
        tag = element.name.lower()

        if tag in block_tags and parts and not parts[-1].endswith("\n"):
            parts.append("\n")
        if tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            parts.append("\n")
            for child in element.children:
                walk(child)
            parts.append("\n")
            return
        if tag == "li":
            parts.append("- ")
            for child in element.children:
                walk(child)
            parts.append("\n")
            return
        if tag == "br":
            parts.append("\n")
            return

        for child in element.children:
            walk(child)
        if tag in {"p", "div"}:
            parts.append("\n")

    walk(node)
    text = "".join(parts)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _extract_gemini_activity(content_cell):
    # Parst eine Haupt-Content-Cell zu dict mit user_text, attachments,
    # timestamp, assistant_text. Returns None wenn nicht parsbar.
    raw_html = str(content_cell)

    ts_match = TIMESTAMP_PATTERN.search(raw_html)
    if not ts_match:
        return None
    date_str, time_str, _tz = ts_match.groups()
    try:
        timestamp = _parse_gemini_timestamp(date_str, time_str)
    except ValueError:
        return None

    ts_full = ts_match.group(0)
    ts_pos = raw_html.find(ts_full)
    if ts_pos < 0:
        return None

    pre_html = raw_html[:ts_pos]
    post_html = raw_html[ts_pos + len(ts_full):]

    # User-Teil
    pre_soup = BeautifulSoup(pre_html, "lxml")
    pre_text = pre_soup.get_text(separator="\n").replace("\xa0", " ")
    if PROMPT_PREFIX in pre_text:
        user_block = pre_text.split(PROMPT_PREFIX, 1)[1].strip()
    else:
        user_block = pre_text.strip()

    attachments = []
    for a_tag in pre_soup.find_all("a"):
        fname = a_tag.get_text(strip=True)
        href = a_tag.get("href", "")
        if fname and not fname.startswith("http"):
            attachments.append({
                "kind": "attachment",
                "file_name": fname,
                "file_uri": href,
            })

    user_text_lines = []
    for line in user_block.splitlines():
        line_stripped = line.strip()
        if not line_stripped:
            continue
        if ATTACHMENT_PATTERN.match(line_stripped):
            continue
        if attachments and line_stripped.startswith("-"):
            line_no_dash = line_stripped.lstrip("- ").strip()
            if any(att["file_name"] == line_no_dash for att in attachments):
                continue
        user_text_lines.append(line_stripped)
    user_text = "\n".join(user_text_lines).strip()

    # Assistant-Teil
    post_soup = BeautifulSoup(post_html, "lxml")
    assistant_text = _gemini_html_to_plaintext(post_soup)

    return {
        "user_text": user_text,
        "attachments": attachments,
        "timestamp": timestamp,
        "assistant_text": assistant_text,
        "assistant_raw_html": post_html,
    }


class GeminiExportParser:
    # Drop-in-kompatibel mit ClaudeExportParser:
    # liefert list[ParsedConversation] aus Google Takeout HTML.

    def __init__(self, source):
        self.source_path = Path(source)
        if self.source_path.is_dir():
            candidate = self.source_path / "MeineAktivit\u00e4ten.html"
            if not candidate.exists():
                html_files = list(self.source_path.glob("*.html"))
                if not html_files:
                    raise FileNotFoundError(
                        f"Keine HTML-Datei in {self.source_path}"
                    )
                candidate = html_files[0]
            self.source_path = candidate
        if not self.source_path.exists():
            raise FileNotFoundError(f"Gemini-Export nicht gefunden: {self.source_path}")
        self._last_skipped = 0

    def _load_soup(self):
        with self.source_path.open(encoding="utf-8") as f:
            return BeautifulSoup(f, "lxml")

    def parse_conversations(self):
        soup = self._load_soup()
        activities = soup.find_all("div", class_=ACTIVITY_CELL_CLASS)

        conversations = []
        skipped = 0

        for activity in activities:
            content_cells = activity.find_all("div", class_="content-cell")
            main_cell = None
            for cell in content_cells:
                cell_classes = cell.get("class", [])
                if (CONTENT_CELL_MAIN_CLASS in cell_classes
                        and "mdl-typography--text-right" not in cell_classes):
                    main_cell = cell
                    break

            if main_cell is None:
                skipped += 1
                continue

            data = _extract_gemini_activity(main_cell)
            if data is None or not data["user_text"]:
                skipped += 1
                continue

            ts_iso = data["timestamp"].isoformat()
            conv_uuid = _synthetic_uuid(data["user_text"], ts_iso)
            user_uuid = _synthetic_uuid("user|" + data["user_text"], ts_iso)
            assistant_uuid = _synthetic_uuid(
                "assistant|" + data["assistant_text"][:500], ts_iso
            )

            first_line = data["user_text"].splitlines()[0] if data["user_text"] else ""
            title = first_line[:60].strip() or None

            user_msg = ParsedMessage(
                external_uuid=user_uuid,
                parent_external_uuid=None,
                role="human",
                turn_index=0,
                text=data["user_text"],
                thinking=None,
                has_tools=False,
                raw_content=[{"type": "text", "text": data["user_text"]}],
                attachments_info=data["attachments"],
                created_at=data["timestamp"],
            )
            assistant_msg = ParsedMessage(
                external_uuid=assistant_uuid,
                parent_external_uuid=user_uuid,
                role="assistant",
                turn_index=1,
                text=data["assistant_text"],
                thinking=None,
                has_tools=False,
                raw_content=[{"type": "text", "text": data["assistant_text"]}],
                attachments_info=[],
                created_at=data["timestamp"],
            )

            conversations.append(ParsedConversation(
                external_uuid=conv_uuid,
                title=title,
                summary_from_provider=None,
                provider_created_at=data["timestamp"],
                provider_updated_at=data["timestamp"],
                messages=[user_msg, assistant_msg],
            ))

        self._last_skipped = skipped
        return conversations


# ----------------------------------------------------------------------
# ChatGPTExportParser (Slice für P5.1 Multi-Provider, Chat 55)
# ----------------------------------------------------------------------
# Eingabe: OpenAI Export-Verzeichnis mit conversations-NNN.json Files
#   ~/llm-exports/chatgpt/<hash>-DATE-<hash>/
#
# Format-Befunde (verifiziert anhand 509 Conversations, 26.04.2026):
#   - Conversations sind Liste, gesplittet auf conversations-000.json bis -NNN.json
#   - Pro Conv: id, conversation_id, title, create_time (Unix-TS), update_time,
#     current_node, mapping (Tree)
#   - mapping[node_id] = {parent, children, message}
#   - message kann None sein (Root-Marker)
#   - Roles: user, assistant, system, tool
#   - content_types: text, multimodal_text, code, execution_output,
#     thoughts, reasoning_recap, tether_browsing_display, tether_quote, etc.
#   - parts kann list[str] ODER list[dict] (image/audio asset pointers)
#
# Mapping zu Pallas (role: human|assistant, text, thinking, has_tools):
#   - Aktiver Pfad: von current_node rückwärts via parent
#   - role=user      → human, text aus parts
#   - role=assistant text → in text-Akkumulator
#   - role=assistant thoughts/reasoning_recap → in thinking
#   - role=assistant code → "[Tool: python]" summary, has_tools=True
#   - role=tool execution_output → "[Tool-Result: ...]" summary
#   - role=tool tether_browsing_display → "[Tool: browsing]" summary
#   - role=system → komplett skippen (Memory/Custom-Instructions separat)
#   - multimodal image_asset_pointer → "[Bild: filename]" placeholder
#
# Konsekutive Assistant/Tool-Nodes werden zu EINER ParsedMessage zusammengefügt.

# Rollen
_CHATGPT_USER_ROLE = "user"
_CHATGPT_ASSISTANT_ROLE = "assistant"
_CHATGPT_TOOL_ROLE = "tool"
_CHATGPT_SYSTEM_ROLE = "system"

# Content-Types als "thinking"
_CHATGPT_THINKING_CONTENT_TYPES = {"thoughts", "reasoning_recap"}

# Content-Types als Tool-Use
_CHATGPT_TOOL_CONTENT_TYPES = {
    "code", "execution_output",
    "tether_browsing_display", "tether_quote",
    "super_widget",
}


def _chatgpt_extract_text_from_parts(parts):
    # parts (list of str OR dict) → rendered string
    if not parts:
        return ""
    out = []
    for p in parts:
        if isinstance(p, str):
            if p:
                out.append(p)
        elif isinstance(p, dict):
            ct = p.get("content_type", "")
            if ct == "image_asset_pointer":
                ptr = p.get("asset_pointer") or "?"
                out.append(f"[Bild: {ptr}]")
            elif ct == "audio_asset_pointer":
                out.append("[Audio]")
            elif ct == "real_time_user_audio_video_asset_pointer":
                out.append("[Audio/Video]")
            elif ct == "audio_transcription":
                t = p.get("text", "")
                if t:
                    out.append(f"[Transcription: {t}]")
                else:
                    out.append("[Audio-Transcription]")
            else:
                out.append(f"[{ct or 'unknown'}]")
    return "\n".join(s for s in out if s)


def _chatgpt_summarize_tool_use(content_type, parts):
    text_preview = _chatgpt_extract_text_from_parts(parts).replace("\n", " ").strip()[:120]
    if content_type == "code":
        return f"[Tool: python{' — ' + text_preview if text_preview else ''}]"
    if content_type == "execution_output":
        size = len(text_preview)
        return f"[Tool-Result: python · ~{size} chars preview]"
    if content_type in {"tether_browsing_display", "tether_quote"}:
        return f"[Tool: browsing{' — ' + text_preview if text_preview else ''}]"
    if content_type == "super_widget":
        return "[Tool: widget]"
    return f"[Tool: {content_type}]"


def _chatgpt_build_active_path(mapping, current_node_id):
    if not current_node_id or current_node_id not in mapping:
        return []
    path = []
    cur = current_node_id
    seen = set()
    while cur and cur not in seen:
        seen.add(cur)
        path.append(cur)
        node = mapping.get(cur, {})
        cur = node.get("parent")
    return list(reversed(path))


def _chatgpt_group_into_turns(mapping, path):
    turns = []
    current_turn = None
    for node_id in path:
        node = mapping.get(node_id, {})
        msg = node.get("message")
        if not msg:
            continue
        role = msg.get("author", {}).get("role", "")
        if role == _CHATGPT_SYSTEM_ROLE:
            continue
        content = msg.get("content") or {}
        ct = content.get("content_type", "")
        parts = content.get("parts", [])
        node_data = {
            "node_id": node_id,
            "msg": msg,
            "content_type": ct,
            "parts": parts,
        }
        if role == _CHATGPT_USER_ROLE:
            pallas_role = "human"
        elif role in (_CHATGPT_ASSISTANT_ROLE, _CHATGPT_TOOL_ROLE):
            pallas_role = "assistant"
        else:
            continue
        if current_turn and current_turn["role"] == pallas_role:
            current_turn["nodes"].append(node_data)
        else:
            current_turn = {"role": pallas_role, "nodes": [node_data]}
            turns.append(current_turn)
    return turns


def _chatgpt_render_turn(turn):
    text_parts = []
    thinking_parts = []
    has_tools = False
    for node in turn["nodes"]:
        ct = node["content_type"]
        parts = node["parts"]
        if ct in _CHATGPT_THINKING_CONTENT_TYPES:
            thinking_text = _chatgpt_extract_text_from_parts(parts)
            if thinking_text:
                thinking_parts.append(thinking_text)
        elif ct in _CHATGPT_TOOL_CONTENT_TYPES:
            text_parts.append(_chatgpt_summarize_tool_use(ct, parts))
            has_tools = True
        elif ct == "user_editable_context":
            ctx_text = _chatgpt_extract_text_from_parts(parts)
            if ctx_text:
                text_parts.append(f"[Context: {ctx_text[:200]}]")
        elif ct == "system_error":
            err_text = _chatgpt_extract_text_from_parts(parts)
            text_parts.append(f"[System-Error: {err_text[:200]}]")
        else:
            rendered = _chatgpt_extract_text_from_parts(parts)
            if rendered:
                text_parts.append(rendered)
    main_text = "\n\n".join(text_parts).strip()
    thinking_text = "\n\n".join(thinking_parts).strip() or None
    return main_text, thinking_text, has_tools


def _chatgpt_earliest_create_time(turn):
    times = []
    for node in turn["nodes"]:
        ct_val = node["msg"].get("create_time")
        if ct_val is not None:
            times.append(ct_val)
    if not times:
        return None
    return min(times)


def _chatgpt_attachments_from_turn(turn):
    out = []
    for node in turn["nodes"]:
        for p in node["parts"]:
            if isinstance(p, dict):
                ct = p.get("content_type", "")
                if ct in ("image_asset_pointer", "audio_asset_pointer",
                          "real_time_user_audio_video_asset_pointer"):
                    out.append({
                        "kind": "attachment",
                        "file_name": p.get("asset_pointer", "?"),
                        "asset_type": ct,
                        "metadata": {
                            k: p.get(k) for k in ("width", "height", "size_bytes")
                            if p.get(k) is not None
                        },
                    })
    return out


class ChatGPTExportParser:
    # Drop-in-kompatibel mit ClaudeExportParser/GeminiExportParser:
    # liefert list[ParsedConversation] aus OpenAI conversations-*.json.

    def __init__(self, source):
        self.source_path = Path(source)
        if not self.source_path.exists():
            raise FileNotFoundError(f"ChatGPT-Export nicht gefunden: {self.source_path}")
        self._last_skipped = 0
        self._last_skip_reasons = {}
        self._last_skip_reason = None

    def _list_json_files(self):
        if self.source_path.is_file():
            return [self.source_path]
        files = sorted(self.source_path.glob("conversations-*.json"))
        if not files:
            single = self.source_path / "conversations.json"
            if single.exists():
                return [single]
            raise FileNotFoundError(
                f"Keine conversations-*.json in {self.source_path}"
            )
        return files

    def parse_conversations(self):
        conversations = []
        skipped = 0
        skip_reasons = {}
        for json_file in self._list_json_files():
            with json_file.open(encoding="utf-8") as f:
                raw_list = json.load(f)
            for raw in raw_list:
                parsed = self._parse_one(raw)
                if parsed is None:
                    skipped += 1
                    reason = self._last_skip_reason or "unknown"
                    skip_reasons[reason] = skip_reasons.get(reason, 0) + 1
                else:
                    conversations.append(parsed)
        self._last_skipped = skipped
        self._last_skip_reasons = skip_reasons
        return conversations

    def _parse_one(self, raw):
        mapping = raw.get("mapping") or {}
        current_node = raw.get("current_node")
        if not mapping:
            self._last_skip_reason = "empty_mapping"
            return None
        path = _chatgpt_build_active_path(mapping, current_node)
        if not path:
            self._last_skip_reason = "no_active_path"
            return None
        turns = _chatgpt_group_into_turns(mapping, path)
        if not turns:
            self._last_skip_reason = "no_user_or_assistant_turns"
            return None
        external_uuid = raw.get("conversation_id") or raw.get("id")
        if not external_uuid:
            self._last_skip_reason = "no_conversation_id"
            return None
        created_ts = raw.get("create_time")
        updated_ts = raw.get("update_time") or created_ts
        if created_ts is None:
            for t in turns:
                ect = _chatgpt_earliest_create_time(t)
                if ect:
                    created_ts = ect
                    break
        if created_ts is None:
            self._last_skip_reason = "no_timestamps"
            return None
        if updated_ts is None:
            updated_ts = created_ts
        provider_created = datetime.fromtimestamp(created_ts)
        provider_updated = datetime.fromtimestamp(updated_ts)
        title = (raw.get("title") or "").strip() or None
        messages = []
        for turn in turns:
            text, thinking, has_tools = _chatgpt_render_turn(turn)
            attachments = _chatgpt_attachments_from_turn(turn)
            if not text and not thinking and not attachments:
                continue
            if not text and attachments:
                text = "[Attachment ohne Text]"
            ts = _chatgpt_earliest_create_time(turn) or created_ts
            msg_created = datetime.fromtimestamp(ts)
            first_node_id = turn["nodes"][0]["node_id"]
            parent_uuid = messages[-1].external_uuid if messages else None
            messages.append(ParsedMessage(
                external_uuid=first_node_id,
                parent_external_uuid=parent_uuid,
                role=turn["role"],
                turn_index=len(messages),
                text=text,
                thinking=thinking,
                has_tools=has_tools,
                raw_content=[
                    {"node_id": n["node_id"], "content_type": n["content_type"]}
                    for n in turn["nodes"]
                ],
                attachments_info=attachments,
                created_at=msg_created,
            ))
        if not messages:
            self._last_skip_reason = "all_turns_empty"
            return None
        return ParsedConversation(
            external_uuid=external_uuid,
            title=title,
            summary_from_provider=None,
            provider_created_at=provider_created,
            provider_updated_at=provider_updated,
            messages=messages,
        )
