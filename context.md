# CivicLens Development Context

> **Mandate to every agent:** Read this file before you begin. Update Sections 3, 4, and 5 before you end your turn. This file is the single source of truth that prevents code-drift across agent handoffs.

## 1. System Overview
* **Project Identity:** CivicLens — AI-Powered Complex Document Intelligence Platform (Ship to Scale Hackathon entry).
* **Mission:** Convert legal, governmental, and regulatory documents into plain-language risk dashboards.
* **Architecture:** Decoupled client-server monorepo.
  * Frontend — Next.js (App Router) + Tailwind CSS, JavaScript (`.js` / `.jsx`).
  * Backend — Node.js + Express.js (REST gateway), JavaScript.
  * Orchestration — Root `package.json` runs both via `concurrently` (no npm workspaces).
* **Core AI Target:** Structured JSON generation via Claude API (primary), with OpenAI / Gemini compatibility layers planned.
* **Knowledge Base:** In-memory JSON similarity matching for hackathon; Pinecone / ChromaDB earmarked for production.
* **Ports:** Backend `5001`, Frontend `3000`. (Backend moved off port 5000 — see Section 4 for the macOS AirPlay collision.)

## 2. Technical Stack Realized
### Backend (`backend/package.json`) — installed versions
* `express@4.22.2`, `multer@2.1.1`, `pdfjs-dist@4.10.38`, `tesseract.js@5.1.1`
* `dotenv@16.6.1`, `cors@2.8.6`, `helmet@8.1.0`
* (Removed `pdf-parse` — see Section 4 for the bundled-pdfjs regression.)
* Node engines: `>=18` (verified on Node 24.11.0)
* Dev runner: `node --watch server.js`

### Frontend (`frontend/package.json`) — installed versions
* `next@14.2.35`, `react@18.3.1`, `react-dom@18.3.1`
* `tailwindcss@3.4.19`, `postcss@8.5.14`, `autoprefixer@10.5.0`
* `lucide-react@0.469.0`, `framer-motion@11.18.2`, `clsx@2.1.1`

### Root (`package.json`) — installed versions
* `concurrently@9.2.1` (dev dependency) — spawns backend and frontend dev processes in parallel.

> Run `npm ls --depth=0` inside each folder to re-verify after changes.

## 3. Current Architecture State

### Completed Milestones
* **Part 1 — Workspace Scaffolding (Lead Systems Architect Agent):**
  * Monorepo directory map created at `/Users/nideshkaarthikrs/MyDocuments/ShipToScale/`.
  * Root `concurrently` dev script wired; ports 5000 / 3000 confirmed collision-free.
  * Backend Express gateway up with `helmet`, `cors`, JSON body parsing, global error handler, `uploads/` auto-created on boot.
  * Backend stub routes (`/api/analyze`, `/api/compare`, `/api/chat`) returning HTTP `501` with structured JSON payloads — wiring verified live via `curl`.
  * `GET /health` returns `{"status":"ok","service":"civiclens-backend"}` — verified.
  * Frontend Next.js App Router skeleton with Tailwind PostCSS pipeline; hero page renders styled and contains the spec §13 headline.
  * Six placeholder components seeded (UploadZone, RiskHeatmap, TabNavigation, ContractCompare, ChatPanel, MetricCard).
  * Seed knowledge base file `backend/src/data/legal_knowledge.json` created with empty `statutes`, `fssai`, `billHistory` arrays.
* **Part 2 — Document Ingestion & Legal Structuring (Data Ingestion Agent):**
  * **`POST /api/analyze/upload`** live and verified end-to-end. Multer single-file upload (20 MB cap), MIME-filtered to `application/pdf`, `image/png`, `image/jpeg`, `image/jpg`.
  * `ocrService.extract(filePath, mimeType)` dispatches: PDFs → `pdfjs-dist` (legacy CJS-friendly build via dynamic ESM import); images → `tesseract.js` lazy worker.
  * Graceful error mapping: `PDF_ENCRYPTED` → 422, `PDF_PARSE_FAILED` → 422, `OCR_FAILED` → 422, `UNSUPPORTED_MIME` → 415, `LIMIT_FILE_SIZE` → 413, missing file → 400.
  * `legalStructuringService.structure(text)` heuristically extracts: `docType`, `disputeCategory`, `involvedParties`, `keyAllegations`, `importantDates`, `monetaryReferences`, `obligations`, `potentialViolations`.
  * `embeddingPreparationService.prepare(text)` produces sliding-window chunks (default 800-char window, 150-char overlap, 40-char minimum) with `{ id, text, normalized, startIdx, endIdx, charCount }` per chunk.
  * Verified live: HTTP 200 on a rental-agreement PDF in **~122 ms** (cold), correctly extracting docType=`rental`, money, dates, parties, violations (`Section 12`), and chunks.
  * Uploaded files are cleaned from `uploads/` after every request (success or error) via `safeUnlink`.
