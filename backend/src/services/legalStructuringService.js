// Heuristic legal structuring — regex-driven extraction for fast hackathon latency.
// LLM augmentation (deeper allegations/violations, semantic dispute categorization) is the next layer's job.

const DOC_TYPE_KEYWORDS = {
  rental: ['rent', 'lease', 'tenant', 'lessor', 'lessee', 'landlord', 'premises', 'security deposit'],
  employment: ['employee', 'employer', 'employment', 'salary', 'wages', 'job', 'designation', 'non-compete', 'termination of employment'],
  insurance: ['insured', 'insurer', 'premium', 'policy', 'claim', 'coverage', 'beneficiary', 'sum assured'],
  bill: ['bill', 'act', 'section', 'parliament', 'gazette', 'enacted', 'ministry', 'notification', 'amendment'],
  ingredient: ['ingredients', 'preservative', 'additive', 'fssai', 'nutrition', 'allergen', 'best before'],
  contract: ['agreement', 'party', 'parties', 'covenant', 'consideration', 'whereas'],
};

const DISPUTE_CATEGORY_MAP = {
  rental: 'tenancy / property',
  employment: 'employment / labour',
  insurance: 'insurance / claims',
  bill: 'public policy / regulatory',
  ingredient: 'consumer / food safety',
  contract: 'commercial contract',
};

const OBLIGATION_PATTERN = /(?:\b(?:shall|must|is required to|agrees to|undertakes to|will be required to|is obligated to)\b)[^.\n]{5,260}\./gi;
const ALLEGATION_PATTERN = /(?:\b(?:violated|breached|failed to|in violation of|did not comply|defaulted on|misrepresented|fraudulently)\b)[^.\n]{5,260}\./gi;
const VIOLATION_REF_PATTERN = /\b(?:section|clause|article|rule|regulation|sub-section)\s+\d+[A-Za-z]?(?:\.\d+)?(?:\([a-zA-Z0-9]+\))?/gi;

// Strict: must start with a digit after the optional currency prefix. The
// older [\d,]+ form matched bare commas, so OCR'd text like "Rs ," and
// "Rs.," surfaced as fake monetary references on the dashboard.
const MONEY_PATTERN = /(?:₹|Rs\.?|INR|Rupees?|USD|\$|EUR|€|GBP|£)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:lakh|lakhs|crore|crores|million|billion|k))?/gi;

// Trailing-comma cleanup: a real amount that ends in "," (e.g. "Rs. 50,000,")
// should drop the trailing punctuation before we surface it.
function normalizeMoneyToken(token) {
  return token.trim().replace(/[,.\s]+$/, '');
}

// Dates: ISO (YYYY-MM-DD), DD/MM/YYYY, DD-MM-YYYY, "1st January 2024", "January 1, 2024", "Jan 2024".
const DATE_PATTERN = new RegExp(
  [
    '\\b\\d{4}-\\d{2}-\\d{2}\\b',
    '\\b\\d{1,2}[\\/-]\\d{1,2}[\\/-]\\d{2,4}\\b',
    '\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)(?:\\s+\\d{2,4})?\\b',
    '\\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{1,2},?\\s+\\d{2,4}\\b',
    '\\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{2,4}\\b',
  ].join('|'),
  'gi'
);

const PARTY_PATTERNS = [
  /between\s+([A-Z][A-Za-z0-9 .,&'\-]{2,80}?)\s+(?:and|&)\s+([A-Z][A-Za-z0-9 .,&'\-]{2,80}?)(?=[.,;\n])/g,
  /\b(lessor|lessee|landlord|tenant|employer|employee|insurer|insured|licensor|licensee|buyer|seller|company|contractor|client)\s*[:\-]\s*([A-Z][A-Za-z0-9 .,&'\-]{2,80}?)(?=[.,;\n])/gi,
];

function detectDocType(text) {
  const lower = text.toLowerCase();
  let best = { type: 'unknown', score: 0 };
  for (const [type, keywords] of Object.entries(DOC_TYPE_KEYWORDS)) {
    const score = keywords.reduce((acc, kw) => acc + (lower.includes(kw) ? 1 : 0), 0);
    if (score > best.score) best = { type, score };
  }
  return best.score >= 2 ? best.type : 'unknown';
}

function uniq(values) {
  return Array.from(new Set(values.map((v) => v.trim()))).filter(Boolean);
}

function extractMatches(text, pattern, limit = 25) {
  const out = [];
  const re = new RegExp(pattern.source, pattern.flags);
  let m;
  while ((m = re.exec(text)) !== null && out.length < limit) {
    out.push(m[0]);
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return uniq(out);
}

function extractParties(text, limit = 10) {
  const found = [];
  for (const pattern of PARTY_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let m;
    while ((m = re.exec(text)) !== null && found.length < limit) {
      if (m[1]) found.push(m[1].trim());
      if (m[2]) found.push(m[2].trim());
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return uniq(found);
}

function summarizeSentences(matches, limit = 10) {
  return uniq(matches.map((s) => s.replace(/\s+/g, ' ').trim())).slice(0, limit);
}

function structure(rawText) {
  const text = (rawText || '').replace(/\r/g, '');
  if (!text.trim()) {
    return {
      docType: 'unknown',
      disputeCategory: 'unknown',
      involvedParties: [],
      keyAllegations: [],
      importantDates: [],
      monetaryReferences: [],
      obligations: [],
      potentialViolations: [],
      empty: true,
    };
  }

  const docType = detectDocType(text);
  const obligations = summarizeSentences(extractMatches(text, OBLIGATION_PATTERN, 50), 12);
  const allegations = summarizeSentences(extractMatches(text, ALLEGATION_PATTERN, 50), 12);
  const violations = uniq(extractMatches(text, VIOLATION_REF_PATTERN, 30));
  const dates = uniq(extractMatches(text, DATE_PATTERN, 40));
  const money = uniq(extractMatches(text, MONEY_PATTERN, 40).map(normalizeMoneyToken));
  const parties = extractParties(text);

  return {
    docType,
    disputeCategory: DISPUTE_CATEGORY_MAP[docType] || 'unclassified',
    involvedParties: parties,
    keyAllegations: allegations,
    importantDates: dates,
    monetaryReferences: money,
    obligations,
    potentialViolations: violations,
    empty: false,
  };
}

module.exports = {
  structure,
  detectDocType,
};
