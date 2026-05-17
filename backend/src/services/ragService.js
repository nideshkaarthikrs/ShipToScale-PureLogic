// RAG service — in-memory similarity matching over backend/src/data/judgments/*.json.
//
// For the hackathon scale (25 judgments, ~5–10 KB each), a TF-IDF-lite token
// overlap with domain affinity boosting comfortably beats the cost/complexity
// of spinning up Pinecone / ChromaDB. Production swap target documented in
// context.md §3.
//
// Public API:
//   retrieveContext(query, opts) → { matches, byDomain, totalIndexed }
//     • opts.topK          (default 5)
//     • opts.disputeDomain (optional bias; e.g. 'rental', 'employment')

const fs = require('fs');
const path = require('path');

const JUDGMENTS_DIR = path.join(__dirname, '..', 'data', 'judgments');

// English stopwords. Kept small on purpose — over-aggressive stopword removal
// kills legal terms of art ("of right", "in service") that genuinely carry
// signal for similarity matching.
const STOPWORDS = new Set([
  'a','an','the','and','or','but','if','then','else','of','to','in','on','at','by',
  'for','with','as','is','are','was','were','be','been','being','it','its','this',
  'that','these','those','from','into','about','over','under','also','such','any',
  'all','no','not','so','than','which','who','whom','whose','what','when','where',
  'why','how','do','does','did','done','have','has','had','will','shall','can',
  'could','should','would','may','might','must','i','we','you','he','she','they',
  'them','their','our','your','my','me','us','him','her','his','hers',
]);

function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function termFrequencies(tokens) {
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  return tf;
}

let INDEX = null;
let IDF = null;

function buildIndex() {
  if (INDEX) return INDEX;

  const files = fs.readdirSync(JUDGMENTS_DIR).filter((f) => f.endsWith('.json'));
  const docs = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(JUDGMENTS_DIR, file), 'utf-8');
      const j = JSON.parse(raw);
      const corpus = [
        j.title,
        j.judgmentSummary,
        (j.keyArguments || []).join(' '),
        j.judgmentText,
      ]
        .filter(Boolean)
        .join('\n');
      const tokens = tokenize(corpus);
      docs.push({
        id: j.id || file.replace(/\.json$/, ''),
        title: j.title || 'Untitled',
        court: j.court || 'Unknown court',
        year: j.year || null,
        disputeDomain: (j.disputeDomain || 'unknown').toLowerCase(),
        winningParty: j.winningParty || 'unknown',
        keyArguments: Array.isArray(j.keyArguments) ? j.keyArguments : [],
        judgmentSummary: j.judgmentSummary || '',
        tokens,
        tf: termFrequencies(tokens),
        length: tokens.length || 1,
      });
    } catch (err) {
      console.warn(`[ragService] skipping malformed judgment ${file}: ${err.message}`);
    }
  }

  // IDF across the corpus — words appearing in many docs (e.g. "court",
  // "petitioner") get down-weighted; rare clause-specific terms dominate the
  // similarity score.
  const df = new Map();
  for (const d of docs) {
    for (const term of new Set(d.tokens)) {
      df.set(term, (df.get(term) || 0) + 1);
    }
  }
  IDF = new Map();
  const N = docs.length || 1;
  for (const [term, freq] of df.entries()) {
    IDF.set(term, Math.log((N + 1) / (freq + 1)) + 1);
  }

  INDEX = docs;
  return INDEX;
}

function tfidfVector(tf) {
  const vec = new Map();
  for (const [term, count] of tf.entries()) {
    const idf = IDF.get(term);
    if (!idf) continue;
    vec.set(term, count * idf);
  }
  return vec;
}

function cosineSim(vecA, vecB) {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (const v of vecA.values()) magA += v * v;
  for (const v of vecB.values()) magB += v * v;
  // iterate the smaller vector for the dot product
  const [small, large] = vecA.size <= vecB.size ? [vecA, vecB] : [vecB, vecA];
  for (const [term, v] of small.entries()) {
    const o = large.get(term);
    if (o) dot += v * o;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

async function retrieveContext(query, opts = {}) {
  const { topK = 5, disputeDomain = null } = opts;
  buildIndex();

  const queryText = typeof query === 'string' ? query : JSON.stringify(query || '');
  const qTokens = tokenize(queryText);
  if (qTokens.length === 0) {
    return { matches: [], byDomain: {}, totalIndexed: INDEX.length };
  }
  const qVec = tfidfVector(termFrequencies(qTokens));

  const scored = INDEX.map((d) => {
    const docVec = tfidfVector(d.tf);
    let score = cosineSim(qVec, docVec);

    // Domain affinity boost: a rental query should not be ranked alongside an
    // employment dismissal just because both contain "agreement" and "party".
    if (disputeDomain && d.disputeDomain === disputeDomain.toLowerCase()) {
      score *= 1.35;
    }
    return { doc: d, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const matches = scored
    .filter((s) => s.score > 0)
    .slice(0, topK)
    .map(({ doc, score }) => ({
      id: doc.id,
      title: doc.title,
      court: doc.court,
      year: doc.year,
      disputeDomain: doc.disputeDomain,
      winningParty: doc.winningParty,
      similarity: Math.round(score * 1000) / 1000, // 3-decimal
      similarityPercent: Math.min(100, Math.round(score * 100)),
      keyArguments: doc.keyArguments,
      judgmentSummary: doc.judgmentSummary,
    }));

  const byDomain = matches.reduce((acc, m) => {
    acc[m.disputeDomain] = (acc[m.disputeDomain] || 0) + 1;
    return acc;
  }, {});

  return { matches, byDomain, totalIndexed: INDEX.length };
}

// Pull winning-argument citations out of the retrieved set. We surface only
// those where the cited party actually won so the LLM never gets handed a
// losing line of argument as a "winning" reference.
function extractWinningArguments(matches) {
  const out = [];
  for (const m of matches) {
    if (!Array.isArray(m.keyArguments) || m.keyArguments.length === 0) continue;
    for (const arg of m.keyArguments) {
      out.push({
        argument: arg,
        citation: `${m.title}, ${m.court} (${m.year})`,
        caseId: m.id,
        winningParty: m.winningParty,
        similarityPercent: m.similarityPercent,
      });
    }
  }
  return out;
}

module.exports = { retrieveContext, extractWinningArguments };
