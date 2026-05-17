'use client';

import { Gavel, Quote } from 'lucide-react';
import { strengthBadge } from '@/lib/mockData';

export default function WinningArgumentsPanel({ arguments: args = [], precedents = [] }) {
  const byId = Object.fromEntries(precedents.map((p) => [p.id, p]));

  return (
    <section className="surface-card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="icon-tile h-10 w-10 text-emerald-700">
          <Gavel className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-black tracking-tight text-slate-950">Winning Legal Arguments</h2>
          <p className="mt-1 text-sm text-slate-500">
            Strongest arguments to make if this document is disputed, grounded in matched precedents.
          </p>
        </div>
      </div>

      <ol className="mt-6 space-y-4">
        {args.length === 0 && (
          <li className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">
            No arguments generated yet. Once the LLM agent is wired, this list will populate from analysis output.
          </li>
        )}
        {args.map((a, idx) => (
          <li key={a.id} className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-bold text-slate-400">#{idx + 1}</span>
                <h3 className="text-sm font-black text-slate-950">{a.headline}</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                  {a.category}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${strengthBadge(a.strength)}`}>
                  {a.strength} strength
                </span>
              </div>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">{a.body}</p>
            {a.citedPrecedents?.length > 0 && (
              <div className="mt-3 border-l-2 border-slate-200 pl-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <Quote className="h-3 w-3" />
                  Cited
                </div>
                <ul className="mt-1 space-y-1 text-xs text-slate-600">
                  {a.citedPrecedents.map((pid) => {
                    const p = byId[pid];
                    if (!p) return null;
                    return (
                      <li key={pid}>
                        <span className="font-medium text-slate-800">{p.title}</span>
                        <span className="text-slate-500"> · {p.court}, {p.year}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
