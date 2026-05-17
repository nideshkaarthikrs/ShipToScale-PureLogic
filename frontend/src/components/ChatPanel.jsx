'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Bot, User, Sparkles, ChevronDown, BookOpen, ShieldCheck } from 'lucide-react';

import { chatStream } from '@/lib/api';

// Default chips when the upload didn't surface any custom ones (e.g. when
// the user opens chat without a current analysis). The grounded chips
// produced by the backend's actionableInsightsService are preferred.
const DEFAULT_CHIPS = [
  'Give me a plain-language summary of this document.',
  'What clauses increase legal risk?',
  'Which precedent is most similar?',
  'What should I negotiate before signing?',
];

// Reasoning blocks render inside a collapsible card per message.
function ReasoningCard({ precedents }) {
  const [open, setOpen] = useState(false);
  if (!precedents?.length) return null;
  return (
    <div className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs text-indigo-900">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left font-medium"
      >
        <span className="inline-flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5" />
          Grounded against {precedents.length} precedent{precedents.length === 1 ? '' : 's'}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5">
          {precedents.map((p) => (
            <li key={p} className="font-mono">{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ChatPanel({ analysis, suggestedChips }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef(null);
  const scrollRef = useRef(null);

  // Auto-scroll on every message update so the user always sees the tail.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streaming]);

  // Compose a slim context payload — only what the chat endpoint needs.
  // We avoid sending the entire `analysis` because it's large (raw text +
  // chunks + LLM envelope) and the backend only reads rawText, structured
  // context, risks, and precedents.
  const docContext = useMemo(() => ({
    rawText: analysis?.rawText || '',
    structuredContext: analysis?.structuredContext || {},
    risks: analysis?.grounded?.risks || [],
  }), [analysis]);

  const precedents = useMemo(
    () => (analysis?.grounded?.similarJudgments || []).map((j) => ({
      id: j.id,
      title: j.title,
      court: j.court,
      year: j.year,
      similarityScore: j.similarityScore,
      judgmentSummary: j.judgmentSummary,
      keyArguments: j.winningArguments,
    })),
    [analysis],
  );

  const chips = (suggestedChips && suggestedChips.length > 0)
    ? suggestedChips
    : (analysis?.grounded?.chatChips?.length ? analysis.grounded.chatChips : DEFAULT_CHIPS);

  async function send(text) {
    const q = (text ?? input).trim();
    if (!q || streaming) return;
    setInput('');

    // Snapshot the conversation history we'll ship to the backend BEFORE
    // appending the in-flight turn — the backend should see what came
    // before, not the user's current question (that's `userQuery`).
    const historyToSend = messages.map((m) => ({ role: m.role, content: m.content }));

    const userMsg = { role: 'user', content: q };
    const assistantMsg = { role: 'assistant', content: '', grounding: null, error: null };
    setMessages((m) => [...m, userMsg, assistantMsg]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    await chatStream({
      userQuery: q,
      uploadedDocumentContext: docContext,
      retrievedPrecedents: precedents,
      conversationHistory: historyToSend,
      signal: controller.signal,
      onGrounding: (meta) => {
        setMessages((all) => {
          const next = [...all];
          next[next.length - 1] = { ...next[next.length - 1], grounding: meta };
          return next;
        });
      },
      onChunk: (chunk) => {
        setMessages((all) => {
          const next = [...all];
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, content: (last.content || '') + chunk };
          return next;
        });
      },
      onDone: () => {
        setStreaming(false);
        abortRef.current = null;
      },
      onError: (err) => {
        setMessages((all) => {
          const next = [...all];
          next[next.length - 1] = {
            ...next[next.length - 1],
            error: err.message || 'Chat failed',
          };
          return next;
        });
        setStreaming(false);
        abortRef.current = null;
      },
    });
  }

  function stopStreaming() {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }

  return (
    <section className="flex h-[600px] flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-slate-900">Ask about this document</h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="h-3 w-3 text-emerald-600" />
            Grounded in your uploaded text and {precedents.length} retrieved precedent{precedents.length === 1 ? '' : 's'}.
          </p>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <div>
            <p className="text-sm text-slate-500">Try one of these — these chips are generated from your document's detected risks:</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {chips.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => send(q)}
                  disabled={streaming}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="space-y-4">
            {messages.map((m, i) => (
              <li key={i} className="flex items-start gap-3">
                <div
                  className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${
                    m.role === 'user' ? 'bg-slate-900 text-white' : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {m.role === 'user' ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm leading-relaxed text-slate-800 ${m.role === 'assistant' ? 'whitespace-pre-wrap' : ''}`}>
                    {m.content}
                    {m.role === 'assistant' && streaming && i === messages.length - 1 && (
                      <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-slate-400 align-middle" />
                    )}
                  </div>
                  {m.error && (
                    <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                      {m.error}
                    </div>
                  )}
                  {m.role === 'assistant' && m.grounding?.citedPrecedentIds?.length > 0 && (
                    <ReasoningCard precedents={m.grounding.citedPrecedentIds} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        className="flex items-center gap-2 border-t border-slate-200 p-3"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Can the landlord legally withhold my deposit?"
          disabled={streaming}
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none disabled:bg-slate-50"
        />
        {streaming ? (
          <button
            type="button"
            onClick={stopStreaming}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" /> Send
          </button>
        )}
      </form>
    </section>
  );
}
