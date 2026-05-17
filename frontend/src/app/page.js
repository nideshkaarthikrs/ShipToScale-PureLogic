import UploadZone from '@/components/UploadZone';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 py-16">
      <span className="rounded-full bg-slate-900/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">
        CivicLens
      </span>
      <h1 className="mt-4 text-center text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
        Upload a document to understand it instantly.
      </h1>
      <p className="mt-4 max-w-2xl text-center text-base text-slate-600 sm:text-lg">
        CivicLens converts contracts, policies, bills, and ingredient labels into plain-language risk dashboards
        — with matched precedents and winning legal arguments — before you sign.
      </p>
      <div className="mt-10 w-full">
        <UploadZone />
      </div>
      <p className="mt-6 text-center text-xs text-slate-400">
        Educational assistance only. Not legal advice.
      </p>
    </main>
  );
}
