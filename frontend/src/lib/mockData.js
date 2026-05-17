// Demo-grade mock data for fields the backend LLM layer will own (Part 4 handoff).
// All shapes here match the contract the next-agent's llmService should produce
// so swapping `getMockAnalysis()` for a real fetch is a one-line change.

export const MOCK_RISKS = [
  {
    id: 'r1',
    tier: 'red',
    title: 'Forfeitable security deposit',
    clause: 'The lessee shall pay a security deposit of Rs. 50,000 to the lessor.',
    explanation: 'Deposit is forfeited entirely if the tenant exits before the 11-month lock-in. No partial refund clause is present.',
    referenceClauseIndex: 0,
  },
  {
    id: 'r2',
    tier: 'red',
    title: 'Penalty exceeds deposit',
    clause: 'Penalty for early termination: Rs. 1,00,000.',
    explanation: 'Early-exit penalty is 2× the security deposit and unrelated to actual damages — likely unenforceable, but enforced informally.',
    referenceClauseIndex: 1,
  },
  {
    id: 'r3',
    tier: 'yellow',
    title: 'Short notice window',
    clause: 'The tenant agrees to vacate the premises within 30 days notice.',
    explanation: 'Standard market notice is 60–90 days. 30 days is tenant-unfriendly for cities with tight rental supply.',
    referenceClauseIndex: 2,
  },
  {
    id: 'r4',
    tier: 'yellow',
    title: 'Asymmetric deposit return',
    clause: 'The landlord must return the deposit within 15 days.',
    explanation: 'Return window is reasonable but has no interest-on-delay clause; landlord faces no penalty for breach.',
    referenceClauseIndex: 3,
  },
  {
    id: 'r5',
    tier: 'green',
    title: 'Standard parties identification',
    clause: 'Between Rajesh Kumar (Lessor) and Priya Sharma (Lessee).',
    explanation: 'Parties are clearly identified and capacity is unambiguous.',
    referenceClauseIndex: 4,
  },
];

export const MOCK_PRECEDENTS = [
  {
    id: 'p1',
    court: 'Supreme Court of India',
    year: 2019,
    citation: '(2019) 6 SCC 632',
    title: 'K.A. Mathai @ Babu v. Kora Bibbikutty',
    similarity: 0.91,
    summary:
      'Forfeiture of advance/deposit not enforceable unless landlord proves actual loss; courts may restore the balance to the tenant.',
    persuasiveReasoning:
      'Section 74 of the Contract Act prevents penalties beyond reasonable compensation. A blanket forfeiture clause without quantification of damages is treated as a penalty, not liquidated damages — and is read down by courts.',
    matchedClauseIds: ['r1', 'r2'],
  },
  {
    id: 'p2',
    court: 'Delhi High Court',
    year: 2022,
    citation: '2022 SCC OnLine Del 4421',
    title: 'Sunita Aggarwal v. Vijay Pal Sharma',
    similarity: 0.84,
    summary:
      'Notice period in residential leases must be reasonable and reciprocal. One-sided 30-day notice favouring the landlord struck down.',
    persuasiveReasoning:
      'Court relied on principles of unconscionability and standard-form contract scrutiny. Reciprocity test: would the tenant accept the same notice period if reversed? If not, the clause is suspect.',
    matchedClauseIds: ['r3'],
  },
  {
    id: 'p3',
    court: 'Bombay High Court',
    year: 2021,
    citation: '2021 SCC OnLine Bom 1129',
    title: 'Hardip Singh v. Bhajan Singh',
    similarity: 0.78,
    summary:
      'Deposit retention beyond 30 days without justification attracts interest at 9% p.a., calculated from the date of vacating.',
    persuasiveReasoning:
      'The court treated unjustified deposit retention as a form of forced credit and applied a deemed-interest standard, even absent an explicit interest clause in the lease.',
    matchedClauseIds: ['r4'],
  },
  {
    id: 'p4',
    court: 'National Consumer Disputes Redressal Commission',
    year: 2020,
    citation: '2020 NCDRC 411',
    title: 'Re: Standard-form Lease Provisions',
    similarity: 0.71,
    summary:
      'Asymmetric clauses in standard-form leases (penalty on tenant, none on landlord) constitute unfair trade practice under the Consumer Protection Act, 2019.',
    persuasiveReasoning:
      'The Commission emphasised that consumer-facing standard-form contracts must pass a fairness test, especially where bargaining power is unequal. Asymmetric remedies are a textbook unfairness marker.',
    matchedClauseIds: ['r2', 'r4'],
  },
];

export const MOCK_WINNING_ARGUMENTS = [
  {
    id: 'a1',
    category: 'Statutory',
    strength: 'high',
    headline: 'Forfeiture as unenforceable penalty under §74 Contract Act',
    body:
      'Under Section 74 of the Indian Contract Act, 1872, a sum stipulated as payable on breach is enforceable only to the extent of reasonable compensation for actual loss. A blanket forfeiture of Rs. 50,000 without quantified damages is a penalty, not liquidated damages.',
    citedPrecedents: ['p1'],
  },
  {
    id: 'a2',
    category: 'Equitable',
    strength: 'high',
    headline: 'Penalty disproportionate to actual loss is void',
    body:
      'A Rs. 1,00,000 early-exit penalty against a Rs. 50,000 deposit is prima facie unconscionable. Courts have consistently read down such penalties to the actual mesne profits for the unexpired period.',
    citedPrecedents: ['p1', 'p4'],
  },
  {
    id: 'a3',
    category: 'Procedural',
    strength: 'medium',
    headline: 'Notice reciprocity test',
    body:
      'A unilateral 30-day notice obligation on the tenant, with no symmetric obligation on the landlord, fails the reciprocity test articulated in the Sunita Aggarwal line of cases.',
    citedPrecedents: ['p2'],
  },
  {
    id: 'a4',
    category: 'Consumer',
    strength: 'medium',
    headline: 'Unfair trade practice under CPA 2019',
    body:
      'Asymmetric remedy structure (tenant exposed to forfeiture + penalty; landlord exposed to none) qualifies as an unfair contract under the Consumer Protection Act, 2019, and is challengeable before the District Commission.',
    citedPrecedents: ['p4'],
  },
];

export const MOCK_RISK_SCORE = {
  predatoryScore: 72,
  band: 'high',
  drivers: ['Forfeitable deposit', 'Disproportionate penalty', 'Asymmetric remedies'],
};

export function tierColor(tier) {
  if (tier === 'red') return 'bg-rose-100 text-rose-900 border-rose-300';
  if (tier === 'yellow') return 'bg-amber-100 text-amber-900 border-amber-300';
  return 'bg-emerald-100 text-emerald-900 border-emerald-300';
}

export function tierDot(tier) {
  if (tier === 'red') return 'bg-rose-500';
  if (tier === 'yellow') return 'bg-amber-500';
  return 'bg-emerald-500';
}

export function bandColor(band) {
  if (band === 'high') return 'text-rose-700';
  if (band === 'medium') return 'text-amber-700';
  return 'text-emerald-700';
}

export function strengthBadge(strength) {
  if (strength === 'high') return 'bg-emerald-100 text-emerald-800';
  if (strength === 'medium') return 'bg-amber-100 text-amber-800';
  return 'bg-slate-100 text-slate-700';
}
