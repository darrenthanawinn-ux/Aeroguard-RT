/**
 * AeroGuard-RT mock telemetry engine.
 *
 * Pure JS (no React). One Simulation instance models a QNX 8.0 target:
 *   - microsecond scheduling jitter for QNX (sub-100 us) vs. a Linux baseline (10-50 ms)
 *   - IMU attitude, motor PWM, thermal / voltage streams
 *   - /dev/aeroguard resource-manager IPC (pulses, FIFO-99 queue, POSIX message calls)
 *   - process-isolation fault injection (non-RT logger crash)
 *   - the primary-stack-hang -> watchdog override -> hard-RT recovery state machine
 *
 * All numbers are SIMULATED. An optional QEMU bridge can override fields via ingestExternal().
 */

export const HISTORY = 150; // jitter chart points
export const STREAM_HISTORY = 100; // IMU / PWM / power chart points
export const LOG_CAP = 400;
export const RECENT_IPC_CAP = 12;

export const WDOG_BUDGET_US = 500; // overdue budget on a 1 kHz heartbeat
export const QNX_JITTER_LIMIT_US = 100;
export const STEP_REVEAL_S = 0.5; // UI replay is time-dilated so humans can watch microsecond events
export const CRUISE_ALT_M = 42;

// ---------------------------------------------------------------- helpers
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const hex = (n, w = 4) => Math.floor(n).toString(16).padStart(w, '0');
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

function gauss() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function stats(values) {
  if (!values.length) return { avg: 0, max: 0, p99: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    avg: sum / values.length,
    max: sorted[sorted.length - 1],
    p99: sorted[Math.floor(0.99 * (sorted.length - 1))],
  };
}

const KERNEL_PULSES = [
  ['_PULSE_CODE_MINAVAIL+1', 'timer'],
  ['_PULSE_CODE_MINAVAIL+2', 'imu-drdy'],
  ['_PULSE_CODE_MINAVAIL+3', 'pwm-latch'],
  ['_PULSE_CODE_UNBLOCK', 'unblock'],
  ['_PULSE_CODE_COIDDEATH', 'coid-death'],
];

const THREADS = [
  { tid: 4, name: 'aeroguard-wdog', prio: 99, policy: 'FIFO' },
  { tid: 5, name: 'pwm-actuator', prio: 99, policy: 'FIFO' },
  { tid: 6, name: 'imu-driver', prio: 98, policy: 'FIFO' },
  { tid: 7, name: 'primary-flightstack', prio: 30, policy: 'RR' },
  { tid: 8, name: 'radio-link', prio: 20, policy: 'RR' },
  { tid: 9, name: 'blackbox-logger', prio: 10, policy: 'RR' },
];

export class Simulation {
  constructor() {
    this.t = 0; // simulated seconds since page load
    this.uptimeBase = 812.337; // pretend the target has been up a while
    this.ticks = 0;
    this.quiet = false;

    this.mode = 'NOMINAL'; // NOMINAL | HANG | OVERRIDE | LANDED
    this.streams = { imu: true, pwm: true, power: true };
    this.stress = false;

    // chart histories
    this.jitter = [];
    this.imu = [];
    this.pwm = [];
    this.power = [];

    // logs
    this.logs = [];
    this.logId = 0;
    this.logDirty = true;
    this._logsSnap = [];

    // flight dynamics
    this.stab = 1;
    this.glitch = 0;
    this.alt = CRUISE_ALT_M;
    this.vs = 0;
    this.throttle = 1480;
    this.motor = [1480, 1480, 1480, 1480];
    this.roll = 0;
    this.pitch = 0;
    this.yaw = 90;
    this.descending = false;

    // power
    this.battV = 16.5;
    this.current = 30;
    this.socTemp = 54;
    this.escTemp = 62;

    // jitter
    this.lastQnx = 24;
    this.lastLinux = 16000;
    this.hbDeltaUs = 1000;

    // processes
    this.primaryPid = 2217;
    this.logger = { state: 'RUNNING', pid: 1425, restarts: 0, crashedAt: 0, respawnAt: 0 };
    this.isolation = { crashes: 0, windowMax: 0, windowN: 0, lastProofMax: null, lastProofSamples: 0 };

    // IPC
    this.pulses = { wdog: 482113, primary: 482109, imu: 951204 };
    this.msgRate = 3200;
    this.queue = { depth: 0, highWater: 2, avgLatUs: 3.1, maxLatUs: 4.4 };
    this.ipcDepth = { wdog: 0, act: 0, imu: 0, primary: 0, radio: 0, logger: 0 };
    this.recentIpc = [];
    this.ipcId = 0;

    // failsafe
    this.failsafe = null;
    this.lastOverrideUs = null;
    this.overrides = 0;
    this.linuxEquivMs = null;

    // optional QEMU bridge frame
    this.external = null;

    // pre-fill chart history quietly, then print the boot banner
    for (let i = 0; i < HISTORY; i += 1) this.step(0.1, true);
    this.bootBanner();
  }

