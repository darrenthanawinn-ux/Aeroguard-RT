import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, Terminal as TerminalIcon, Trash2 } from 'lucide-react';
import Panel, { Chip } from './Panel.jsx';
import { cx, fmtStamp } from '../utils/format.js';

const FILTERS = ['ALL', 'KERN', 'SCHED', 'IPC', 'FSM', 'FAULT'];

const LEVEL_TEXT = {
  dbg: 'text-slate-500',
  info: 'text-slate-300',
  ok: 'text-emerald-300',
  warn: 'text-amber-300',
  err: 'text-red-400',
};

const CAT_TEXT = {
  KERN: 'text-sky-400',
  SCHED: 'text-violet-300',
  IPC: 'text-cyan-300',
  FSM: 'text-emerald-300',
  FAULT: 'text-red-400',
  SYS: 'text-slate-400',
};

export default function FaultTerminal({ logs }) {
  const [filter, setFilter] = useState('ALL');
  const [follow, setFollow] = useState(true);
  const [clearedBefore, setClearedBefore] = useState(0);
  const boxRef = useRef(null);

  const visible = useMemo(
    () => logs.filter((l) => l.id > clearedBefore && (filter === 'ALL' || l.cat === filter || (filter === 'FAULT' && l.level === 'err'))),
    [logs, filter, clearedBefore],
  );

  useEffect(() => {
    const el = boxRef.current;
    if (follow && el) el.scrollTop = el.scrollHeight;
  }, [visible, follow]);

  const onScroll = () => {
    const el = boxRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    if (atBottom !== follow) setFollow(atBottom);
  };

  const clear = () => {
    const last = logs.length ? logs[logs.length - 1].id : 0;
    setClearedBefore(last);
  };

  return (
    <Panel
      title="System Event & Fault Terminal"
      subtitle="/dev/slog2 · kernel pulses · scheduler · FSM"
      icon={TerminalIcon}
      bodyClassName="p-0"
      right={
        <>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Log filter">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={cx(
                  'rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider transition-colors',
                  filter === f ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300' : 'border-slate-700 text-slate-500 hover:text-slate-300',
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setFollow(true);
              const el = boxRef.current;
              if (el) el.scrollTop = el.scrollHeight;
            }}
            className={cx('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider', follow ? 'border-emerald-500/50 text-emerald-300' : 'border-amber-500/50 text-amber-300')}
          >
            <ArrowDownToLine className="h-3 w-3" aria-hidden="true" />
            {follow ? 'following' : 'paused'}
          </button>
          <button type="button" onClick={clear} className="inline-flex items-center gap-1 rounded border border-slate-700 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-slate-400 hover:text-slate-200">
            <Trash2 className="h-3 w-3" aria-hidden="true" />
            Clear
          </button>
          <Chip tone="slate">{visible.length} lines</Chip>
        </>
      }
    >
      <div ref={boxRef} onScroll={onScroll} className="scroll-thin h-[320px] overflow-y-auto bg-ink-950/80 px-3 py-2 font-mono text-[11px] leading-[1.6]" role="log" aria-live="off">
        {visible.length === 0 ? <div className="text-slate-600">no events match the current filter</div> : null}
        {visible.map((l) => (
          <div key={l.id} className="flex gap-2 whitespace-pre-wrap break-words">
            <span className="tabular shrink-0 text-slate-600">{fmtStamp(l.ts)}</span>
            <span className={cx('w-[46px] shrink-0 font-semibold', CAT_TEXT[l.cat] || 'text-slate-400')}>{l.cat}</span>
            <span className="hidden w-[118px] shrink-0 truncate text-slate-500 md:inline">{l.src}</span>
            <span className={cx('min-w-0 flex-1', LEVEL_TEXT[l.level] || 'text-slate-300')}>{l.msg}</span>
          </div>
        ))}
        <div className="mt-1 flex items-center gap-1 text-emerald-400">
          <span>aeroguard@qnx8:~#</span>
          <span className="inline-block h-3 w-1.5 animate-blink bg-emerald-400" />
        </div>
      </div>
    </Panel>
  );
}
