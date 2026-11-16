import React from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { BatteryCharging, Compass, Thermometer, Waves } from 'lucide-react';
import Panel, { Toggle } from './Panel.jsx';
import { cx, fmtNum } from '../utils/format.js';

const AXIS_TICK = { fill: '#64748b', fontSize: 9, fontFamily: 'JetBrains Mono, monospace' };

function StreamCard({ title, icon: Icon, enabled, onToggle, children, readouts }) {
  return (
    <div className={cx('min-w-0 rounded-lg border bg-slate-950/50 p-3 transition-colors', enabled ? 'border-slate-800' : 'border-slate-800/60')}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-slate-300">
          <Icon className={cx('h-4 w-4', enabled ? 'text-emerald-400' : 'text-slate-600')} aria-hidden="true" />
          {title}
        </div>
        <div className="flex items-center gap-2">
          <span className={cx('font-mono text-[9px] uppercase tracking-wider', enabled ? 'text-emerald-400' : 'text-slate-500')}>{enabled ? 'live' : 'muted'}</span>
          <Toggle checked={enabled} onChange={onToggle} label={`Toggle ${title} stream`} />
        </div>
      </div>

      <div className={cx('mb-2 grid gap-2', readouts.length === 4 ? 'grid-cols-4' : 'grid-cols-3')}>
        {readouts.map((r) => (
          <div key={r.label} className="min-w-0">
            <div className="truncate font-mono text-[9px] uppercase tracking-wider text-slate-500">{r.label}</div>
            <div className={cx('tabular truncate font-mono text-sm font-semibold', enabled ? r.tone || 'text-slate-100' : 'text-slate-600')}>{enabled ? r.value : '—'}</div>
          </div>
        ))}
      </div>

      <div className="relative h-[150px] w-full min-w-0">
        <div className={cx('h-full w-full transition-opacity', enabled ? 'opacity-100' : 'opacity-25')}>{children}</div>
        {!enabled ? (
          <div className="absolute inset-0 flex items-center justify-center font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">stream muted</div>
        ) : null}
      </div>
    </div>
  );
}

function MiniChart({ data, children, yDomain, yTicks, yWidth = 34 }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
        <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} hide />
        <YAxis domain={yDomain} ticks={yTicks} tick={AXIS_TICK} stroke="#334155" width={yWidth} allowDataOverflow />
        {children}
      </LineChart>
    </ResponsiveContainer>
  );
}