  // ------------------------------------------------------------ logging
  uptime(offsetUs = 0) {
    return this.uptimeBase + this.t + offsetUs / 1e6;
  }

  log(cat, level, src, msg, offsetUs = 0) {
    if (this.quiet) return;
    this.logId += 1;
    this.logs.push({ id: this.logId, ts: this.uptime(offsetUs), cat, level, src, msg });
    if (this.logs.length > LOG_CAP) this.logs.splice(0, this.logs.length - LOG_CAP);
    this.logDirty = true;
  }

  bootBanner() {
    this.log('KERN', 'info', 'procnto-smp-instr', 'QNX Neutrino 8.0.0 (x86_64) SMP, 4 cpus, clock 1000us tick, realtime kernel instrumented');
    this.log('KERN', 'ok', 'procnto', 'microkernel up: process isolation via MMU, IPC = synchronous MsgSend/MsgReceive/MsgReply');
    this.log('IPC', 'info', '/dev/aeroguard', `resource manager attached (resmgr_attach, chid=3, pid=4102, prefix=/dev/aeroguard)`);
    this.log('SCHED', 'info', 'aeroguard-wdog', 'SCHED_FIFO prio=99 tid=4 pinned cpu=0, timer pulse armed @1000us period');
    this.log('FSM', 'ok', 'aeroguard-wdog', 'FSM INIT -> ARMED (budget 500us overdue on 1 kHz heartbeat)');
    this.log('SCHED', 'info', 'pwm-actuator', 'SCHED_FIFO prio=99 tid=5 pinned cpu=1, PWM bus owner = primary-flightstack');
    this.log('SYS', 'info', 'ground-station', 'telemetry source: MOCK ENGINE (simulated QNX target)');
  }

  logSystem(msg, level = 'info') {
    this.log('SYS', level, 'ground-station', msg);
  }

  // ------------------------------------------------------------ main step
  step(dt, quiet = false) {
    this.quiet = quiet;
    this.t += dt;
    this.ticks += 1;

    this.updateFailsafe();
    this.updateLogger();
    this.updateDynamics(dt);
    this.sampleJitter();
    this.sampleIpc(dt);
    this.pushStreams();
    if (!quiet) this.emitBackgroundLogs();
    this.quiet = false;
  }

  freshExternal() {
    return this.external && this.t - this.external.at < 1.0 ? this.external : null;
  }

