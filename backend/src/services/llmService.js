// LLM service — structured Legal Intelligence generation via Claude API.
//
// Why direct fetch instead of @anthropic-ai/sdk:
//   • Node 18+ ships global fetch; one less dep to install for the hackathon.
//   • Anthropic Messages API surface we need (model, system, messages,
//     max_tokens) is tiny and stable enough to call directly.
//
// Hard guarantees this module enforces, regardless of what the LLM returns:
//   1. Output is always valid JSON matching the Part 4 schema (validator
//      patches drift; emptyAnalysisEnvelope handles total failure).
//   2. Every payload carries a non-empty `disclaimer`.
//   3. No predicted "outcome" / "verdict" / "you will win" language is ever
//      asked for — prompts explicitly forbid prediction & legal advice.
//   4. Educational framing is part of the system prompt, not a hope.
//   5. winningArguments / persuasiveReasoning entries are tied to the
//      retrieved precedents we injected — we instruct the model to cite
//      caseId for every persuasive claim. Frontend can surface unsourced
//      claims for review.

const {
  validateAnalysisSchema,
  extractJson,
  emptyAnalysisEnvelope,
  DEFAULT_DISCLAIMER,
} = require('../utils/schemaValidator');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-7';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 4096;

// --- Specialized prompting modes -------------------------------------------
//
// Each mode adds *jurisdiction-aware framing* — statutes, common allegations,
// and the typical clauses a reader actually wants flagged. Modes are picked
// from `documentType` / `structuredContext.disputeCategory`. A mode that
// doesn't exist falls back to the generic legal mode.

const MODE_PROMPTS = {
  rental: `MODE: RENTAL / TENANCY DISPUTE
You are reviewing a residential or commercial tenancy document.
Focus risk analysis on: security deposit forfeiture clauses, unilateral rent
escalation, lock-in periods, eviction-on-short-notice clauses, maintenance
liability shift to tenant, indemnity & damages caps, jurisdictional ouster.
Relevant Indian statutes to reference *only if the document or precedents
mention them*: Transfer of Property Act 1882 §§105–117, Rent Control Acts of
the relevant state, Specific Relief Act 1963, Consumer Protection Act 2019.`,

  employment: `MODE: EMPLOYMENT DISPUTE
You are reviewing an employment contract, termination notice, or workplace
dispute document.
Focus risk analysis on: termination & notice clauses, non-compete & garden
leave, salary/benefit clawback, IP assignment scope, confidentiality breadth,
disciplinary procedure fairness, conditions amounting to retrenchment.
Relevant statutes to surface only when cited by document or precedents:
Industrial Disputes Act 1947, Industrial Employment (Standing Orders) Act
1946, Shops & Establishments Acts, Payment of Gratuity Act 1972, Specific
Relief Act 1963 §14.`,

  insurance: `MODE: INSURANCE CONFLICT
You are reviewing an insurance policy, claim repudiation letter, or related
dispute.
Focus risk analysis on: exclusion clauses, pre-existing condition definitions,
material non-disclosure standards, sub-limits, depreciation/copay schedules,
arbitration & forum clauses, sum-insured definitions.
Relevant references only when document/precedents support them: Insurance
Act 1938, IRDAI (Protection of Policyholders' Interests) Regulations 2017,
Consumer Protection Act 2019, principle of *uberrimae fidei*.`,

  consumer: `MODE: CONSUMER COMPLAINT
You are reviewing a consumer-side dispute (defective product, deficient
service, deceptive trade practice).
Focus risk analysis on: warranty scope & disclaimers, deceptive pricing,
unfair contract terms, refund/return restrictions, arbitration clauses
attempting to bar Consumer Forum jurisdiction.
Relevant references only when supported: Consumer Protection Act 2019,
Sale of Goods Act 1930, Indian Contract Act 1872 §§16, 23.`,

  generic: `MODE: GENERAL LEGAL DOCUMENT
You are reviewing a legal/regulatory document of unspecified domain. Apply
careful, neutral analysis. Do not assume facts not in the document.`,
};

// Map free-form documentType / disputeCategory strings to a prompt mode.
function resolveMode(documentType, structuredContext) {
  const candidates = [
    documentType,
    structuredContext && structuredContext.docType,
    structuredContext && structuredContext.disputeCategory,
  ]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());

  for (const c of candidates) {
    if (c.includes('rent') || c.includes('lease') || c.includes('tenan')) return 'rental';
    if (c.includes('employ') || c.includes('termination') || c.includes('labour')) return 'employment';
    if (c.includes('insur') || c.includes('policy') || c.includes('claim')) return 'insurance';
    if (c.includes('consumer') || c.includes('product') || c.includes('warranty')) return 'consumer';
  }
  return 'generic';
}

// --- System prompt ---------------------------------------------------------

