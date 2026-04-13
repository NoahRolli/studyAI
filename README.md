# Pallas

AI-native personal knowledge management system — a Second Brain.
Parses documents (PDF, Word, PowerPoint, Excel, images via OCR, Markdown), generates smart summaries, extracts concepts into a 3D knowledge graph (Metis), manages ontological relations, and includes a fully encrypted journal with mood tracking, fuzzy logic insights, and medication tracking. All AI features run locally via Ollama or optionally via Groq Cloud.

**Work in Progress — Solo Project**

---

## Tech Stack

| Component | Technology |
|---|---|
| Backend | Python 3.14 · FastAPI · SQLAlchemy · SQLite |
| Frontend | React · TypeScript · Vite 7 · Tailwind CSS v4 |
| Knowledge Graph | Three.js · @react-three/fiber (3D Sphere) · ReactFlow (2D Ego-Graph) |
| Rich Text | TipTap (WikiLinks, Tasks, Markdown) |
| Charts | Recharts (Mood timeline) |
| AI (Study) | Ollama (local) · Groq Cloud (llama-3.3-70b) · Claude API — switchable with auto-fallback |
| AI (Journal) | Ollama only — local, private, no external API |
| Parsing | PyMuPDF · python-docx · python-pptx · openpyxl · Tesseract OCR |
| Encryption | AES-256-GCM · Argon2id |
| Server | Docker · Ubuntu 24.04 · LUKS-encrypted storage · WireGuard |
| Docs | Sphinx · Furo theme · GitHub Pages |

---

## Modules

### Archiv
File management with folders, document upload (7 formats), AI-generated summaries with key terms, PDF preview. Folders can be toggled for Metis visibility (eye icon). Summary editor with TipTap, WikiLinks, and auto-save.

### Journal
Fully encrypted diary (AES-256-GCM, separate SQLite DB). Auto-generated titles, inline editing, mood analysis via Ollama with fuzzy logic membership functions. Topic clustering, storyline detection, medication tracker with dose history and intake notes. Auto-lock on inactivity, tab switch, or navigation.

### Calendar
Event management with recurring events, color coding, agenda view. Sport tracker integration (duration, intensity, type). GitHub commit tracking with purple dots. Planned: work-hours tracking, weather/moon phases.

### Notes
Flat structure (no folders — Metis handles organization). TipTap rich text with WikiLinks (`[[Title]]` — auto-creates notes), backlinks panel, quick-switcher (Cmd+K), pinned notes. AI panel: summarize, related notes, link suggestions via Ollama. Checkbox auto-sort with collapse.

### Metis (Second Brain)
3D knowledge sphere — concepts as nodes, not files. Hybrid keyword extraction (summary key terms + Ollama). Auto-linking, auto-clustering. Two instances: public (top-level) and encrypted (inside Journal). Three.js sphere with quaternion trackball rotation, hierarchical folder layout, cluster nebula particles, ontology edge markers. Visual settings panel (9 controls). Edge colors toggle.

### Ontology
Knowledge structure management. Four tabs: Overview (confirmed relations), Suggestions (AI-generated, confirm/reject), Metis Links (pending), Graph (ReactFlow ego-view). Unified edge system. Learning loop (rejected relations as negative examples). Transitive inference.

### Delphi (Planned)
Knowledge chat — ask questions, get answers from all collected knowledge across modules.

---

## AI Architecture

Three-tier provider system with automatic fallback:

1. **Ollama Local** (MacBook, gemma4:e2b) — always available
2. **Ollama Server** (Olymp, gemma4:e4b) — switchable
3. **Groq Cloud** (llama-3.3-70b-versatile) — default for non-journal tasks

Auto-fallback: Groq 429 rate limit → Ollama Server → Ollama Local. Global provider switch + per-page overrides. Model badges on all AI-generated content.

**Journal AI is strictly Ollama-only** — never routed to cloud providers, enforced at code level.

---

## Fuzzy Logic

Mood scores (-1.0 to 1.0) are translated into fuzzy membership sets:

- sehr_schlecht / schlecht / neutral / gut / sehr_gut
- Overlapping trapezoid functions (no hard boundaries)
- Used in Journal Insights for natural correlations
- AI summary prompts receive fuzzy distributions instead of raw numbers

---

## Infrastructure

| Component | Detail |
|---|---|
| Server | Olymp (Lenovo M920q, Ubuntu 24.04, 15GB RAM) |
| Container | Docker, port 8001, network_mode: host |
| Storage | LUKS-encrypted Samsung T7 (Tresor) |
| VPN | WireGuard (Aigis gateway) |
| Auth | /etc/olymp/auth.json |
| Backup | Automated every 3h via cron |
| Docs | Auto-deploy via GitHub Actions |
| CI | Ruff linting |

---

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 20+
- [Ollama](https://ollama.ai) (required for AI features)
- Optional: [Tesseract](https://github.com/tesseract-ocr/tesseract) (for OCR)

### Backend
```bash
git clone https://github.com/NoahRolli/pallas.git
cd pallas
python3 -m venv .venv
source .venv/bin/activate
pip3 install -r backend/requirements.txt
uvicorn backend.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Deploy to Server
```bash
bash deploy.sh
```

---

## Documentation

[https://noahrolli.github.io/pallas/](https://noahrolli.github.io/pallas/)

---

## License

MIT