  // ------------------------------------------------------------ failsafe FSM
  triggerHang() {
    if (this.mode !== 'NOMINAL' || this.failsafe) return false;
    const detect = WDOG_BUDGET_US + randInt(9, 38);
    const cut = detect + randInt(7, 13);
    const take = cut + randInt(11, 19);
    const total = take + randInt(24, 41);
    const lastHb = this.pulses.primary;
    this.linuxEquivMs = rand(18, 46);

    const steps = [
      {
        us: 0,
        cat: 'FAULT',
        level: 'warn',
        src: 'aeroguard-wdog',
        label: 'Primary stack heartbeat lost',
        msg: `no feed since hb #${lastHb} from primary-flightstack (pid ${this.primaryPid}); thread stopped calling MsgSend on /dev/aeroguard`,
      },
      {
        us: detect,
        cat: 'FSM',
        level: 'err',
        src: 'aeroguard-wdog',
        label: 'Watchdog budget exceeded',
        msg: `timer pulse _PULSE_CODE_MINAVAIL+1 fired, heartbeat overdue > ${WDOG_BUDGET_US}us -> FSM ARMED -> TRIPPED`,
      },
      {
        us: cut,
        cat: 'FAULT',
        level: 'err',
        src: '/dev/aeroguard',
        label: 'Untrusted command path severed',
        msg: `ConnectDetach(coid=7) forced on untrusted channel, chid=3 command mask := RT_ONLY, mode=LOCKED_RT_ONLY`,
      },
      {
        us: take,
        cat: 'SCHED',
        level: 'warn',
        src: 'procnto',
        label: 'PWM bus handed to RT recovery',
        msg: `pwm-actuator source := recovery-rt (SCHED_FIFO prio=99 tid=11), 4 PWM channels latched, ESC outputs continuous`,
      },
      {
        us: total,
        cat: 'FSM',
        level: 'ok',
        src: 'recovery-rt',
        label: 'Attitude hold + controlled descent',
        msg: `FSM TRIPPED -> RECOVERING: attitude hold, descent -2.5 m/s, total override latency ${total}us`,
      },
    ];

    this.failsafe = { startedAt: this.t, revealed: 0, totalUs: total, detectUs: detect, cutUs: cut, takeUs: take, steps };
    this.log('FAULT', 'warn', 'ground-station', '>>> OPERATOR INJECT: primary-flightstack SIGSTOP (simulated stack hang)');
    return true;
  }

  updateFailsafe() {
    const f = this.failsafe;
    if (!f || f.revealed >= f.steps.length) return;
    const elapsed = this.t - f.startedAt;
    const target = Math.min(f.steps.length, Math.floor(elapsed / STEP_REVEAL_S) + 1);
    while (f.revealed < target) {
      const step = f.steps[f.revealed];
      f.revealed += 1;
      this.log(step.cat, step.level, step.src, step.msg, step.us);
      this.applyStep(f.revealed);
    }
  }

  applyStep(revealedCount) {
    if (revealedCount === 1) {
      this.mode = 'HANG';
      this.glitch = 3.5;
    } else if (revealedCount === 3) {
      this.mode = 'OVERRIDE';
    } else if (revealedCount === 4) {
      this.descending = true;
    } else if (revealedCount === 5) {
      this.lastOverrideUs = this.failsafe.totalUs;
      this.overrides += 1;
      this.log(
        'FSM',
        'ok',
        'aeroguard-wdog',
        `override complete in ${this.failsafe.totalUs}us - Linux userspace watchdog equivalent ~ ${this.linuxEquivMs.toFixed(1)}ms`,
        this.failsafe.totalUs + 3,
      );
    }
  }

  rearm() {
    if (this.mode === 'NOMINAL') return false;
    this.mode = 'NOMINAL';
    this.failsafe = null;
    this.descending = false;
    this.alt = CRUISE_ALT_M;
    this.vs = 0;
    this.throttle = 1480;
    this.glitch = 0;
    this.primaryPid = randInt(2300, 4000);
    this.log('FSM', 'info', 'aeroguard-wdog', 'operator re-arm requested: FSM RECOVERING -> ARMED');
    this.log('KERN', 'info', 'procnto', `spawn primary-flightstack pid=${this.primaryPid} (RR prio=30, untrusted, MMU-isolated)`);
    this.log('IPC', 'ok', '/dev/aeroguard', 'untrusted channel re-opened after handshake (coid=7), mode=READY');
    return true;
  }

