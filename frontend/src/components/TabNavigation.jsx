'use client';

export default function TabNavigation({ tabs, active, onChange }) {
  return (
    <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-3" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange?.(tab.id)}
          className={[
            'rounded-full px-3.5 py-1.5 text-sm font-medium transition',
            active === tab.id
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
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
