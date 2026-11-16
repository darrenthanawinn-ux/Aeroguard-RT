import React from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, RotateCcw, ShieldAlert, Timer } from 'lucide-react';
import Panel, { Chip, Stat } from './Panel.jsx';
import { cx, fmtNum, fmtUs } from '../utils/format.js';

const LEVEL_TEXT = {
  warn: 'text-amber-300',
  err: 'text-red-300',
  ok: 'text-emerald-300',
  info: 'text-slate-300',
};

/** SVG: untrusted path vs hard-RT recovery path into the watchdog gate and PWM bus. */
function PathDiagram({ mode }) {
  const nominal = mode === 'NOMINAL';
  const hung = mode === 'HANG';
  const override = mode === 'OVERRIDE' || mode === 'LANDED';

  const primaryColor = nominal ? '#34d399' : hung ? '#fbbf24' : '#ef4444';
  const recoveryColor = override ? '#34d399' : '#475569';
  const gateColor = nominal ? '#34d399' : hung ? '#fbbf24' : '#f59e0b';

  return (
    <svg viewBox="0 0 360 112" className="h-auto w-full" role="img" aria-label="Command path diagram: primary stack and recovery routine feeding the watchdog gate and PWM bus">
      {/* primary -> gate */}
      <line x1="112" y1="30" x2="150" y2="48" stroke={primaryColor} strokeWidth="2" strokeDasharray={nominal ? undefined : '4 4'} className={nominal ? 'flow' : undefined} opacity={override ? 0.7 : 1} />
      {override ? (
        <g stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round">
          <line x1="125" y1="32" x2="137" y2="46" />
          <line x1="137" y1="32" x2="125" y2="46" />
        </g>
      ) : null}
      {/* recovery -> gate */}
      <line x1="112" y1="82" x2="150" y2="64" stroke={recoveryColor} strokeWidth="2" strokeDasharray={override ? undefined : '3 5'} className={override ? 'flow-fast' : undefined} />
      {/* gate -> bus */}
      <line x1="210" y1="56" x2="250" y2="56" stroke={gateColor} strokeWidth="2.5" className="flow" />

      {/* primary */}
      <g>
        <rect x="8" y="12" width="104" height="36" rx="6" fill={nominal ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.10)'} stroke={primaryColor} strokeWidth="1.5" className={hung ? 'animate-pulseRing' : undefined} />
        <text x="60" y="27" textAnchor="middle" fontSize="9" fontFamily="JetBrains Mono, monospace" fill="#e2e8f0" fontWeight="600">PRIMARY STACK</text>
        <text x="60" y="39" textAnchor="middle" fontSize="8" fontFamily="JetBrains Mono, monospace" fill={primaryColor}>{nominal ? 'RR 30 · untrusted' : hung ? 'NO HEARTBEAT' : 'PATH SEVERED'}</text>
      </g>
      {/* recovery */}
      <g>
        <rect x="8" y="64" width="104" height="36" rx="6" fill={override ? 'rgba(16,185,129,0.10)' : 'rgba(71,85,105,0.10)'} stroke={recoveryColor} strokeWidth="1.5" />
        <text x="60" y="79" textAnchor="middle" fontSize="9" fontFamily="JetBrains Mono, monospace" fill="#e2e8f0" fontWeight="600">RECOVERY-RT</text>
        <text x="60" y="91" textAnchor="middle" fontSize="8" fontFamily="JetBrains Mono, monospace" fill={recoveryColor}>{override ? 'FIFO 99 · ACTIVE' : 'FIFO 99 · standby'}</text>
      </g>
      {/* gate */}
      <g>
        <rect x="150" y="30" width="60" height="52" rx="6" fill="rgba(245,158,11,0.07)" stroke={gateColor} strokeWidth="1.5" />
        <text x="180" y="52" textAnchor="middle" fontSize="9" fontFamily="JetBrains Mono, monospace" fill="#e2e8f0" fontWeight="600">WDOG</text>
        <text x="180" y="63" textAnchor="middle" fontSize="9" fontFamily="JetBrains Mono, monospace" fill="#e2e8f0" fontWeight="600">GATE</text>
        <text x="180" y="75" textAnchor="middle" fontSize="7.5" fontFamily="JetBrains Mono, monospace" fill={gateColor}>{nominal ? 'ARMED' : hung ? 'TRIPPING' : 'RT ONLY'}</text>
      </g>
      {/* pwm bus */}
      <g>
        <rect x="250" y="30" width="102" height="52" rx="6" fill="rgba(16,185,129,0.08)" stroke="#34d399" strokeWidth="1.5" />
        <text x="301" y="52" textAnchor="middle" fontSize="9" fontFamily="JetBrains Mono, monospace" fill="#e2e8f0" fontWeight="600">PWM BUS</text>
        <text x="301" y="64" textAnchor="middle" fontSize="8" fontFamily="JetBrains Mono, monospace" fill="#34d399">4 × ESC</text>
        <text x="301" y="75" textAnchor="middle" fontSize="7.5" fontFamily="JetBrains Mono, monospace" fill="#94a3b8">{nominal ? 'src: primary' : 'src: recovery-rt'}</text>
      </g>
    </svg>
  );
}