  // ------------------------------------------------------------ logger crash (isolation proof)
  crashLogger() {
    const L = this.logger;
    if (L.state !== 'RUNNING') return false;
    L.state = 'CRASHED';
    L.crashedAt = this.t;
    L.respawnAt = this.t + 3;
    this.isolation.crashes += 1;
    this.isolation.windowMax = 0;
    this.isolation.windowN = 0;
    this.log('FAULT', 'err', 'blackbox-logger', `pid ${L.pid} SIGSEGV (si_code=SEGV_MAPERR addr=0x0000000000000008) in ring_flush()`);
    this.log('KERN', 'warn', 'procnto', `process ${L.pid} terminated, 3 channels destroyed, 2 connections detached; no RT thread preempted or blocked`, 6);
    this.log('FSM', 'ok', 'aeroguard-wdog', 'isolation check: FIFO-99 pulse stream unaffected, logging path is non-critical -> no override required', 11);
    this.log('FAULT', 'warn', 'procmgr', 'respawn policy RESTART scheduled in 3000ms (backoff)', 14);
    return true;
  }

  updateLogger() {
    const L = this.logger;
    if (L.state === 'CRASHED' && this.t >= L.respawnAt) {
      L.state = 'RESPAWNING';
      L.respawnAt = this.t + 0.6;
      this.log('KERN', 'info', 'procmgr', 'respawning blackbox-logger from /opt/aeroguard/bin/blackbox-logger');
    } else if (L.state === 'RESPAWNING' && this.t >= L.respawnAt) {
      L.state = 'RUNNING';
      L.pid = randInt(1500, 9000);
      L.restarts += 1;
      this.isolation.lastProofMax = this.isolation.windowMax;
      this.isolation.lastProofSamples = this.isolation.windowN;
      this.log('KERN', 'ok', 'procmgr', `blackbox-logger restarted pid=${L.pid} (restart #${L.restarts})`);
      this.log(
        'FSM',
        'ok',
        'aeroguard-wdog',
        `isolation proof: max FIFO-99 jitter during logger outage = ${Math.round(this.isolation.windowMax)}us over ${this.isolation.windowN} samples (limit ${QNX_JITTER_LIMIT_US}us)`,
      );
    }
  }

