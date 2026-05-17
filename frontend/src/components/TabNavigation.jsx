'use client';

export default function TabNavigation({ tabs, active, onChange }) {
  return (
    <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/78 p-1.5 shadow-sm backdrop-blur" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange?.(tab.id)}
          className={[
            'whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-semibold transition',
            active === tab.id
              ? 'bg-slate-950 text-white shadow-[0_10px_24px_rgba(15,23,42,0.18)]'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
          ].join(' ')}
        >
          {tab.label}
          {typeof tab.count === 'number' && (
            <span className={`ml-1.5 text-[10px] tabular-nums ${active === tab.id ? 'text-slate-300' : 'text-slate-400'}`}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
