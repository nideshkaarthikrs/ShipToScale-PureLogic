// Schema guard for LLM JSON responses produced by llmService.analyzeDocument.
//
// We intentionally avoid a runtime dep (no zod / ajv) — the hackathon backend
// already pulls in pdfjs + tesseract, and a custom 80-line validator gives us:
//   • exact control over coercion (string|number|array fallbacks),
//   • zero install cost,
//   • repair semantics: if the LLM drifts on one field we patch that field
//     rather than rejecting the whole envelope and forcing a re-call.
//
// Contract (Part 4 — Legal Intelligence):
//   {
//     summary: string,
//     disputeType: string,
//     riskScore: number,                // 0–100, clamped
//     riskAnalysis: array,
//     extractedClauses: array,
//     precedentMatches: array,
//     winningArguments: array,
//     persuasiveReasoning: array,
//     weaknessesDetected: array,
//     disclaimer: string
//   }

const REQUIRED_FIELDS = [
  ['summary', 'string'],
  ['disputeType', 'string'],
  ['riskScore', 'number'],
  ['riskAnalysis', 'array'],
  ['extractedClauses', 'array'],
  ['precedentMatches', 'array'],
  ['winningArguments', 'array'],
  ['persuasiveReasoning', 'array'],
  ['weaknessesDetected', 'array'],
  ['disclaimer', 'string'],
];

const DEFAULT_DISCLAIMER =
  'This analysis is for educational and informational purposes only. ' +
  'It does not constitute legal advice, does not predict legal outcomes, ' +
  'and is not a substitute for consultation with a qualified attorney.';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function coerceString(value, fallback = '') {
  if (typeof value === 'string') return value.trim();
  if (value == null) return fallback;
  try {
    return String(value);
  } catch (_) {
    return fallback;
  }
}

function coerceNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function coerceArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

// Best-effort JSON extraction. Claude sometimes wraps JSON in ```json fences
// or adds an explanatory preface even under strong instructions, so we strip
// fences and pull the outermost balanced { ... } block before parsing.
function extractJson(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  let text = String(raw).trim();

  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) text = fenceMatch[1].trim();

  try {
    return JSON.parse(text);
  } catch (_) {
    // Fall through to brace-balancing.
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  const candidate = text.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(candidate);
  } catch (_) {
    return null;
  }
}

function validateAnalysisSchema(payload) {
  const errors = [];

  if (!isPlainObject(payload)) {
    return { valid: false, errors: ['payload is not an object'], value: null };
  }

  const normalized = {};

  for (const [field, type] of REQUIRED_FIELDS) {
    const raw = payload[field];

    if (raw === undefined) {
      errors.push(`missing field: ${field}`);
    }

    if (type === 'string') {
      normalized[field] = coerceString(raw, '');
      if (!normalized[field]) errors.push(`field "${field}" must be a non-empty string`);
    } else if (type === 'number') {
      const n = coerceNumber(raw, 0);
      normalized[field] = field === 'riskScore' ? clamp(Math.round(n), 0, 100) : n;
    } else if (type === 'array') {
      normalized[field] = coerceArray(raw);
    }
  }

  // disclaimer is mandatory — never let the LLM omit it
  if (!normalized.disclaimer) {
    normalized.disclaimer = DEFAULT_DISCLAIMER;
  }

  return {
    valid: errors.length === 0,
    errors,
    value: normalized,
  };
}

// Build an empty-but-shape-correct envelope. Used as a graceful fallback when
// the LLM is unreachable (missing key, network error) or returns unparseable
// output — the frontend can still render an "analysis unavailable" state
// instead of crashing on `undefined.map`.
function emptyAnalysisEnvelope(reason = 'LLM analysis unavailable.') {
  return {
    summary: reason,
    disputeType: 'unknown',
    riskScore: 0,
    riskAnalysis: [],
    extractedClauses: [],
    precedentMatches: [],
    winningArguments: [],
    persuasiveReasoning: [],
    weaknessesDetected: [],
    disclaimer: DEFAULT_DISCLAIMER,
  };
}

module.exports = {
  validateAnalysisSchema,
  extractJson,
  emptyAnalysisEnvelope,
  DEFAULT_DISCLAIMER,
};
