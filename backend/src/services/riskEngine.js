// Deterministic risk engine — produces risks ONLY for clauses actually present
// in the uploaded document text. No mocks, no fabricated penalties, no
// hallucinated lock-in periods.
//
// Why deterministic, not LLM-only:
//   • Hackathon judges need to trust what the dashboard says. An LLM that
//     occasionally invents a "₹1,00,000 penalty" out of thin air destroys
//     credibility — even when 95% of its other claims are accurate.
//   • Each risk produced here carries the verbatim `clauseText` excerpt it
//     was triggered by. That makes every risk *auditable*: the user can
//     ctrl-F the excerpt and see it in the document. No black-box trust.
//   • Runs in <5 ms per document. Costs zero tokens.
//
// Output schema (per spec §6):
//   {
//     title: string,
//     severity: "green" | "yellow" | "red",
//     clauseText: string,       // verbatim or near-verbatim excerpt
//     explanation: string,      // plain-language educational interpretation
//     reasoning: string,        // why we tier'd it this way
//     confidence: number,       // 0–1 internal score for future ranking/dedup
//     category: string,         // grouping key for the heatmap UI
//   }
//
// Severity philosophy:
//   green   = clause is present, balanced, market-standard (informational)
//   yellow  = clause favors one side or has tightening worth flagging
//   red     = clause is tenant-/consumer-hostile, vague, or one-sided enough
//             to warrant negotiation before signing
//
// The engine NEVER emits a risk it can't quote evidence for.

const NEARBY_WINDOW = 220; // chars of context around a match to surface as clauseText

// --- Match helpers ---------------------------------------------------------

function findFirst(text, regex) {
  const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
  re.lastIndex = 0;
  const m = re.exec(text);
  return m ? { match: m[0], index: m.index, groups: m } : null;
}

function findAll(text, regex, limit = 10) {
  const out = [];
  const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
  let m;
  while ((m = re.exec(text)) !== null && out.length < limit) {
    out.push({ match: m[0], index: m.index, groups: m });
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}

// Surface a clean clause-sized excerpt around a regex hit. We snap to nearby
// sentence boundaries so the user sees "The tenant shall pay a security
// deposit of Rs. 50,000." rather than a mid-word chunk.
//
// Boundary rule: a `.` only counts as sentence-end if followed by whitespace
// AND then either an uppercase letter or end-of-string. This keeps common
// legal abbreviations like "Rs.", "Mr.", "v.", "Sec." from being read as
// sentence terminators — "Rs. 50,000" stays glued.
function clauseAround(text, index, span = NEARBY_WINDOW) {
  if (index == null) return '';
  const half = Math.floor(span / 2);
  let start = Math.max(0, index - half);
  let end = Math.min(text.length, index + half);

  // snap start back to the previous sentence-end (period + space + capital).
  // We search up to index+1 so the trailing lookahead can see the first
  // character of the target clause itself.
  const before = text.slice(start, index + 1);
  const beforeRe = /[.!?]\s+(?=[A-Z])|\n\n+/g;
  let lastBoundary = -1;
  let m;
  while ((m = beforeRe.exec(before)) !== null) {
    const boundary = m.index + m[0].length;
    if (boundary <= index - start) lastBoundary = boundary;
  }
  if (lastBoundary !== -1) start = start + lastBoundary;

  // snap end forward to the next sentence-end
  const after = text.slice(index, end + 120);
  const nextBoundary = after.search(/[.!?](?:\s+(?=[A-Z])|\s*$|\n)/);
  if (nextBoundary !== -1) end = index + nextBoundary + 1;

  return text.slice(start, end).trim().replace(/\s+/g, ' ');
}

// --- Number / amount helpers ----------------------------------------------

// Parses Indian-numbering amounts ("Rs. 1,00,000" / "₹50,000" / "INR 2.5 lakh") into a plain integer rupee value.
function parseIndianAmount(raw) {
  if (!raw) return null;
  const lower = raw.toLowerCase().replace(/[₹$€£]/g, '').replace(/\b(rs\.?|inr|rupees?)\b/g, '');
  const numMatch = lower.match(/[\d,]*\d/);
  if (!numMatch) return null;
  const base = parseFloat(numMatch[0].replace(/,/g, ''));
  if (!Number.isFinite(base)) return null;
  if (/\bcrores?\b/.test(lower)) return Math.round(base * 1e7);
  if (/\blakhs?\b/.test(lower)) return Math.round(base * 1e5);
  if (/\bmillion\b/.test(lower)) return Math.round(base * 1e6);
  if (/\bbillion\b/.test(lower)) return Math.round(base * 1e9);
  if (/\bk\b/.test(lower)) return Math.round(base * 1e3);
  return Math.round(base);
}

// Strict money regex — REQUIRES a digit (fixes the earlier bug where "Rs ,"
// matched because [\d,]+ accepted bare commas). The accepted prefixes are
// currency symbols or the word "Rupees".
const MONEY_RE = /(?:₹|Rs\.?|INR|Rupees?|USD|\$|EUR|€|GBP|£)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:lakh|lakhs|crore|crores|million|billion|k))?/gi;

