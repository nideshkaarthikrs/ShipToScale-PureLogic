'use client';

import { useState } from 'react';
import { Send, Bot, User } from 'lucide-react';

const SUGGESTED = [
  'Is the security deposit refundable?',
  'What happens if I terminate before the lock-in?',
  'Which clauses are most risky?',
  'Give me a one-paragraph plain-language summary.',
];

export default function ChatTab({ analysis }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(text) {
    const q = (text ?? input).trim();
    if (!q) return;
    setMessages((m) => [...m, { role: 'user', content: q }]);
    setInput('');
    setBusy(true);
    // POST /api/chat is still a 501 stub; surface that honestly until the LLM agent wires it up.
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content:
            'Chat is not wired to a live LLM yet — POST /api/chat currently returns a 501 stub. Once the LLM Orchestration agent finishes Part 4, this panel will answer using the extracted text and matched precedents as context.',
        },
      ]);
      setBusy(false);
    }, 350);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-900">Ask about this document</h2>
        <p className="text-xs text-slate-500">Grounded in the {analysis?.preparedChunks?.length || 0} chunks prepared by the ingestion pipeline.</p>
      </header>

      <div className="max-h-[420px] overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <div>
            <p className="text-sm text-slate-500">Try a starter question:</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTED.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => send(q)}
                  className="rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-200"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {messages.map((m, i) => (
              <li key={i} className="flex items-start gap-3">
                <div
                  className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${
                    m.role === 'user' ? 'bg-slate-900 text-white' : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {m.role === 'user' ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                </div>
                <div className="flex-1 text-sm text-slate-700">{m.content}</div>
              </li>
            ))}
            {busy && (
              <li className="flex items-center gap-3 text-sm text-slate-500">
                <Bot className="h-4 w-4" /> thinking…
              </li>
            )}
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
          placeholder="e.g. Can the landlord keep my deposit?"
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!input.trim() || busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" /> Send
        </button>
      </form>
    </section>
  );
}
