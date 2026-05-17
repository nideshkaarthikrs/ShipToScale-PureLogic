'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileWarning, ShieldCheck } from 'lucide-react';

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
    return <main className="mx-auto max-w-7xl px-6 py-10 text-slate-500">Loading…</main>;
  }

  if (!analysis) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col items-center px-6 py-20 text-center">
        <FileWarning className="h-10 w-10 text-amber-500" />
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">No analysis loaded</h1>
        <p className="mt-2 text-sm text-slate-600">
          Upload a document from the home page first — the dashboard reads the most recent analysis from session storage.
        </p>
        <button
          type="button"
          onClick={() => router.push('/')}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Go to upload
        </button>
      </main>
    );
  }

  const llmOk = analysis.llmMeta?.ok;

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" />
        Back to upload
      </Link>

      <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{analysis.meta?.originalName || 'Document'}</h1>
          <p className="mt-1 text-sm text-slate-600">
            <span className="capitalize">{analysis.structuredContext?.docType || 'unknown'}</span>
            <span className="mx-1.5 text-slate-300">·</span>
            {analysis.meta?.pageCount || '?'} pages
            <span className="mx-1.5 text-slate-300">·</span>
            extracted via <code className="font-mono text-xs">{analysis.meta?.engine}</code>
            <span className="mx-1.5 text-slate-300">·</span>
            {analysis.processingTimeMs} ms
          </p>
        </div>
      </header>

      <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4" />
        Every risk below is traceable to a verbatim clause from your uploaded document. No fabricated penalties or invented terms.
        {llmOk === false && (
          <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium">
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
