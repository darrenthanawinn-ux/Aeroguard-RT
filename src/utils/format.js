/** Tiny classnames helper (no dependency). */
export const cx = (...parts) => parts.filter(Boolean).join(' ');

/** Format a microsecond value as µs or ms. */
export function fmtUs(us, digits = 0) {
  if (us === null || us === undefined || Number.isNaN(us)) return '—';
  if (us >= 1000) return `${(us / 1000).toFixed(1)} ms`;
  return `${us.toFixed(digits)} µs`;
}

export function fmtNum(n, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toFixed(digits);
}

/** Kernel-style uptime stamp: "[  812.337412]" */
export function fmtStamp(ts) {
  return `[${ts.toFixed(6).padStart(11, ' ')}]`;
}

export function fmtInt(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return Math.round(n).toLocaleString('en-US');
}

export function fmtUptime(sec) {
  const s = Math.floor(sec);
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${ss}`;
}