  // ------------------------------------------------------------ dynamics
  updateDynamics(dt) {
    const T = this.t;
    const ext = this.freshExternal();
    const recovering = this.mode === 'OVERRIDE' || this.mode === 'LANDED';

    const stabTarget = recovering ? 0.1 : 1;
    this.stab += (stabTarget - this.stab) * Math.min(1, dt * 3);
    this.glitch *= Math.pow(0.78, dt / 0.1);

    // attitude
    let roll = (2.4 * Math.sin(0.9 * T) + 0.8 * Math.sin(2.3 * T + 1)) * this.stab + gauss() * 0.12 + this.glitch * Math.sin(T * 18);
    let pitch = (1.8 * Math.sin(0.6 * T + 0.7) + 0.5 * Math.sin(1.7 * T)) * this.stab + gauss() * 0.1 + this.glitch * 0.6 * Math.cos(T * 15);
    let yaw = 90 + 14 * Math.sin(0.2 * T) * this.stab;
    if (ext && finite(ext.roll)) roll = ext.roll;
    if (ext && finite(ext.pitch)) pitch = ext.pitch;
    if (ext && finite(ext.yaw)) yaw = ext.yaw;
    this.roll = roll;
    this.pitch = pitch;
    this.yaw = yaw;

    // altitude
    if (this.mode === 'NOMINAL' || this.mode === 'HANG') {
      this.alt = CRUISE_ALT_M + 0.35 * Math.sin(0.5 * T);
      this.vs = 0.175 * Math.cos(0.5 * T);
    } else if (this.descending) {
      const target = this.alt < 4 ? -0.6 : -2.5;
      this.vs += (target - this.vs) * 0.4;
      this.alt = Math.max(0, this.alt + this.vs * dt);
      if (this.alt <= 0.15) {
        this.alt = 0;
        this.vs = 0;
        this.descending = false;
        this.mode = 'LANDED';
        this.log('FSM', 'ok', 'recovery-rt', 'touchdown detected (alt<0.15m): motors idle, FSM RECOVERING -> SAFE_DISARMED');
      }
    }

    // throttle + motor mixing
    let thrTarget = 1480 + 6 * Math.sin(0.5 * T);
    if (this.mode === 'LANDED') thrTarget = 1000;
    else if (this.descending) thrTarget = 1445;
    this.throttle += (thrTarget - this.throttle) * Math.min(1, dt * (this.mode === 'LANDED' ? 6 : 3));

    const thr = this.throttle;
    const r = roll * 4.2;
    const p = pitch * 4.2;
    const y = Math.sin(T * 0.4) * 3 * this.stab;
    let motors = [thr + r - p + y, thr - r - p - y, thr - r + p + y, thr + r + p - y].map((m) => clamp(m + gauss() * 1.8, 1000, 2000));
    if (this.mode === 'LANDED') motors = [1000, 1000, 1000, 1000];
    if (ext && Array.isArray(ext.pwm) && ext.pwm.length === 4 && ext.pwm.every(finite)) motors = ext.pwm.map((m) => clamp(m, 1000, 2000));
    this.motor = motors;

    // power / thermal
    const avg = motors.reduce((a, b) => a + b, 0) / 4;
    let current = this.mode === 'LANDED' ? 0.8 : 6 + (avg - 1000) * 0.052 + gauss() * 0.15;
    let volt = clamp(16.55 - 0.00055 * T - current * 0.014 + gauss() * 0.008, 13.2, 16.8);
    const k = clamp(dt / 0.1, 0, 5) * 0.01;
    this.socTemp += (52 + current * 0.35 - this.socTemp) * k + gauss() * 0.03;
    this.escTemp += (40 + current * 0.9 - this.escTemp) * k + gauss() * 0.04;
    if (ext && finite(ext.current)) current = ext.current;
    if (ext && finite(ext.volt)) volt = ext.volt;
    if (ext && finite(ext.temp)) this.socTemp = ext.temp;
    this.current = current;
    this.battV = volt;
  }

  // ------------------------------------------------------------ jitter
  sampleJitter() {
    const ext = this.freshExternal();
    let q = 24 + gauss() * 6 + (Math.random() < 0.07 ? rand(18, 52) : 0);
    if (this.stress) q += rand(0, 6);
    q = clamp(q, 9, 97);

    let l = this.stress
      ? 30000 + gauss() * 8000 + (Math.random() < 0.25 ? rand(5000, 18000) : 0)
      : 15500 + gauss() * 3800 + (Math.random() < 0.12 ? rand(8000, 26000) : 0);
    l = clamp(l, 10000, 50000);

    if (ext && finite(ext.jitterQnxUs)) q = Math.max(1, ext.jitterQnxUs);
    if (ext && finite(ext.jitterLinuxUs)) l = Math.max(1, ext.jitterLinuxUs);

    this.lastQnx = q;
    this.lastLinux = l;
    this.hbDeltaUs = Math.round(1000 + (q - 24) * 0.6 + gauss() * 3);

    if (this.logger.state !== 'RUNNING') {
      this.isolation.windowMax = Math.max(this.isolation.windowMax, q);
      this.isolation.windowN += 1;
    }

    this.jitter.push({ t: this.t, qnx: q, linux: l });
    if (this.jitter.length > HISTORY) this.jitter.shift();
  }

