import React from 'react';
import { Bug, Network } from 'lucide-react';
import Panel, { Chip } from './Panel.jsx';
import { cx } from '../utils/format.js';

// Node geometry (viewBox 0 0 640 330)
const NODES = {
  wdog: { x: 40, y: 56, w: 150, h: 44, title: 'aeroguard-wdog', sub: 'FIFO 99 · tid 4', zone: 'rt' },
  act: { x: 40, y: 128, w: 150, h: 44, title: 'pwm-actuator', sub: 'FIFO 99 · tid 5', zone: 'rt' },
  imu: { x: 40, y: 200, w: 150, h: 44, title: 'imu-driver', sub: 'FIFO 98 · tid 6', zone: 'rt' },
  dev: { x: 250, y: 118, w: 140, h: 64, title: '/dev/aeroguard', sub: 'resmgr · chid 3', zone: 'rm' },
  primary: { x: 450, y: 56, w: 160, h: 44, title: 'primary-flightstack', sub: 'RR 30 · untrusted', zone: 'nrt' },
  radio: { x: 450, y: 128, w: 160, h: 44, title: 'radio-link', sub: 'RR 20 · untrusted', zone: 'nrt' },
  logger: { x: 450, y: 200, w: 160, h: 44, title: 'blackbox-logger', sub: 'RR 10 · non-RT', zone: 'nrt' },
};

const cy = (n) => n.y + n.h / 2;

