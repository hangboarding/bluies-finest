// Session timer driven by wall-clock timestamps, so it stays accurate if the phone
// throttles timers or the tab is backgrounded. Also owns screen wake lock and audio.
import type { HangResult, Hands } from './types';
import type { Values } from './protocols';

export type Phase = 'ready' | 'hang' | 'rest' | 'sw';
export interface Step { p: Phase; t: number; set?: number; rep?: number; hand?: 'L' | 'R' | 'both'; bigRest?: boolean; logged?: boolean; }

export function buildSteps(v: Values): Step[] {
  const q: Step[] = v.ready > 0 ? [{ p: 'ready', t: v.ready }] : [];
  const hands: ('L' | 'R' | 'both')[] = v.hands === 'LR' ? ['L', 'R'] : [v.hands === 'both' ? 'both' : (v.hands as 'L' | 'R')];
  for (let s = 1; s <= v.sets; s++) {
    for (let r = 1; r <= v.reps; r++) {
      hands.forEach((h, hi) => { q.push({ p: 'hang', t: v.hang, set: s, rep: r, hand: h }); if (hi < hands.length - 1) q.push({ p: 'sw', t: v.sw, set: s, rep: r }); });
      if (r < v.reps) q.push({ p: 'rest', t: v.rest, set: s, rep: r });
    }
    if (s < v.sets) q.push({ p: 'rest', t: v.reps > 1 ? v.setRest : v.rest, set: s, bigRest: v.reps > 1 });
  }
  return q;
}

// ---------- audio (iOS needs the context created/resumed inside a tap) ----------
let ac: AudioContext | null = null;
export let soundOn = true;
export const setSound = (on: boolean) => { soundOn = on; };
export function unlockAudio() {
  try {
    ac ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ac.state !== 'running') ac.resume().catch(() => {}); // iOS can leave it 'suspended' or 'interrupted' after a call/lock
    const b = ac.createBuffer(1, 1, 22050), s = ac.createBufferSource(); s.buffer = b; s.connect(ac.destination); s.start(0);
  } catch { /* no audio available */ }
}
export function beep(freq = 880, dur = 0.12, delay = 0) {
  if (!soundOn || !ac) return;
  const t0 = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.frequency.value = freq; o.connect(g); g.connect(ac.destination);
  g.gain.setValueAtTime(0.3, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.start(t0); o.stop(t0 + dur);
}
export const fanfare = () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.25, i * 0.15));

// ---------- wake lock ----------
let lock: any = null, wantLock = false, requesting = false;
export async function keepAwake(on: boolean) {
  wantLock = on;
  try {
    if (on && !lock && !requesting && 'wakeLock' in navigator) {
      requesting = true;
      try { lock = await (navigator as any).wakeLock.request('screen'); } finally { requesting = false; }
      lock?.addEventListener?.('release', () => { lock = null; });
      // turned off while the request was still pending: let go straight away
      if (!wantLock && lock) { const l = lock; lock = null; await l.release(); }
    }
    if (!on && lock) { const l = lock; lock = null; await l.release(); }
  } catch { /* denied or unsupported — the timer still works */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (wantLock) keepAwake(true);
  if (ac && ac.state !== 'running') ac.resume().catch(() => {});
});

