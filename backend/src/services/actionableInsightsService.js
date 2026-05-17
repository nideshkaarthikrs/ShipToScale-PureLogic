// Actionable insights — converts detected risks/clauses into consumer-facing
// "questions to ask" and "negotiation suggestions" that the user can actually
// take to their counterparty before signing.
//
// Why deterministic, not LLM:
//   • The risks/clauses are already grounded (riskEngine surfaces verbatim
//     excerpts). The insights derived from them should be equally
//     deterministic — same risk pattern → same suggestion, every time.
//   • Latency: this runs synchronously inside the upload response. An LLM
//     call here would double the request time on every upload.
//   • Trust: a user reading "Ask for an itemized list of damages" should be
//     able to know exactly which detected risk produced that suggestion.
//
// Mapping philosophy:
//   We key suggestions off the *category* field on each risk (set by the
//   riskEngine: `deposit`, `termination`, `fees`, `lock-in`, `renewal`,
//   `obligations`, `restrictions`, `penalty`, `one-sided`, `dispute
//   resolution`, `liability`). Each category has a deterministic bundle of
//   (question, negotiation) entries. A suggestion is only emitted if its
//   triggering risk actually exists in the detected set — so a document
//   with no lock-in clause never sees "ask about the lock-in" surfaced.
//
// Output schema (per spec §16):
//   {
//     suggestedQuestions: [{ question, sourceRiskTitle, category }],
//     negotiationSuggestions: [{ suggestion, sourceRiskTitle, category, severity }]
//   }

// -- Suggestion bundles per risk category -----------------------------------
//
// Each bundle is keyed by category. The first array is questions the user
// should ask the counterparty (or themselves); the second is concrete
// negotiation moves.

const SUGGESTION_BUNDLES = {
  deposit: {
    questions: [
      'What specific deductions can be made from the security deposit, and are they itemized in writing?',
      'Within how many days after vacating must the deposit be returned?',
      'Is there a written process for disputing deductions?',
    ],
    negotiations: [
      'Request an itemized written list of permissible deductions, with photo evidence required at handover.',
      'Negotiate a fixed 15–30 day deposit return window with interest on delayed return.',
      'Ask for a joint inspection at move-in and move-out, with the inspection report signed by both parties.',
    ],
  },
  termination: {
    questions: [
      'Is the notice period reciprocal — does the landlord have the same obligation if they ask you to vacate?',
      'What counts as valid "written notice" — email, registered post, or both?',
      'Can the agreement be terminated without notice for any reason (and if so, what)?',
    ],
    negotiations: [
      'Negotiate a symmetric notice period — whatever you owe, they owe.',
      'Specify acceptable channels for notice (email + registered post) to avoid disputes.',
      'Add a "no-fault" early-exit clause with prorated rent for unused months.',
    ],
  },
  fees: {
    questions: [
      'Is the late fee capped — and after how many days does it stop accruing?',
      'On what basis is the fee calculated (flat amount, percentage, per day)?',
      'Is there a grace period before the late fee kicks in?',
    ],
    negotiations: [
      'Cap the total late fee at one month\'s rent maximum.',
      'Request a 5–7 day grace period before any late fee applies.',
      'Convert percentage/compounding late fees into a single flat administrative charge.',
    ],
  },
  'lock-in': {
    questions: [
      'What are the exact consequences of breaking the lock-in early — forfeiture, prorated penalty, or just notice?',
      'Does the lock-in apply equally to both parties, or only to me?',
      'Can the lock-in be reduced for a higher monthly rent or vice versa?',
    ],
    negotiations: [
      'Negotiate the lock-in down to 3–6 months for a residential lease.',
      'Replace lock-in forfeiture with a single month\'s rent as exit fee.',
      'Add a mutual lock-in: the landlord cannot ask you to vacate during the same period.',
    ],
  },
  renewal: {
    questions: [
      'What is the exact notice window to opt out before the agreement auto-renews?',
      'Will the rent change on renewal, and by how much?',
      'Can I opt out of auto-renewal entirely at signing?',
    ],
    negotiations: [
      'Request an explicit opt-out window of at least 30 days before renewal.',
      'Cap any renewal rent escalation at CPI or a fixed percentage.',
      'Convert auto-renewal into a default month-to-month tenancy unless renewed in writing.',
    ],
  },
  obligations: {
    questions: [
      'Which specific utilities am I responsible for (electricity, water, gas, society dues)?',
      'Is there a cap on how much these charges can increase year-over-year?',
      'Who is responsible for major repairs vs. day-to-day maintenance?',
    ],
    negotiations: [
      'Get a written breakdown of which charges are tenant-borne vs. landlord-borne.',
      'Add a major-repair carve-out: structural or appliance failures stay with the landlord.',
      'Request a maintenance ceiling above which the landlord must approve in writing.',
    ],
  },
  restrictions: {
    questions: [
      'Are any restrictions (pets, guests, working from home) negotiable for this property?',
      'What are the penalties for violating these restrictions?',
    ],
    negotiations: [
      'Negotiate explicit exceptions for visiting family/short-term guests.',
      'If any restriction is a deal-breaker, request a written exception clause.',
    ],
  },
  penalty: {
    questions: [
      'What is the legal basis for this penalty — is it tied to actual damages?',
      'Has this penalty ever been challenged or reduced for prior tenants?',
      'Will any portion of the penalty be refunded if the issue is resolved quickly?',
    ],
    negotiations: [
      'Replace blanket forfeiture/penalty with "actual damages, proved in writing" language.',
      'Cap the maximum penalty at one month\'s rent.',
      'Add a cure period: 7–14 days to fix the issue before any penalty applies.',
    ],
  },
  'one-sided': {
    questions: [
      'Why does this clause give one party unilateral discretion — what protections exist for the other side?',
      'Can this discretion be made conditional on a notice period or written justification?',
    ],
    negotiations: [
      'Convert "sole discretion" into "reasonable discretion, exercised in good faith".',
      'Require advance written notice (24–48 hours) before any inspection or entry.',
      'Add a written-reasons requirement before discretion can be exercised.',
    ],
  },
  'dispute resolution': {
    questions: [
      'Which courts have exclusive jurisdiction — is this convenient for you?',
      'Is there a mandatory mediation or arbitration step before going to court?',
    ],
    negotiations: [
      'Negotiate jurisdiction in the city where the property is located, not the landlord\'s home city.',
      'Add a 30-day mediation step before either party can litigate.',
    ],
  },
  liability: {
    questions: [
      'What is the maximum amount I could be liable for under the indemnity clause?',
      'Is the indemnity capped or unlimited?',
      'Does it cover third-party claims, or only direct claims by the landlord?',
    ],
    negotiations: [
      'Cap indemnity liability at the security deposit amount.',
      'Carve out indemnity exposure for claims caused by the landlord\'s own negligence.',
      'Limit indemnity to direct damages — exclude consequential, indirect, and punitive losses.',
    ],
  },
};

