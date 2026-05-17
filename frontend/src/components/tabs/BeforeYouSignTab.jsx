'use client';

import { HelpCircle, Handshake, ShieldCheck, AlertTriangle } from 'lucide-react';

// "Before You Sign" — consumer guidance derived deterministically from the
// detected risks. Two sections:
//   1. Questions to ask (the user asks the counterparty / themselves)
//   2. Negotiation suggestions (concrete changes to request before signing)
//
// Every suggestion carries its `sourceRiskTitle` and `category` so the user
// can see which detected clause produced this prompt — the same grounded-
// intelligence principle that powers the risk cards.

function SeverityDot({ severity }) {
  const color =
    severity === 'red' ? 'bg-rose-500'
      : severity === 'yellow' ? 'bg-amber-500'
        : 'bg-emerald-500';
  return <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${color}`} />;
}

function SourceTag({ title, category }) {
  if (!title && !category) return null;
  if (!title) {
    return (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
        baseline · {category}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
      from “{title}”
    </span>
  );
}

export default function BeforeYouSignTab({ analysis }) {
  const grounded = analysis?.grounded || {};
  const questions = grounded.suggestedQuestions || [];
  const negotiations = grounded.negotiationSuggestions || [];

  const isEmpty = questions.length === 0 && negotiations.length === 0;

  return (
    <section className="space-y-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Before you sign</h2>
            <p className="mt-1 text-sm text-slate-500">
              Practical questions to ask and changes to request — each item is tied to a
              specific risk we detected in your document. No invented conditions, no
              boilerplate.
            </p>
          </div>
        </div>
      </header>

      {isEmpty && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
          <h3 className="mt-3 text-sm font-semibold text-slate-900">No actionable guidance generated</h3>
          <p className="mt-1 text-sm text-slate-500">
            The risk engine didn't surface any clauses we have suggestion mappings for.
            This usually means the document is either very short or doesn't contain the
            patterns we detect (deposits, notice periods, penalties, etc.).
          </p>
        </div>
      )}

      {questions.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="flex items-center gap-3 border-b border-slate-200 px-6 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
              <HelpCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Questions to ask</h3>
              <p className="text-xs text-slate-500">
                {questions.length} grounded question{questions.length === 1 ? '' : 's'} based on detected clauses.
              </p>
            </div>
          </header>
          <ol className="divide-y divide-slate-100">
            {questions.map((q, i) => (
              <li key={i} className="flex items-start gap-3 px-6 py-4">
                <span className="mt-1 text-[10px] font-bold text-slate-400">Q{i + 1}</span>
                <div className="flex-1">
                  <p className="text-sm leading-relaxed text-slate-800">{q.question}</p>
                  <div className="mt-1.5">
                    <SourceTag title={q.sourceRiskTitle} category={q.category} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {negotiations.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="flex items-center gap-3 border-b border-slate-200 px-6 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <Handshake className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Negotiation suggestions</h3>
              <p className="text-xs text-slate-500">
                Concrete changes to request — ordered by the severity of the underlying clause.
              </p>
            </div>
          </header>
          <ol className="divide-y divide-slate-100">
            {negotiations.map((n, i) => (
              <li key={i} className="flex items-start gap-3 px-6 py-4">
                <SeverityDot severity={n.severity} />
                <div className="flex-1">
                  <p className="text-sm leading-relaxed text-slate-800">{n.suggestion}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <SourceTag title={n.sourceRiskTitle} category={n.category} />
                    <span className="text-[10px] uppercase tracking-wide text-slate-400">{n.severity} severity</span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </section>
  );
}
