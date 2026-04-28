"""
Delphi Provider-Layer — Prompt-Building + LLM-Aufruf + Citation-Extraction.

Architektur:
- Wir nutzen ai_service.chat_with_fallback() fuer das Provider-Routing
  (Groq -> Ollama-Server -> Ollama-Local). Kein eigenes Routing.
- Confidence-Tier steuert die System-Prompt-Variante:
  high   = mit Citations [N] aus Sources antworten
  medium = mit Citations soweit moeglich, [!] fuer Aussagen ohne Quelle
  low    = ehrlich sagen dass keine Pallas-Quellen passen, optional
           generelles Wissen mit [!] markieren

Citation-Format in der Antwort (Konvention an den LLM):
  [1], [2], ...   Verweis auf SOURCE 1, 2, ... aus dem Prompt
  [!]             markiert Aussagen die nicht durch Sources gedeckt sind
"""

import re
import logging
from dataclasses import dataclass

from backend.services.ai_service import chat_with_fallback
from backend.services.delphi_retrieval import RetrievalResult

logger = logging.getLogger(__name__)


# ---------- Konstanten ----------
MAX_RESPONSE_TOKENS = 1500
MAX_HISTORY_MESSAGES = 10  # Letzte N Messages der Conversation als Kontext


# ---------- Result-Type ----------
@dataclass
class ProviderResponse:
    answer: str                   # Roher LLM-Output, [N] und [!] noch drin
    provider: str                 # "groq" | "ollama_server" | "ollama_local"
    model: str                    # Deskriptiver Name (Provider liefert nicht zurueck)
    cited_indices: list[int]      # [1, 3, 5] = welche Sources der LLM zitiert hat
    has_unverified_claims: bool   # War [!] in der Antwort?


# ---------- System-Prompts pro Confidence-Tier ----------
_BASE_RULES = """Du bist Delphi, der Wissens-Assistent von Pallas (Noahs persoenlichem Wissenssystem).
Du antwortest praezise, freundlich und auf Deutsch.

ZITIER-REGELN (sehr wichtig):
- Wenn du eine Information aus den unten gelieferten Pallas-Quellen verwendest, markiere sie mit [N], wobei N die SOURCE-Nummer ist.
- Wenn du eine Aussage machst, die NICHT durch eine Pallas-Quelle gedeckt ist (z.B. allgemeines Wissen, deine eigene Einschaetzung), markiere sie mit [!].
- Erfinde KEINE Citations. Nur tatsaechlich vorhandene SOURCE-Nummern verwenden.
- Wenn du etwas nicht weisst, sag es offen statt zu raten."""

_PROMPT_HIGH = _BASE_RULES + """

Die Pallas-Quellen unten sind sehr relevant fuer die Frage. Stuetze deine Antwort
primaer auf diese Quellen und zitiere sie mit [N]."""

_PROMPT_MEDIUM = _BASE_RULES + """

Die Pallas-Quellen unten sind nur teilweise relevant. Nutze sie wo moeglich mit [N],
und ergaenze nur wenn noetig mit allgemeinem Wissen, das du dann mit [!] markierst.
Wenn die Quellen die Frage nicht ausreichend beantworten, sag das ehrlich."""

_PROMPT_LOW = _BASE_RULES + """

Es gibt keine ausreichend relevanten Pallas-Quellen fuer diese Frage. Antworte ehrlich,
dass du dazu in Noahs Wissen nichts findest. Wenn du aus allgemeinem Wissen antworten
kannst, mache das, aber markiere ALLE Aussagen mit [!]."""


def _system_prompt_for(confidence: str) -> str:
    if confidence == "high":
        return _PROMPT_HIGH
    if confidence == "medium":
        return _PROMPT_MEDIUM
    return _PROMPT_LOW


