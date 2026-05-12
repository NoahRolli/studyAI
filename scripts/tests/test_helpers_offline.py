"""Offline-Tests fuer _parse_batch_response — Edge-Cases ohne LLM."""
import sys
sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parents[2] / 'backend' / 'api'))
from concepts_cluster_helpers import _parse_batch_response, _normalize_name


def test(name, expected_clusters, expected_missing, parsed, batch, name_to_id):
    clusters, missing = _parse_batch_response(parsed, batch, name_to_id)
    ok = clusters == expected_clusters and sorted(missing) == sorted(expected_missing)
    status = "OK " if ok else "FAIL"
    print(f"  [{status}] {name}")
    if not ok:
        print(f"    expected_clusters: {expected_clusters}")
        print(f"    got_clusters:      {clusters}")
        print(f"    expected_missing:  {expected_missing}")
        print(f"    got_missing:       {missing}")
    return ok


print("=== _parse_batch_response Tests ===\n")
results = []

# Test 1: Happy Path
results.append(test(
    "1) Happy path: all assigned",
    {"ethics": ["autonomy", "privacy"], "tech": ["docker", "fastapi"]},
    [],
    parsed=[
        {"label": "Ethics", "members": ["autonomy", "privacy"]},
        {"label": "Tech", "members": ["docker", "fastapi"]},
    ],
    batch=["autonomy", "privacy", "docker", "fastapi"],
    name_to_id={"autonomy": 1, "privacy": 2, "docker": 3, "fastapi": 4},
))

# Test 2: LLM dropt eines silent
results.append(test(
    "2) LLM dropt 'fastapi' silent",
    {"ethics": ["autonomy", "privacy"], "tech": ["docker"]},
    ["fastapi"],
    parsed=[
        {"label": "Ethics", "members": ["autonomy", "privacy"]},
        {"label": "Tech", "members": ["docker"]},
    ],
    batch=["autonomy", "privacy", "docker", "fastapi"],
    name_to_id={"autonomy": 1, "privacy": 2, "docker": 3, "fastapi": 4},
))

# Test 3: LLM halluziniert nicht-existentes Concept
results.append(test(
    "3) LLM halluziniert 'transcendence' (nicht in name_to_id)",
    {"ethics": ["autonomy"]},
    ["privacy"],
    parsed=[
        {"label": "Ethics", "members": ["autonomy", "transcendence"]},
        {"label": "Other", "members": ["transcendence"]},
    ],
    batch=["autonomy", "privacy"],
    name_to_id={"autonomy": 1, "privacy": 2},
))

# Test 4: LLM nutzt anderen Batch-Concept (Carry-Over)
results.append(test(
    "4) LLM mischt Concept aus anderem Batch rein",
    {"ethics": ["autonomy"]},
    ["privacy"],
    parsed=[
        {"label": "Ethics", "members": ["autonomy", "docker"]},  # docker nicht im Batch
    ],
    batch=["autonomy", "privacy"],
    name_to_id={"autonomy": 1, "privacy": 2, "docker": 3},
))

# Test 5: Doppel-Zuordnung — erste gewinnt, zweiter Cluster bleibt leer und wird nicht angelegt
results.append(test(
    "5) LLM packt 'autonomy' in zwei Cluster — erste gewinnt, leerer Cluster verworfen",
    {"ethics": ["autonomy"]},
    ["privacy"],
    parsed=[
        {"label": "Ethics", "members": ["autonomy"]},
        {"label": "AI", "members": ["autonomy"]},
    ],
    batch=["autonomy", "privacy"],
    name_to_id={"autonomy": 1, "privacy": 2},
))

# Test 6: Case-Insensitive Match
results.append(test(
    "6) Case-Insensitive: 'PRIVACY' matcht 'privacy'",
    {"ethics": ["autonomy", "privacy"]},
    [],
    parsed=[
        {"label": "Ethics", "members": ["AUTONOMY", "PRIVACY"]},
    ],
    batch=["autonomy", "privacy"],
    name_to_id={"autonomy": 1, "privacy": 2},
))

# Test 7: Whitespace-Tolerant
results.append(test(
    "7) Whitespace: 'fast api' matcht 'fast api' (mehrfach-spaces)",
    {"tech": ["fast api"]},
    [],
    parsed=[
        {"label": "Tech", "members": ["  fast  api  "]},
    ],
    batch=["fast api"],
    name_to_id={"fast api": 1},
))

# Test 8: Leerer Response
results.append(test(
    "8) Leerer Response — alle missing",
    {},
    ["a", "b", "c"],
    parsed=[],
    batch=["a", "b", "c"],
    name_to_id={"a": 1, "b": 2, "c": 3},
))

# Test 9: None-Response (Parse fehlgeschlagen)
results.append(test(
    "9) None statt Liste — alle missing",
    {},
    ["a"],
    parsed=None,
    batch=["a"],
    name_to_id={"a": 1},
))

# Test 10: Misc-Label normal behandeln (Routing nach Stream-Loop)
results.append(test(
    "10) _Misc-Label wird zurueckgegeben (Routing macht Stream)",
    {"_misc": ["a"]},
    [],  # a ist assigned (Stream routet es dann zu folder_misc)
    parsed=[
        {"label": "_Misc", "members": ["a"]},
    ],
    batch=["a"],
    name_to_id={"a": 1},
))

print(f"\n=== {sum(results)}/{len(results)} passed ===")
print("Normalize-Smoke:")
print(f"  '_normalize_name(\"  Foo  BAR  \")' = '{_normalize_name('  Foo  BAR  ')}'")
print(f"  '_normalize_name(\"Pallas\")'       = '{_normalize_name('Pallas')}'")
