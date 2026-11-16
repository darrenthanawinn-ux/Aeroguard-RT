import { useCallback, useEffect, useRef, useState } from 'react';
import { Simulation } from '../engine/simulation.js';

const TICK_MS = 100; // 10 Hz UI refresh; microsecond samples are modelled per tick
export const QEMU_BRIDGE_URL = 'ws://localhost:8765';

/**
 * Owns the Simulation instance, drives it on a timer, and exposes
 * a React snapshot plus stable action callbacks.
 *
 * source: 'mock' | 'qemu'. In 'qemu' mode the hook tries a WebSocket bridge
 * (JSON frames, see README) and falls back to the mock engine if it cannot connect.
 */
export function useSimulation() {
  const simRef = useRef(null);
  if (simRef.current === null) simRef.current = new Simulation();
  const sim = simRef.current;

  const [snap, setSnap] = useState(() => sim.snapshot());
  const [paused, setPausedState] = useState(false);
  const [source, setSourceState] = useState('mock');
  const [bridgeStatus, setBridgeStatus] = useState('idle'); // idle | connecting | live

  const pausedRef = useRef(false);
  const lastRef = useRef(typeof performance !== 'undefined' ? performance.now() : Date.now());

  // main loop
  useEffect(() => {
    lastRef.current = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.25, Math.max(0.05, (now - lastRef.current) / 1000));
      lastRef.current = now;
      if (pausedRef.current) return;
      sim.step(dt);
      setSnap(sim.snapshot());
    }, TICK_MS);
    return () => clearInterval(id);
  }, [sim]);

  // optional QEMU bridge
  useEffect(() => {
    if (source !== 'qemu') {
      setBridgeStatus('idle');
      return undefined;
    }
    let closed = false;
    let ws = null;
    setBridgeStatus('connecting');
    sim.logSystem(`connecting to QEMU bridge ${QEMU_BRIDGE_URL} ...`);

    const fallback = (reason) => {
      if (closed) return;
      closed = true;
      sim.logSystem(`QEMU bridge unavailable (${reason}) - falling back to MOCK ENGINE`, 'warn');
      setBridgeStatus('idle');
      setSourceState('mock');
      setSnap(sim.snapshot());
    };

    try {
      ws = new WebSocket(QEMU_BRIDGE_URL);
      ws.onopen = () => {
        if (closed) return;
        setBridgeStatus('live');
        sim.logSystem('QEMU bridge connected: live frames override mock fields', 'ok');
      };
      ws.onmessage = (ev) => {
        if (closed) return;
        try {
          sim.ingestExternal(JSON.parse(ev.data));
        } catch {
          /* ignore malformed frame */
        }
      };
      ws.onerror = () => fallback('connection error');
      ws.onclose = () => fallback('connection closed');
    } catch (err) {
      fallback(err && err.message ? err.message : 'WebSocket error');
    }

    return () => {
      closed = true;
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        try {
          ws.close();
        } catch {
          /* noop */
        }
      }
    };
  }, [source, sim]);

  const refresh = useCallback(() => setSnap(sim.snapshot()), [sim]);

  const actions = {
    triggerHang: useCallback(() => {
      sim.triggerHang();
      refresh();
    }, [sim, refresh]),
    rearm: useCallback(() => {
      sim.rearm();
      refresh();
    }, [sim, refresh]),
    crashLogger: useCallback(() => {
      sim.crashLogger();
      refresh();
    }, [sim, refresh]),
    setStream: useCallback(
      (key, value) => {
        sim.setStream(key, value);
        refresh();
      },
      [sim, refresh],
    ),
    setStress: useCallback(
      (value) => {
        sim.setStress(value);
        refresh();
      },
      [sim, refresh],
    ),
    setPaused: useCallback((value) => {
      pausedRef.current = value;
      setPausedState(value);
    }, []),
    setSource: useCallback((value) => setSourceState(value), []),
  };

  return { snap, paused, source, bridgeStatus, actions };
}