export default function FailsafePanel({ snap, actions }) {
  const { mode, failsafe, latest } = snap;
  const nominal = mode === 'NOMINAL';
  const busy = !nominal || Boolean(failsafe && !failsafe.complete);
  const canRearm = mode === 'OVERRIDE' || mode === 'LANDED';
  const ring = mode === 'OVERRIDE' ? 'red' : mode === 'HANG' ? 'amber' : 'none';

  const totalUs = failsafe && failsafe.complete ? failsafe.totalUs : snap.lastOverrideUs;
  const speedup = totalUs && snap.linuxEquivMs ? (snap.linuxEquivMs * 1000) / totalUs : null;

  return (
    <Panel
      title="Safety Override · Failsafe"
      subtitle="primary stack hang → hard-RT recovery"
      icon={ShieldAlert}
      accent={nominal ? 'emerald' : 'red'}
      ring={ring}
      right={<Chip tone={nominal ? 'emerald' : mode === 'HANG' ? 'amber' : 'red'}>{mode}</Chip>}
    >
      <PathDiagram mode={mode} />

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={actions.triggerHang}
          disabled={busy}
          className={cx(
            'flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-3 font-mono text-xs font-bold uppercase tracking-[0.16em] transition-all',
            busy
              ? 'cursor-not-allowed border-slate-700 bg-slate-800/50 text-slate-500'
              : 'border-red-500/70 bg-red-500/15 text-red-200 shadow-[0_0_24px_rgba(239,68,68,0.18)] hover:bg-red-500/25 hover:shadow-[0_0_32px_rgba(239,68,68,0.35)] active:scale-[0.99]',
          )}
        >
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          Simulate Primary Stack Hang
        </button>
        <button
          type="button"
          onClick={actions.rearm}
          disabled={!canRearm}
          className={cx(
            'flex items-center justify-center gap-2 rounded-lg border px-4 py-3 font-mono text-xs font-semibold uppercase tracking-[0.14em] transition-colors',
            canRearm ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20' : 'cursor-not-allowed border-slate-800 text-slate-600',
          )}
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Re-arm
        </button>
      </div>

      <ol className="mt-3 space-y-1.5" aria-label="Override timeline">
        {(failsafe
          ? failsafe.steps
          : [
              { us: 0, label: 'Primary stack heartbeat lost', done: false, level: 'warn' },
              { us: null, label: 'Watchdog budget exceeded', done: false, level: 'err' },
              { us: null, label: 'Untrusted command path severed', done: false, level: 'err' },
              { us: null, label: 'PWM bus handed to RT recovery', done: false, level: 'warn' },
              { us: null, label: 'Attitude hold + controlled descent', done: false, level: 'ok' },
            ]
        ).map((s, i) => (
          <li
            key={s.label}
            className={cx(
              'flex items-center gap-2.5 rounded-md border px-2.5 py-1.5 font-mono text-[11px] transition-colors',
              s.done ? 'border-slate-700 bg-slate-950/70' : 'border-slate-800/60 bg-transparent',
            )}
          >
            {s.done ? <CheckCircle2 className={cx('h-3.5 w-3.5 shrink-0', LEVEL_TEXT[s.level])} aria-hidden="true" /> : <CircleDashed className="h-3.5 w-3.5 shrink-0 text-slate-700" aria-hidden="true" />}
            <span className={cx('min-w-0 flex-1 truncate', s.done ? 'text-slate-200' : 'text-slate-600')}>
              {i + 1}. {s.label}
            </span>
            <span className={cx('tabular shrink-0', s.done ? LEVEL_TEXT[s.level] : 'text-slate-700')}>{s.us === null ? '— µs' : `T+${s.us} µs`}</span>
          </li>
        ))}
      </ol>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Detect" value={failsafe && failsafe.revealed >= 2 ? fmtUs(failsafe.detectUs) : '—'} tone="amber" hint="budget 500 µs" />
        <Stat label="Total override" value={totalUs ? fmtUs(totalUs) : '—'} tone="emerald" hint={failsafe && !failsafe.complete ? 'in progress…' : totalUs ? 'hang → recovery' : 'run a test'} />
        <Stat label="Linux equiv." value={snap.linuxEquivMs && failsafe ? `${fmtNum(snap.linuxEquivMs, 1)} ms` : '—'} tone="amber" hint={speedup ? `${Math.round(speedup).toLocaleString('en-US')}× slower` : 'userspace wdog'} />
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <Stat label="Altitude" value={`${fmtNum(latest.alt, 1)} m`} tone={nominal ? 'slate' : 'amber'} />
        <Stat label="Vert. speed" value={`${fmtNum(latest.vs, 1)} m/s`} tone={nominal ? 'slate' : 'amber'} />
        <Stat label="Overrides" value={snap.overrides} hint="this session" />
      </div>

      <p className="mt-3 flex items-start gap-1.5 font-mono text-[10px] leading-relaxed text-slate-500">
        <Timer className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
        Timestamps are simulated microseconds. The on-screen replay is time-dilated so each step is visible.
      </p>
    </Panel>
  );
}
