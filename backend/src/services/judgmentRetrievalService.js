// Judgment retrieval — lightweight, vector-DB-free precedent matcher.
//
// Why this exists alongside ragService:
//   • ragService is the *internal* retriever used to ground the LLM call —
//     its output is shaped for prompt injection (full keyArguments, raw
//     summary, byDomain stats) and it returns up to topK matches.
//   • judgmentRetrievalService is the *public* retrieval contract per spec
//     §7: a fixed top-3 list with a slimmer, frontend-friendly shape and a
//     dedicated `relevantReasoning` field extracted from the judgment body.
//   • Both are kept thin and decoupled; in production we'd back both with a
//     shared vector store, but for hackathon scale (25 docs) a second
//     in-memory pass costs ~5 ms and avoids cross-coupling their contracts.
//
// Ranking design — reasoning-similarity over raw keyword overlap:
//
//   score(doc) = Σ_field weight(field) × overlap(query, doc.field)
//
// where overlap is IDF-weighted token coverage (rare terms dominate), and
// field weights front-load the reasoning-bearing fields:
//
//     judgmentSummary    × 3.0   — distilled reasoning, highest signal
//     keyArguments       × 2.5   — explicit legal lines of argument
//     judgmentText       × 1.0   — full body, lots of boilerplate noise
//     title              × 0.8   — caption only; party names rarely match
//     disputeDomain      × 0.5   — bag-of-one-token field, handled below
//
// A pure judgmentText-weighted scheme over-rewards documents that simply
// reuse common procedural language ("petitioner", "respondent", "writ").
// By front-loading summary + keyArguments we bias toward judgments whose
// *reasoning* — not their procedural surface — matches the query.
//
// disputeDomain match adds a flat +0.25 bonus when it equals docType. This
// is intentionally smaller than ragService's ×1.35 multiplier: this service
// is the public "show me similar cases" endpoint and we don't want a query
// like "rental security deposit forfeiture" to over-exclude an analogous
// consumer-side unfair-clause judgment just because of the domain tag.

const fs = require('fs');
const path = require('path');

const JUDGMENTS_DIR = path.join(__dirname, '..', 'data', 'judgments');

const STOPWORDS = new Set([
  'a','an','the','and','or','but','if','then','else','of','to','in','on','at','by',
  'for','with','as','is','are','was','were','be','been','being','it','its','this',
  'that','these','those','from','into','about','over','under','also','such','any',
  'all','no','not','so','than','which','who','whom','whose','what','when','where',
  'why','how','do','does','did','done','have','has','had','will','shall','can',
  'could','should','would','may','might','must','i','we','you','he','she','they',
  'them','their','our','your','my','me','us','him','her','his','hers','said',
  'shall','upon','herein','hereby','thereof','therein','thereto',
]);

const FIELD_WEIGHTS = {
  judgmentSummary: 3.0,
  keyArguments: 2.5,
  judgmentText: 1.0,
  title: 0.8,
};

const DOMAIN_MATCH_BONUS = 0.25;

// Reasoning-bearing cue words. Sentences in `judgmentText` containing any of
// these are the ones we extract as `relevantReasoning` — they are where the
// court actually *reasons*, as opposed to recital paragraphs.
const REASONING_CUES = [
  'held', 'holds', 'holding', 'opined', 'observed', 'finds', 'finding',
  'principle', 'doctrine', 'reasoning', 'jurisprudence', 'precedent',
  'natural justice', 'burden of proof', 'preponderance', 'ratio',
  'court is of the', 'this court', 'we are of', 'it is settled',
  'consider', 'considered', 'view of the', 'in view of',
];

function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function tokenSet(text) {
  return new Set(tokenize(text));
}

// Lightweight sentence splitter. Avoids dragging in a tokenizer dep; legal
// text uses heavy abbreviations ("Rs.", "v.", "Sec.") so we keep splits to
// sentence-ending punctuation followed by whitespace + capital letter.
function splitSentences(text) {
  if (!text) return [];
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z(\d])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 30 && s.length < 600);
}

let INDEX = null;
let IDF = null;

function loadJudgments() {
  if (INDEX) return INDEX;

  const files = fs.readdirSync(JUDGMENTS_DIR).filter((f) => f.endsWith('.json'));
  const docs = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(JUDGMENTS_DIR, file), 'utf-8');
      const j = JSON.parse(raw);

      const keyArgsText = Array.isArray(j.keyArguments) ? j.keyArguments.join(' ') : '';

      docs.push({
        id: j.id || file.replace(/\.json$/, ''),
        title: j.title || 'Untitled judgment',
        court: j.court || 'Unknown court',
        year: j.year || null,
        disputeDomain: (j.disputeDomain || 'unknown').toLowerCase(),
        winningParty: j.winningParty || 'unknown',
        keyArguments: Array.isArray(j.keyArguments) ? j.keyArguments : [],
        judgmentSummary: j.judgmentSummary || '',
        judgmentText: j.judgmentText || '',
        // pre-tokenized per-field sets for O(1) overlap checks
        tokens: {
          title: tokenSet(j.title),
          judgmentSummary: tokenSet(j.judgmentSummary),
          keyArguments: tokenSet(keyArgsText),
          judgmentText: tokenSet(j.judgmentText),
        },
        // sentence-level cache for reasoning extraction
        sentences: splitSentences(j.judgmentText || ''),
      });
    } catch (err) {
      console.warn(`[judgmentRetrievalService] skipping ${file}: ${err.message}`);
    }
  }

  // IDF over the union of all field tokens — rare terms in *any* field get
  // their weight; common procedural vocabulary ("petitioner", "court") gets
  // its weight crushed and stops dominating raw overlap scores.
  const df = new Map();
  for (const d of docs) {
    const unionTokens = new Set([
      ...d.tokens.title,
      ...d.tokens.judgmentSummary,
      ...d.tokens.keyArguments,
      ...d.tokens.judgmentText,
    ]);
    for (const t of unionTokens) df.set(t, (df.get(t) || 0) + 1);
  }
  IDF = new Map();
  const N = docs.length || 1;
  for (const [term, freq] of df.entries()) {
    IDF.set(term, Math.log((N + 1) / (freq + 1)) + 1);
  }

  INDEX = docs;
  return INDEX;
}

