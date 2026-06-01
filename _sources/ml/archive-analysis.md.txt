# Archive Analysis — ML Phase 1

Phase 1 is an unsupervised, exploratory analysis of the personal knowledge archive: roughly 1,254 documents (chat exports, notes, handoffs) accumulated in the LLM archive. The goal is to understand the *structure* of that archive — to discover its natural topics, label them, and find the documents that sit between topics and connect them. There is no API endpoint, no frontend, and no 3D visualisation here: those belong to later phases. Phase 1 is purely "understand the data, end to end."

The pipeline lives in `backend/ml/archive_analysis/` and runs against a dedicated, exploratory database (`data/ml_phase1.db`), so the production `pallas.db` is never touched.

## Pipeline

| Step | Script | Purpose |
|---|---|---|
| 0 | `inspect_data.py` | Survey the raw archive (counts, length distribution, languages) |
| 1 | `preprocess.py` | Normalise and clean document text |
| 2 | `chunk.py` | Split documents into overlapping chunks (1500/150) |
| 3 | `embed.py` | Embed chunks with bge-m3 (1024-dim, multilingual) |
| 4.5 | `topic_extract.py` | Distil a 1–2 sentence English topic summary per document (gemma4:e2b) |
| 4.6 | `topic_embed.py` | Embed each topic summary with bge-m3 |
| 4 | `cluster_topics.py` | Cluster the topic embeddings (mean-centered average-link) |
| 5 | `cluster_label.py` | Label each cluster in 2–4 words (gemma4:e2b) |
| 6 | `bridge_docs.py` | Per-document silhouette and thematic bridge detection |

The step numbering reflects the order in which the stages were *added*, not a strict 0→6 sequence. Steps 4.5 and 4.6 (topic distillation and re-embedding) were inserted ahead of the clustering step (4) after the first clustering attempt failed — see the diagnosis below.

Each script is invokable as a module and writes an audit row to the `pipeline_runs` table:

```bash
python -m backend.ml.archive_analysis.cluster_topics --ml-db data/ml_phase1.db --pallas-db data/pallas-snapshot.db --k 100
python -m backend.ml.archive_analysis.cluster_label  --ml-db data/ml_phase1.db
python -m backend.ml.archive_analysis.bridge_docs    --ml-db data/ml_phase1.db --top 20
```

## The diagnosis: why the first approach failed

The first design was the obvious one: embed every chunk, mean-pool the chunk vectors into one vector per document, then cluster. The result was pathological — **969 of 1,254 documents landed in a single mega-cluster.**

The first hypothesis was that bge-m3 was encoding the *chat format* (the recurring conversational structure of the exported chats) more strongly than the actual topic content, so every long multi-turn document looked alike. That hypothesis was partly right but, as it turned out, **not the real cause.**

**Fix attempt — topic summaries.** Rather than swap the embedding model (an 11-hour re-embedding gamble), the *representation* was swapped: an LLM (gemma4:e2b) distils each document into a dense 1–2 sentence English topic summary, and those summaries are embedded and clustered instead of the raw text. The summaries were clean and topic-dense — yet the first clustering run on them *still* placed 899 of 1,254 documents in the largest cluster at k=50, only marginally better than before.

**Measure, do not guess.** Instead of trusting the format hypothesis, four clustering configurations were run on the same topic vectors, comparing the largest-cluster size at k=50:

| Configuration | Largest cluster (k=50) |
|---|---|
| average-link · cosine · raw | 899 |
| average-link · cosine · **mean-centered** | **118** |
| complete-link · cosine · raw | 137 |
| ward · euclidean (L2-norm) | 55 |

The cosine-similarity floor was measured too: mean 0.543, p10 0.454, p90 0.635 — a moderate, well-spread distribution. If a shared "register" (a recurring boilerplate phrasing) had been the cause, p10 would sit close to the mean. It did not.

**Root cause.** The problem was **average-link chaining amplified by a single dominant shared component** in the embedding space — not the chat format, and not uniform summaries. Mean-centering (`X = X - X.mean(0)`) projects out that common direction, and the chaining collapses: 899 → 118 at the same k.

