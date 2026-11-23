import { describe, it, expect } from 'vitest';
import { PROTOCOLS } from '../src/lib/protocols';
import {
  protoValues, blockValues, readyFor, workoutTotals, fmtRest, fmtLength, blockLine, moveItem, sanitizeVals,
  readWorkouts, loadAdjust, fromTemplate, makeBlock, TEMPLATES, DEFAULT_REST, mergeWorkouts, mergeDeleted, type Workout,
} from '../src/lib/workouts';
import { buildSteps } from '../src/lib/timer';

const P = PROTOCOLS;
const block = (proto: string, restAfter = DEFAULT_REST, saved?: Record<string, any>) => makeBlock(proto, P[proto]!, saved, { restAfter });
const workout = (...blocks: ReturnType<typeof block>[]): Workout => ({ id: 'w1', name: 'Test', blocks, updatedAt: 0 });

describe('protoValues', () => {
  it('takes the protocol defaults, then the user’s saved tweaks', () => {
    expect(protoValues(P.max!)).toMatchObject({ hang: 10, rest: 180, sets: 5, reps: 1, edge: 20, add: 0, mode: 'hang', hands: 'both' });
    expect(protoValues(P.max!, { add: 10, edge: 18 })).toMatchObject({ add: 10, edge: 18, hang: 10 });
  });
  it('keeps only timer settings (no names or descriptions)', () => {
    expect(Object.keys(protoValues(P.rep!)).sort()).toEqual(['add', 'edge', 'effort', 'hands', 'hang', 'lift', 'mode', 'reps', 'rem', 'rest', 'setRest', 'sets', 'sw'].sort());
  });
});

describe('running order', () => {
  it('only the first exercise, or one with no rest before it, gets the get-ready countdown', () => {
    const w = workout(block('warm', 120), block('max', 0), block('rep'));
    expect([0, 1, 2].map(i => readyFor(w, i, 10))).toEqual([10, 0, 10]);
  });
  it('blockValues builds the same steps as the Hang page would for that protocol', () => {
    const v = blockValues(block('rep'), P.rep, 0);
    expect(buildSteps(v).filter(s => s.p === 'hang')).toHaveLength(36);
    expect(v.ready).toBe(0);
  });
  it('totals add every exercise and the rests between them, but not a rest after the last', () => {
    const w = workout(block('warm', 120), block('max', 300));
    // warm-up: 10 ready + 6×10s + 5×20s; max: 5×10s + 4×180s
    expect(workoutTotals(w, P, 10)).toEqual({ secs: 10 + 60 + 100 + 120 + 50 + 720, hangs: 11 });
  });
});

describe('formatting', () => {
  it('rests', () => {
    expect([0, 45, 60, 90, 300].map(fmtRest)).toEqual(['no rest', '45s', '1:00', '1:30', '5:00']);
  });
  it('lengths', () => {
    expect([20, 59, 60, 2290].map(fmtLength)).toEqual(['~20s', '~59s', '~1 min', '~38 min']);
  });
  it('one-line summary of an exercise', () => {
    expect(blockLine(protoValues(P.max!, { add: 10 }), 'Half crimp')).toBe('5 × 10s · 20mm · +10kg · Half crimp');
    expect(blockLine(protoValues(P.rep!))).toBe('6 × 6 × 7s · 20mm · bodyweight');
    expect(blockLine(protoValues(P.oneA!, { rem: 5 }))).toBe('4 × 10s · 20mm · −5kg · each hand');
    expect(blockLine(protoValues(P.rec!, { lift: 30 }))).toBe('6 × 3s · 20mm · lift 30kg');
  });
});

