// Contextual Q&A panel (spec §6 Contract Chat Assistant). Next agent: wire to POST /api/chat with documentId context.

export default function ChatPanel() {
  return (
    <section className="flex h-80 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Ask about this document</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 text-sm text-slate-500">
        Conversation will appear here.
      </div>
      <div className="border-t border-slate-200 p-3">
        <input
          type="text"
          placeholder="e.g. Can the landlord keep my deposit?"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>
    </section>
  );
}
