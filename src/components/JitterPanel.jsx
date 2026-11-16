import React, { useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Gauge, Flame } from 'lucide-react';
import Panel, { Chip, Stat, Toggle } from './Panel.jsx';
import { cx, fmtUs } from '../utils/format.js';
import { QNX_JITTER_LIMIT_US } from '../engine/simulation.js';

const TICKS = [1, 10, 100, 1000, 10000, 100000];
const tickLabel = (v) => (v >= 1000 ? `${v / 1000} ms` : `${v} µs`);

function JitterTooltip({ active, payload, now }) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-700 bg-slate-950/95 px-3 py-2 font-mono text-[11px] shadow-xl">
      <div className="mb-1 text-slate-500">T-{Math.max(0, now - row.t).toFixed(1)} s</div>
      <div className="text-emerald-300">QNX 8.0: {fmtUs(row.qnx, 1)}</div>
      <div className="text-amber-300">Linux: {fmtUs(row.linux, 0)}</div>
    </div>
  );
}

export default function JitterPanel({ snap, actions }) {
  const [show, setShow] = useState({ qnx: true, linux: true });
  const { qnx, linux } = snap.jitterStats;
  const qnxOk = qnx.max < QNX_JITTER_LIMIT_US;
  const ratio = qnx.avg > 0 ? linux.avg / qnx.avg : 0;

  return (
    <Panel
      title="Determinism · Scheduling Jitter"
      subtitle="timer-pulse wake-up latency, log scale"
      icon={Gauge}
      right={
        <>
          <Chip tone={qnxOk ? 'emerald' : 'red'}>{qnxOk ? 'QNX < 100 µs ✓' : 'QNX budget exceeded'}</Chip>
          <label className="flex cursor-pointer items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-slate-400">
            <Flame className={cx('h-3.5 w-3.5', snap.stress ? 'text-amber-400' : 'text-slate-600')} aria-hidden="true" />
            Stress load
            <Toggle checked={snap.stress} onChange={actions.setStress} label="Inject CPU stress load on Linux baseline" tone="amber" />
          </label>
        </>
      }
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShow((s) => ({ ...s, qnx: !s.qnx }))}
          aria-pressed={show.qnx}
          className={cx('flex items-center gap-2 rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors', show.qnx ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 text-slate-500')}
        >
          <span className="h-0.5 w-4 rounded bg-emerald-400" /> QNX 8.0 microkernel
        </button>
        <button
          type="button"
          onClick={() => setShow((s) => ({ ...s, linux: !s.linux }))}
          aria-pressed={show.linux}
          className={cx('flex items-center gap-2 rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors', show.linux ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-slate-700 text-slate-500')}
        >
          <span className="h-0.5 w-4 rounded bg-amber-400" /> Linux baseline (CFS)
        </button>
        <span className="ml-auto font-mono text-[10px] text-slate-500">now: QNX {fmtUs(snap.latest.qnxUs, 1)} · Linux {fmtUs(snap.latest.linuxUs)}</span>
      </div>

      <div className="h-[280px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={snap.jitter} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
            <XAxis
              dataKey="t"
              type="number"
              domain={['dataMin', 'dataMax']}
              tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
              tickFormatter={(v) => `-${Math.max(0, snap.t - v).toFixed(0)}s`}
              stroke="#334155"
              minTickGap={40}
            />
            <YAxis
              scale="log"
              type="number"
              domain={[1, 100000]}
              ticks={TICKS}
              allowDataOverflow
              tickFormatter={tickLabel}
              tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
              stroke="#334155"
              width={58}
            />
            <ReferenceArea y1={10000} y2={50000} fill="#f59e0b" fillOpacity={0.06} stroke="none" ifOverflow="hidden" />
            <ReferenceLine y={QNX_JITTER_LIMIT_US} stroke="#34d399" strokeDasharray="5 4" strokeOpacity={0.7} label={{ value: '100 µs hard-RT budget', position: 'insideTopRight', fill: '#34d399', fontSize: 10 }} />
            <Tooltip content={<JitterTooltip now={snap.t} />} isAnimationActive={false} />
            {show.linux ? <Line type="monotone" dataKey="linux" stroke="#fbbf24" strokeWidth={1.75} dot={false} isAnimationActive={false} /> : null}
            {show.qnx ? <Line type="monotone" dataKey="qnx" stroke="#34d399" strokeWidth={2} dot={false} isAnimationActive={false} /> : null}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-5">
        <Stat label="QNX p99" value={fmtUs(qnx.p99, 1)} tone="emerald" hint="last 10 s" />
        <Stat label="QNX max" value={fmtUs(qnx.max, 1)} tone={qnxOk ? 'emerald' : 'red'} hint={qnxOk ? 'under 100 µs' : 'over budget'} />
        <Stat label="Linux p99" value={fmtUs(linux.p99)} tone="amber" hint="last 10 s" />
        <Stat label="Linux max" value={fmtUs(linux.max)} tone="amber" hint="10–50 ms band" />
        <Stat label="Determinism gain" value={`${Math.round(ratio).toLocaleString('en-US')}×`} tone="emerald" hint="avg Linux ÷ avg QNX" />
      </div>
    </Panel>
  );
}
