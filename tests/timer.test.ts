import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildSteps, SessionTimer, type Step, type TimerHooks } from '../src/lib/timer';
import { values } from './helpers';

function hooks() {
  return {
    onTick: vi.fn<TimerHooks['onTick']>(),
    onPhase: vi.fn<TimerHooks['onPhase']>(),
    onWarn: vi.fn<TimerHooks['onWarn']>(),
    onDone: vi.fn<TimerHooks['onDone']>(),
  };
}
const sec = (s: number) => vi.advanceTimersByTime(s * 1000);
const shape = (xs: Step[]) => xs.map(s => `${s.p}${s.hand ? ':' + s.hand : ''}${s.bigRest ? ':big' : ''}=${s.t}`);

beforeEach(() => { vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance', 'Date'] }); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('buildSteps', () => {
  it('simple protocol: ready, then hang/rest alternating with no trailing rest', () => {
    expect(shape(buildSteps(values({ ready: 10, hang: 10, rest: 60, sets: 3 })))).toEqual([
      'ready=10', 'hang:both=10', 'rest=60', 'hang:both=10', 'rest=60', 'hang:both=10',
    ]);
  });

  it('ready = 0 skips the get-ready step', () => {
    const s = buildSteps(values({ ready: 0, sets: 1 }));
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ p: 'hang', set: 1, rep: 1, hand: 'both' });
  });

  it('reps use rep rest within a set and setRest (bigRest) between sets', () => {
    const s = buildSteps(values({ hang: 7, rest: 3, reps: 3, sets: 2, setRest: 180 }));
    expect(shape(s)).toEqual([
      'hang:both=7', 'rest=3', 'hang:both=7', 'rest=3', 'hang:both=7', 'rest:big=180',
      'hang:both=7', 'rest=3', 'hang:both=7', 'rest=3', 'hang:both=7',
    ]);
    expect(s.filter(x => x.p === 'hang').map(x => `${x.set}.${x.rep}`)).toEqual(['1.1', '1.2', '1.3', '2.1', '2.2', '2.3']);
  });

  it('single rep per set uses the normal rest between sets, not setRest', () => {
    const s = buildSteps(values({ reps: 1, sets: 2, rest: 30, setRest: 999 }));
    expect(s[1]).toMatchObject({ p: 'rest', t: 30, bigRest: false });
  });

  it('LR hands: left hang, switch, right hang for every rep', () => {
    expect(shape(buildSteps(values({ hands: 'LR', sw: 10, sets: 2, rest: 180 })))).toEqual([
      'hang:L=10', 'sw=10', 'hang:R=10', 'rest=180', 'hang:L=10', 'sw=10', 'hang:R=10',
    ]);
  });

  it('single hand keeps that hand', () => {
    expect(buildSteps(values({ hands: 'R', sets: 1 }))[0]!.hand).toBe('R');
  });
});