  // ------------------------------------------------------------ IPC
  sampleIpc(dt) {
    const alive = this.mode === 'NOMINAL';
    const loggerAlive = this.logger.state === 'RUNNING';
    const n = Math.round(dt * 1000);

    this.pulses.wdog += n;
    this.pulses.imu += n;
    if (alive) this.pulses.primary += n;

    this.msgRate = Math.round((alive ? 1500 : 0) + 1000 + 1000 + (loggerAlive ? 200 : 0) + 50 + gauss() * 12);

    const depth = clamp(Math.round(Math.abs(gauss()) * 0.9), 0, 3);
    this.queue.depth = depth;
    this.queue.highWater = Math.max(this.queue.highWater, depth);
    this.queue.avgLatUs = clamp(3.0 + gauss() * 0.4, 1.8, 5.5);
    this.queue.maxLatUs = Math.max(this.queue.maxLatUs * 0.9985, this.queue.avgLatUs + (Math.random() < 0.1 ? rand(0.3, 1.8) : 0.2));

    const d = this.ipcDepth;
    d.wdog = clamp(Math.round(Math.abs(gauss()) * 0.8), 0, 2);
    d.act = clamp(Math.round(Math.abs(gauss()) * 0.7), 0, 2);
    d.imu = clamp(Math.round(Math.abs(gauss()) * 0.8), 0, 2);
    d.primary = alive ? clamp(Math.round(Math.abs(gauss()) * 1.5), 0, 4) : 0;
    d.radio = clamp(Math.round(Math.abs(gauss()) * 1.2), 0, 3);
    d.logger = loggerAlive ? clamp(Math.round(Math.abs(gauss()) * 2.5), 0, 8) : 0;

    if (this.quiet) return;
    const count = randInt(1, 3);
    for (let i = 0; i < count; i += 1) this.pushIpcCall(alive, loggerAlive);
  }

  pushIpcCall(alive, loggerAlive) {
    const choices = [];
    const rcv = `0x${hex(randInt(0, 65535))}`;
    const us = Math.max(1, Math.round(this.queue.avgLatUs + gauss() * 0.6));

    choices.push({ op: 'MsgSendPulse', from: 'procnto', to: 'aeroguard-wdog', detail: `code=_PULSE_CODE_MINAVAIL+1 val=${this.pulses.wdog % 65536}`, size: 0, us, level: 'ok' });
    choices.push({ op: 'MsgSend', from: 'imu-driver', to: '/dev/aeroguard', detail: `DCMD_AG_IMU_FRAME rcvid=${rcv}`, size: 48, us, level: 'ok' });
    choices.push({ op: 'MsgReply', from: '/dev/aeroguard', to: 'imu-driver', detail: `status=EOK rcvid=${rcv}`, size: 4, us, level: 'ok' });

    if (alive) {
      choices.push({ op: 'MsgSend', from: 'primary-flightstack', to: '/dev/aeroguard', detail: `DCMD_AG_FEED_WDOG hb=#${this.pulses.primary} rcvid=${rcv}`, size: 16, us, level: 'ok' });
      choices.push({ op: 'MsgSend', from: 'primary-flightstack', to: '/dev/aeroguard', detail: `DCMD_AG_SET_PWM [${this.motor.map((m) => Math.round(m)).join(',')}] rcvid=${rcv}`, size: 24, us, level: 'ok' });
      choices.push({ op: 'MsgReceive', from: '/dev/aeroguard', to: 'chid=3', detail: `rcvid=${rcv} prio=30 -> inherits FIFO 99`, size: 24, us, level: 'ok' });
    } else if (this.mode === 'OVERRIDE' || this.mode === 'HANG') {
      choices.push({ op: 'MsgSend', from: 'recovery-rt', to: 'pwm-actuator', detail: `DCMD_AG_SET_PWM [${this.motor.map((m) => Math.round(m)).join(',')}] src=RT`, size: 24, us, level: 'warn' });
      choices.push({ op: 'MsgSend', from: 'primary-flightstack', to: '/dev/aeroguard', detail: 'rejected: EACCES (untrusted path severed)', size: 0, us: 0, level: 'err' });
    }

    if (loggerAlive) {
      choices.push({ op: 'MsgSend', from: 'blackbox-logger', to: '/dev/aeroguard', detail: `DCMD_AG_LOG_PUSH prio=10 rcvid=${rcv}`, size: 256, us: us + 2, level: 'ok' });
    }
    const c = pick(choices);
    this.ipcId += 1;
    this.recentIpc.push({ id: this.ipcId, ts: this.uptime(), ...c });
    if (this.recentIpc.length > RECENT_IPC_CAP) this.recentIpc.shift();
  }