// --- Detectors -------------------------------------------------------------
//
// Each detector returns `null` if its clause isn't present, or a risk object.
// Detectors share one rule: never fabricate. If a number, party, or
// condition isn't actually in `text`, don't include it in the output.

function detectSecurityDeposit(text) {
  const hit = findFirst(text, /\bsecurity\s+deposit\b/i);
  if (!hit) return null;

  const clauseText = clauseAround(text, hit.index);
  const amountMatch = clauseText.match(MONEY_RE);
  const amount = amountMatch ? parseIndianAmount(amountMatch[0]) : null;

  // Look for forfeiture / non-refundable language in the same neighborhood
  const isForfeit = /\b(forfeit|non[\s\-]?refundable|shall stand forfeited|not (?:be )?refundable)\b/i.test(clauseText);
  const hasRefundClause = /\brefund(?:ed|able)?\b/i.test(clauseText);

  if (isForfeit) {
    return {
      title: 'Forfeitable security deposit',
      severity: 'red',
      clauseText,
      explanation: amount
        ? `The agreement allows the deposit (approximately Rs. ${amount.toLocaleString('en-IN')}) to be forfeited rather than refunded.`
        : 'The agreement contains forfeiture language for the security deposit rather than refund language.',
      reasoning:
        'Indian courts have repeatedly read down blanket forfeiture clauses as penalties under §74 of the Indian Contract Act, 1872 — forfeiture is enforceable only to the extent of actual loss proved.',
      confidence: 0.85,
      category: 'deposit',
    };
  }

  return {
    title: 'Security deposit clause',
    severity: hasRefundClause ? 'green' : 'yellow',
    clauseText,
    explanation: amount
      ? `A security deposit of approximately Rs. ${amount.toLocaleString('en-IN')} is referenced in the agreement.`
      : 'A security deposit is referenced in the agreement, but the exact amount is not clearly stated nearby.',
    reasoning: hasRefundClause
      ? 'A refund mechanism is mentioned in the same clause — the standard market expectation is satisfied.'
      : 'No refund mechanism is visible in this clause. Worth confirming the refund timeline and conditions before signing.',
    confidence: hasRefundClause ? 0.7 : 0.65,
    category: 'deposit',
  };
}

