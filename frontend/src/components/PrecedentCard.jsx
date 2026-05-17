'use client';

import { useState } from 'react';
import { ChevronDown, Scale } from 'lucide-react';

function SimilarityBar({ value }) {
  const pct = Math.round((value || 0) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-indigo-600" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium tabular-nums text-slate-700">{pct}%</span>
    </div>
  );
}

export default function PrecedentCard({ precedent }) {
  const [open, setOpen] = useState(false);
  if (!precedent) return null;

  return (
    <article className="surface-card surface-card-hover overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-4 p-5 text-left"
        aria-expanded={open}
      >
        <div className="icon-tile mt-1 h-10 w-10 flex-shrink-0 text-indigo-700">
          <Scale className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-sm font-black text-slate-950">{precedent.title}</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{precedent.citation}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
            <span className="font-medium">{precedent.court}</span>
            <span>·</span>
            <span>{precedent.year}</span>
            <span>·</span>
            <SimilarityBar value={precedent.similarity} />
          </div>
          <p className="mt-3 line-clamp-2 text-sm text-slate-700">{precedent.summary}</p>
        </div>
        <ChevronDown
          className={`mt-1 h-4 w-4 flex-shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="border-t border-slate-100 bg-slate-50/85 px-5 py-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Persuasive reasoning</h4>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">{precedent.persuasiveReasoning}</p>
          {precedent.matchedClauseIds?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {precedent.matchedClauseIds.map((cid) => (
                <span key={cid} className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200">
                  matches risk {cid}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