  // ------------------------------------------------------------ chart streams
  pushStreams() {
    const t = this.t;
    const on = this.streams;

    this.imu.push(on.imu ? { t, roll: this.roll, pitch: this.pitch, yaw: this.yaw - 90 } : { t, roll: null, pitch: null, yaw: null });
    this.pwm.push(
      on.pwm ? { t, m1: this.motor[0], m2: this.motor[1], m3: this.motor[2], m4: this.motor[3] } : { t, m1: null, m2: null, m3: null, m4: null },
    );
    this.power.push(on.power ? { t, v: this.battV, a: this.current, temp: this.socTemp, esc: this.escTemp } : { t, v: null, a: null, temp: null, esc: null });

    if (this.imu.length > STREAM_HISTORY) this.imu.shift();
    if (this.pwm.length > STREAM_HISTORY) this.pwm.shift();
    if (this.power.length > STREAM_HISTORY) this.power.shift();
  }

  // ------------------------------------------------------------ background terminal chatter
  emitBackgroundLogs() {
    const alive = this.mode === 'NOMINAL';

    if (Math.random() < 0.75) {
      const [code, tag] = pick(KERNEL_PULSES);
      const th = pick(THREADS.slice(0, 3));
      this.log('KERN', 'dbg', 'procnto', `pulse ${code} (${tag}) val=0x${hex(randInt(0, 255), 2)} prio=${th.prio} -> tid=${th.tid} ${th.name}`);
    }

    if (Math.random() < 0.55) {
      const th = pick(THREADS);
      const dead = (th.name === 'primary-flightstack' && !alive) || (th.name === 'blackbox-logger' && this.logger.state !== 'RUNNING');
      if (!dead) {
        const ctx = (1.4 + Math.random() * 1.1).toFixed(1);
        this.log('SCHED', 'info', 'procnto', `tid=${th.tid} ${th.name} SCHED_${th.policy} prio=${th.prio} ready -> running, ctx_switch=${ctx}us`);
      }
    }

    if (Math.random() < 0.45) {
      if (alive) {
        const slack = WDOG_BUDGET_US - Math.max(0, this.hbDeltaUs - 1000);
        this.log('FSM', 'info', 'aeroguard-wdog', `ARMED: hb #${this.pulses.primary} ok, period ${this.hbDeltaUs}us, slack ${slack}us of ${WDOG_BUDGET_US}us`);
      } else if (this.mode === 'OVERRIDE') {
        this.log(
          'FSM',
          'warn',
          'recovery-rt',
          `RECOVERING: roll=${this.roll.toFixed(2)} pitch=${this.pitch.toFixed(2)} alt=${this.alt.toFixed(1)}m vs=${this.vs.toFixed(1)}m/s throttle=${Math.round(this.throttle)}`,
        );
      } else if (this.mode === 'LANDED') {
        this.log('FSM', 'info', 'recovery-rt', 'SAFE_DISARMED: motors idle, awaiting operator re-arm');
      }
    }

    if (Math.random() < 0.18) {
      this.log('IPC', 'info', '/dev/aeroguard', `queue FIFO99 depth=${this.queue.depth} hw=${this.queue.highWater} avg_deq=${this.queue.avgLatUs.toFixed(1)}us`);
    }
  }

  // ------------------------------------------------------------ toggles
  setStream(key, value) {
    if (!(key in this.streams)) return;
    this.streams[key] = !!value;
    this.log('SYS', 'dbg', 'ground-station', `stream ${key.toUpperCase()} ${value ? 'subscribed' : 'muted'}`);
  }

  setStress(value) {
    this.stress = !!value;
    this.log('SYS', this.stress ? 'warn' : 'info', 'ground-station', this.stress ? 'stress-ng started on Linux baseline (cpu+io load); QNX RT threads unaffected' : 'stress-ng stopped');
  }