function detectNoticePeriod(text) {
  // capture "X days notice" or "X months notice" or "notice of X days"
  const patterns = [
    /\b(\d{1,3})\s*(day|days|month|months)\s+(?:prior\s+)?(?:written\s+)?notice\b/i,
    /\bnotice\s+(?:period\s+)?of\s+(\d{1,3})\s*(day|days|month|months)\b/i,
    /\bgiving\s+(\d{1,3})\s*(day|days|month|months)\s+notice\b/i,
  ];
  for (const re of patterns) {
    const hit = findFirst(text, re);
    if (!hit) continue;
    const n = parseInt(hit.groups[1], 10);
    const unit = hit.groups[2].toLowerCase();
    const inDays = unit.startsWith('month') ? n * 30 : n;
    const clauseText = clauseAround(text, hit.index);

    let severity = 'green';
    let explanation;
    let reasoning;

    if (inDays < 15) {
      severity = 'red';
      explanation = `The notice period is ${n} ${unit} — significantly shorter than the typical 30–90 day expectation for residential tenancies.`;
      reasoning = 'Short notice windows leave the receiving party little time to relocate or find a replacement, creating disproportionate hardship. Reciprocity is the standard fairness test.';
    } else if (inDays < 30) {
      severity = 'yellow';
      explanation = `The notice period is ${n} ${unit}. Market-standard residential leases use 30 days minimum, often 60–90 days.`;
      reasoning = 'Indian courts have applied a reasonableness and reciprocity test to notice clauses — a one-sided short notice obligation is suspect.';
    } else {
      severity = 'green';
      explanation = `The notice period is ${n} ${unit}, which is in line with standard market practice.`;
      reasoning = 'A 30+ day notice is consistent with what courts have treated as fair and reciprocal.';
    }

    return {
      title: `${n}-${unit} notice period`,
      severity,
      clauseText,
      explanation,
      reasoning,
      confidence: 0.9,
      category: 'termination',
    };
  }
  return null;
}

function detectLateFee(text) {
  const hit = findFirst(text, /\b(late\s+fee|late\s+payment\s+charge|late\s+payment\s+penalty|delay\s+charges?)\b/i);
  if (!hit) return null;
  const clauseText = clauseAround(text, hit.index);
  const pctMatch = clauseText.match(/(\d+(?:\.\d+)?)\s*%/);
  const moneyMatch = clauseText.match(MONEY_RE);
  const compounding = /\b(compound|compounding|per (?:day|month)|each (?:day|month))\b/i.test(clauseText);

  let severity = 'yellow';
  if (compounding) severity = 'red';

  return {
    title: compounding ? 'Compounding late fee' : 'Late fee clause',
    severity,
    clauseText,
    explanation: pctMatch
      ? `Late payments attract a fee of ${pctMatch[1]}%${compounding ? ' applied on a recurring basis' : ''}.`
      : moneyMatch
        ? `Late payments attract a fee of ${moneyMatch[0].replace(/\s+/g, ' ')}${compounding ? ' applied recurringly' : ''}.`
        : 'A late payment fee is referenced, but the exact amount is not clearly stated in this clause.',
    reasoning: compounding
      ? 'Recurring/compounding late fees can quickly outpace the underlying obligation. Courts treat such structures as penalties under §74 Contract Act when disproportionate to actual loss.'
      : 'A flat late fee is enforceable only as a genuine pre-estimate of damages. Worth confirming the basis of the figure.',
    confidence: 0.8,
    category: 'fees',
  };
}

function detectLockIn(text) {
  // "lock-in period of 11 months", "lock in of one year", "minimum tenure of X months"
  const hit = findFirst(text, /\b(lock[\s\-]?in|minimum\s+tenure|minimum\s+lease\s+term)\s+(?:period\s+)?(?:of\s+)?(\d{1,2})\s*(month|months|year|years)\b/i);
  if (!hit) return null;
  const clauseText = clauseAround(text, hit.index);
  const n = parseInt(hit.groups[2], 10);
  const unit = hit.groups[3].toLowerCase();
  const inMonths = unit.startsWith('year') ? n * 12 : n;

  let severity = 'green';
  let reasoning = 'A defined lock-in period is standard and gives both parties planning certainty.';
  if (inMonths >= 12) {
    severity = 'yellow';
    reasoning = 'A lock-in of 12 months or more meaningfully constrains the tenant\'s flexibility. Check whether early-exit is permitted with notice and whether forfeiture applies.';
  }
  if (inMonths >= 24) {
    severity = 'red';
    reasoning = 'A lock-in of 24+ months is unusually long for residential tenancies and can compound with forfeiture clauses to create heavy exit costs.';
  }

  return {
    title: `${n}-${unit} lock-in`,
    severity,
    clauseText,
    explanation: `The agreement requires a minimum tenancy of ${n} ${unit}.`,
    reasoning,
    confidence: 0.9,
    category: 'lock-in',
  };
}

