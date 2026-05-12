# Concepts Cluster Helpers — Prompt-Bau, Response-Parsing, Name-Lookup
#
# Coverage-Garantie (Chat 73):
# - _build_prompt: Verschaerfte Constraints, "every input must appear"
# - _parse_batch_response: Toleranter Lookup + Missing-Detection fuer
#   Misc-Cluster-Fallback
# - _normalize_name: Robuster Vergleichs-Schluessel (lowercase+strip)
#
# Isoliert von SSE-Streaming damit testbar ohne FastAPI-Setup.

import json


def _normalize_name(s: str) -> str:
    """Robuster Lookup-Schluessel: lowercase + strip + Mehrfach-Whitespace zu einem."""
    return " ".join(str(s).lower().strip().split())


def _build_prompt(folder_hint: str, batch: list[str]) -> str:
    """Verschaerfter Cluster-Prompt mit Coverage-Constraint.

    Erzwingt:
    - alle Inputs muessen im Output erscheinen
    - Konzept-Namen exakt aus der Liste, keine Umformulierungen
    - Mindestens 2 Members pro Cluster, sonst in _Misc_ packen
    """
    folder_ctx = ""
    if folder_hint:
        folder_ctx = (
            f"All concepts below come from the topic area '{folder_hint}'. "
            "Use this as semantic context to find meaningful sub-groups.\n\n"
        )
    n = len(batch)
    return (
        f"You are clustering {n} concepts into thematic groups.\n\n"
        "STRICT RULES — follow exactly:\n"
        f"1. EVERY one of the {n} input concepts MUST appear in exactly one "
        "cluster in the output. Do not omit any concept.\n"
        "2. Use concept names EXACTLY as written in the input list "
        "(same spelling, same case, same punctuation). Do not rephrase, "
        "translate, pluralize, or combine names.\n"
        "3. Each cluster needs at least 2 members. Group truly isolated "
        "concepts into a cluster labeled '_Misc' (they will be handled separately).\n"
        "4. Give each cluster a short descriptive English label (1-4 words).\n"
        "5. Aim for cohesive, semantically tight clusters. Better to have many "
        "small clusters than a few huge mixed ones.\n\n"
        "Return ONLY a JSON array. No prose, no markdown fences, no explanation.\n"
        "Format: [{\"label\": \"...\", \"members\": [\"...\", \"...\"]}, ...]\n"
        "Example: [{\"label\": \"Ethics\", \"members\": [\"autonomy\", \"privacy\"]}, "
        "{\"label\": \"_Misc\", \"members\": [\"unrelated_term\"]}]\n\n"
        f"{folder_ctx}"
        f"Concepts ({n} total): {json.dumps(batch)}"
    )


def _parse_batch_response(
    parsed,
    batch_input: list[str],
    name_to_id: dict,
) -> tuple[dict[str, list[str]], list[str]]:
    """Wertet LLM-Antwort fuer einen Batch aus.

    Returns:
        (cluster_dict, missing_names)
        - cluster_dict: label_lower -> [canonical_concept_name, ...]
        - missing_names: Input-Concepts die der LLM nicht zugeordnet hat
          (fuer Misc-Cluster-Fallback)
    """
    # Lookup-Index: normalisierter Name -> canonical name aus name_to_id
    # (name_to_id-Keys sind die canonical Concept-Namen aus DB)
    norm_to_canonical = {_normalize_name(n): n for n in name_to_id.keys()}

    # Set der Input-Concepts (normalisiert) — verhindert dass LLM
    # halluzinierte Namen oder Carry-Over zwischen Batches durchkommen
    batch_norm_set = {_normalize_name(b) for b in batch_input}

    batch_clusters: dict[str, list[str]] = {}
    assigned_norm: set[str] = set()

    if isinstance(parsed, list):
        for item in parsed:
            if not isinstance(item, dict):
                continue
            label = str(item.get("label", "")).strip()
            members = item.get("members", [])
            if not label or not isinstance(members, list):
                continue
            label_lower = label.lower()

            for m in members:
                m_norm = _normalize_name(m)
                # Nur Concepts aus DIESEM Batch akzeptieren
                if m_norm not in batch_norm_set:
                    continue
                canonical = norm_to_canonical.get(m_norm)
                if canonical is None:
                    continue
                # Doppel-Zuordnung verhindern: erste Zuordnung gewinnt
                if m_norm in assigned_norm:
                    continue
                assigned_norm.add(m_norm)

                if label_lower not in batch_clusters:
                    batch_clusters[label_lower] = []
                batch_clusters[label_lower].append(canonical)

    # Fehlende Inputs ermitteln
    missing: list[str] = []
    for orig in batch_input:
        orig_norm = _normalize_name(orig)
        if orig_norm not in assigned_norm:
            canonical = norm_to_canonical.get(orig_norm)
            if canonical is not None:
                missing.append(canonical)

    return batch_clusters, missing