describe('moveItem', () => {
  it('moves without mutating the original', () => {
    const xs = ['a', 'b', 'c', 'd'];
    expect(moveItem(xs, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveItem(xs, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(xs, 1, 99)).toEqual(['a', 'c', 'd', 'b']);
    expect(xs).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('reading saved workouts', () => {
  it('clamps out-of-range numbers and ignores junk', () => {
    const base = protoValues(P.max!);
    const v = sanitizeVals({ hang: 0, sets: 999, edge: 2, add: -5, mode: 'fly' as any, hands: 'LR' }, base);
    expect(v).toMatchObject({ hang: 1, sets: 50, edge: 3, add: 0, mode: 'hang', hands: 'LR' });
  });
  it('drops malformed workouts and exercises, keeps the rest', () => {
    const ok = readWorkouts([
      { id: 'a', name: 'Good', updatedAt: 5, blocks: [{ id: 'b1', proto: 'max', vals: { hang: 10, add: 5 }, restAfter: 99999, grip: 'Open', adj: 'Felt easy' }, { nope: 1 }] },
      { name: 'no id', blocks: [] },
      null, 'junk',
    ]);
    expect(ok).toHaveLength(1);
    expect(ok[0]!.blocks).toHaveLength(1);
    expect(ok[0]!.blocks[0]).toMatchObject({ id: 'b1', proto: 'max', restAfter: 1800, grip: 'Open', adj: 'Felt easy', vals: { hang: 10, add: 5, sets: 5 } });
    expect(readWorkouts(undefined)).toEqual([]);
  });
});

describe('load progression', () => {
  const s = (over: Record<string, any>) => ({ protocolKey: 'max', rpe: 7, mode: 'hang' as const, edgeMm: 20, addedKg: 0, assistKg: 0, liftKg: 0, ...over });
  it('easy adds 2.5kg, taking it off the assist first', () => {
    expect(loadAdjust(s({ rpe: 5, addedKg: 10 }), P.max)?.next).toEqual({ add: 12.5, rem: 0, lift: 0 });
    expect(loadAdjust(s({ rpe: 4, assistKg: 1 }), P.max)?.next).toEqual({ add: 1.5, rem: 0, lift: 0 });
  });
  it('very hard backs off 2.5kg, into assist once there’s no added weight left', () => {
    expect(loadAdjust(s({ rpe: 9, addedKg: 1 }), P.max)).toMatchObject({ next: { add: 0, rem: 1.5, lift: 0 }, easier: false, what: '−1.5kg assist' });
  });
  it('in the zone, light-by-design or unrated: no change', () => {
    expect(loadAdjust(s({ rpe: 7 }), P.max)).toBeNull();
    expect(loadAdjust(s({ rpe: 3, protocolKey: 'warm' }), P.warm)).toBeNull();
    expect(loadAdjust(s({ rpe: 3, protocolKey: 'abra' }), P.abra)).toBeNull();
    expect(loadAdjust(s({ rpe: 3, protocolKey: 'jlmh' }), P.jlmh)).toBeNull();
    expect(loadAdjust(s({ rpe: null }), P.max)).toBeNull();
  });
  it('Min Edge changes the edge by 1mm instead', () => {
    expect(loadAdjust(s({ protocolKey: 'min', rpe: 5, edgeMm: 14 }), P.min)).toMatchObject({ next: { edge: 13 }, what: '13mm', prev: { edge: 14 } });
    expect(loadAdjust(s({ protocolKey: 'min', rpe: 5, edgeMm: 3 }), P.min)).toBeNull(); // already the smallest allowed
  });
  it('no-hang lifts change the weight lifted', () => {
    expect(loadAdjust(s({ protocolKey: 'rec', mode: 'lift', rpe: 4, liftKg: 30 }), P.rec)).toMatchObject({ next: { lift: 32.5 }, what: '32.5kg lift' });
  });
});

describe('starter workouts', () => {
  it.each(TEMPLATES.map(t => [t.key, t] as const))('%s only uses protocols that exist', (_k, t) => {
    const w = fromTemplate(t, P, {});
    expect(w.blocks.length).toBe(t.blocks.length);
    expect(new Set(w.blocks.map(b => b.id)).size).toBe(w.blocks.length);
  });
  it('use the climber’s own saved loads', () => {
    const w = fromTemplate(TEMPLATES.find(t => t.key === 'strength')!, P, { max: { add: 15 } });
    expect(w.blocks.find(b => b.proto === 'max')!.vals.add).toBe(15);
  });
});

describe('syncing workouts between devices', () => {
  const w = (id: string, updatedAt: number, name = id) => ({ id, name, updatedAt, blocks: [block('max')] });
  it('keeps a workout the newer copy hasn’t seen (made on the other phone)', () => {
    expect(mergeWorkouts([w('a', 1), w('b', 5)], [w('a', 1)]).map(x => x.id)).toEqual(['a', 'b']);
  });
  it('takes the most recently changed version of each workout, whichever copy it’s in', () => {
    const out = mergeWorkouts([w('a', 9, 'renamed on the old copy'), w('b', 1, 'old')], [w('a', 5, 'older edit'), w('b', 7, 'new')]);
    expect(out.map(x => x.name)).toEqual(['renamed on the old copy', 'new']);
  });
  it('a deletion wins over older copies, but not over a later edit', () => {
    expect(mergeWorkouts([w('a', 5)], [], { a: 6 })).toEqual([]);
    expect(mergeWorkouts([w('a', 7)], [], { a: 6 }).map(x => x.id)).toEqual(['a']);
  });
  it('deletion records merge (latest time wins) and old ones are forgotten', () => {
    const now = Date.UTC(2026, 10, 23);
    expect(mergeDeleted({ a: now - 9e5, old: now - 200 * 864e5 }, { a: now - 1e5, b: now }, now)).toEqual({ a: now - 1e5, b: now });
    expect(mergeDeleted(undefined, null)).toEqual({});
  });
});
