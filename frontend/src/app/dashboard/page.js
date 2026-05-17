'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileWarning } from 'lucide-react';

import TabNavigation from '@/components/TabNavigation';
import SummaryTab from '@/components/tabs/SummaryTab';
import RisksTab from '@/components/tabs/RisksTab';
import SimilarJudgmentsTab from '@/components/tabs/SimilarJudgmentsTab';
import WinningArgumentsTab from '@/components/tabs/WinningArgumentsTab';
import ChatTab from '@/components/tabs/ChatTab';

import {
  MOCK_RISKS,
  MOCK_PRECEDENTS,
  MOCK_WINNING_ARGUMENTS,
  MOCK_RISK_SCORE,
} from '@/lib/mockData';
import { ANALYSIS_STORAGE_KEY } from '@/lib/api';

const TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'risks', label: 'Risks' },
  { id: 'judgments', label: 'Similar Judgments' },
  { id: 'arguments', label: 'Winning Arguments' },
  { id: 'chat', label: 'Chat' },
];

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

  // Risk / precedent / arguments data is still mocked — the next-agent's LLM service will
  // produce these fields directly. Show a banner so the demo audience knows what's real.
  const risks = MOCK_RISKS;
  const precedents = MOCK_PRECEDENTS;
  const args = MOCK_WINNING_ARGUMENTS;
  const score = MOCK_RISK_SCORE;

  const tabsWithCounts = [
    { ...TABS[0] },
    { ...TABS[1], count: risks.length },
    { ...TABS[2], count: precedents.length },
    { ...TABS[3], count: args.length },
    { ...TABS[4] },
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

      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        Demo note: extraction is real (pdfjs/tesseract). Risks, precedents, and winning arguments are mocked until the LLM Orchestration agent (Part 4) ships.
      </div>

      <div className="mt-6">
        <TabNavigation tabs={tabsWithCounts} active={active} onChange={setActive} />
      </div>

      <div className="mt-6">
        {active === 'summary' && <SummaryTab analysis={analysis} />}
        {active === 'risks' && <RisksTab risks={risks} score={score} />}
        {active === 'judgments' && <SimilarJudgmentsTab precedents={precedents} />}
        {active === 'arguments' && <WinningArgumentsTab arguments={args} precedents={precedents} />}
        {active === 'chat' && <ChatTab analysis={analysis} />}
      </div>
    </main>
  );
}