// -- Generic doc-type fallbacks ---------------------------------------------
//
// If we have no detected risks at all but we DO know what kind of document
// this is, surface the few baseline questions every user should ask. These
// are not derived from clauses — they're the questions whose answer is "the
// document is silent on this", which itself is useful intelligence.

const DOC_TYPE_BASELINES = {
  rental: {
    questions: [
      'Is a refundable security deposit clearly stated, with the return timeline?',
      'Is the notice period reciprocal between landlord and tenant?',
      'Are utility responsibilities split out clearly?',
    ],
    negotiations: [
      'Request a written inventory of the property\'s condition at move-in.',
      'Get the rent escalation clause in writing if there is one.',
    ],
  },
  employment: {
    questions: [
      'What is the scope of the non-compete clause, and is it time-bound?',
      'Who owns IP created outside working hours on personal equipment?',
      'What is the notice period for resignation vs. termination?',
    ],
    negotiations: [
      'Negotiate the non-compete to a specific industry and geography.',
      'Carve out personal-time IP from the assignment clause.',
      'Ask for symmetric notice obligations on both sides.',
    ],
  },
  insurance: {
    questions: [
      'What exclusions apply to claims?',
      'How is "material non-disclosure" defined?',
      'What is the claim-rejection appeal process?',
    ],
    negotiations: [
      'Request a written list of common rejection reasons before signing.',
      'Negotiate a defined sub-limit schedule rather than open-ended exclusions.',
    ],
  },
};

// -- Public API -------------------------------------------------------------

/**
 * Generate consumer-facing questions and negotiation suggestions grounded in
 * the detected risk set.
 *
 * @param {Array<{title, severity, category, ...}>} risks   From riskEngine
 * @param {string} [docType]                                e.g. 'rental'
 * @param {object} [opts]
 * @param {number} [opts.maxQuestions=8]                    Cap surface area
 * @param {number} [opts.maxNegotiations=8]
 * @returns {{ suggestedQuestions: Array, negotiationSuggestions: Array }}
 */
