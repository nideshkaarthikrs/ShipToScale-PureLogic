// Tailwind color helpers shared across risk-rendering components.
//
// The fabricated MOCK_RISKS / MOCK_PRECEDENTS / MOCK_WINNING_ARGUMENTS arrays
// that used to live here have been removed — they were producing dashboard
// content (₹1,00,000 penalties, fake forfeiture clauses, invented case
// citations) that did not exist in the uploaded document. The dashboard now
// reads grounded risks from the backend's deterministic riskEngine via
// `analysis.grounded.*`.
//
// Only the color/badge helpers remain here because RiskHeatmap and
// WinningArgumentsPanel still import them. Filename kept as `mockData.js`
// to avoid renaming every import site; consider renaming to `riskStyles.js`
// in a future pass.

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
  if (strength === 'high' || strength === 'strong') return 'bg-emerald-100 text-emerald-800';
  if (strength === 'medium' || strength === 'moderate') return 'bg-amber-100 text-amber-800';
  return 'bg-slate-100 text-slate-700';
}