The two fixes were complementary, not redundant. The topic-summary rewrite was *necessary* — it made the space topic-driven at all — but *not sufficient*; mean-centering was the missing step. The broader lesson: when clustering embeddings, always consider mean-centering, because one dominant shared direction can feed average-link chaining even when the cosine floor looks healthy.

## Choosing k

A silhouette sweep from k=75 to 250 rose **monotonically** (0.113 → 0.156) with no peak — typical for high-dimensional text embeddings, where smaller clusters are always "tighter." Naively maximising the silhouette would push toward k=250 with 53 singletons, which is over-fragmentation rather than insight.

The cut was chosen on **structural criteria** instead:

- **Size plateau** — the largest cluster stays at 71 documents from k=75 to k=125, only splitting at k=150 (the dense software/Pallas core).
- **Anchor coherence** — 31 known Pallas-development documents stay in one cluster up to k=125 and fragment at k=150. A cut that breaks a known-coherent block is too fine.
- **Singleton growth** — moderate (11) up to k=125, then accelerating.

**k=100** satisfies all three: the Pallas core is intact, the largest cluster is 71, there are only 7 singletons, and it is finer than k=75 without over-fragmenting.

## Results

**100 labeled topic islands.** The FHNW coursework thread is clearly visible — "Knowledge Representation Ontology," "Fraud detection modeling," "Business Information Systems," "Systems modeling" — alongside Pallas itself as "AI application development" and everyday clusters such as textile, travel, watch industry, music, culinary, and bicycle maintenance.

**Bridge analysis.** Using per-document silhouette on the same mean-centered representation as the clustering, a document with low or negative silhouette sits *between* clusters — a thematic bridge. The mean silhouette is **+0.121**; **181 documents (~14%) are negative**, 109 are near zero, and 7 are singletons. The strongest bridges are all substantively correct:

| Doc | Bridge | Content |
|---|---|---|
| 1266 | Travel ↔ Scuba diving | Diving schools in Djerba (Tunisia) |
| 1088 | AI image generation ↔ Watch industry | First MoonSwatch release |
| 198 | Swiss law/finance ↔ Time and work | Hourly-wage calculation |
| 786 | Textile/fashion ↔ Skincare | Sunburn skincare |
| 394 | Music ↔ History and conflict | Black Sabbath best albums |

The most diffuse multi-document clusters (lowest mean silhouette) are "LLM Data Management," "AI Careers," and "System architecture design" — all in the dense AI/software region with many neighbours — plus "Instructional guides," which is generic by nature. All are plausible.

**Singleton is not a bridge.** A singleton (silhouette 0, no nearest foreign cluster) is an *isolated* document; a bridge is the *opposite* — a document pulled between two islands. The two are easy to confuse, and each is excluded from the other's analysis accordingly.

## Data and artifacts

The canonical database is `data/ml_phase1.db`:

- **`archive_documents`** — adds `topic_summary`, `topic_embedding`, `cluster_id`, `silhouette`, and `nearest_cluster_id`
- **`clusters`** — one row per cluster: `label`, `size`, `mean_silhouette`, `label_model`
- **`cluster_linkage`** — the full agglomerative linkage matrix (with document-id order) for reconstruction
- **`pipeline_runs`** — an audit row per step (parameters and result)

## Key learnings

- **Swapping the representation beats swapping the model.** LLM topic distillation removed the format register at the root, with no multi-hour re-embedding gamble.
- **Diagnose before you fix.** Four configurations and a measured cosine floor disproved the intuitive "shared register" hypothesis and pointed instead at average-link chaining plus a dominant shared component.
- **Mean-centering is the cheap, decisive lever** for average-link chaining on embeddings — even when the cosine floor looks healthy.
- **Silhouette is monotone in k for high-dimensional text embeddings.** Do not maximise it; cut on structural criteria (size plateau, anchor coherence, singleton growth).
- **Anchor coherence is a strong, cheap tiebreaker** — where a known topic block fragments, the cut is too fine.