const GLOBAL_GUARDRAILS = `You are CivicLens Legal Intelligence — an educational AI assistant that helps a
non-lawyer understand a legal document by grounding analysis in retrieved
prior judgments.

NON-NEGOTIABLE RULES — violating any of these is a failure:
1. NEVER predict the legal outcome of any case. Do not say a party "will win",
   "will lose", "is likely to succeed", or assign probabilities to verdicts.
   You may say a *line of argument has been persuasive in prior cases when
   supported by similar facts* — that is grounded analysis, not prediction.
2. NEVER provide legal advice. Do not tell the reader what to do, what to
   sign, what to file, or whom to sue. You explain; the reader decides.
3. Always frame outputs as EDUCATIONAL. Use language like "courts have
   considered…", "this clause has historically been challenged when…",
   "the document contains…".
4. Ground every "winningArgument" and "persuasiveReasoning" entry in the
   retrieved precedents you were given. Cite the caseId. If no retrieved
   precedent supports a point, do not invent one — leave the array shorter.
5. If the document text is empty, garbled, or off-topic, return a minimal
   valid envelope with summary explaining the limitation. Do not hallucinate
   content.
6. Output MUST be a single JSON object — no prose preamble, no markdown
   fences, no trailing commentary. Output JSON only.

REQUIRED OUTPUT SCHEMA (exact keys, all required):
{
  "summary": string,                      // 3–5 sentence plain-language overview
  "disputeType": string,                  // e.g. "rental", "employment", "insurance", "consumer", "unknown"
  "riskScore": number,                    // integer 0–100. 0 = benign, 100 = highly predatory
  "riskAnalysis": [                       // per-risk findings
    {
      "tier": "red" | "yellow" | "green",
      "clause": string,                   // verbatim or near-verbatim from document
      "explanation": string,              // educational, plain language
      "severity": "high" | "medium" | "low"
    }
  ],
  "extractedClauses": [                   // notable clauses worth surfacing even if not risky
    { "label": string, "text": string, "category": string }
  ],
  "precedentMatches": [                   // ONLY use retrieved cases provided in user message
    {
      "caseId": string,
      "title": string,
      "court": string,
      "year": number,
      "similarityPercent": number,
      "relevance": string                 // 1–2 sentence why this case is relevant
    }
  ],
  "winningArguments": [                   // grounded in retrieved precedents
    {
      "argument": string,
      "supportingCaseId": string,         // must match a caseId from precedentMatches
      "strength": "strong" | "moderate" | "weak",
      "category": string
    }
  ],
  "persuasiveReasoning": [                // why these arguments have worked previously
    { "point": string, "supportingCaseId": string }
  ],
  "weaknessesDetected": [                 // weaknesses in the document/position itself
    { "weakness": string, "explanation": string, "severity": "high" | "medium" | "low" }
  ],
  "disclaimer": string                    // educational, non-advice disclaimer
}`;

// --- Context construction --------------------------------------------------

function buildUserPrompt({ documentText, structuredContext, retrievedJudgments, winningArgumentRefs }) {
  // Trim doc text to keep within reasonable token budgets. The legal-structured
  // context already extracted parties/dates/money so we don't need the full
  // doc; ~12k chars is plenty of room.
  const safeText = (documentText || '').slice(0, 12000);

  const precedentBlock = (retrievedJudgments || []).map((m, i) => {
    return `[Precedent ${i + 1}] caseId=${m.id}
  Title: ${m.title}
  Court: ${m.court} (${m.year})
  Domain: ${m.disputeDomain}
  Similarity: ${m.similarityPercent}%
  Winning party: ${m.winningParty}
  Summary: ${m.judgmentSummary}
  Key arguments cited:
${(m.keyArguments || []).map((a, j) => `    ${j + 1}. ${a}`).join('\n')}`;
  }).join('\n\n');

  const winningArgBlock = (winningArgumentRefs || []).slice(0, 12).map((w, i) => {
    return `  ${i + 1}. (caseId=${w.caseId}, won by ${w.winningParty}, ${w.similarityPercent}% similar) ${w.argument}`;
  }).join('\n');

  return `UPLOADED DOCUMENT TEXT:
"""
${safeText || '(no extractable text — likely a scanned image PDF; do not invent content)'}
"""

STRUCTURED CONTEXT (already extracted by deterministic parser — trust these facts):
${JSON.stringify(structuredContext || {}, null, 2)}

RETRIEVED PRIOR JUDGMENTS (use ONLY these for precedentMatches / winningArguments):
${precedentBlock || '(no precedents retrieved — leave precedentMatches and winningArguments empty)'}

WINNING ARGUMENT REFERENCES from the retrieved set:
${winningArgBlock || '(none)'}

INSTRUCTIONS:
- Produce the JSON envelope per the schema in the system prompt.
- Cite caseId on every winningArguments / persuasiveReasoning entry.
- If retrieved precedents are empty, return empty arrays for precedentMatches
  / winningArguments / persuasiveReasoning rather than inventing cases.
- riskScore is 0–100; calibrate against severity of clauses found, not the
  presence of any clauses at all.
- Do not predict outcomes. Do not give advice. Output JSON only.`;
}