// ---------- engine ----------
export interface TimerHooks {
  onTick(step: Step, left: number, idx: number): void;
  onPhase(step: Step, idx: number): void;
  onWarn(left: number): void;
  onDone(log: HangResult[]): void;
}
export class SessionTimer {
  /** Countdown beeps for the last N seconds of a rest, switch or get-ready (always ends before the rest does). */
  preWarn = 5;
  steps: Step[]; idx = 0; log: HangResult[] = []; paused = false;
  private endAt = 0; private remaining = 0; private h: number | undefined; private lastLeft = -1;
  pausedMs = 0; private pausedAt = 0; maxPauseMs = 0;
  constructor(steps: Step[], private hooks: TimerHooks) { this.steps = steps; }
  get step() { return this.steps[this.idx]!; }
  start(fromIdx = 0) { this.idx = fromIdx; this.enter(); this.h = window.setInterval(() => this.tick(), 100); document.addEventListener('visibilitychange', this.vis); }
  private vis = () => this.tick();
  private enter() { this.endAt = performance.now() + this.step.t * 1000; this.lastLeft = -1; this.hooks.onPhase(this.step, this.idx); this.tick(); }
  left() { return Math.max(0, Math.ceil(((this.paused ? this.remaining : this.endAt - performance.now())) / 1000 - 1e-9)); }
  private done = false;
  private tick() {
    if (this.paused || this.done || this.idx >= this.steps.length) return;
    // catch up on any phases that ended while we were throttled
    // (beep/announce only the phase we land on, not every one that was skipped)
    let moved = false;
    while (performance.now() >= this.endAt) { if (!this.advance(true, true)) return; moved = true; }
    if (moved) this.hooks.onPhase(this.step, this.idx);
    const l = this.left();
    if (l !== this.lastLeft) {
      this.lastLeft = l;
      const warnAt = this.step.p === 'hang' ? 3 : Math.min(this.preWarn, this.step.t - 1);
      if (l <= warnAt && l > 0) this.hooks.onWarn(l);
      this.hooks.onTick(this.step, l, this.idx);
    }
  }
  /** Move to the next step. Returns false when the session is over. */
  private advance(natural: boolean, quiet = false): boolean {
    const c = this.step;
    if (c.p === 'hang' && !c.logged) { this.log.push({ set: c.set!, rep: c.rep!, hand: c.hand!, target: c.t, held: c.t, full: true }); c.logged = true; }
    const overshoot = natural ? performance.now() - this.endAt : 0;
    this.idx++;
    if (this.idx >= this.steps.length) { this.finish(); return false; }
    this.endAt = performance.now() - overshoot + this.step.t * 1000; this.lastLeft = -1;
    if (this.paused) this.remaining = this.step.t * 1000; // a skip while paused starts the next step fresh
    if (!quiet) this.hooks.onPhase(this.step, this.idx);
    return true;
  }
  /** Seconds held so far on the current hang (respects pause). */
  private elapsed() { const c = this.step, rem = this.paused ? this.remaining : this.endAt - performance.now(); return Math.min(c.t, Math.max(0, Math.floor(c.t - rem / 1000 + 1e-6))); } // letting go at 9.5s of 10s isn't a full hang
  /** Log the current hang as cut short and move on. */
  private cutShort() {
    const c = this.step, held = this.elapsed();
    this.log.push({ set: c.set!, rep: c.rep!, hand: c.hand!, target: c.t, held, full: held >= c.t }); c.logged = true;
    return held;
  }
  letGo() {
    if (this.done) return 0;
    const c = this.step; if (c.p !== 'hang' || c.logged) return 0;
    const held = this.cutShort();
    this.advance(false); this.tick(); return held;
  }
  /** Skipping a hang only credits the time actually held — it never counts as a free full hang. */
  skip() {
    if (this.done) return;
    if (this.step.p === 'hang' && !this.step.logged) this.cutShort();
    this.advance(false); this.tick();
  }
  pause() { if (this.paused) return; this.remaining = this.endAt - performance.now(); this.paused = true; this.pausedAt = Date.now(); }
  resume() { if (!this.paused) return; const p = Date.now() - this.pausedAt; this.pausedMs += p; this.maxPauseMs = Math.max(this.maxPauseMs, p); this.endAt = performance.now() + this.remaining; this.paused = false; this.tick(); }
  stop() { clearInterval(this.h); document.removeEventListener('visibilitychange', this.vis); }
  private finish() { this.done = true; this.stop(); this.hooks.onDone(this.log); }
}

export const handsLabel = (h: Hands) => ({ both: 'Both', L: 'Left', R: 'Right', LR: 'L then R' }[h]);
