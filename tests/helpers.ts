import type { HangResult, Session } from '../src/lib/types';
import type { Values } from '../src/lib/protocols';
import type { Ctx } from '../src/lib/achievements';

let seq = 0;

/** A fully-typed session with sensible defaults; override any field. */
export function session(over: Partial<Session> = {}): Session {
  seq++;
  const base: Session = {
    id: `s${seq}`,
    userId: 'u1',
    createdAt: '2026-11-18T12:00:00.000Z',
    protocolKey: 'max',
    protocolName: 'Max Hangs',
    mode: 'hang',
    hang: 10, rest: 180, sets: 5, reps: 1, setRest: 180,
    edgeMm: 20,
    addedKg: 0, assistKg: 0, liftKg: 0, effortPct: 60,
    hands: 'both',
    grip: 'Half crimp', fingers: '4', board: 'Beastmaker 1000', edgeMaterial: 'Wood', edgeProfile: 'Rounded',
    feel: '🙂',
    rpe: 7,
    tutS: 50,
    fullHangs: 5,
    totalHangs: 5,
    hangs: [],
    loadPct: 100,
    points: 50,
    isPb: false,
    note: '',
  };
  return { ...base, ...over };
}

/** Session finishing at local wall-clock time y-m-d h:00 (month is 1-based). */
export function sessionAt(y: number, m: number, d: number, h = 12, over: Partial<Session> = {}): Session {
  return session({ createdAt: new Date(y, m - 1, d, h).toISOString(), ...over });
}

export function hang(over: Partial<HangResult> = {}): HangResult {
  return { set: 1, rep: 1, hand: 'both', target: 10, held: 10, full: true, ...over };
}

export function values(over: Partial<Values> = {}): Values {
  return {
    hang: 10, rest: 20, sets: 2, reps: 1, setRest: 60, edge: 20,
    add: 0, rem: 0, lift: 20, effort: 60, sw: 5, ready: 0,
    mode: 'hang', hands: 'both', ...over,
  };
}

export function ctx(over: Partial<Ctx> = {}): Ctx {
  return { sessions: [], flags: {}, hasAvatar: false, customBoards: 0, customProtocols: 0, heartsReceived: 0, commentsGiven: 0, pointsTotal: 0, ...over };
}
