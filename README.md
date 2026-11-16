# AeroGuard-RT Ground Station

React + Vite + Tailwind + Recharts + Lucide dashboard for a QNX 8.0 real-time drone safety-supervisor.
All telemetry is **simulated** by a mock engine (`src/engine/simulation.js`) unless the optional QEMU bridge is connected.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
```

Production build: `npm run build && npm run preview`.

## What's in it

| Panel | File | Notes |
| --- | --- | --- |
| Jitter monitor | `components/JitterPanel.jsx` | QNX (<100 µs) vs Linux (10-50 ms), log-scale chart, stress-load toggle |
| Live streams | `components/StreamPanel.jsx` | IMU attitude, motor PWM, thermal/voltage; each stream can be muted |
| Process isolation map | `components/NodeMap.jsx` | "Crash logger" button proves the RT watchdog is never affected |
| IPC inspector | `components/IpcInspector.jsx` | `/dev/aeroguard`, pulse counts, FIFO-99 queue, thread table, message trace |
| Failsafe simulator | `components/FailsafePanel.jsx` | "Simulate Primary Stack Hang" -> watchdog trip -> path cut -> RT recovery -> descent; Re-arm |
| Fault terminal | `components/FaultTerminal.jsx` | Live kernel pulses, scheduler, FSM, faults; filter / follow / clear |

The override timeline shows simulated microsecond timestamps, but the on-screen replay is time-dilated (0.5 s per step) so it is visible.

## Optional QEMU bridge

Click **QEMU bridge** in the header. The app connects to `ws://localhost:8765` and falls back to the mock engine if it cannot connect.
Send JSON text frames; any field is optional and overrides the mock value for ~1 s after each frame:

```json
{ "jitterQnxUs": 31, "jitterLinuxUs": 18000, "roll": 1.2, "pitch": -0.4, "yaw": 92,
  "pwm": [1480, 1482, 1479, 1481], "volt": 16.1, "current": 31.2, "temp": 55, "log": "optional kernel line" }
```

Edit `QEMU_BRIDGE_URL` in `src/hooks/useSimulation.js` to change the address.
