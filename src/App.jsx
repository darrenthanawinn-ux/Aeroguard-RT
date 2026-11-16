import React from 'react';
import Header from './components/Header.jsx';
import JitterPanel from './components/JitterPanel.jsx';
import StreamPanel from './components/StreamPanel.jsx';
import NodeMap from './components/NodeMap.jsx';
import IpcInspector from './components/IpcInspector.jsx';
import FailsafePanel from './components/FailsafePanel.jsx';
import FaultTerminal from './components/FaultTerminal.jsx';
import { useSimulation } from './hooks/useSimulation.js';
import { cx } from './utils/format.js';

export default function App() {
  const { snap, paused, source, bridgeStatus, actions } = useSimulation();
  const override = snap.mode === 'OVERRIDE';

  return (
    <div className={cx('min-h-screen transition-shadow', override && 'override-glow')}>
      <div className="mx-auto flex max-w-[1680px] flex-col gap-4 p-3 sm:p-4 lg:p-5">
        <Header snap={snap} source={source} bridgeStatus={bridgeStatus} paused={paused} actions={actions} />

        {override ? (
          <div role="alert" className="rounded-lg border border-red-500/60 bg-red-500/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.16em] text-red-200">
            ⚠ Watchdog override engaged · untrusted command path cut · hard-real-time recovery routine controls the actuators
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
            <JitterPanel snap={snap} actions={actions} />
            <StreamPanel snap={snap} actions={actions} />
          </div>
          <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
            <FailsafePanel snap={snap} actions={actions} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <NodeMap snap={snap} actions={actions} />
          <IpcInspector snap={snap} />
        </div>

        <FaultTerminal logs={snap.logs} />

        <footer className="pb-2 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-slate-600">
          AeroGuard-RT · all telemetry is simulated by the mock engine unless the QEMU bridge is connected
        </footer>
      </div>
    </div>
  );
}
