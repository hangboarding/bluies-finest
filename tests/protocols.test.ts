import { describe, it, expect } from 'vitest';
import { PROTOCOLS, DEFAULTS, FIELDS, personalVals, type Values } from '../src/lib/protocols';
import { buildSteps } from '../src/lib/timer';

const valuesFor = (key: string): Values => {
  const p = PROTOCOLS[key]!;
  return {
    ...DEFAULTS, hang: p.hang, rest: p.rest, sets: p.sets, reps: p.reps, edge: p.edge,
    setRest: p.setRest ?? DEFAULTS.setRest, mode: p.mode ?? 'hang', hands: p.hands ?? 'both',
    sw: p.sw ?? DEFAULTS.sw, effort: p.effort ?? DEFAULTS.effort, simple: p.simple,
  };
};

describe('built-in protocols', () => {
  it.each(Object.keys(PROTOCOLS))('%s has sane values and builds the right number of hangs', key => {
    const p = PROTOCOLS[key]!;
    for (const k of ['hang', 'rest', 'sets', 'reps', 'edge'] as const) expect(p[k], k).toBeGreaterThan(0);
    const steps = buildSteps(valuesFor(key));
    const perRep = (p.hands ?? 'both') === 'LR' ? 2 : 1;
    expect(steps.filter(s => s.p === 'hang')).toHaveLength(p.sets * p.reps * perRep);
    expect(steps[0]!.p).toBe('ready');
    expect(steps.at(-1)!.p).toBe('hang');
  });

  it('repeaters: 6 sets of 7/3 × 6 with 180s between sets', () => {
    const steps = buildSteps(valuesFor('rep'));
    expect(steps.filter(s => s.bigRest).map(s => s.t)).toEqual([180, 180, 180, 180, 180]);
  });

  it('every field key exists on the values object', () => {
    const v = valuesFor('max');
    for (const f of FIELDS) expect(v, f.k).toHaveProperty(f.k);
  });
});

describe('personalVals', () => {
  it('keeps only the load (and how it’s applied) from saved tweaks', () => {
    expect(personalVals('max', { hang: 12, sets: 3, add: 10, rem: 0, mode: 'lift', lift: 30, edge: 18, ready: 5 })).toEqual({ add: 10, rem: 0, mode: 'lift', lift: 30 });
  });
  it('Min Edge also keeps the edge', () => {
    expect(personalVals('min', { edge: 12, sets: 8, add: 0 })).toEqual({ edge: 12, add: 0 });
  });
  it('your own protocols keep everything', () => {
    expect(personalVals('c_abc123', { sets: 9, hang: 15, add: 5 })).toEqual({ sets: 9, hang: 15, add: 5 });
  });
  it('copes with nothing saved', () => {
    expect(personalVals('max', undefined)).toEqual({});
  });
});

