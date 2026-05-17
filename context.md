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

## 5. Next Immediate Steps (For Next Agent Handoff)

**Next Agent — LLM Orchestration & Risk Analysis:**
1. Implement `backend/src/services/llmService.js`:
   * `analyzeDocument(text, documentType, structuredContext)` → calls Claude API (primary; OpenAI/Gemini fallback per spec §9). Apply specialized prompt variants per `documentType` (legal/food/policy/insurance — spec §10–§11).
   * Force structured JSON output: `{ documentType, summary, risks: [{ tier, clause, explanation }], importantTerms[], implications[], predatoryScore }`. Validate via `utils/schemaValidator.js` before returning.
   * `answerQuestion(documentContext, question)` for the chat route.
2. Extend `analyzeController.js`:
   * Add a `POST /api/analyze` (or augment `/upload`) that chains the ingestion pipeline output into `llmService.analyzeDocument`, then optionally `ragService.retrieveContext` for grounding.
   * Tip: ingestion already produces `structuredContext` + `preparedChunks` — pass these straight to the LLM as system-prompt context instead of re-tokenizing.
3. Read `ANTHROPIC_API_KEY` from `process.env` (already in `.env.example`). Fail fast with a clear error if missing — do not silently fall back.
4. Verify with the same rental PDF used in Part 2 verification:
   ```bash
   curl -X POST http://localhost:5001/api/analyze/upload -F "file=@/tmp/civiclens-test.pdf" | jq
   ```
   plus a second call routing through the LLM endpoint once wired.
5. Update Sections 2 (add `@anthropic-ai/sdk` etc.), 3 (Completed Milestones for Part 3), 4 (any token-limit / latency / retry edge cases), and 5 (next slot — likely RAG knowledge-base seeding) of this file.

**Operational tips for the next agent:**
- pdfjs-dist prints a `standardFontDataUrl` warning — it's non-fatal, ignore unless touching font rendering.
- The chunker default (800/150) is tuned for ~200-token chunks; if you switch to a token-aware embedding model, retune via the `options` arg to `embeddingPreparationService.prepare`.
- The `structuredContext.empty` flag tells you when extraction produced no text — short-circuit the LLM call in that case and return a clear "scanned document, OCR fallback pending" message.
- Frontend already expects the LLM response shape under `analysis.risks`, `analysis.precedents`, `analysis.winningArguments`, `analysis.riskScore` (see `frontend/src/lib/mockData.js`). Match those keys to delete the demo banner without further frontend edits.
