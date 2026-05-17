'use client';

import { useMemo, useState } from 'react';
import PrecedentCard from '@/components/PrecedentCard';

export default function SimilarJudgmentsTab({ precedents = [] }) {
  const [sortBy, setSortBy] = useState('similarity');
  const sorted = useMemo(() => {
    const arr = [...precedents];
    if (sortBy === 'similarity') arr.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
    else if (sortBy === 'year') arr.sort((a, b) => (b.year || 0) - (a.year || 0));
    return arr;
  }, [precedents, sortBy]);

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black tracking-tight text-slate-950">Similar Judgments</h2>
          <p className="text-sm text-slate-500">
            Indian court precedents semantically matched to clauses in this document.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">Sort by</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs font-semibold shadow-sm"
          >
            <option value="similarity">Similarity</option>
            <option value="year">Year</option>
          </select>
        </div>
      </div>

      <div className="space-y-3">
        {sorted.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
            No precedents matched yet.
          </div>
        )}
        {sorted.map((p) => (
          <PrecedentCard key={p.id} precedent={p} />
        ))}
      </div>
    </section>
  );
}
