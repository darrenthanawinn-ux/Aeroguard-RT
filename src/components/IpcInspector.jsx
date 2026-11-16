import React from 'react';
import { MessagesSquare } from 'lucide-react';
import Panel, { Chip, Stat } from './Panel.jsx';
import { cx, fmtInt, fmtNum } from '../utils/format.js';

const STATE_TONE = {
  RUN: 'text-emerald-300',
  'RT-OWNED': 'text-amber-300',
  TRIPPED: 'text-amber-300',
  HUNG: 'text-amber-300',
  SEVERED: 'text-red-300',
  CRASHED: 'text-red-300',
  RESPAWNING: 'text-amber-300',
};

const LEVEL_TEXT = { ok: 'text-emerald-300', warn: 'text-amber-300', err: 'text-red-300' };

export default function IpcInspector({ snap }) {
  const { ipc } = snap;
  const modeTone = ipc.dev.state === 'READY' ? 'emerald' : 'amber';

  return (
    <Panel
      title="POSIX IPC Inspector"
      subtitle="MsgSend / MsgReceive / MsgReply / pulses"
      icon={MessagesSquare}
      right={<Chip tone={modeTone}>{ipc.dev.state}</Chip>}
    >
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="/dev/aeroguard" value={`pid ${ipc.dev.pid}`} hint={`chid ${ipc.dev.chid} · ${ipc.dev.fds} open fds`} tone="emerald" />
        <Stat label="Msg rate" value={`${fmtInt(ipc.msgRate)}/s`} hint="sync send/reply pairs" />
        <Stat label="Pulses (wdog)" value={fmtInt(ipc.pulses.wdog)} hint={`imu ${fmtInt(ipc.pulses.imu)}`} tone="emerald" />
        <Stat label="Pulses (primary)" value={fmtInt(ipc.pulses.primary)} hint={snap.mode === 'NOMINAL' ? 'heartbeat live' : 'frozen · no feed'} tone={snap.mode === 'NOMINAL' ? 'slate' : 'red'} />
      </div>

      <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-300">FIFO 99 priority queue</h3>
          <div className="tabular flex gap-4 font-mono text-[10px] text-slate-400">
            <span>depth <b className="text-emerald-300">{ipc.queue.depth}</b></span>
            <span>high-water <b className="text-slate-200">{ipc.queue.highWater}</b></span>
            <span>avg deq <b className="text-emerald-300">{fmtNum(ipc.queue.avgLatUs, 1)} µs</b></span>
            <span>max deq <b className="text-amber-300">{fmtNum(ipc.queue.maxLatUs, 1)} µs</b></span>
          </div>
        </div>
        <div className="flex gap-1" aria-label={`Queue depth ${ipc.queue.depth} of 8`}>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className={cx('h-2 flex-1 rounded-sm transition-colors', i < ipc.queue.depth ? 'bg-emerald-400' : 'bg-slate-800')} />
          ))}
        </div>
      </div>

      <div className="mt-3 overflow-x-auto scroll-thin rounded-lg border border-slate-800">
        <table className="w-full min-w-[420px] text-left font-mono text-[11px]">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/70 text-[9px] uppercase tracking-wider text-slate-500">
              <th className="px-2.5 py-1.5 font-medium">Prio</th>
              <th className="px-2.5 py-1.5 font-medium">Thread</th>
              <th className="px-2.5 py-1.5 font-medium">Policy</th>
              <th className="px-2.5 py-1.5 text-right font-medium">Msg/s</th>
              <th className="px-2.5 py-1.5 text-right font-medium">Q</th>
              <th className="px-2.5 py-1.5 font-medium">State</th>
            </tr>
          </thead>
          <tbody>
            {ipc.rows.map((r) => (
              <tr key={r.name} className="border-b border-slate-800/60 last:border-0">
                <td className={cx('tabular px-2.5 py-1', r.prio >= 98 ? 'text-emerald-300' : 'text-slate-400')}>{r.prio}</td>
                <td className="px-2.5 py-1 text-slate-200">{r.name}</td>
                <td className="px-2.5 py-1 text-slate-500">{r.policy}</td>
                <td className="tabular px-2.5 py-1 text-right text-slate-300">{fmtInt(r.rate)}</td>
                <td className="tabular px-2.5 py-1 text-right text-slate-400">{r.depth}</td>
                <td className={cx('px-2.5 py-1 font-semibold', STATE_TONE[r.state] || 'text-slate-300')}>{r.state}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3">
        <h3 className="mb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">Live message trace</h3>
        <div className="h-[196px] overflow-hidden rounded-lg border border-slate-800 bg-slate-950/70 p-2 font-mono text-[10.5px] leading-[1.55]">
          {ipc.recent.length === 0 ? <div className="text-slate-600">waiting for IPC traffic…</div> : null}
          {ipc.recent.map((m) => (
            <div key={m.id} className="flex gap-2 whitespace-nowrap">
              <span className="tabular shrink-0 text-slate-600">{m.ts.toFixed(3)}</span>
              <span className={cx('w-[84px] shrink-0 font-semibold', LEVEL_TEXT[m.level] || 'text-slate-300')}>{m.op}</span>
              <span className="min-w-0 truncate text-slate-400">
                <span className="text-slate-300">{m.from}</span> → <span className="text-slate-300">{m.to}</span> <span className="text-slate-500">{m.detail}</span>
                {m.size ? <span className="text-slate-600"> · {m.size}B</span> : null}
                {m.us ? <span className="text-slate-600"> · {m.us}µs</span> : null}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
