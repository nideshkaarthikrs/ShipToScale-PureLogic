'use client';

import { useMemo, useState } from 'react';
import { tierColor, tierDot, bandColor } from '@/lib/mockData';

function ScoreGauge({ score, band }) {
  const offset = 251 - (251 * Math.min(100, Math.max(0, score))) / 100;
  return (
    <div className="relative flex h-32 w-32 items-center justify-center">
      <svg viewBox="0 0 100 100" className="h-32 w-32 -rotate-90">
        <circle cx="50" cy="50" r="40" stroke="#e2e8f0" strokeWidth="10" fill="none" />
        <circle
          cx="50"
          cy="50"
          r="40"
          stroke="currentColor"
          strokeWidth="10"
          fill="none"
          strokeDasharray="251"
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={bandColor(band)}
        />
      </svg>
      <div className="absolute text-center">
        <div className={`text-3xl font-bold ${bandColor(band)}`}>{score}</div>
        <div className="text-[10px] uppercase tracking-wide text-slate-500">/ 100</div>
      </div>
    </div>
  );
}

export default function RiskHeatmap({ risks = [], score = null }) {
  const [activeTier, setActiveTier] = useState('all');
  const counts = useMemo(() => {
    const c = { red: 0, yellow: 0, green: 0 };
    for (const r of risks) c[r.tier] = (c[r.tier] || 0) + 1;
    return c;
  }, [risks]);

  const visible = activeTier === 'all' ? risks : risks.filter((r) => r.tier === activeTier);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Risk Heatmap</h2>
          <p className="mt-1 text-sm text-slate-500">
            Predatory Score blends clause-level risks into a single 0–100 metric.
          </p>
          <div className="mt-4 flex gap-2">
            {['all', 'red', 'yellow', 'green'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setActiveTier(t)}
                className={[
                  'rounded-full px-3 py-1 text-xs font-medium transition',
                  activeTier === t ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                ].join(' ')}
              >
                {t === 'all' ? `All (${risks.length})` : `${t} (${counts[t] || 0})`}
              </button>
            ))}
          </div>
        </div>
        {score && (
          <div className="flex items-center gap-4">
            <ScoreGauge score={score.predatoryScore} band={score.band} />
            <div className="max-w-[180px] text-sm">
              <div className="font-medium uppercase tracking-wide text-slate-500">Top drivers</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-700">
                {score.drivers.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      <ul className="mt-6 space-y-3">
        {visible.length === 0 && (
          <li className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">
            No risks in this tier.
          </li>
        )}
        {visible.map((r) => (
          <li key={r.id} className={`rounded-xl border p-4 ${tierColor(r.tier)}`}>
            <div className="flex items-start gap-3">
              <span className={`mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full ${tierDot(r.tier)}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold">{r.title}</h3>
                  <span className="text-[11px] font-medium uppercase tracking-wide opacity-80">{r.tier} risk</span>
                </div>
                <blockquote className="mt-2 border-l-2 border-current/30 pl-3 text-sm italic opacity-90">
                  “{r.clause}”
                </blockquote>
                <p className="mt-2 text-sm">{r.explanation}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