function generateInsights(risks = [], docType = null, opts = {}) {
  const { maxQuestions = 8, maxNegotiations = 8 } = opts;

  const categoriesSeen = new Set();
  const questions = [];
  const negotiations = [];

  // Order: red first, then yellow, then green. Within each tier, higher
  // confidence first. This matches the heatmap ordering and means the most
  // urgent issues bubble to the top of the Before-You-Sign tab.
  const sevRank = { red: 0, yellow: 1, green: 2 };
  const ordered = [...risks].sort((a, b) => {
    const s = (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9);
    if (s !== 0) return s;
    return (b.confidence || 0) - (a.confidence || 0);
  });

  for (const risk of ordered) {
    const bundle = SUGGESTION_BUNDLES[risk.category];
    if (!bundle) continue;

    // Limit each category to its top 2 questions / top 2 negotiations so a
    // document with five different deposit-category risks doesn't drown the
    // tab in deposit content.
    const perCategoryCap = categoriesSeen.has(risk.category) ? 0 : 2;
    if (perCategoryCap === 0) continue;
    categoriesSeen.add(risk.category);

    for (const q of bundle.questions.slice(0, perCategoryCap)) {
      if (questions.length >= maxQuestions) break;
      questions.push({
        question: q,
        sourceRiskTitle: risk.title,
        category: risk.category,
      });
    }
    for (const n of bundle.negotiations.slice(0, perCategoryCap)) {
      if (negotiations.length >= maxNegotiations) break;
      negotiations.push({
        suggestion: n,
        sourceRiskTitle: risk.title,
        category: risk.category,
        severity: risk.severity,
      });
    }
  }

  // Fallback: if the document had detected risks but none mapped to any
  // category (unlikely but defensible), AND we know the docType, surface
  // baseline questions so the tab isn't empty.
  if (questions.length === 0 && DOC_TYPE_BASELINES[docType]) {
    for (const q of DOC_TYPE_BASELINES[docType].questions) {
      questions.push({ question: q, sourceRiskTitle: null, category: 'baseline' });
    }
    for (const n of DOC_TYPE_BASELINES[docType].negotiations) {
      negotiations.push({ suggestion: n, sourceRiskTitle: null, category: 'baseline', severity: 'green' });
    }
  }

  return { suggestedQuestions: questions, negotiationSuggestions: negotiations };
}

// -- Chat suggestion chips --------------------------------------------------
//
// A separate, smaller set of suggestion *chips* tailored for the chat panel.
// These differ from `generateInsights` in being conversational ("ask the
// chatbot") rather than action-oriented ("ask the landlord"). They mix
// document-type, risk-driven, and precedent-driven prompts.

const GENERIC_CHAT_CHIPS = [
  'Give me a plain-language summary of this document.',
  'What clauses increase legal risk?',
  'What protections are missing from this agreement?',
  'What should I negotiate before signing?',
];

const RISK_CHIPS_BY_CATEGORY = {
  deposit: 'Can the other party legally withhold my deposit under these terms?',
  termination: 'Is the notice period in this document enforceable?',
  fees: 'Is the late fee/penalty in this document legally enforceable?',
  'lock-in': 'What happens if I exit during the lock-in period?',
  renewal: 'Can I get out of the auto-renewal clause?',
  penalty: 'Is the penalty amount disproportionate under Indian contract law?',
  liability: 'How broad is my indemnity obligation in this agreement?',
  'one-sided': 'Are the unilateral discretion clauses fair?',
  'dispute resolution': 'Where would disputes under this agreement be heard?',
};

/**
 * Produce 4–6 suggestion chips for the chat panel, biased toward whichever
 * risk categories are actually present in this document.
 */
function generateChatChips(risks = [], similarJudgments = []) {
  const chips = new Set();
  for (const r of risks) {
    const chip = RISK_CHIPS_BY_CATEGORY[r.category];
    if (chip) chips.add(chip);
    if (chips.size >= 3) break;
  }

  if (similarJudgments.length > 0) {
    chips.add('Which retrieved precedent is most similar to my situation?');
    chips.add('What arguments helped similar cases succeed?');
  }

  for (const chip of GENERIC_CHAT_CHIPS) {
    if (chips.size >= 6) break;
    chips.add(chip);
  }

  return Array.from(chips).slice(0, 6);
}

module.exports = {
  generateInsights,
  generateChatChips,
  // exported for tests / observability
  SUGGESTION_BUNDLES,
  DOC_TYPE_BASELINES,
};
