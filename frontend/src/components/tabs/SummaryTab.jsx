'use client';

import { Calendar, Users, IndianRupee, FileText, ShieldAlert, FileSignature } from 'lucide-react';

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="surface-card surface-card-hover p-5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-2 text-2xl font-black tracking-tight text-slate-950">{value}</div>
    </div>
  );
}

function ListCard({ icon: Icon, title, items, empty }) {
  return (
    <section className="surface-card p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <Icon className="h-4 w-4 text-slate-500" />
        {title}
      </div>
      {items && items.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {items.map((item, i) => (
            <li
              key={`${item}-${i}`}
              className="rounded-full bg-slate-100/90 px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200/70"
            >
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-500">{empty || 'Nothing detected.'}</p>
      )}
    </section>
  );
}

export default function SummaryTab({ analysis }) {
  const ctx = analysis?.structuredContext || {};
  const meta = analysis?.meta || {};
  const chunkCount = analysis?.preparedChunks?.length || 0;
  const charCount = analysis?.rawText?.length || 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat icon={FileText} label="Document type" value={ctx.docType || 'unknown'} />
        <Stat icon={ShieldAlert} label="Dispute category" value={ctx.disputeCategory || 'unclassified'} />
        <Stat icon={FileSignature} label="Pages" value={meta.pageCount ?? '—'} />
        <Stat icon={FileText} label="Chunks prepared" value={chunkCount} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ListCard icon={Users} title="Involved parties" items={ctx.involvedParties} empty="No parties matched." />
        <ListCard icon={Calendar} title="Important dates" items={ctx.importantDates} empty="No dates detected." />
        <ListCard icon={IndianRupee} title="Monetary references" items={ctx.monetaryReferences} empty="No amounts detected." />
        <ListCard icon={ShieldAlert} title="Potential violations" items={ctx.potentialViolations} empty="No statutory references found." />
      </div>

      <section className="surface-card overflow-hidden p-5">
        <h3 className="text-sm font-semibold text-slate-700">Extracted text preview</h3>
        <p className="mt-1 text-xs text-slate-500">
          {charCount.toLocaleString()} characters · engine: {meta.engine || '—'} · processed in {analysis?.processingTimeMs || 0} ms
        </p>
        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200/80 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-100 shadow-inner">
{analysis?.rawText?.slice(0, 4000) || '— no extractable text —'}
        </pre>
        {meta.warning && (
          <p className="mt-2 text-xs text-amber-700">⚠️ {meta.warning}</p>
        )}
      </section>
    </div>
  );
}