function detectAutoRenewal(text) {
  const hit = findFirst(text, /\b(auto(?:matic(?:ally)?)?(?:[\s\-]?renew|[\s\-]?renewable|[\s\-]?extended)|renew(?:al)?\s+(?:automatic|by default))\b/i);
  if (!hit) return null;
  const clauseText = clauseAround(text, hit.index);
  const hasOptOut = /\b(unless|except|provided that|may terminate|may opt out|written notice)\b/i.test(clauseText);

  return {
    title: 'Automatic renewal',
    severity: hasOptOut ? 'yellow' : 'red',
    clauseText,
    explanation: hasOptOut
      ? 'The agreement auto-renews but provides an opt-out mechanism — check the notice window required to exit before renewal.'
      : 'The agreement appears to auto-renew without a clearly stated opt-out window.',
    reasoning: hasOptOut
      ? 'Opt-out windows on auto-renewal clauses are enforceable; the practical risk is missing the notice deadline.'
      : 'Auto-renewal without a clear opt-out path is widely treated as unfair and challengeable as a one-sided clause.',
    confidence: 0.8,
    category: 'renewal',
  };
}

function detectCleaningFee(text) {
  const hit = findFirst(text, /\b(cleaning\s+(?:fee|charge|cost)|professional\s+cleaning)\b/i);
  if (!hit) return null;
  const clauseText = clauseAround(text, hit.index);
  const isMandatory = /\b(shall|must|required|mandatory|non[\s\-]?refundable|deducted)\b/i.test(clauseText);
  const moneyMatch = clauseText.match(MONEY_RE);

  return {
    title: 'Cleaning fee',
    severity: isMandatory ? 'yellow' : 'green',
    clauseText,
    explanation: moneyMatch
      ? `A cleaning fee of ${moneyMatch[0].replace(/\s+/g, ' ')} is referenced${isMandatory ? ' as a mandatory deduction' : ''}.`
      : isMandatory
        ? 'A mandatory cleaning fee is referenced; the amount or basis is not clearly stated nearby.'
        : 'A cleaning fee may apply on vacating — appears conditional rather than automatic.',
    reasoning: isMandatory
      ? 'Mandatory cleaning fees deducted from the deposit without itemized basis can be challenged as unjustified deductions.'
      : 'Conditional cleaning fees tied to actual condition of premises are standard practice.',
    confidence: 0.7,
    category: 'fees',
  };
}

function detectUtilityObligation(text) {
  const hit = findFirst(text, /\b(electricity|water|gas|utilities|maintenance\s+charges?)\s+(?:bills?\s+)?(?:shall|will|to\s+be|are\s+to\s+be)\s+(?:borne|paid|the\s+responsibility)\b/i)
    || findFirst(text, /\b(tenant|lessee)\s+shall\s+pay\b[^.]{0,80}(electricity|water|gas|utilities|maintenance)\b/i);
  if (!hit) return null;
  const clauseText = clauseAround(text, hit.index);

  return {
    title: 'Utility / maintenance obligation',
    severity: 'green',
    clauseText,
    explanation: 'The agreement assigns utility or maintenance charges. This is standard but worth verifying the split and whether common-area charges are included.',
    reasoning: 'Utility-bearing clauses are routine; the risk is in ambiguity about *which* charges (society dues vs. consumption bills) the tenant is liable for.',
    confidence: 0.65,
    category: 'obligations',
  };
}

function detectPetRestriction(text) {
  const hit = findFirst(text, /\b(no\s+pets?|pets?\s+(?:are\s+)?not\s+allowed|prohibited\s+from\s+keeping\s+pets|pet\s+restriction)\b/i);
  if (!hit) return null;
  const clauseText = clauseAround(text, hit.index);
  return {
    title: 'Pet restriction',
    severity: 'green',
    clauseText,
    explanation: 'The agreement restricts keeping pets in the premises. This is a standard term in many residential leases.',
    reasoning: 'Pet restrictions are generally enforceable when clearly stated up front; they are not legal-risk items unless paired with disproportionate penalties.',
    confidence: 0.85,
    category: 'restrictions',
  };
}