// --- Anthropic call --------------------------------------------------------

async function callClaude({ system, user, maxTokens = DEFAULT_MAX_TOKENS }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const err = new Error('ANTHROPIC_API_KEY is not set in environment');
    err.code = 'LLM_NO_API_KEY';
    throw err;
  }

  const body = {
    model: ANTHROPIC_MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  };

  const resp = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    const err = new Error(`Claude API ${resp.status}: ${text.slice(0, 300)}`);
    err.code = 'LLM_HTTP_ERROR';
    err.status = resp.status;
    throw err;
  }

  const json = await resp.json();
  // Anthropic messages API returns content as an array of typed blocks.
  const text = Array.isArray(json.content)
    ? json.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
    : '';
  return { text, usage: json.usage || null, stopReason: json.stop_reason };
}

// --- Public API ------------------------------------------------------------

/**
 * Generate structured Legal Intelligence for an uploaded document.
 *
 * @param {string} documentText            Extracted document text.
 * @param {string} documentType            'rental' | 'employment' | 'insurance' | 'consumer' | string
 * @param {object} structuredContext       Output of legalStructuringService.structure(...)
 * @param {object} [opts]
 * @param {Array}  [opts.retrievedJudgments]   Output of ragService.retrieveContext(...).matches
 * @param {Array}  [opts.winningArgumentRefs]  Output of ragService.extractWinningArguments(...)
 * @returns {Promise<{analysis: object, mode: string, meta: object}>}
 */
async function analyzeDocument(documentText, documentType, structuredContext = {}, opts = {}) {
  const mode = resolveMode(documentType, structuredContext);
  const system = `${GLOBAL_GUARDRAILS}\n\n${MODE_PROMPTS[mode] || MODE_PROMPTS.generic}`;
  const user = buildUserPrompt({
    documentText,
    structuredContext,
    retrievedJudgments: opts.retrievedJudgments || [],
    winningArgumentRefs: opts.winningArgumentRefs || [],
  });

  let raw;
  let usage = null;
  try {
    const result = await callClaude({ system, user });
    raw = result.text;
    usage = result.usage;
  } catch (err) {
    // Degrade gracefully to empty envelope so the frontend never sees undefined.
    const envelope = emptyAnalysisEnvelope(
      err.code === 'LLM_NO_API_KEY'
        ? 'LLM analysis disabled — ANTHROPIC_API_KEY is not configured. Showing extraction-only view.'
        : `LLM analysis temporarily unavailable: ${err.message}`,
    );
    envelope.disputeType = mode;
    return {
      analysis: envelope,
      mode,
      meta: { ok: false, reason: err.code || 'LLM_ERROR', message: err.message },
    };
  }

  const parsed = extractJson(raw);
  const { valid, errors, value } = validateAnalysisSchema(parsed || {});

  // Even on validation drift we keep the patched `value` — the frontend cares
  // about shape, and a partially-filled-but-shape-correct payload beats a
  // 500 to the user. Surface the drift in meta for observability.
  return {
    analysis: value || emptyAnalysisEnvelope('LLM returned unparseable output.'),
    mode,
    meta: {
      ok: valid,
      validationErrors: errors,
      usage,
      modelId: ANTHROPIC_MODEL,
    },
  };
}

/**
 * Free-form Q&A grounded in document context. Used by the /api/chat route.
 * Same guardrails apply: no advice, no outcome prediction, educational tone.
 */
async function answerQuestion(documentContext, question) {
  if (!question || typeof question !== 'string') {
    return { answer: 'Please provide a question.', meta: { ok: false } };
  }

  const system = `You are CivicLens — an educational legal AI assistant. Answer the user's
question about their uploaded document grounded ONLY in the document context
provided. Do not predict legal outcomes. Do not provide legal advice. Keep
answers concise, plain-language, and educational. If the document context
does not contain enough information to answer, say so plainly.

Always end answers with the disclaimer:
"${DEFAULT_DISCLAIMER}"`;

  const ctxText = typeof documentContext === 'string'
    ? documentContext.slice(0, 8000)
    : JSON.stringify(documentContext || {}, null, 2).slice(0, 8000);

  const user = `DOCUMENT CONTEXT:
"""
${ctxText}
"""

QUESTION: ${question}`;

  try {
    const { text } = await callClaude({ system, user, maxTokens: 1024 });
    return { answer: text.trim() || 'No response generated.', meta: { ok: true } };
  } catch (err) {
    return {
      answer:
        err.code === 'LLM_NO_API_KEY'
          ? 'Chat is unavailable: server is missing ANTHROPIC_API_KEY.'
          : `Chat is temporarily unavailable: ${err.message}`,
      meta: { ok: false, reason: err.code || 'LLM_ERROR' },
    };
  }
}

module.exports = {
  analyzeDocument,
  answerQuestion,
  // exported for tests / inspection
  resolveMode,
  MODE_PROMPTS,
};