  ingestExternal(frame) {
    if (!frame || typeof frame !== 'object') return;
    this.external = { ...frame, at: this.t };
    if (typeof frame.log === 'string') this.log('KERN', 'info', 'qemu-bridge', frame.log.slice(0, 220));
  }

  // ------------------------------------------------------------ snapshot for React
  snapshot() {
    if (this.logDirty) {
      this._logsSnap = this.logs.slice();
      this.logDirty = false;
    }

    const recentJ = this.jitter.slice(-100);
    const qStats = stats(recentJ.map((j) => j.qnx));
    const lStats = stats(recentJ.map((j) => j.linux));

    const alive = this.mode === 'NOMINAL';
    const loggerAlive = this.logger.state === 'RUNNING';
    const d = this.ipcDepth;

    const rows = [
      { prio: 99, name: 'aeroguard-wdog', policy: 'FIFO', rate: 1000, depth: d.wdog, state: this.mode === 'NOMINAL' ? 'RUN' : 'TRIPPED' },
      { prio: 99, name: 'pwm-actuator', policy: 'FIFO', rate: 1000, depth: d.act, state: this.mode === 'NOMINAL' ? 'RUN' : 'RT-OWNED' },
      { prio: 98, name: 'imu-driver', policy: 'FIFO', rate: 1000, depth: d.imu, state: 'RUN' },
      { prio: 30, name: 'primary-flightstack', policy: 'RR', rate: alive ? 500 : 0, depth: d.primary, state: alive ? 'RUN' : this.mode === 'HANG' ? 'HUNG' : 'SEVERED' },
      { prio: 20, name: 'radio-link', policy: 'RR', rate: 50, depth: d.radio, state: 'RUN' },
      { prio: 10, name: 'blackbox-logger', policy: 'RR', rate: loggerAlive ? 200 : 0, depth: d.logger, state: loggerAlive ? 'RUN' : this.logger.state },
    ];

    const f = this.failsafe;
    const failsafe = f
      ? {
          revealed: f.revealed,
          totalUs: f.totalUs,
          detectUs: f.detectUs,
          cutUs: f.cutUs,
          takeUs: f.takeUs,
          complete: f.revealed >= f.steps.length,
          steps: f.steps.map((s, i) => ({ us: s.us, label: s.label, level: s.level, done: i < f.revealed })),
        }
      : null;

    return {
      t: this.t,
      uptime: this.uptime(),
      mode: this.mode,
      streams: { ...this.streams },
      stress: this.stress,
      jitter: this.jitter.slice(),
      imu: this.imu.slice(),
      pwm: this.pwm.slice(),
      power: this.power.slice(),
      jitterStats: { qnx: qStats, linux: lStats },
      latest: {
        roll: this.roll,
        pitch: this.pitch,
        yaw: this.yaw,
        motor: this.motor.slice(),
        volt: this.battV,
        current: this.current,
        socTemp: this.socTemp,
        escTemp: this.escTemp,
        alt: this.alt,
        vs: this.vs,
        qnxUs: this.lastQnx,
        linuxUs: this.lastLinux,
        hbDeltaUs: this.hbDeltaUs,
      },
      ipc: {
        dev: {
          path: '/dev/aeroguard',
          pid: 4102,
          chid: 3,
          fds: 4 + (alive ? 1 : 0) + (loggerAlive ? 1 : 0),
          state: alive ? 'READY' : this.mode === 'LANDED' ? 'LOCKED_SAFE' : 'LOCKED_RT_ONLY',
        },
        pulses: { ...this.pulses, total: this.pulses.wdog + this.pulses.imu + this.pulses.primary },
        msgRate: this.msgRate,
        queue: { ...this.queue },
        rows,
        recent: this.recentIpc.slice(),
      },
      logger: { ...this.logger },
      isolation: { ...this.isolation },
      failsafe,
      lastOverrideUs: this.lastOverrideUs,
      overrides: this.overrides,
      linuxEquivMs: this.linuxEquivMs,
      logs: this._logsSnap,
    };
  }
}
