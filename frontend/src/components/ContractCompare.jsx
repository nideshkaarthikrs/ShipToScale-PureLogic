// Side-by-side diff viewer (spec §6 Contract Comparison). Next agent: render two-column clause diff with risk deltas.

export default function ContractCompare() {
  return (
    <section className="surface-card p-6">
      <h2 className="text-lg font-black text-slate-950">Contract Comparison</h2>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="h-32 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 text-sm text-slate-500">Document A</div>
        <div className="h-32 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 text-sm text-slate-500">Document B</div>
      </div>
    </section>
  );
}
