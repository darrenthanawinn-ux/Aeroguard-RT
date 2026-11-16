import React from 'react';
import { cx } from '../utils/format.js';

const ACCENTS = {
  emerald: 'text-emerald-400',
  amber: 'text-amber-400',
  red: 'text-red-400',
  slate: 'text-slate-400',
  sky: 'text-sky-400',
};

const RINGS = {
  none: 'border-slate-800/90',
  amber: 'border-amber-500/40',
  red: 'border-red-500/50',
};

/** Shared glass panel chrome used by every dashboard section. */
export default function Panel({ title, subtitle, icon: Icon, right, accent = 'emerald', ring = 'none', className = '', bodyClassName = '', children }) {
  return (
    <section
      className={cx(
        'min-w-0 rounded-xl border bg-slate-900/50 backdrop-blur-sm shadow-[0_0_0_1px_rgba(2,6,12,0.6)]',
        RINGS[ring] || RINGS.none,
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon ? <Icon className={cx('h-4 w-4 shrink-0', ACCENTS[accent] || ACCENTS.emerald)} aria-hidden="true" /> : null}
          <h2 className="truncate font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-200">{title}</h2>
          {subtitle ? <span className="hidden truncate font-mono text-[10px] text-slate-500 sm:inline">{subtitle}</span> : null}
        </div>
        {right ? <div className="flex flex-wrap items-center gap-2">{right}</div> : null}
      </header>
      <div className={cx('p-4', bodyClassName)}>{children}</div>
    </section>
  );
}

/** Small labelled metric tile. */
export function Stat({ label, value, hint, tone = 'slate' }) {
  const tones = {
    slate: 'text-slate-100',
    emerald: 'text-emerald-300',
    amber: 'text-amber-300',
    red: 'text-red-300',
  };
  return (
    <div className="min-w-0 rounded-lg border border-slate-800/80 bg-slate-950/50 px-3 py-2">
      <div className="truncate font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className={cx('tabular mt-0.5 truncate font-mono text-lg font-semibold leading-tight', tones[tone] || tones.slate)}>{value}</div>
      {hint ? <div className="truncate font-mono text-[10px] text-slate-500">{hint}</div> : null}
    </div>
  );
}

/** Accessible on/off switch. */
export function Toggle({ checked, onChange, label, tone = 'emerald' }) {
  const on = tone === 'amber' ? 'bg-amber-500/80' : 'bg-emerald-500/80';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-slate-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60',
        checked ? on : 'bg-slate-800',
      )}
    >
      <span className={cx('inline-block h-3.5 w-3.5 transform rounded-full bg-slate-100 shadow transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
    </button>
  );
}

export function Chip({ children, tone = 'slate', className = '' }) {
  const tones = {
    slate: 'border-slate-700 bg-slate-800/60 text-slate-300',
    emerald: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    amber: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
    red: 'border-red-500/50 bg-red-500/10 text-red-300',
    sky: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  };
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider', tones[tone] || tones.slate, className)}>
      {children}
    </span>
  );
}
