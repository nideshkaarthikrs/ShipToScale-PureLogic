'use client';

import RiskHeatmap from '@/components/RiskHeatmap';

export default function RisksTab({ risks, score, negotiationSuggestions }) {
  return <RiskHeatmap risks={risks} score={score} negotiationSuggestions={negotiationSuggestions} />;
}