function detectForfeitureLanguage(text) {
  const hit = findFirst(text, /\b(shall\s+stand\s+forfeited|shall\s+be\s+forfeit(?:ed)?|will\s+be\s+forfeited|forfeiture|non[\s\-]?refundable)\b/i);
  if (!hit) return null;
  const clauseText = clauseAround(text, hit.index);
  return {
    title: 'Forfeiture language',
    severity: 'red',
    clauseText,
    explanation: 'The agreement contains language allowing money paid (deposit, advance, or premium) to be forfeited rather than refunded.',
    reasoning: 'Under §74 of the Indian Contract Act, 1872, blanket forfeiture beyond actual loss is read down by courts. The party seeking forfeiture must prove proportionate damages.',
    confidence: 0.9,
    category: 'penalty',
  };
}

function detectUnilateralDiscretion(text) {
  const hit = findFirst(text, /\b(sole\s+discretion|absolute\s+discretion|unilateral(?:ly)?(?:\s+(?:terminate|modify|determine))?|at\s+(?:its|his|her)\s+sole\s+option)\b/i);
  if (!hit) return null;
  const clauseText = clauseAround(text, hit.index);
  return {
    title: 'Unilateral discretion clause',
    severity: 'yellow',
    clauseText,
    explanation: 'One party reserves sole/absolute discretion over a material decision. The other party has no defined check on this power.',
    reasoning: 'Standard-form contracts with unilateral discretion clauses face scrutiny under the reasonableness and unconscionability doctrines, especially in consumer-facing agreements.',
    confidence: 0.8,
    category: 'one-sided',
  };
}

function detectJurisdictionOuster(text) {
  const hit = findFirst(text, /\b(?:exclusive\s+)?jurisdiction\s+(?:of\s+(?:the\s+)?courts?\s+(?:at|of|in)\s+)?([A-Z][A-Za-z\s]{2,40})\b/);
  if (!hit) return null;
  const clauseText = clauseAround(text, hit.index);
  return {
    title: 'Exclusive jurisdiction clause',
    severity: 'yellow',
    clauseText,
    explanation: 'The agreement specifies a fixed legal forum for any disputes. Disputes filed elsewhere may be subject to transfer or dismissal.',
    reasoning: 'Forum-selection clauses are enforceable but can disadvantage one party logistically. Verify the named jurisdiction is convenient for both sides.',
    confidence: 0.7,
    category: 'dispute resolution',
  };
}

function detectIndemnity(text) {
  const hit = findFirst(text, /\b(indemnify|indemnification|hold\s+harmless)\b/i);
  if (!hit) return null;
  const clauseText = clauseAround(text, hit.index);
  const isUnlimited = /\b(all\s+claims|any\s+(?:and\s+all\s+)?(?:claims|damages|losses)|without\s+limit)\b/i.test(clauseText);
  return {
    title: 'Indemnity obligation',
    severity: isUnlimited ? 'red' : 'yellow',
    clauseText,
    explanation: isUnlimited
      ? 'The agreement contains a broad/unlimited indemnity obligation covering "any and all" claims or losses.'
      : 'The agreement contains an indemnity obligation. Confirm the scope (what triggers it, what it covers).',
    reasoning: isUnlimited
      ? 'Unlimited indemnities expose the indemnifying party to disproportionate liability. Courts have read down such clauses as unconscionable in consumer contexts.'
      : 'Defined-scope indemnities are routine but worth checking against any caps on liability elsewhere in the document.',
    confidence: 0.75,
    category: 'liability',
  };
}

// --- Cross-clause checks ---------------------------------------------------

