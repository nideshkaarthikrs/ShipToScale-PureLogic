// Predatory Score 0–100 gauge (spec §6, §8 Feature 9). Next agent: render dynamic gauge keyed off analysis payload.

export default function MetricCard({ score = 0 }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Predatory Score</h2>
      <p className="mt-2 text-5xl font-bold text-slate-900">{score}<span className="text-2xl text-slate-400">/100</span></p>
      <p className="mt-2 text-sm text-slate-500">Standardized vulnerability metric across the document.</p>
    </section>
  );
}
