'use client';

import RiskHeatmap from '@/components/RiskHeatmap';

export default function RisksTab({ risks, score }) {
  return <RiskHeatmap risks={risks} score={score} />;
}
