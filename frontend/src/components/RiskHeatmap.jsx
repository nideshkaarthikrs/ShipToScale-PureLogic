'use client';

import { useMemo, useState } from 'react';
import { Handshake } from 'lucide-react';
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

export default function RiskHeatmap({ risks = [], score = null, negotiationSuggestions = [] }) {
  const [activeTier, setActiveTier] = useState('all');
  const counts = useMemo(() => {
    const c = { red: 0, yellow: 0, green: 0 };
    for (const r of risks) c[r.tier] = (c[r.tier] || 0) + 1;
    return c;
  }, [risks]);

  // Match a risk → its top negotiation suggestion by source-risk title.
  // The backend already emits suggestions ordered by severity, so the first
  // match for a given title is the most relevant one to show inline.
  const suggestionByRiskTitle = useMemo(() => {
    const map = new Map();
    for (const s of negotiationSuggestions) {
      if (!s.sourceRiskTitle || map.has(s.sourceRiskTitle)) continue;
      map.set(s.sourceRiskTitle, s.suggestion);
    }
    return map;
  }, [negotiationSuggestions]);

  const visible = activeTier === 'all' ? risks : risks.filter((r) => r.tier === activeTier);

  return (
    <section className="surface-card p-5 sm:p-6">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black tracking-tight text-slate-950">Risk Heatmap</h2>
          <p className="mt-1 text-sm text-slate-500">
            Predatory Score blends clause-level risks into a single 0-100 metric.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {['all', 'red', 'yellow', 'green'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setActiveTier(t)}
                className={[
                  'rounded-full px-3 py-1.5 text-xs font-bold capitalize transition',
                  activeTier === t ? 'bg-slate-950 text-white shadow-lg shadow-slate-950/15' : 'bg-slate-100 text-slate-700 ring-1 ring-slate-200/70 hover:bg-white',
                ].join(' ')}
              >
                {t === 'all' ? `All (${risks.length})` : `${t} (${counts[t] || 0})`}
              </button>
            ))}
          </div>
        </div>
        {score && (
          <div className="flex items-center gap-4 rounded-2xl bg-slate-50/80 p-3 ring-1 ring-slate-200/80">
            <ScoreGauge score={score.predatoryScore} band={score.band} />
            <div className="max-w-[180px] text-sm">
              <div className="font-bold uppercase tracking-wide text-slate-500">Top drivers</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-700 marker:text-slate-300">
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
          <li key={r.id} className={`rounded-2xl border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${tierColor(r.tier)}`}>
            <div className="flex items-start gap-3">
              <span className={`mt-1 h-3 w-3 flex-shrink-0 rounded-full ring-4 ring-white/70 ${tierDot(r.tier)}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-black">{r.title}</h3>
                  <span className="rounded-full bg-white/60 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide opacity-80 ring-1 ring-current/15">{r.tier} risk</span>
                </div>
                <blockquote className="mt-3 rounded-xl border-l-2 border-current/30 bg-white/45 px-3 py-2 text-sm italic opacity-90">
                  “{r.clause}”
                </blockquote>
                <p className="mt-2 text-sm">{r.explanation}</p>
                {suggestionByRiskTitle.get(r.title) && (
                  <div className="mt-3 inline-flex items-start gap-1.5 rounded-lg bg-white/60 px-2.5 py-1.5 text-xs ring-1 ring-current/20">
                    <Handshake className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 opacity-70" />
                    <span className="leading-snug">
                      <span className="font-medium uppercase tracking-wide opacity-70">Negotiation tip ·</span>{' '}
                      {suggestionByRiskTitle.get(r.title)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