* **Part 4 — Core Legal Intelligence & Prompt Orchestration (Legal Intelligence Agent):**
  * **`backend/src/utils/schemaValidator.js`** — zero-dep custom validator (Zod intentionally skipped; node_modules already heavy). Exports `validateAnalysisSchema`, `extractJson` (strips ```json fences + falls back to outermost balanced braces), `emptyAnalysisEnvelope`, `DEFAULT_DISCLAIMER`. Validator *repairs* drift (coerces types, clamps `riskScore` to 0–100, auto-fills missing disclaimer) instead of rejecting — shape correctness is the contract with the frontend.
  * **`backend/src/services/llmService.js`** — direct `fetch` to Anthropic Messages API (`x-api-key`, `anthropic-version: 2023-06-01`), no SDK. Model id read from `ANTHROPIC_MODEL` env, defaults `claude-opus-4-7`. Exports `analyzeDocument(text, documentType, structuredContext, { retrievedJudgments, winningArgumentRefs })` and `answerQuestion(documentContext, question)` (chat).
  * **Specialized prompt modes** (`MODE_PROMPTS`): `rental`, `employment`, `insurance`, `consumer`, `generic`. `resolveMode()` picks based on `documentType` / `structuredContext.docType` / `disputeCategory` keyword match. Each mode injects domain-relevant statute names (Indian Contract Act, IDA 1947, Insurance Act 1938, CPA 2019, etc.) as *reference frame*, never as ground truth.
  * **`GLOBAL_GUARDRAILS`** system prompt enforces six non-negotiable rules: (1) never predict legal outcomes, (2) never provide legal advice, (3) educational framing only, (4) winningArguments must cite `caseId` from retrieved precedents, (5) empty/garbled text → minimal envelope with no hallucination, (6) JSON-only output.
  * **`backend/src/services/ragService.js`** — TF-IDF cosine similarity over the 25 judgments in `backend/src/data/judgments/case_*.json`. Builds index lazily on first call. Domain affinity boost: ×1.35 when `disputeDomain` matches user query domain. Exports `retrieveContext(query, { topK, disputeDomain })` and `extractWinningArguments(matches)` (filters to entries whose winningParty actually won — no losing-arg leakage).
  * **`POST /api/analyze`** (new, JSON body) — fast path for re-running analysis on already-extracted text: `{ rawText, structuredContext } → { analysis, rag, llmMeta, processingTimeMs }`.
  * **`POST /api/analyze/upload`** now runs the full ingest → RAG → LLM chain by default. Opt-out with `?analyze=0` for diagnostics. New top-level response keys: `analysis` (schema envelope), `rag` (mode + match stats), `llmMeta` (ok / validationErrors / usage). Legacy ingestion keys (`rawText`, `docType`, `structuredContext`, `preparedChunks`, `meta`) unchanged — frontend keeps using them.
  * **Prompt orchestration flow:** structuredContext.disputeCategory + keyAllegations + potentialViolations + obligations + first 2 KB of rawText → composed RAG query → top-5 precedents with domain-bias → `extractWinningArguments` over the matches → injected into `buildUserPrompt` (precedent block with caseId + winning-party + similarity + key arguments) → Claude with mode-specific system prompt + GLOBAL_GUARDRAILS → JSON extraction → schema repair → response.
  * **Soft-fail strategy:** missing `ANTHROPIC_API_KEY`, Anthropic 4xx/5xx, or unparseable LLM output never crashes the upload route. Validator returns `emptyAnalysisEnvelope(reason)` with a populated disclaimer; `llmMeta.ok=false` surfaces the cause for observability.
  * Verified locally (without API key): `analyzeDocument(...)` returns a valid empty envelope with `disputeType="rental"`, `riskScore=0`, full disclaimer. RAG retrieval against an employment-termination query top-ranks `case_001` (Ramesh Kumar Sharma v. Hindustan Polymers) at 47% similarity over a corpus of 25.

* **Part 5 — Lightweight Precedent Retrieval (Legal Retrieval Infrastructure Agent):**
  * **`backend/src/services/judgmentRetrievalService.js`** — public top-3 retrieval contract, distinct from `ragService` which is the LLM-grounding internal retriever. Same corpus, different shape and ranking philosophy.
  * **Why two retrievers, not one:** `ragService` shapes output for *prompt injection* (full keyArguments, byDomain stats, up to topK matches, ×1.35 domain multiplier). `judgmentRetrievalService` shapes output for *human consumption* (fixed top 3, slim shape with `relevantReasoning`, milder +25%-of-score domain bonus that can't drown out a strong off-domain analogue). Sharing one service would force one set of trade-offs onto both surfaces.
  * **Public API:** `retrieveSimilarJudgments(rawText, docType)` → `Array<{ id, title, court, year, disputeDomain, winningParty, similarityScore, winningArguments[], relevantReasoning[], judgmentSummary }>`. Top 3, sorted by normalized `similarityScore` ∈ [0, 1].
  * **Ranking formula:** `score(doc) = Σ_field weight(field) × IDF-weighted-overlap(query, doc.field)`, with field weights:
    * `judgmentSummary × 3.0` — distilled reasoning, highest signal
    * `keyArguments × 2.5` — explicit legal lines of argument
    * `judgmentText × 1.0` — full body, lots of procedural noise
    * `title × 0.8` — party names rarely transfer across cases
    Domain match adds a proportional `+0.25 × current_raw` bonus (intentionally weaker than `ragService`'s ×1.35 multiplier).
  * **Reasoning-similarity bias, not keyword overlap:** the score-summing operates on *intersection IDF*, so rare-term overlaps (e.g. "natural justice", "preponderance", "lock-in") dominate while procedural vocabulary ("petitioner", "respondent", "court") is crushed. Front-loaded weights on `judgmentSummary` + `keyArguments` further bias toward judgments whose *reasoning* matches, not those that merely reuse boilerplate.
  * **`relevantReasoning` extraction:** sentence-split `judgmentText`, score each sentence by (IDF overlap with query) + (+1.5 if sentence contains a reasoning cue like "held", "observed", "this court is of", "principle", "natural justice"), filter out sentences with zero query overlap AND no cue, return top-3 sentences. This is what makes the output *show why a case is relevant*, not just *that it is*.
  * **Normalization:** raw composite scores are divided by the per-query maximum so `similarityScore` is comparable across queries of varying length. Pure IDF sums grow with query size; normalization keeps the top hit at 1.0.
  * **Measured metrics (corpus N=25, Node 24, cold load):**
    * Index build: ~10 ms on first call (lazy; cached after).
    * Per-query latency: **~14 ms cold, ~3 ms warm** for full top-3 + reasoning extraction.
    * Test 1 (employment termination, with `docType='employment'`) → 3 employment cases at similarity `1.000 / 0.975 / 0.873`, all 3 with non-empty `relevantReasoning`. Top hit correctly extracts the "direct superior / personal animosity / bias" reasoning sentence.
    * Test 2 (rental security-deposit query, with `docType='rental'`) → top-ranks `Suresh Malhotra v. Ramesh Gupta` (rental) at 1.0, followed by employment fallbacks because the corpus only contains 1 rental judgment.
    * Empty input → `[]` (no crash).
  * **Known corpus skew:** 24 of the 25 indexed judgments have `disputeDomain: "employment"`. Insurance / consumer / rental queries find at most one on-domain match and then fall back to employment analogues. This is a *seed-data* issue, not a retrieval bug — adding domain coverage means dropping more `case_*.json` files into `backend/src/data/judgments/`; the index rebuilds on next server start.

* **Part 7 — Conversational Intelligence & Consumer Guidance (Final Integration Agent):**
  * **`backend/src/services/actionableInsightsService.js`** — deterministic mapping from detected risk categories to consumer-facing "questions to ask" and "negotiation suggestions". Exports `generateInsights(risks, docType)` → `{ suggestedQuestions[], negotiationSuggestions[] }` and `generateChatChips(risks, similarJudgments)` → 4–6 chat prompt chips biased by detected risks. Every suggestion carries `sourceRiskTitle` + `category` so the UI can show *which* clause produced *which* prompt. Per-category cap (2 questions, 2 negotiations) prevents a single dominant risk from drowning the panel.
  * **Suggestion bundles** are keyed off `riskEngine.category` values: `deposit`, `termination`, `fees`, `lock-in`, `renewal`, `obligations`, `restrictions`, `penalty`, `one-sided`, `dispute resolution`, `liability`. Doc-type baselines (`rental`, `employment`, `insurance`) supply a fallback when no risks mapped — these surface the *silent-on-this* questions that themselves carry signal.
  * **Upload response extended:** `grounded.suggestedQuestions`, `grounded.negotiationSuggestions`, `grounded.chatChips` now ride alongside `grounded.risks` / `grounded.score` / `grounded.similarJudgments`. Frontend reads directly — no LLM round-trip for any of these.
  * **`backend/src/services/llmService.js`** — added `streamAnswer({ question, documentContext, history, onChunk, onDone, onError })`. Parses Anthropic's SSE Messages stream (`content_block_delta` + `text_delta` events), re-emits plain text chunks. Why streaming: chat responses take 5–30 s; without streaming the dashboard freezes mid-question. Streaming surfaces the first token in ~500 ms.
  * **Chat prompt builder** (`buildChatUserPrompt`) injects four context blocks into the user turn: uploaded document excerpt (6 KB cap), detected risks (top 8, with verbatim clause excerpts), retrieved precedents (top 3, with caseId / court / similarity / summary / winning arguments), and prior conversation history (trailing 6 messages). System prompt enforces: ground every claim, no outcome prediction, no advice, plain language, cite caseIds, always end with the disclaimer.
  * **`backend/src/controllers/chatController.js`** rewritten from a 501 stub. Accepts `{ userQuery, uploadedDocumentContext, retrievedPrecedents, conversationHistory }`. Backfills risks via `riskEngine.analyzeRisks` and precedents via `judgmentRetrievalService.retrieveSimilarJudgments` if the client didn't pass them — `curl` users get the same grounding as the UI. Default response is SSE (`event: grounding` → `event: chunk` × N → `event: done`); `?stream=0` falls back to non-streaming JSON.
  * **Statelessness:** the server holds no chat session. The client persists `conversationHistory` in component state and resends the trailing window on every turn. Trade-off documented in §4.
  * **`frontend/src/lib/api.js`** — added `chatStream({ userQuery, uploadedDocumentContext, retrievedPrecedents, conversationHistory, onChunk, onGrounding, onDone, onError, signal })`. Uses `fetch()` + `body.getReader()` because `EventSource` doesn't support POST with JSON bodies. Manual SSE frame parser: split on `\n\n`, route by `event:` header, JSON-decode `data:`.
  * **`frontend/src/components/ChatPanel.jsx`** — new canonical chat surface (the old legacy stub is replaced). Features: streaming text rendering with a pulsing cursor while chunks arrive, abortable in-flight requests (`AbortController`-backed Stop button), dynamic suggestion chips that prefer `grounded.chatChips` over generic defaults, collapsible "grounded against N precedents" reasoning card per assistant message, auto-scroll to tail, responsive Tailwind layout. `ChatTab.jsx` is now a thin wrapper.
  * **`frontend/src/components/tabs/BeforeYouSignTab.jsx`** — new tab. Two sections: "Questions to ask" and "Negotiation suggestions". Each item shows its `sourceRiskTitle` chip so the user can trace any suggestion back to the detected clause that produced it. Empty state explains when nothing fired ("the document doesn't contain the patterns we detect").
  * **Dashboard updates** (`frontend/src/app/dashboard/page.js`): added the **Before You Sign** tab between Winning Arguments and Chat, with item-count badge. Negotiation suggestions now also pass through to `RiskHeatmap` so a "Negotiation tip" chip renders inline beneath each risk card (per spec §18). UI styling, scoring ring, tab strip, and precedent cards are all preserved.
  * Verified locally: rental sample (deposit + penalty + late fee + lock-in + indemnity + jurisdiction) → 9 risks, score 100/high, 8 grounded questions, 8 grounded negotiations, 6 chat chips. **Zero orphaned suggestions** — every Q / negotiation `sourceRiskTitle` resolves to a real entry in `grounded.risks`.

* **Part 6 — Grounded Risk Intelligence (Legal Grounding Agent):**
  * **`backend/src/services/riskEngine.js`** — fully deterministic, regex-driven risk detector. Every risk it emits carries a verbatim `clauseText` excerpt — no fabricated penalties, no invented lock-in periods, no hallucinated landlord behaviors. If a clause isn't in the document text, no risk is produced.
  * **Output schema** (per spec §6): `{ title, severity ∈ {green,yellow,red}, clauseText, explanation, reasoning, confidence ∈ [0,1], category }`. The `confidence` field is internal (not yet surfaced in UI) but is wired through for future ranking/dedup.
  * **Detectors implemented:** security deposit (refund vs forfeit), notice period (length-tiered), late fees (compounding flagged red), lock-in (12mo+ → yellow, 24mo+ → red), automatic renewal (opt-out checked), cleaning fees, utility/maintenance obligations, pet restrictions, forfeiture language, unilateral discretion, exclusive jurisdiction, indemnity (unlimited flagged red). Plus a cross-clause check: **penalty exceeds deposit** only fires when *both* amounts are actually parsed from the text and the penalty is numerically larger.
  * **Deterministic predatory score:** `scoreRisks()` aggregates risks with weights `red=+22, yellow=+11, green=−3`, clamped to 0–100, with bands `low (<30) / medium (30–59) / high (≥60)`. Same document → same score on every run. Score drivers are the top-4 red-tier titles.
  * **Sentence-boundary snapping** for clause excerpts: a period only counts as sentence-end if followed by whitespace + uppercase letter (or `\n\n`). This preserves abbreviations like `Rs. 50,000`, `Mr.`, `v.`, `Sec.` instead of truncating mid-amount. Without this fix, every monetary clause displayed as `"...security deposit of Rs."` with the number cut off — directly causing the "exact amount not clearly stated" false signal that broke trust in earlier builds.
  * **Money regex hardening** in `legalStructuringService.js`: changed `[\d,]+` to `\d[\d,]*` so a digit is required after the currency prefix. Without this, OCR output like `"Rs ,"` matched as a fake monetary reference. `normalizeMoneyToken()` also strips trailing punctuation from valid amounts.
  * **`analyzeController.js` integration:** `POST /api/analyze/upload` now always runs `riskEngine.analyzeRisks(rawText)` and `judgmentRetrievalService.retrieveSimilarJudgments(rawText, docType)` before optionally calling the LLM. These deterministic outputs land at top-level `grounded: { risks, score, similarJudgments }` on the response — the dashboard renders from this. The LLM-augmented `analysis.*` envelope is still there but is now a *secondary* signal, not the primary trust surface.
  * **Frontend wire-up:** `frontend/src/app/dashboard/page.js` rewritten to read `analysis.grounded.risks` / `analysis.grounded.score` / `analysis.grounded.similarJudgments`. Mock arrays (`MOCK_RISKS`, `MOCK_PRECEDENTS`, `MOCK_WINNING_ARGUMENTS`, `MOCK_RISK_SCORE`) **deleted** from `frontend/src/lib/mockData.js` — only the color/badge helper functions remain. Three adapter functions in the dashboard (`adaptRisks`, `adaptPrecedents`, `adaptWinningArguments`) map backend shapes to legacy component shapes without touching any component code — preserves UI styling (heatmap, R/Y/G cards, score ring, precedent cards) per spec §12.
  * **Winning Arguments fallback:** when the LLM is unavailable, `adaptWinningArguments` synthesizes the panel from the retrieved judgments' `keyArguments[]` — these are real lines that won real indexed cases, citing real `case_*` IDs. Better than empty state, still grounded.
  * **Demo banner replaced** with a green "every risk is traceable to a verbatim clause" trust banner that includes a "grounded mode" pill when `llmMeta.ok === false`.
  * **Verified locally:** rental sample with deposit + penalty + late fee + lock-in + indemnity + jurisdiction → 11 grounded risks, predatory score 87 (high), drivers `[Forfeiture language, Compounding late fee, Indemnity obligation]`. Unrelated software-engineering text → 0 risks, score 0. Bank-deposit text (mentions "deposit" but not "security deposit") → 0 risks. Empty input → `[]`, score 0.

* **Part 3 — Legal Intelligence Dashboard UI (Lead Frontend Agent):**
  * Home page (`/`) wires real upload through `lib/api.uploadDocument()` → `POST /api/analyze/upload`, stores result under `sessionStorage['civiclens.analysis.v1']`, then `router.push('/dashboard')`.
  * Dashboard page (`/dashboard`) is a client component that hydrates from sessionStorage, renders an empty-state if no analysis exists, and exposes five tabs: **Summary**, **Risks**, **Similar Judgments**, **Winning Arguments**, **Chat**.
  * Visualizations: SVG ring gauge for Predatory Score (0–100), per-clause R/Y/G highlights, indigo similarity bars on each precedent (0–100%), strength badges + category chips on each winning argument.
  * `PrecedentCard` is fully expandable — collapsed view shows court / year / similarity / one-line summary; expanded view reveals persuasive reasoning and matched-risk chips.
  * `UploadZone` uses XHR for upload progress (fetch can't observe upload bytes), surfaces backend errors inline (415 / 413 / 422 / 400 / 500), and lazy-locks the dropzone during upload.
  * Demo banner on the dashboard discloses that **risks / precedents / arguments are still mocked** — extraction is real, but LLM-generated fields await Part 4.
  * Verified live: `GET /` and `GET /dashboard` compile and serve 200 from Next 14.2.35 dev; `POST /api/analyze/upload` round-trips at ~170 ms via the frontend api helper contract.

### Mock Data Boundary (Part 3 → Part 4 handoff)
`frontend/src/lib/mockData.js` exports `MOCK_RISKS`, `MOCK_PRECEDENTS`, `MOCK_WINNING_ARGUMENTS`, `MOCK_RISK_SCORE` shaped to match the contract Part 4's `llmService.analyzeDocument` should return. Replacing the mocks with live data is a one-place change in `dashboard/page.js` (the four `MOCK_*` imports become reads off the `analysis` payload).

### Unified Response Schema (`POST /api/analyze/upload`)
```json
{
  "rawText": "string",
  "docType": "rental | employment | insurance | bill | ingredient | contract | unknown",
  "structuredContext": {
    "docType": "...",
    "disputeCategory": "...",
    "involvedParties": ["..."],
    "keyAllegations": ["..."],
    "importantDates": ["..."],
    "monetaryReferences": ["..."],
    "obligations": ["..."],
    "potentialViolations": ["..."],
    "empty": false
  },
  "preparedChunks": [
    { "id": 0, "text": "...", "normalized": "...", "startIdx": 0, "endIdx": 800, "charCount": 800 }
  ],
  "processingTimeMs": 122,
  "meta": {
    "originalName": "...",
    "mimeType": "application/pdf",
    "sizeBytes": 1339,
    "engine": "pdfjs-dist | tesseract.js",
    "pageCount": 1,
    "ocrConfidence": null,
    "warning": null,
    "chunkCount": 1
  }
}
```

### Current Code Structure Artifacts
```
ShipToScale/
├── context.md                              # This file
├── package.json                            # Root concurrently runner
├── .gitignore
├── .env.example                            # Top-level API key placeholders
├── backend/
│   ├── package.json
│   ├── .env.example                        # PORT, ANTHROPIC_API_KEY, NODE_ENV
│   ├── server.js                           # Express gateway, port 5001
│   └── src/
│       ├── controllers/
│       │   ├── analyzeController.js        # POST /api/analyze (stub 501) + POST /api/analyze/upload (LIVE)
│       │   ├── compareController.js        # POST /api/compare (stub 501)
│       │   └── chatController.js           # POST /api/chat    (stub 501)
│       ├── services/
│       │   ├── ocrService.js               # extract() dispatcher → pdfjs-dist | tesseract.js
│       │   ├── legalStructuringService.js  # regex heuristics: parties / dates / money / obligations / allegations / violations
│       │   ├── embeddingPreparationService.js  # sliding-window chunker (800/150)
│       │   ├── llmService.js               # analyzeDocument stub (Claude target)
│       │   └── ragService.js               # retrieveContext stub (in-memory JSON sim)
│       ├── data/
│       │   └── legal_knowledge.json        # { statutes:[], fssai:[], billHistory:[] }
│       └── utils/
│           └── schemaValidator.js          # validateAnalysisSchema stub
└── frontend/
    ├── package.json
    ├── next.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── jsconfig.json                       # @/* path alias → ./src/*
    ├── .env.example                        # NEXT_PUBLIC_API_BASE_URL
    └── src/
        ├── app/
        │   ├── layout.js                   # Root HTML shell, imports globals.css
        │   ├── page.js                     # Hero + UploadZone → routes to /dashboard on success
        │   ├── globals.css                 # @tailwind base/components/utilities
        │   └── dashboard/
        │       └── page.js                 # Client component: hydrates analysis, renders tabs
        ├── lib/
        │   ├── api.js                      # uploadDocument() helper, sessionStorage key
        │   └── mockData.js                 # MOCK_RISKS / MOCK_PRECEDENTS / MOCK_WINNING_ARGUMENTS / MOCK_RISK_SCORE
        └── components/
            ├── UploadZone.jsx              # XHR upload w/ progress, drag-drop, inline errors
            ├── RiskHeatmap.jsx             # SVG score gauge + R/Y/G clause cards (tier filter)
            ├── PrecedentCard.jsx           # Expandable card: court / year / similarity / reasoning
            ├── WinningArgumentsPanel.jsx   # Ranked legal arguments with citations
            ├── TabNavigation.jsx           # Controlled tab strip
            ├── ContractCompare.jsx         # Side-by-side diff viewer (placeholder, unused for now)
            ├── ChatPanel.jsx               # (legacy panel — superseded by ChatTab)
            ├── MetricCard.jsx              # Predatory score gauge (legacy — RiskHeatmap supersedes)
            └── tabs/
                ├── SummaryTab.jsx          # Real ingestion data: parties / dates / money / violations + raw preview
                ├── RisksTab.jsx            # Wraps RiskHeatmap
                ├── SimilarJudgmentsTab.jsx # PrecedentCard list with sort (similarity | year)
                ├── WinningArgumentsTab.jsx # Wraps WinningArgumentsPanel
                └── ChatTab.jsx             # Suggested questions; honest about 501 stub until LLM agent ships
```

## 4. Discovered Edge Cases & Technical Fixes

* **Port 5000 occupied on macOS (AirPlay Receiver).** The original plan used port 5000, but on macOS 12+ the system Control Center binds `*:5000` for AirPlay. Backend was moved to **5001** across `backend/server.js`, `backend/.env.example`, and `frontend/.env.example` (`NEXT_PUBLIC_API_BASE_URL`). Override with `PORT=<n>` in `backend/.env` if needed.
* **`multer@1.x` deprecated.** The blueprint listed multer without a major version. Resolved to `multer@^2.1.1` to clear the security advisory; `upload.single('file')` API unchanged.
* **Next.js advisory drift.** Installed `next@14.2.35` (latest patched 14.x). `npm audit` still reports 2 advisories (high + moderate) that only fix by jumping to `next@16.x` — a breaking change deferred for the user's call. Both are self-hosted-production DoS/cache-poisoning issues; not blocking for hackathon-local dev.
* **Node engine.** Verified on Node 24.11.0. `node --watch` (used by backend dev script) requires Node ≥18, which the package.json `engines` field enforces.
* **`pdf-parse` swapped for `pdfjs-dist`.** `pdf-parse@1.1.4` ships a bundled pdfjs from 2018 that throws `bad XRef entry` and `Unknown compression method in flate stream` on most modern PDFs (including pdf-lib output). Migrated to `pdfjs-dist@^4.10.38/legacy/build/pdf.mjs`, loaded via dynamic `await import()` from CommonJS, with `disableWorker: true` and `isEvalSupported: false`. pdfjs prints a non-fatal warning about `standardFontDataUrl` — text extraction is unaffected; if needed, point it at `node_modules/pdfjs-dist/standard_fonts/` later.
* **pdfjs `Buffer` rejection.** pdfjs-dist 4.x explicitly rejects Node `Buffer` even though it extends `Uint8Array`. We convert via `new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)` in `ocrService.extractFromPdf`.
* **Heuristic structuring imperfection.** Regex-based party extraction occasionally captures a trailing temporal phrase (e.g. "Priya Sharma on 1st March 2024"). Acceptable for hackathon latency; LLM-augmented refinement is the agent-after's territory. Similarly, obligation sentences ending in abbreviations like "Rs." are truncated — fine for indexing, not for display.
* **Scanned PDFs.** PDFs with no extractable text (image-based scans) currently return `text: ""` with a `meta.warning`. PDF→image rasterization + Tesseract fallback is deferred to a future iteration.
* **Tailwind `content` globs missed `src/lib/`.** Initial `tailwind.config.js` only scanned `./src/app/**` and `./src/components/**`. Because `frontend/src/lib/mockData.js` declares risk-tier class strings (`text-rose-700`, `bg-amber-100`, `border-emerald-300`, …) via helper functions, those classes were tree-shaken out of the bundle — the Risks tab would have rendered without color. Fixed by adding `./src/lib/**/*.{js,jsx}` to the `content` array; CSS bundle grew from 24.9 KB to 26.2 KB. Lesson: any source file that emits Tailwind class strings must be in the `content` globs.
* **Zod intentionally skipped.** The schema validator could have used Zod or Ajv, but neither was installed and adding a runtime dep to a hackathon backend that already ships pdfjs + tesseract felt heavy for a ~10-field schema. Custom validator does coercion + repair (clamping `riskScore`, auto-filling `disclaimer`) which a pure Zod check would not — repair is the right behavior here because shape-correctness is the contract with the frontend; a strict reject would force a full LLM re-call on every minor drift.
* **`@anthropic-ai/sdk` skipped in favor of native `fetch`.** Node 18+ ships `fetch` globally and the Messages API surface we need (model / system / messages / max_tokens) is small enough that a direct POST is cleaner than dragging in another dep tree. Trade-off: if Anthropic ships streaming/tool-use features we want later, swapping to the SDK is a one-file change in `llmService.callClaude`.
* **`POST /api/analyze` body parser is route-local.** The global app uses `express.json()` for JSON routes, but `/api/analyze/upload` is multipart. The new `/api/analyze` JSON route therefore mounts `express.json({ limit: '2mb' })` *as middleware on that one handler*, not globally — keeps the multer pipeline on `/upload` untouched.
* **RAG output shape ≠ frontend's existing `MOCK_PRECEDENTS`.** `ragService` returns `{ id, title, court, year, similarityPercent, judgmentSummary, keyArguments[], … }` but `mockData.js` uses `similarity` (0–1) and `summary`. When the frontend wires off `analysis.precedentMatches`, expect a small key-rename pass — the LLM is instructed to emit `similarityPercent` and a one-sentence `relevance`, matching the new shape, not the legacy mock.
* **LLM soft-fail keeps the dashboard alive without an API key.** Missing `ANTHROPIC_API_KEY` does NOT 500 the upload route — it returns a valid envelope with `llmMeta.ok=false` and a disclaimer-populated empty analysis. Trade-off chosen deliberately: hackathon judges shouldn't see a broken dashboard if the key isn't wired, but the soft-fail means a misconfigured prod deploy looks identical to a working one. Mitigation: `llmMeta.reason` is always set; frontend can banner on `ok=false`.
* **Two precedent retrievers, intentionally.** `ragService.retrieveContext` and `judgmentRetrievalService.retrieveSimilarJudgments` both walk the same 25-doc corpus but expose different contracts (variable-topK rich shape for prompt-injection vs fixed-top-3 slim shape for UI). Resisted unifying them: a single retriever would need a config matrix that obscures both call sites. Cost is ~3 ms per query for the second pass on the warm cache — well under the LLM round-trip budget.
* **Judgment corpus is employment-heavy.** 24 / 25 seed judgments are `disputeDomain: "employment"`. This skews any retrieval against a rental / insurance / consumer dispute — the on-domain hit ranks #1 (if any exists at all) and slots 2–3 fall back to employment analogues. Not a retrieval bug; a seed-data ask. Adding judgments requires no code change — just drop new `case_*.json` files into `backend/src/data/judgments/` and restart the server (index rebuilds lazily on next retrieval call).
* **Why a deterministic risk engine sits beside the LLM.** The earlier build relied entirely on `analysis.riskAnalysis` from Claude. Two problems: (1) Claude occasionally invented penalties (₹1,00,000) and lock-ins (11 months) that did not exist in the uploaded document, (2) the dashboard ignored that anyway and rendered `MOCK_RISKS`. The deterministic engine fixes both: every risk surfaces a verbatim excerpt, and the dashboard now reads `analysis.grounded.*` first with the LLM treated as an *augmentation* layer. Trust before flash. Trade-off: the engine only catches patterns we've coded detectors for — a contract using non-standard wording for a real risk could be missed. The LLM layer is still there to catch what the regex misses; it just no longer gets to invent.
* **Abbreviation-aware sentence boundaries.** The first risk-engine cut truncated clauses at `Rs.` and dropped the amount, producing "exact amount not clearly stated" warnings on clauses where the amount was clearly stated three characters later. Fix: a period only ends a sentence if followed by whitespace + uppercase letter (or `\n\n`). Costs nothing at runtime; eliminates an entire class of false negatives. Applies to legal abbreviations broadly (`Mr.`, `v.`, `Sec.`, `No.`).
* **Money regex required a digit anchor.** The original `[\d,]+` matched a bare `,`, so OCR'd noise like `"Rs ,"` surfaced as a "monetary reference" on the Summary tab. Fix: anchor to `\d[\d,]*` (at least one digit, then optional digit/comma run). Trailing punctuation on real amounts is also stripped via `normalizeMoneyToken()`.
* **Frontend mock arrays deleted, helpers kept.** `frontend/src/lib/mockData.js` no longer exports any data — only `tierColor`, `tierDot`, `bandColor`, `strengthBadge`. Filename intentionally not renamed to avoid touching every import site; a follow-up agent should rename to `riskStyles.js`. Three adapter functions in `dashboard/page.js` map backend shapes (`severity`, `clauseText`, `similarityScore`, `judgmentSummary`) into the legacy component prop shapes (`tier`, `clause`, `similarity`, `summary`) — kept the UI styling and components untouched per the spec's "preserve visual style" constraint.
* **SSE streaming over EventSource.** Streaming the chat reply uses Server-Sent Events from the backend but the frontend cannot use the browser's native `EventSource` because that API doesn't support POST or JSON bodies. We instead `fetch()` with `Accept: text/event-stream` and read `body.getReader()`, parsing SSE frames by hand. Custom event types: `grounding` (once, precedent metadata), `chunk` (repeated, text delta), `done`, `error`. Anthropic's own SSE wire format is parsed server-side and re-emitted in this simplified shape — the client doesn't need to know Anthropic event types.
* **Chat is stateless on the server.** Each `POST /api/chat` carries the full trailing conversation history from the client; the backend persists nothing. Trade-off: each request retransmits up to 6 messages of history, but adding session storage means handling expiry, cleanup, and multi-tab sync — not worth it for a hackathon. Client-side `useState` is the source of truth for the chat thread.
* **Actionable insights are deterministic, not LLM-generated.** Questions and negotiation suggestions are produced by a category-keyed lookup against the grounded risks, not by another Claude call. Rationale: (1) latency — the insights ship in the upload response with zero added cost, (2) trust — same risk pattern always produces the same suggestion, (3) auditability — every suggestion carries `sourceRiskTitle` so the user can see exactly which detected clause produced it. The LLM is still used for chat where free-form reasoning is genuinely needed.

## 5. Next Immediate Steps (For Next Agent Handoff)

**Next Agent — Polish + Coverage Expansion:**
1. **Expand judgment corpus.** 24 / 25 seed cases are employment. Add rental, insurance, consumer judgments to `backend/src/data/judgments/case_*.json` so similarity retrieval has on-domain hits for those documents. Index rebuilds lazily — no code change.
2. **Surface LLM-only fields** in the UI when present: `analysis.analysis.persuasiveReasoning` (why winning arguments worked) and `analysis.analysis.weaknessesDetected` (weaknesses in the user's position). Both are net-new panels — dashboard currently doesn't render them.
3. **Display the disclaimer.** `analysis.analysis.disclaimer` is computed but not shown. It's a guardrail surface, not optional UI — render it at the bottom of every analysis-bearing tab.
4. **Add employment risk detectors.** `riskEngine.js` covers ~12 rental-domain clauses. Employment-side detectors (non-compete scope, IP assignment breadth, garden leave, salary clawback) would meaningfully extend grounded coverage for employment uploads. Each detector is ~40 lines following the existing pattern. Don't forget to add corresponding `SUGGESTION_BUNDLES` entries in `actionableInsightsService.js`.
5. **Persist chat history** across browser refreshes via `sessionStorage` keyed off the analysis hash. Currently the chat resets to empty on any reload — acceptable for demo, friction for real use.
3. **End-to-end live verify** (requires `ANTHROPIC_API_KEY` in `backend/.env`):
   ```bash
   curl -X POST http://localhost:5001/api/analyze/upload \
     -F "file=@/tmp/civiclens-test.pdf" | jq '.analysis | keys, .riskScore, (.precedentMatches | length)'
   ```
   Expect: all 10 schema keys present, `riskScore` ∈ [0,100], `precedentMatches.length` ≤ 5, every `winningArguments[].supportingCaseId` ∈ `precedentMatches[].caseId`.
4. **Token / latency observability**: `llmMeta.usage` is plumbed through but nothing reads it. Add a `/api/health/llm` route or log line on each call so we can see input/output token cost on the demo.
5. Update Sections 3, 4, 5 of this file before handoff.

**Operational tips for the next agent:**
- pdfjs-dist prints a `standardFontDataUrl` warning — non-fatal, ignore unless touching font rendering.
- `structuredContext.empty === true` short-circuits the LLM call (no point burning tokens on empty extractions). The upload route already handles this — `analysis` will be `null` and the response will note the scanned-PDF limitation.
- `ANTHROPIC_MODEL` env var overrides the default `claude-opus-4-7`. Use `claude-haiku-4-5-20251001` if you're rate-limited during demo prep.
- The TF-IDF index in `ragService` is built lazily on the first `retrieveContext` call (~25 ms cold for 25 docs). To pre-warm, add `ragService.retrieveContext('warmup', { topK: 1 })` in `server.js` boot.
- Adding new judgments: just drop a `case_NNN.json` file with the same shape into `backend/src/data/judgments/` — the index rebuilds on next server start.
- Frontend mock shape and live shape diverge slightly (see Section 4 edge case "RAG output shape ≠ frontend's existing `MOCK_PRECEDENTS`"). Plan a key-rename pass, not a one-line swap.
