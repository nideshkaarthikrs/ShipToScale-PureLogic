import { ArrowRight, CheckCircle2, FileSearch, ShieldCheck, Sparkles } from 'lucide-react';
import UploadZone from '@/components/UploadZone';

export default function HomePage() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden px-6 py-8 sm:py-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-56 bg-[linear-gradient(90deg,rgba(15,23,42,0.08),transparent,rgba(20,184,166,0.10))]" />

      <nav className="mx-auto flex max-w-6xl items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="icon-tile h-10 w-10 text-slate-950">
            <FileSearch className="h-5 w-5" />
          </div>
          <span className="text-sm font-bold tracking-tight text-slate-950">CivicLens</span>
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-slate-200/80 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm backdrop-blur sm:flex">
          <ShieldCheck className="h-3.5 w-3.5 text-teal-600" />
          Grounded document intelligence
        </div>
      </nav>

      <div className="mx-auto grid min-h-[calc(100vh-7rem)] max-w-6xl items-center gap-10 py-12 lg:grid-cols-[1.02fr_0.98fr]">
        <section className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/75 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            Contract clarity before the signature
          </div>

          <h1 className="mt-5 max-w-3xl text-5xl font-black tracking-tight text-slate-950 sm:text-6xl lg:text-7xl">
            Read the fine print like a pro.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
            CivicLens turns contracts, policies, bills, and labels into a sharp risk dashboard with clause evidence,
            precedent matches, and practical negotiation moves.
          </p>

          <div className="mt-7 flex flex-wrap gap-2">
            {['Clause traceability', 'Risk heatmap', 'Matched judgments'].map((item) => (
              <span key={item} className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200/80">
                <CheckCircle2 className="h-3.5 w-3.5 text-teal-600" />
                {item}
              </span>
            ))}
          </div>

          <div className="mt-8 hidden items-center gap-3 text-sm font-semibold text-slate-700 sm:flex">
            Upload a file
            <ArrowRight className="h-4 w-4 text-slate-400" />
            Get a grounded dashboard
            <ArrowRight className="h-4 w-4 text-slate-400" />
            Negotiate smarter
          </div>
        </section>

        <section className="glass-panel rounded-[1.75rem] p-3 sm:p-4">
          <UploadZone />
        </section>
      </div>

      <p className="mx-auto -mt-8 max-w-6xl text-xs text-slate-500">
        Educational assistance only. Not legal advice.
      </p>
    </main>
  );
}
