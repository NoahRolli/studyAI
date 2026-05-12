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

from sqlalchemy.orm import Session

from backend.services.ai_service import chat_with_fallback, chat_with_tools_fallback
from backend.services.delphi_retrieval import RetrievalResult
from backend.services.delphi_tools import execute_tool
from backend.services.delphi_tool_schemas import TOOL_SCHEMAS

logger = logging.getLogger(__name__)


# ---------- Konstanten ----------
MAX_RESPONSE_TOKENS = 1500
MAX_HISTORY_MESSAGES = 10  # Letzte N Messages der Conversation als Kontext

# Source-Type-Labels fuer den Sources-Block. Vorher hart kodiert als
# binaeres "Notiz" oder "Zusammenfassung" — chat_message wurde dadurch
# faelschlich als Zusammenfassung gerendert. Lookup mit Fallback auf
# den raw source_type, falls kuenftig neue Typen dazukommen.
SOURCE_TYPE_LABELS = {
    "note": "Notiz",
    "summary": "Zusammenfassung",
    "chat_message": "Chat",
}


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
- Wenn du eine Information aus den unten gelieferten Pallas-Quellen verwendest, markiere sie mit [N] (nur die Zahl in eckigen Klammern, z.B. [1] oder [3]). Schreibe NIEMALS [SOURCE N] oder [Quelle N] in deiner Antwort — IMMER nur [N].
- Wenn du eine Aussage machst, die NICHT durch eine Pallas-Quelle gedeckt ist (z.B. allgemeines Wissen, deine eigene Einschaetzung), markiere sie mit [!].
- Erfinde KEINE Citations. Nur tatsaechlich vorhandene SOURCE-Nummern verwenden.
- Wenn du etwas nicht weisst, sag es offen statt zu raten.

QUELLEN-FORMAT:
- Quellen sind im Format `[Typ \u00b7 YYYY-MM-DD] Titel` formatiert (z.B. `[Chat \u00b7 2024-04-15]`).
- Das Datum gibt an wann die Quelle erstellt wurde. Nutze es fuer Fragen nach
  Zeitablaeufen, Reihenfolge oder "wie lange schon".
- Typen: Chat (LLM-Konversation), Notiz, Zusammenfassung.

WERKZEUGE (falls verfuegbar):
- Bei Fragen nach Zeit, Reihenfolgen oder Anzahl rufe ein Werkzeug auf
  statt nur die Quellen-Snippets zu lesen. Werkzeuge geben dir aggregierte
  Daten ueber alle Pallas-Eintraege hinweg.
- Bei reinen Wissensfragen brauchst du keine Werkzeuge. Nutze sie
  zielgerichtet — pro Antwort hoechstens 2-3 Aufrufe.
- Wenn keine Werkzeuge angeboten werden, antworte aus den Quellen heraus.

WERKZEUG-AUSWAHL (wichtig — falsches Werkzeug = unbrauchbares Resultat):
- "wann begann X" / "wie lange arbeite ich an X" / "was kam zuerst, X
  oder Y" -> get_topic_timeline (bei Vergleich zweimal aufrufen).
- "was sind die fruehesten Erwaehnungen von X" -> list_oldest_sources.
- "wie viele Eintraege habe ich im Zeitraum Z" (KEIN Topic, nur Zeit)
  -> count_sources_per_period. Dieses Werkzeug kennt kein Thema —
  rufe es NIEMALS fuer 'wie lange arbeite ich an X' auf.

WERKZEUG-ANTWORTEN LESEN:
- Die erste Zeile jeder Werkzeug-Antwort meldet den Modus:
  - "Cluster '<Label>' (centroid-sim X.XX, N Concepts)" -> thematisch
    gefiltert, Treffer sind enger.
  - "kein klarer Cluster gefunden -> Fallback" -> breitere Embedding-
    Suche, Treffer koennen mehrdeutig sein.
- get_topic_timeline liefert ein Histogramm pro Monat. Achte auf
  Burst-Pattern statt auf das frueheste Datum: wenn 2025-11 nur 1
  Eintrag hat und 2026-04 plötzlich 99, fing der Diskurs in 2026-04 an
  und der frühe Eintrag ist Rauschen aus anderem Kontext.
- list_oldest_sources zeigt Titel — pruefe sie auf Plausibilitaet.
  Ein Titel wie "Python Code Excel Zusammenfassung" ist offensichtlich
  nicht ueber das Pallas-Projekt, auch wenn der Begriff darin auftaucht.