function edgePath(from, to) {
  const a = NODES[from];
  const b = NODES[to];
  const leftToRight = a.x < b.x;
  const x1 = leftToRight ? a.x + a.w : a.x;
  const x2 = leftToRight ? b.x : b.x + b.w;
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${cy(a)} C ${mx} ${cy(a)}, ${mx} ${cy(b)}, ${x2} ${cy(b)}`;
}

function nodeState(id, snap) {
  const mode = snap.mode;
  const L = snap.logger.state;
  if (id === 'primary') {
    if (mode === 'NOMINAL') return 'ok';
    return mode === 'HANG' ? 'warn' : 'dead';
  }
  if (id === 'logger') return L === 'RUNNING' ? 'ok' : L === 'RESPAWNING' ? 'warn' : 'dead';
  if (id === 'wdog') return mode === 'NOMINAL' ? 'ok' : mode === 'HANG' ? 'warn' : 'active';
  if (id === 'act') return mode === 'NOMINAL' ? 'ok' : 'active';
  if (id === 'dev') return mode === 'NOMINAL' ? 'ok' : 'warn';
  return 'ok';
}

const STATE_STYLE = {
  ok: { stroke: '#34d399', fill: 'rgba(16,185,129,0.07)', text: '#a7f3d0' },
  active: { stroke: '#f59e0b', fill: 'rgba(245,158,11,0.10)', text: '#fde68a' },
  warn: { stroke: '#f59e0b', fill: 'rgba(245,158,11,0.08)', text: '#fde68a' },
  dead: { stroke: '#ef4444', fill: 'rgba(239,68,68,0.10)', text: '#fca5a5' },
};

function edgeState(from, to, snap) {
  const involved = [from, to];
  if (involved.includes('logger')) return snap.logger.state === 'RUNNING' ? 'flow' : 'dead';
  if (involved.includes('primary')) {
    if (snap.mode === 'NOMINAL') return 'flow';
    return snap.mode === 'HANG' ? 'stall' : 'dead';
  }
  return 'flow';
}

export default function NodeMap({ snap, actions }) {
  const { logger, isolation, mode } = snap;
  const edges = [
    ['imu', 'dev'],
    ['wdog', 'dev'],
    ['act', 'dev'],
    ['primary', 'dev'],
    ['radio', 'dev'],
    ['logger', 'dev'],
  ];

  const rtHealthy = true; // RT zone stays up by construction of the simulation
  const loggerDown = logger.state !== 'RUNNING';
  const crashable = logger.state === 'RUNNING';

  return (
    <Panel
      title="Resource Manager · Process Isolation"
      subtitle="MMU-enforced boundaries, IPC via /dev/aeroguard"
      icon={Network}
      right={
        <>
          <Chip tone={loggerDown ? 'amber' : 'emerald'}>logger {logger.state.toLowerCase()}</Chip>
          <button
            type="button"
            onClick={actions.crashLogger}
            disabled={!crashable}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider transition-colors',
              crashable ? 'border-amber-500/60 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20' : 'cursor-not-allowed border-slate-800 text-slate-600',
            )}
          >
            <Bug className="h-3 w-3" aria-hidden="true" />
            Crash logger
          </button>
        </>
      }
    >
      <svg viewBox="0 0 640 290" className="h-auto w-full" role="img" aria-label="Process isolation map: real-time actuator watchdog separated from non-real-time processes by the /dev/aeroguard resource manager">
        {/* zones */}
        <g fontFamily="JetBrains Mono, monospace" fontSize="9" letterSpacing="1.5">
          <rect x="14" y="26" width="206" height="242" rx="10" fill="rgba(16,185,129,0.035)" stroke="#34d399" strokeOpacity="0.45" strokeDasharray="6 4" />
          <text x="26" y="42" fill="#34d399">HARD REAL-TIME ZONE</text>
          <rect x="424" y="26" width="212" height="242" rx="10" fill="rgba(148,163,184,0.03)" stroke="#64748b" strokeOpacity="0.55" strokeDasharray="6 4" />
          <text x="436" y="42" fill="#94a3b8">UNTRUSTED / NON-RT ZONE</text>
        </g>

        {/* isolation barrier */}
        <g>
          <line x1="410" y1="26" x2="410" y2="268" stroke={loggerDown || mode !== 'NOMINAL' ? '#f59e0b' : '#34d399'} strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="2 5" />
          <text x="410" y="282" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="#64748b" letterSpacing="1">
            MMU ISOLATION BARRIER
          </text>
        </g>

        {/* edges */}
        {edges.map(([from, to]) => {
          const st = edgeState(from, to, snap);
          const color = st === 'flow' ? '#34d399' : st === 'stall' ? '#f59e0b' : '#ef4444';
          return (
            <path
              key={`${from}-${to}`}
              d={edgePath(from, to)}
              fill="none"
              stroke={color}
              strokeWidth="1.6"
              strokeOpacity={st === 'dead' ? 0.55 : 0.9}
              className={st === 'flow' ? 'flow' : undefined}
              strokeDasharray={st === 'flow' ? undefined : '3 5'}
            />
          );
        })}

        {/* severed marks */}
        {(mode === 'OVERRIDE' || mode === 'LANDED') && (
          <g stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round">
            <line x1="408" y1="72" x2="420" y2="84" />
            <line x1="420" y1="72" x2="408" y2="84" />
          </g>
        )}
        {loggerDown && (
          <g stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round">
            <line x1="408" y1="206" x2="420" y2="218" />
            <line x1="420" y1="206" x2="408" y2="218" />
          </g>
        )}

        {/* nodes */}
        {Object.entries(NODES).map(([id, n]) => {
          const st = nodeState(id, snap);
          const s = STATE_STYLE[st];
          const isDev = id === 'dev';
          const pulsing = st === 'dead' || st === 'warn';
          return (
            <g key={id}>
              <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={isDev ? 10 : 7} fill={s.fill} stroke={s.stroke} strokeWidth={isDev ? 2 : 1.5} className={pulsing ? 'animate-pulseRing' : undefined} />
              <text x={n.x + n.w / 2} y={n.y + n.h / 2 - 2} textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="11" fontWeight="600" fill="#e2e8f0">
                {n.title}
              </text>
              <text x={n.x + n.w / 2} y={n.y + n.h / 2 + 11} textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="8.5" fill={s.text}>
                {st === 'dead' ? (id === 'logger' ? `CRASHED · pid ${logger.pid}` : 'SEVERED') : st === 'warn' && id === 'primary' ? 'HUNG' : n.sub}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px]">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-slate-500">RT actuator watchdog</div>
            <div className={cx('font-semibold', rtHealthy ? 'text-emerald-300' : 'text-red-300')}>● RUNNING · never preempted</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-slate-500">Logger crashes (session)</div>
            <div className="tabular font-semibold text-slate-100">{isolation.crashes}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-slate-500">Max RT jitter during outage</div>
            <div className="tabular font-semibold text-emerald-300">
              {isolation.lastProofMax !== null ? `${Math.round(isolation.lastProofMax)} µs / ${isolation.lastProofSamples} samples` : loggerDown ? `${Math.round(isolation.windowMax)} µs (measuring…)` : 'no crash yet'}
            </div>
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          Kill the non-real-time logger: the QNX microkernel destroys only that process&apos;s channels and connections. FIFO-99 threads keep their jitter budget, and the watchdog does not need to fire.
        </p>
      </div>
    </Panel>
  );
}
