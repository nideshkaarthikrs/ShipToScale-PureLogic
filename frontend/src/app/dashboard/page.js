'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileSearch, FileWarning, Gauge, Scale, ShieldCheck } from 'lucide-react';

import TabNavigation from '@/components/TabNavigation';
import SummaryTab from '@/components/tabs/SummaryTab';
import RisksTab from '@/components/tabs/RisksTab';
import SimilarJudgmentsTab from '@/components/tabs/SimilarJudgmentsTab';
import WinningArgumentsTab from '@/components/tabs/WinningArgumentsTab';
import BeforeYouSignTab from '@/components/tabs/BeforeYouSignTab';
import ChatTab from '@/components/tabs/ChatTab';

import { ANALYSIS_STORAGE_KEY } from '@/lib/api';

const TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'risks', label: 'Risks' },
  { id: 'judgments', label: 'Similar Judgments' },
  { id: 'arguments', label: 'Winning Arguments' },
  { id: 'before-you-sign', label: 'Before You Sign' },
  { id: 'chat', label: 'Chat' },
];

// Adapt the deterministic backend risk shape ({ title, severity, clauseText,
// explanation, reasoning, confidence, category }) into the legacy component
// shape ({ id, tier, title, clause, explanation }) without touching the
// component. Reasoning is appended to the explanation so it's visible.
function adaptRisks(grounded) {
  if (!grounded?.risks) return [];
  return grounded.risks.map((r, i) => ({
    id: `r${i}`,
    tier: r.severity,
    title: r.title,
    clause: r.clauseText,
    explanation: r.reasoning ? `${r.explanation} ${r.reasoning}` : r.explanation,
  }));
}

// Adapt the deterministic judgmentRetrievalService output → PrecedentCard
// shape. similarityScore is already 0–1, summary maps to judgmentSummary,
// and persuasiveReasoning is the joined reasoning sentences.
function adaptPrecedents(grounded) {
  if (!grounded?.similarJudgments) return [];
  return grounded.similarJudgments.map((j) => ({
    id: j.id,
    title: j.title,
    court: j.court,
    year: j.year,
    citation: `${j.court} (${j.year})`,
    similarity: j.similarityScore,
    summary: j.judgmentSummary,
    persuasiveReasoning: (j.relevantReasoning || []).join(' '),
    matchedClauseIds: [],
  }));
}

// Adapt LLM-produced winningArguments → panel shape. If the LLM layer
// soft-failed, we synthesize arguments from the retrieved judgments'
// keyArguments — these are real lines that won real cases, citing real IDs.
function adaptWinningArguments(analysis, grounded) {
  // Prefer LLM output if it produced grounded arguments
  if (analysis?.winningArguments?.length > 0) {
    return analysis.winningArguments.map((a, i) => ({
      id: `a${i}`,
      category: a.category || 'Statutory',
      strength: a.strength || 'moderate',
      headline: a.argument?.slice(0, 90) || 'Argument',
      body: a.argument || '',
      citedPrecedents: a.supportingCaseId ? [a.supportingCaseId] : [],
    }));
  }
  // Fallback: surface real winning arguments from the retrieved judgments.
  // Limit to top 2 args per judgment to keep the panel scannable.
  const args = [];
  for (const j of grounded?.similarJudgments || []) {
    const topArgs = (j.winningArguments || []).slice(0, 2);
    topArgs.forEach((argText, idx) => {
      args.push({
        id: `${j.id}-${idx}`,
        category: j.disputeDomain || 'Legal',
        strength: idx === 0 ? 'high' : 'medium',
        headline: argText.slice(0, 90),
        body: argText,
        citedPrecedents: [j.id],
      });
    });
  }
  return args.slice(0, 6);
}