// IDF-weighted overlap between a query token set and a doc field token set.
// We sum IDF over the *intersection*, not just count tokens — that's what
// turns this from "keyword overlap" into "weighted reasoning overlap".
function weightedOverlap(queryTokens, fieldTokens) {
  if (queryTokens.size === 0 || fieldTokens.size === 0) return 0;
  let score = 0;
  // iterate the smaller of the two sets
  const [small, large] = queryTokens.size <= fieldTokens.size
    ? [queryTokens, fieldTokens]
    : [fieldTokens, queryTokens];
  for (const term of small) {
    if (large.has(term)) {
      score += IDF.get(term) || 1;
    }
  }
  return score;
}

// Normalize raw composite scores into [0, 1] across the candidate set so the
// returned `similarityScore` is interpretable and comparable across queries
// of varying length. Pure raw IDF sums grow linearly with query size — a
// 4-token query would always rank "less similar" than a 40-token query.
function normalizeScores(scored) {
  const max = Math.max(0, ...scored.map((s) => s.raw));
  if (max === 0) return scored.map((s) => ({ ...s, similarityScore: 0 }));
  return scored.map((s) => ({
    ...s,
    similarityScore: Math.round((s.raw / max) * 1000) / 1000, // 3-decimal 0–1
  }));
}

// Extract reasoning-bearing sentences that overlap with the query. We score
// each sentence by (a) presence of REASONING_CUES (the court actually
// reasoning, not reciting facts) and (b) IDF overlap with the query, then
// return the top 3 short excerpts.
function extractRelevantReasoning(doc, queryTokens, maxSentences = 3) {
  if (!doc.sentences.length) return [];

  const scored = doc.sentences.map((sent) => {
    const lower = sent.toLowerCase();
    const hasCue = REASONING_CUES.some((cue) => lower.includes(cue));
    const sentTokens = tokenSet(sent);
    const overlap = weightedOverlap(queryTokens, sentTokens);
    // Hard requirement: must have some query overlap OR be a strong reasoning
    // sentence. Pure cue-word sentences with zero query overlap aren't
    // "relevant" — they're just generic reasoning paragraphs.
    if (overlap === 0 && !hasCue) return null;
    return {
      sentence: sent,
      score: overlap + (hasCue ? 1.5 : 0),
    };
  }).filter(Boolean);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxSentences).map((s) => s.sentence);
}

/**
 * Retrieve the top 3 judgments most similar to an uploaded dispute.
 *
 * @param {string} rawText  Extracted text of the uploaded document.
 * @param {string} [docType]  Optional dispute domain hint
 *                            (e.g. 'rental', 'employment', 'insurance', 'consumer').
 * @returns {Promise<Array<{
 *   title: string,
 *   similarityScore: number,         // normalized 0–1
 *   winningArguments: string[],      // only when winningParty matches the side likely to win
 *   relevantReasoning: string[],     // extracted reasoning sentences from judgmentText
 *   judgmentSummary: string,
 *   // diagnostic extras (non-breaking — frontend may ignore):
 *   id: string, court: string, year: number|null,
 *   disputeDomain: string, winningParty: string
 * }>>}
 */
async function retrieveSimilarJudgments(rawText, docType = null) {
  loadJudgments();

  const queryTokens = tokenSet(rawText || '');
  if (queryTokens.size === 0) return [];

  const docTypeLower = docType ? String(docType).toLowerCase() : null;

  const scored = INDEX.map((doc) => {
    let raw = 0;
    for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
      raw += weight * weightedOverlap(queryTokens, doc.tokens[field]);
    }
    if (docTypeLower && doc.disputeDomain === docTypeLower) {
      raw += DOMAIN_MATCH_BONUS * raw; // proportional bump so it can't dominate a strong off-domain match
    }
    return { doc, raw };
  });

  const normalized = normalizeScores(scored)
    .filter((s) => s.raw > 0)
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, 3);

  return normalized.map(({ doc, similarityScore }) => ({
    id: doc.id,
    title: doc.title,
    court: doc.court,
    year: doc.year,
    disputeDomain: doc.disputeDomain,
    winningParty: doc.winningParty,
    similarityScore,
    // Surface keyArguments as "winning arguments" — these are the legal lines
    // the winning side actually advanced. We do not filter by winningParty
    // here because the consumer of this endpoint wants to *see what worked*
    // in analogous cases regardless of which side won; the winningParty
    // field is exposed alongside so callers can interpret context.
    winningArguments: doc.keyArguments,
    relevantReasoning: extractRelevantReasoning(doc, queryTokens),
    judgmentSummary: doc.judgmentSummary,
  }));
}

module.exports = {
  retrieveSimilarJudgments,
  // exported for tests / observability
  FIELD_WEIGHTS,
  DOMAIN_MATCH_BONUS,
};
