// Side-by-side diff viewer (spec §6 Contract Comparison). Next agent: render two-column clause diff with risk deltas.

export default function ContractCompare() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Contract Comparison</h2>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="h-32 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">Document A</div>
        <div className="h-32 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">Document B</div>
      </div>
    </section>
  );
}
