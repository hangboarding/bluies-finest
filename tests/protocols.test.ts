import { describe, it, expect } from 'vitest';
import { PROTOCOLS, DEFAULTS, FIELDS, type Values } from '../src/lib/protocols';
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
