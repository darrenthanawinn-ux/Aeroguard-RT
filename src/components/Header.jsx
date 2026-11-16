import React from 'react';
import { Activity, Cpu, Pause, Play, Plug, ShieldAlert, ShieldCheck, WifiOff } from 'lucide-react';
import { Chip } from './Panel.jsx';
import { cx, fmtUptime } from '../utils/format.js';

const MODE_META = {
  NOMINAL: { label: 'ALL SYSTEMS NOMINAL', tone: 'emerald', Icon: ShieldCheck },
  HANG: { label: 'PRIMARY STACK HUNG', tone: 'amber', Icon: ShieldAlert },
  OVERRIDE: { label: 'SAFETY OVERRIDE ACTIVE', tone: 'red', Icon: ShieldAlert },
  LANDED: { label: 'SAFE LANDED / DISARMED', tone: 'amber', Icon: ShieldCheck },
};

export default function Header({ snap, source, bridgeStatus, paused, actions }) {
  const meta = MODE_META[snap.mode] || MODE_META.NOMINAL;
  const StatusIcon = meta.Icon;

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800/90 bg-slate-900/60 px-4 py-3 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/10">
          <Cpu className="h-5 w-5 text-emerald-300" aria-hidden="true" />
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
        </div>
        <div>
          <h1 className="font-mono text-sm font-bold uppercase tracking-[0.22em] text-slate-100">
            AeroGuard<span className="text-emerald-400">-RT</span> <span className="text-slate-400">Ground Station</span>
          </h1>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">QNX 8.0 safety supervisor · procnto-smp-instr · x86_64</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={meta.tone} className={cx('px-2.5 py-1 text-[11px]', snap.mode !== 'NOMINAL' && 'animate-pulseRing')}>
          <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {meta.label}
        </Chip>
        <Chip tone="slate">
          <Activity className="h-3 w-3" aria-hidden="true" />
          UP {fmtUptime(snap.uptime)}
        </Chip>

        <div className="inline-flex overflow-hidden rounded-md border border-slate-700 font-mono text-[10px] uppercase tracking-wider" role="group" aria-label="Telemetry source">
          <button
            type="button"
            onClick={() => actions.setSource('mock')}
            className={cx('px-2.5 py-1 transition-colors', source === 'mock' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400 hover:bg-slate-800')}
          >
            Mock engine
          </button>
          <button
            type="button"
            onClick={() => actions.setSource('qemu')}
            className={cx('flex items-center gap-1.5 border-l border-slate-700 px-2.5 py-1 transition-colors', source === 'qemu' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-400 hover:bg-slate-800')}
            title="Connects to ws://localhost:8765 and falls back to the mock engine if unavailable"
          >
            {bridgeStatus === 'live' ? <Plug className="h-3 w-3" aria-hidden="true" /> : <WifiOff className="h-3 w-3" aria-hidden="true" />}
            QEMU bridge{bridgeStatus === 'connecting' ? '…' : bridgeStatus === 'live' ? ' · live' : ''}
          </button>
        </div>

        <button
          type="button"
          onClick={() => actions.setPaused(!paused)}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-slate-300 transition-colors hover:bg-slate-800"
          aria-pressed={paused}
        >
          {paused ? <Play className="h-3 w-3" aria-hidden="true" /> : <Pause className="h-3 w-3" aria-hidden="true" />}
          {paused ? 'Resume' : 'Freeze'}
        </button>
      </div>
    </header>
  );
}