# ---------- Sources-Block ----------
def _build_sources_block(retrieval: RetrievalResult) -> str:
    """Markdown-formatierter Sources-Block fuer den LLM-Prompt.

    Returns leerer String wenn keine Sources UND keine matched_concepts.
    """
    blocks: list[str] = []

    if retrieval.sources:
        lines = ["## Pallas-Quellen fuer deine Antwort:"]
        for idx, src in enumerate(retrieval.sources, start=1):
            stype = "Notiz" if src.source_type == "note" else "Zusammenfassung"
            preview = (src.preview_text or "").strip()
            if not preview:
                preview = "(keine Vorschau verfuegbar)"
            lines.append(
                f"\n[SOURCE {idx}] ({stype}) {src.title}\n{preview}"
            )
        blocks.append("\n".join(lines))

    # Matched-Concepts ohne Sources: nur dann eigener Block, wenn es ueberhaupt
    # Concepts gibt UND wir vom hoechsten Concept-Score 0.5 ueberschreiten
    # (sonst wird Noise mitgeschickt der den LLM verwirrt).
    concept_only = [
        c for c in retrieval.matched_concepts
        if c.similarity_score >= 0.5
    ][:5]
    if concept_only and not retrieval.sources:
        names = ", ".join(c.concept_name for c in concept_only)
        blocks.append(
            "## Konzepte aus Pallas (ohne ausfuehrliche Notizen):\n"
            f"{names}\n"
            "(Diese Konzepte sind in deinem Wissen referenziert, aber keine Notiz "
            "oder Zusammenfassung deckt das Thema ausfuehrlich ab.)"
        )

    return "\n\n".join(blocks) if blocks else ""


# ---------- Conversation-History ----------
def _format_history(history: list[dict]) -> str:
    """Letzte N Messages als simple Text-History formatieren."""
    if not history:
        return ""
    recent = history[-MAX_HISTORY_MESSAGES:]
    lines = ["## Bisheriger Gespraechsverlauf:"]
    for msg in recent:
        role = msg.get("role", "user")
        content = (msg.get("content") or "").strip()
        if not content:
            continue
        prefix = "Noah" if role == "user" else "Delphi"
        lines.append(f"{prefix}: {content}")
    return "\n".join(lines)


# ---------- Prompt-Builder ----------
def _build_full_prompt(
    user_query: str,
    retrieval: RetrievalResult,
    history: list[dict],
) -> str:
    """Baut den vollstaendigen User-Prompt zusammen.

    System-Prompt geht separat (ueber chat_with_fallback's system-Param).
    """
    parts: list[str] = []

    sources_block = _build_sources_block(retrieval)
    if sources_block:
        parts.append(sources_block)

    history_block = _format_history(history)
    if history_block:
        parts.append(history_block)

    parts.append(f"## Aktuelle Frage von Noah:\n{user_query}")
    parts.append("Antworte direkt, ohne Wiederholung der Frage.")

    return "\n\n".join(parts)


# ---------- Marker-Extraction ----------
_CITE_RE = re.compile(r"\[(\d+)\]")
_UNVERIFIED_RE = re.compile(r"\[!\]")


def _extract_markers(answer: str) -> tuple[list[int], bool]:
    """Liest [N]-Citations und [!]-Marker aus der LLM-Antwort.

    Returns (cited_indices, has_unverified). cited_indices ist deduped + sorted.
    """
    cited = sorted({int(m) for m in _CITE_RE.findall(answer)})
    has_unverified = bool(_UNVERIFIED_RE.search(answer))
    return cited, has_unverified


# ---------- Hauptinterface ----------
async def generate_delphi_response(
    user_query: str,
    retrieval: RetrievalResult,
    conversation_history: list[dict] | None = None,
) -> ProviderResponse:
    """Generiert eine Delphi-Antwort mit Citation-Markern.

    Nutzt ai_service.chat_with_fallback() — Auto-Failover Groq -> Ollama.
    Confidence-Tier steuert System-Prompt-Variante.
    """
    history = conversation_history or []

    system_prompt = _system_prompt_for(retrieval.confidence)
    user_prompt = _build_full_prompt(user_query, retrieval, history)

    answer, provider_name = await chat_with_fallback(
        prompt=user_prompt,
        system=system_prompt,
        max_tokens=MAX_RESPONSE_TOKENS,
    )

    cited, has_unverified = _extract_markers(answer)

    # Model-Name ist nicht im chat_with_fallback Returnwert — wir deriven
    # ihn aus dem Provider-Namen fuers UI/DB. Nicht 100% exakt aber gut genug.
    model_label = {
        "groq": "llama-3.3-70b-versatile",
        "ollama_server": "gemma4:e2b (server)",
        "ollama_local": "gemma4:e2b (local)",
    }.get(provider_name, provider_name)

    logger.info(
        f"Delphi-Response: provider={provider_name}, "
        f"confidence={retrieval.confidence}, "
        f"cited={cited}, unverified={has_unverified}"
    )

    return ProviderResponse(
        answer=answer,
        provider=provider_name,
        model=model_label,
        cited_indices=cited,
        has_unverified_claims=has_unverified,
    )