describe('SessionTimer', () => {
  // hang 10 / rest 20 / 2 sets => [hang 10, rest 20, hang 10] = 40s
  const steps = () => buildSteps(values({ hang: 10, rest: 20, sets: 2 }));

  it('a full run logs every hang as full with held === target and fires onDone once', () => {
    const h = hooks(), t = new SessionTimer(steps(), h);
    t.start();
    sec(40);
    expect(h.onDone).toHaveBeenCalledTimes(1);
    expect(h.onDone.mock.calls[0]![0]).toEqual([
      { set: 1, rep: 1, hand: 'both', target: 10, held: 10, full: true },
      { set: 2, rep: 1, hand: 'both', target: 10, held: 10, full: true },
    ]);
    expect(h.onPhase.mock.calls.map(c => c[0].p)).toEqual(['hang', 'rest', 'hang']);
    sec(60);
    expect(h.onDone).toHaveBeenCalledTimes(1);
  });

  it('stays on a step until its time is up', () => {
    const h = hooks(), t = new SessionTimer(steps(), h);
    t.start();
    sec(9.9);
    expect(t.idx).toBe(0);
    expect(t.left()).toBe(1);
    sec(0.1);
    expect(t.idx).toBe(1);
    expect(t.left()).toBe(20);
  });

  it('letGo mid-hang logs held < target and full = false', () => {
    const h = hooks(), t = new SessionTimer(steps(), h);
    t.start();
    sec(6.2);
    expect(t.letGo()).toBe(6);
    expect(t.log).toEqual([{ set: 1, rep: 1, hand: 'both', target: 10, held: 6, full: false }]);
    expect(t.step.p).toBe('rest');
    expect(t.left()).toBe(20);
  });

  it('letGo during a rest does nothing', () => {
    const h = hooks(), t = new SessionTimer(steps(), h);
    t.start();
    sec(12);
    expect(t.letGo()).toBe(0);
    expect(t.idx).toBe(1);
    expect(t.log).toHaveLength(1);
  });

  it('regression: skip on a hang logs only the elapsed time, never a free full hang', () => {
    const h = hooks(), t = new SessionTimer(steps(), h);
    t.start();
    sec(3.4);
    t.skip();
    expect(t.log).toEqual([{ set: 1, rep: 1, hand: 'both', target: 10, held: 3, full: false }]);
    expect(t.step.p).toBe('rest');
    // the hang is not logged a second time when the rest ends
    sec(20);
    expect(t.log).toHaveLength(1);
  });

  it('skip at the very start of a hang logs held 0', () => {
    const h = hooks(), t = new SessionTimer(steps(), h);
    t.start();
    t.skip();
    expect(t.log).toEqual([{ set: 1, rep: 1, hand: 'both', target: 10, held: 0, full: false }]);
  });

  it('skip on a rest moves to the next hang with its full duration', () => {
    const h = hooks(), t = new SessionTimer(steps(), h);
    t.start();
    sec(15);
    t.skip();
    expect(t.idx).toBe(2);
    expect(t.left()).toBe(10);
    expect(t.log).toHaveLength(1);
  });

  it('regression: letGo while paused uses the time held before the pause', () => {
    const h = hooks(), t = new SessionTimer(steps(), h);
    t.start();
    sec(4);
    t.pause();
    sec(60); // a long pause must not count as hang time
    expect(t.letGo()).toBe(4);
    expect(t.log[0]).toMatchObject({ held: 4, full: false });
  });

  it('pause freezes the countdown and resume continues from where it left off', () => {
    const h = hooks(), t = new SessionTimer(steps(), h);
    t.start();
    sec(4);
    t.pause();
    sec(30);
    expect(t.idx).toBe(0);
    expect(t.left()).toBe(6);
    t.resume();
    expect(t.pausedMs).toBe(30000);
    expect(t.maxPauseMs).toBe(30000);
    sec(5.9);
    expect(t.idx).toBe(0);
    sec(0.1);
    expect(t.idx).toBe(1);
    expect(t.log[0]).toMatchObject({ held: 10, full: true });
  });

  it('regression: skip while paused, then resume, gives the next step its full duration', () => {
    const h = hooks(), t = new SessionTimer(steps(), h);
    t.start();
    sec(12); // 2s into the 20s rest
    t.pause();
    sec(10);
    t.skip();
    expect(t.idx).toBe(2);
    expect(t.left()).toBe(10);
    sec(30); // still paused
    expect(t.idx).toBe(2);
    t.resume();
    expect(t.left()).toBe(10);
    sec(9.9);
    expect(h.onDone).not.toHaveBeenCalled();
    sec(0.1);
    expect(h.onDone).toHaveBeenCalledTimes(1);
  });

  it('letGo on the final hang does not throw and fires onDone exactly once', () => {
    const h = hooks(), t = new SessionTimer(steps(), h);
    t.start();
    sec(35); // 5s into the last hang
    expect(() => t.letGo()).not.toThrow();
    expect(h.onDone).toHaveBeenCalledTimes(1);
    expect(h.onDone.mock.calls[0]![0].map(r => r.held)).toEqual([10, 5]);
    // further input after the end is ignored
    expect(() => { t.letGo(); t.skip(); t.pause(); t.resume(); }).not.toThrow();
    sec(30);
    expect(h.onDone).toHaveBeenCalledTimes(1);
  });

  it('skip on the final hang does not throw and fires onDone exactly once', () => {
    const h = hooks(), t = new SessionTimer(steps(), h);
    t.start();
    sec(37);
    expect(() => t.skip()).not.toThrow();
    expect(h.onDone).toHaveBeenCalledTimes(1);
    expect(h.onDone.mock.calls[0]![0][1]).toMatchObject({ held: 7, full: false });
    expect(() => t.skip()).not.toThrow();
    sec(30);
    expect(h.onDone).toHaveBeenCalledTimes(1);
  });

  it('stop() clears the interval', () => {
    const h = hooks(), t = new SessionTimer(steps(), h);
    t.start();
    sec(2);
    t.stop();
    sec(100);
    expect(t.idx).toBe(0);
    expect(h.onDone).not.toHaveBeenCalled();
  });

  it('catches up when the clock jumps (throttled/backgrounded tab) and finishes correctly', () => {
    // Simulate a throttled tab: the 100ms interval never fires while the wall clock moves on,
    // then the page becomes visible again and the visibilitychange handler ticks.
    vi.spyOn(window, 'setInterval').mockImplementation(() => 0 as any);
    const h = hooks(), t = new SessionTimer(steps(), h);
    t.start();
    sec(25); // mid-rest
    expect(t.idx).toBe(0);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(t.idx).toBe(1);
    expect(t.left()).toBe(5); // overshoot carried over: the rest ends at 30s, not 25 + 20
    sec(100);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(h.onDone).toHaveBeenCalledTimes(1);
    expect(h.onDone.mock.calls[0]![0]).toEqual([
      { set: 1, rep: 1, hand: 'both', target: 10, held: 10, full: true },
      { set: 2, rep: 1, hand: 'both', target: 10, held: 10, full: true },
    ]);
    // phases skipped while throttled aren't announced (no burst of beeps); the session just finishes
    expect(h.onPhase.mock.calls.map(c => c[1])).toEqual([0, 1]);
  });

  it('catches up when advancing by a large amount at once', () => {
    const h = hooks(), t = new SessionTimer(buildSteps(values({ ready: 5, hang: 7, rest: 3, reps: 6, sets: 3, setRest: 60 })), h);
    t.start();
    sec(10_000);
    expect(h.onDone).toHaveBeenCalledTimes(1);
    const log = h.onDone.mock.calls[0]![0];
    expect(log).toHaveLength(18);
    expect(log.every(r => r.full && r.held === 7)).toBe(true);
  });

  it('onWarn fires for the last 3s of hangs and the last 5s of rests', () => {
    const h = hooks(), t = new SessionTimer(steps(), h);
    t.start();
    sec(10);
    expect(h.onWarn.mock.calls.map(c => c[0])).toEqual([3, 2, 1]);
    h.onWarn.mockClear();
    sec(20);
    expect(h.onWarn.mock.calls.map(c => c[0])).toEqual([5, 4, 3, 2, 1]);
    h.onWarn.mockClear();
    sec(10);
    expect(h.onWarn.mock.calls.map(c => c[0])).toEqual([3, 2, 1]);
  });

  it('onTick reports each whole second once', () => {
    const h = hooks(), t = new SessionTimer(buildSteps(values({ hang: 3, sets: 1 })), h);
    t.start();
    sec(3);
    expect(h.onTick.mock.calls.map(c => c[1])).toEqual([3, 2, 1]);
  });

  it('start(fromIdx) resumes mid-session', () => {
    const h = hooks(), t = new SessionTimer(steps(), h);
    t.start(2);
    expect(h.onPhase).toHaveBeenCalledTimes(1);
    expect(h.onPhase.mock.calls[0]![1]).toBe(2);
    sec(10);
    expect(h.onDone).toHaveBeenCalledTimes(1);
    expect(h.onDone.mock.calls[0]![0]).toEqual([{ set: 2, rep: 1, hand: 'both', target: 10, held: 10, full: true }]);
  });

  it('LR session logs left and right hangs', () => {
    const h = hooks(), t = new SessionTimer(buildSteps(values({ hands: 'LR', sw: 5, sets: 1 })), h);
    t.start();
    sec(25);
    expect(h.onDone.mock.calls[0]![0].map(r => r.hand)).toEqual(['L', 'R']);
  });
});