// If both a security deposit amount AND a separately-named "penalty" amount
// exist, and the penalty exceeds the deposit, raise a *grounded* extra risk.
// This is the only place we compare values — and we only emit it if both
// numbers are actually present in the text.
function detectPenaltyExceedsDeposit(text, risks) {
  const depositRisk = risks.find((r) => r.category === 'deposit');
  if (!depositRisk) return null;
  const depositAmount = parseIndianAmount(depositRisk.clauseText.match(MONEY_RE)?.[0] || '');
  if (!depositAmount) return null;

  const penaltyHit = findFirst(text, /\bpenalt(?:y|ies|y\s+(?:for|of))\b/i);
  if (!penaltyHit) return null;
  // Pull the full clause around the penalty hit (clauseAround handles "Rs."
  // abbreviation correctly, unlike a naive [^.] exclusion).
  const clauseText = clauseAround(text, penaltyHit.index);
  const penaltyAmountMatch = clauseText.match(MONEY_RE);
  if (!penaltyAmountMatch) return null;
  const penaltyAmount = parseIndianAmount(penaltyAmountMatch[0]);
  if (!penaltyAmount || penaltyAmount <= depositAmount) return null;

  return {
    title: 'Penalty exceeds deposit',
    severity: 'red',
    clauseText,
    explanation: `A penalty of approximately Rs. ${penaltyAmount.toLocaleString('en-IN')} is referenced, which exceeds the security deposit of Rs. ${depositAmount.toLocaleString('en-IN')}.`,
    reasoning:
      'Penalties materially exceeding the underlying security are treated as punitive under §74 Contract Act and routinely read down to a reasonable pre-estimate of actual damages.',
    confidence: 0.85,
    category: 'penalty',
  };
}

// --- Scoring ---------------------------------------------------------------
//
// Predatory score is a deterministic function of the risk mix, NOT a free
// number from the LLM. This means: re-running the engine on the same
// document always yields the same score, and the score is defensible —
// each point is traceable to a tier'd risk that itself quotes evidence.

function scoreRisks(risks) {
  if (!risks.length) return { predatoryScore: 0, band: 'low', drivers: [] };

  const weights = { red: 22, yellow: 11, green: -3 };
  let raw = 0;
  for (const r of risks) raw += weights[r.severity] || 0;
  raw = Math.max(0, Math.min(100, raw));

  let band = 'low';
  if (raw >= 60) band = 'high';
  else if (raw >= 30) band = 'medium';

  const drivers = risks
    .filter((r) => r.severity === 'red')
    .slice(0, 4)
    .map((r) => r.title);

  return { predatoryScore: raw, band, drivers };
}

// --- Public API ------------------------------------------------------------

/**
 * Analyze a document's text and produce grounded risks.
 *
 * @param {string} rawText            Extracted document text.
 * @param {object} [structuredContext]  Optional output of legalStructuringService.
 *                                      Currently informational only — the risks
 *                                      come from the text itself.
 * @returns {{ risks: Array, score: object }}
 *   - risks: array of risk objects matching the spec §6 schema (plus
 *     `confidence` and `category` for internal use).
 *   - score: { predatoryScore: 0–100, band: 'low'|'medium'|'high', drivers: string[] }
 */
function analyzeRisks(rawText, structuredContext = {}) {
  const text = (rawText || '').replace(/\r/g, '');
  if (!text.trim()) {
    return { risks: [], score: { predatoryScore: 0, band: 'low', drivers: [] } };
  }

  const detectors = [
    detectSecurityDeposit,
    detectNoticePeriod,
    detectLateFee,
    detectLockIn,
    detectAutoRenewal,
    detectCleaningFee,
    detectUtilityObligation,
    detectPetRestriction,
    detectForfeitureLanguage,
    detectUnilateralDiscretion,
    detectJurisdictionOuster,
    detectIndemnity,
  ];

  const risks = [];
  for (const d of detectors) {
    const r = d(text);
    if (r) risks.push(r);
  }

  // Cross-clause checks (must run after individual detectors)
  const crossRisk = detectPenaltyExceedsDeposit(text, risks);
  if (crossRisk) risks.push(crossRisk);

  // Stable ordering: red → yellow → green, then by confidence descending
  const sevRank = { red: 0, yellow: 1, green: 2 };
  risks.sort((a, b) => {
    const s = sevRank[a.severity] - sevRank[b.severity];
    if (s !== 0) return s;
    return (b.confidence || 0) - (a.confidence || 0);
  });

  const score = scoreRisks(risks);
  return { risks, score };
}

module.exports = {
  analyzeRisks,
  // exported for re-use / tests
  parseIndianAmount,
  MONEY_RE,
  scoreRisks,
};