- Eine fruehe Einzel-Erwaehnung sagt nichts ueber den Topic-Beginn,
  besonders bei mehrdeutigen Begriffen ('Metis' = Pallas-Modul oder
  griechische Goettin). Wenn die Daten unplausibel scheinen, sag
  offen dass der Tool-Output mehrdeutige Treffer enthaelt — erfinde
  KEINE Praezision."""

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


def _date_context() -> str:
    """Aktuelles Datum + Wochenanker fuer den System-Prompt.

    Wird dynamisch zur Anfrage-Zeit berechnet (kein Modul-Konstant) damit
    der LLM auch nach Server-Restart-langen Sessions korrekte Anker hat.
    Macht Fragen wie "diese Woche", "letzten Monat", "gestern" aufloesbar
    ohne dass der User Datum nennen muss.
    """
    from datetime import datetime, timedelta
    WD = ["Montag", "Dienstag", "Mittwoch", "Donnerstag",
          "Freitag", "Samstag", "Sonntag"]
    today = datetime.now()
    wd = today.weekday()  # 0=Mo, 6=So
    monday = today - timedelta(days=wd)
    sunday = monday + timedelta(days=6)
    next_mon = monday + timedelta(days=7)
    next_sun = monday + timedelta(days=13)
    last_mon = monday - timedelta(days=7)
    last_sun = monday - timedelta(days=1)
    fmt = lambda d: d.strftime("%Y-%m-%d")
    iso_year, iso_week, _ = today.isocalendar()
    return (
        "\n\n## ZEITKONTEXT (heute)\n"
        f"- Heute: {WD[wd]}, {fmt(today)} (Kalenderwoche {iso_week})\n"
        f"- Gestern: {fmt(today - timedelta(days=1))}\n"
        f"- Morgen: {fmt(today + timedelta(days=1))}\n"
        f"- Diese Woche: {fmt(monday)} bis {fmt(sunday)}\n"
        f"- Naechste Woche: {fmt(next_mon)} bis {fmt(next_sun)}\n"
        f"- Letzte Woche: {fmt(last_mon)} bis {fmt(last_sun)}\n"
        f"- Dieser Monat: {today.strftime('%Y-%m')}\n"
        "Bei Fragen wie 'diese Woche', 'naechste Woche', 'gestern', 'morgen', "
        "'letzten Monat' nutze diese Daten direkt — frage den User NICHT "
        "nach Datums-Klaerung."
    )


def _system_prompt_for(confidence: str) -> str:
    if confidence == "high":
        base = _PROMPT_HIGH
    elif confidence == "medium":
        base = _PROMPT_MEDIUM
    else:
        base = _PROMPT_LOW
    return base + _date_context()


# ---------- Sources-Block ----------
def _build_sources_block(retrieval: RetrievalResult) -> str:
    """Markdown-formatierter Sources-Block fuer den LLM-Prompt.

    Returns leerer String wenn keine Sources UND keine matched_concepts.
    """
    blocks: list[str] = []

    if retrieval.sources:
        lines = ["## Pallas-Quellen fuer deine Antwort:"]
        for idx, src in enumerate(retrieval.sources, start=1):
            stype = SOURCE_TYPE_LABELS.get(src.source_type, src.source_type)
            # Datum im Header gibt dem LLM Zeit-Kontext fuer Fragen wie
            # "wie lange arbeite ich schon an X" oder "was war zuerst".
            # ISO-Format weil LLMs das am robustesten parsen und sortieren.
            if src.created_at:
                date_str = src.created_at.strftime("%Y-%m-%d")
                header = f"[{stype} \u00b7 {date_str}] {src.title}"
            else:
                header = f"[{stype}] {src.title}"
            preview = (src.preview_text or "").strip()
            if not preview:
                preview = "(keine Vorschau verfuegbar)"
            lines.append(f"\n### Quelle {idx}: {header}\n{preview}")
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
_CITE_RE = re.compile(r"\[(?:SOURCE|Source|Quelle|QUELLE)?\s*(\d+)\]", re.IGNORECASE)
_UNVERIFIED_RE = re.compile(r"\[!\]")


def _extract_markers(answer: str) -> tuple[list[int], bool]:
    """Liest [N]-Citations und [!]-Marker aus der LLM-Antwort.

    Returns (cited_indices, has_unverified). cited_indices ist deduped + sorted.
    """
    cited = sorted({int(m) for m in _CITE_RE.findall(answer)})
    has_unverified = bool(_UNVERIFIED_RE.search(answer))
    return cited, has_unverified


# ---------- Tool-Use-Pfad ----------
async def _chat_with_tools_path(
    user_prompt: str,
    system_prompt: str,
    db: Session,
) -> tuple[str, str]:
    """Tool-Use-Aufruf via ai_service.chat_with_tools_fallback.

    Wrappt execute_tool in eine Closure, die die DB-Session injiziert.
    Der LLM sieht die DB nicht — nur die Tool-Args aus dem Schema.

    Returns (answer, provider_name). Provider kann "groq" sein (mit Tools)
    oder ein Ollama-Provider (ohne Tools, Fallback-Pfad).
    """
    async def _tool_executor(name: str, args: dict) -> str:
        return await execute_tool(name, args, db)

    return await chat_with_tools_fallback(
        prompt=user_prompt,
        system=system_prompt,
        tools=TOOL_SCHEMAS,
        tool_executor=_tool_executor,
        max_tokens=MAX_RESPONSE_TOKENS,
    )


# ---------- Hauptinterface ----------
async def generate_delphi_response(
    user_query: str,
    retrieval: RetrievalResult,
    db: Session,
    conversation_history: list[dict] | None = None,
) -> ProviderResponse:
    """Generiert eine Delphi-Antwort mit Citation-Markern.

    Nutzt ai_service.chat_with_fallback() — Auto-Failover Groq -> Ollama.
    Confidence-Tier steuert System-Prompt-Variante.
    """
    history = conversation_history or []

    system_prompt = _system_prompt_for(retrieval.confidence)
    user_prompt = _build_full_prompt(user_query, retrieval, history)

    # Routing: Tools nur bei Groq + medium/low Confidence sinnvoll.
    # Bei high-Confidence sind die RAG-Sources stark, Tools waeren nur Latenz.
    # Bei Ollama-Fallback (Groq down) gibt's keine Tools — chat_with_tools_fallback
    # macht die Pre-Check-Logik selbst und faellt ggf. auf chat_with_fallback zurueck.
    if retrieval.confidence != "high":
        answer, provider_name = await _chat_with_tools_path(
            user_prompt=user_prompt,
            system_prompt=system_prompt,
            db=db,
        )
    else:
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