export default function DashboardPage() {
  const router = useRouter();
  const [analysis, setAnalysis] = useState(null);
  const [active, setActive] = useState('summary');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(ANALYSIS_STORAGE_KEY);
      if (raw) setAnalysis(JSON.parse(raw));
    } catch (_) {
      /* ignore parse errors */
    }
    setHydrated(true);
  }, []);

  const risks = useMemo(() => adaptRisks(analysis?.grounded), [analysis]);
  const precedents = useMemo(() => adaptPrecedents(analysis?.grounded), [analysis]);
  const args = useMemo(
    () => adaptWinningArguments(analysis?.analysis, analysis?.grounded),
    [analysis],
  );
  const score = useMemo(() => {
    const g = analysis?.grounded?.score;
    if (!g) return null;
    return {
      predatoryScore: g.predatoryScore,
      band: g.band,
      drivers: g.drivers,
    };
  }, [analysis]);

  const insightsCount =
    (analysis?.grounded?.suggestedQuestions?.length || 0) +
    (analysis?.grounded?.negotiationSuggestions?.length || 0);

  const tabsWithCounts = [
    { ...TABS[0] },
    { ...TABS[1], count: risks.length },
    { ...TABS[2], count: precedents.length },
    { ...TABS[3], count: args.length },
    { ...TABS[4], count: insightsCount },
    { ...TABS[5] },
  ];

  if (!hydrated) {
    return <main className="mx-auto max-w-7xl px-6 py-10 text-slate-500">Loading...</main>;
  }

  if (!analysis) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-20 text-center">
        <div className="icon-tile h-14 w-14 text-amber-600">
          <FileWarning className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">No analysis loaded</h1>
        <p className="mt-2 text-sm text-slate-600">
          Upload a document from the home page first. The dashboard reads the most recent analysis from session storage.
        </p>
        <button
          type="button"
          onClick={() => router.push('/')}
          className="cool-button mt-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Go to upload
        </button>
      </main>
    );
  }

  const llmOk = analysis.llmMeta?.ok;

  return (
    <main className="mx-auto max-w-7xl px-5 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex items-center justify-between gap-4">
        <Link href="/" className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1.5 text-sm font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200/80 backdrop-blur hover:text-slate-950">
          <ArrowLeft className="h-4 w-4" />
          Upload
        </Link>
        <div className="hidden items-center gap-2 rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white shadow-lg sm:flex">
          <FileSearch className="h-3.5 w-3.5 text-teal-300" />
          CivicLens Analysis
        </div>
      </div>

      <header className="glass-panel overflow-hidden rounded-[1.75rem]">
        <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_22rem] lg:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200/70">
              <ShieldCheck className="h-3.5 w-3.5 text-teal-600" />
              Evidence-first review
            </div>
            <h1 className="mt-4 max-w-4xl text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              {analysis.meta?.originalName || 'Document'}
            </h1>
            <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
              <span className="capitalize">{analysis.structuredContext?.docType || 'unknown'}</span>
              <span className="text-slate-300">/</span>
              <span>{analysis.meta?.pageCount || '?'} pages</span>
              <span className="text-slate-300">/</span>
              <span>engine <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">{analysis.meta?.engine}</code></span>
              <span className="text-slate-300">/</span>
              <span>{analysis.processingTimeMs} ms</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-950 p-4 text-white shadow-xl">
              <Gauge className="h-5 w-5 text-teal-300" />
              <p className="mt-3 text-3xl font-black">{score?.predatoryScore ?? '--'}</p>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Risk score</p>
            </div>
            <div className="rounded-2xl bg-white/80 p-4 shadow-sm ring-1 ring-slate-200/80">
              <Scale className="h-5 w-5 text-amber-600" />
              <p className="mt-3 text-3xl font-black text-slate-950">{precedents.length}</p>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Judgments</p>
            </div>
          </div>
        </div>
      </header>

      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-emerald-200/80 bg-emerald-50/85 px-4 py-3 text-xs text-emerald-950 shadow-sm backdrop-blur">
        <ShieldCheck className="h-4 w-4 flex-shrink-0" />
        <span>Every risk below is traceable to a verbatim clause from your uploaded document. No fabricated penalties or invented terms.</span>
        {llmOk === false && (
          <span className="ml-auto whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold">
            grounded mode (LLM unavailable)
          </span>
        )}
      </div>

      <div className="mt-6">
        <TabNavigation tabs={tabsWithCounts} active={active} onChange={setActive} />
      </div>

      <div className="mt-6">
        {active === 'summary' && <SummaryTab analysis={analysis} />}
        {active === 'risks' && (
          <RisksTab
            risks={risks}
            score={score}
            negotiationSuggestions={analysis?.grounded?.negotiationSuggestions || []}
          />
        )}
        {active === 'judgments' && <SimilarJudgmentsTab precedents={precedents} />}
        {active === 'arguments' && <WinningArgumentsTab arguments={args} precedents={precedents} />}
        {active === 'before-you-sign' && <BeforeYouSignTab analysis={analysis} />}
        {active === 'chat' && <ChatTab analysis={analysis} />}
      </div>
    </main>
  );
}