function MotorBars({ motors, enabled }) {
  const labels = ['M1 FL', 'M2 FR', 'M3 RR', 'M4 RL'];
  return (
    <div className="mt-2 grid grid-cols-4 gap-2">
      {motors.map((m, i) => {
        const pct = Math.max(0, Math.min(100, ((m - 1000) / 1000) * 100));
        return (
          <div key={labels[i]} className="min-w-0">
            <div className="flex items-center justify-between font-mono text-[9px] text-slate-500">
              <span>{labels[i]}</span>
              <span className="tabular text-slate-300">{enabled ? Math.round(m) : '—'}</span>
            </div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-emerald-400/80 transition-[width] duration-100" style={{ width: enabled ? `${pct}%` : '0%' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function StreamPanel({ snap, actions }) {
  const { latest, streams } = snap;
  const voltLow = latest.volt < 14.8;
  const tempHigh = latest.socTemp > 85 || latest.escTemp > 85;

  return (
    <Panel title="Live Telemetry Streams" subtitle="subscribe / mute individual channels" icon={Waves} bodyClassName="p-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <StreamCard
          title="IMU attitude"
          icon={Compass}
          enabled={streams.imu}
          onToggle={(v) => actions.setStream('imu', v)}
          readouts={[
            { label: 'Roll °', value: fmtNum(latest.roll, 2), tone: 'text-emerald-300' },
            { label: 'Pitch °', value: fmtNum(latest.pitch, 2), tone: 'text-amber-300' },
            { label: 'Hdg °', value: fmtNum(latest.yaw, 1), tone: 'text-sky-300' },
          ]}
        >
          <MiniChart data={snap.imu} yDomain={[-10, 10]} yTicks={[-10, -5, 0, 5, 10]}>
            <Line type="monotone" dataKey="roll" stroke="#34d399" strokeWidth={1.6} dot={false} isAnimationActive={false} connectNulls={false} />
            <Line type="monotone" dataKey="pitch" stroke="#fbbf24" strokeWidth={1.6} dot={false} isAnimationActive={false} connectNulls={false} />
            <Line type="monotone" dataKey="yaw" stroke="#38bdf8" strokeWidth={1.2} dot={false} isAnimationActive={false} connectNulls={false} />
          </MiniChart>
        </StreamCard>

        <StreamCard
          title="Motor PWM out"
          icon={Waves}
          enabled={streams.pwm}
          onToggle={(v) => actions.setStream('pwm', v)}
          readouts={[
            { label: 'Mean µs', value: Math.round(latest.motor.reduce((a, b) => a + b, 0) / 4), tone: 'text-emerald-300' },
            { label: 'Spread µs', value: Math.round(Math.max(...latest.motor) - Math.min(...latest.motor)), tone: 'text-slate-100' },
            { label: 'Source', value: snap.mode === 'NOMINAL' ? 'PRIMARY' : snap.mode === 'HANG' ? 'LATCHED' : 'RT-RECOV', tone: snap.mode === 'NOMINAL' ? 'text-emerald-300' : 'text-amber-300' },
          ]}
        >
          <MiniChart data={snap.pwm} yDomain={[(min) => Math.floor(min - 15), (max) => Math.ceil(max + 15)]} yWidth={40}>
            <Line type="monotone" dataKey="m1" stroke="#34d399" strokeWidth={1.4} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="m2" stroke="#6ee7b7" strokeWidth={1.4} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="m3" stroke="#fbbf24" strokeWidth={1.4} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="m4" stroke="#fcd34d" strokeWidth={1.4} dot={false} isAnimationActive={false} />
          </MiniChart>
          <MotorBars motors={latest.motor} enabled={streams.pwm} />
        </StreamCard>

        <StreamCard
          title="Thermal / voltage"
          icon={Thermometer}
          enabled={streams.power}
          onToggle={(v) => actions.setStream('power', v)}
          readouts={[
            { label: 'Batt V', value: fmtNum(latest.volt, 2), tone: voltLow ? 'text-red-300' : 'text-emerald-300' },
            { label: 'Draw A', value: fmtNum(latest.current, 1), tone: 'text-slate-100' },
            { label: 'SoC °C', value: fmtNum(latest.socTemp, 1), tone: tempHigh ? 'text-red-300' : 'text-amber-300' },
            { label: 'ESC °C', value: fmtNum(latest.escTemp, 1), tone: tempHigh ? 'text-red-300' : 'text-amber-300' },
          ]}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={snap.power} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
              <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} hide />
              <YAxis yAxisId="v" domain={[13.5, 17]} tick={AXIS_TICK} stroke="#334155" width={34} allowDataOverflow />
              <YAxis yAxisId="c" orientation="right" domain={[30, 100]} tick={AXIS_TICK} stroke="#334155" width={30} allowDataOverflow />
              <Line yAxisId="v" type="monotone" dataKey="v" stroke="#34d399" strokeWidth={1.6} dot={false} isAnimationActive={false} />
              <Line yAxisId="c" type="monotone" dataKey="temp" stroke="#fbbf24" strokeWidth={1.4} dot={false} isAnimationActive={false} />
              <Line yAxisId="c" type="monotone" dataKey="esc" stroke="#f87171" strokeWidth={1.2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute bottom-1 right-9 flex items-center gap-1 font-mono text-[9px] text-slate-500">
            <BatteryCharging className="h-3 w-3" aria-hidden="true" /> V · °C
          </div>
        </StreamCard>
      </div>
    </Panel>
  );
}
