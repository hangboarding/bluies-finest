// Workouts: a saved queue of protocols ("exercises") run back to back, with a rest after each.
// Stored in the user's private settings (synced like custom protocols), so nothing changes on the
// server: every exercise is saved as its own ordinary session when the workout finishes.
import { DEFAULTS, LIMITS, PROTOCOLS, personalVals, type Protocol, type Values } from './protocols';
import { buildSteps } from './timer';
import type { NewSession } from './types';

/** The timer settings an exercise keeps (everything on the Hang page's number pad, plus mode and hands). */
export const BLOCK_KEYS = ['hang', 'rest', 'sets', 'reps', 'setRest', 'edge', 'add', 'rem', 'lift', 'effort', 'sw', 'mode', 'hands'] as const;
export type BlockVals = Pick<Values, typeof BLOCK_KEYS[number]>;

export interface WorkoutBlock {
  id: string;
  /** Protocol key, built-in or custom (c_…). */
  proto: string;
  vals: BlockVals;
  /** Grip and fingers for this exercise; blank = whatever the Hang page has selected. */
  grip?: string; fing?: string;
  /** Seconds of rest after this exercise, before the next one (ignored for the last). */
  restAfter: number;
  /** Load change made from how hard it felt last time, shown until it's next done. */
  adj?: string;
}
export interface Workout { id: string; name: string; blocks: WorkoutBlock[]; updatedAt: number; lastRunAt?: number; }

export const DEFAULT_REST = 180;
export const MAX_BLOCKS = 12;
export const REST_LIMITS: [number, number] = [0, 1800];
export const newId = (prefix: string) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const clamp = (n: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, n));

/** A protocol's recommended values with `saved` on top (usually your load for it: see personalVals). */
export function protoValues(p: Protocol, saved: Record<string, any> = {}): BlockVals {
  const v: any = { ...DEFAULTS, ...p, ...saved };
  const out: any = {};
  for (const k of BLOCK_KEYS) out[k] = v[k];
  return out as BlockVals;
}

/** Full timer values for one exercise. `ready` is the get-ready countdown (0 to skip it). */
export function blockValues(b: WorkoutBlock, p: Protocol | undefined, ready: number): Values {
  return { ...DEFAULTS, ...protoValues(p ?? PROTOCOLS.jlmh!, {}), ...b.vals, ready, simple: !!p?.simple } as Values;
}

/** The get-ready countdown before exercise `i`: the first always gets it; later ones only when there's no rest before them. */
export const readyFor = (w: Workout, i: number, ready: number) => (i === 0 || (w.blocks[i - 1]?.restAfter ?? 0) <= 0 ? ready : 0);

export const hangCount = (v: Pick<Values, 'sets' | 'reps' | 'hands'>) => v.sets * v.reps * (v.hands === 'LR' ? 2 : 1);
const stepSeconds = (v: Values) => buildSteps(v).reduce((a, s) => a + s.t, 0);

/** Total time and hangs for a workout, rests between exercises included. */
export function workoutTotals(w: Workout, protos: Record<string, Protocol>, ready: number) {
  let secs = 0, hangs = 0;
  w.blocks.forEach((b, i) => {
    const v = blockValues(b, protos[b.proto], readyFor(w, i, ready));
    secs += stepSeconds(v) + (i < w.blocks.length - 1 ? Math.max(0, b.restAfter) : 0);
    hangs += hangCount(v);
  });
  return { secs, hangs };
}

/** 90 → "1:30", 45 → "45s", 0 → "no rest". */
export const fmtRest = (s: number) => s <= 0 ? 'no rest' : s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
/** Rough length for a summary: "~38 min", "~45s". */
export const fmtLength = (s: number) => s < 60 ? `~${Math.max(1, Math.round(s))}s` : `~${Math.round(s / 60)} min`;

/** One line describing an exercise: "5 × 10s · 20mm · +10kg". */
export function blockLine(v: BlockVals, grip?: string) {
  const reps = v.reps > 1 ? `${v.sets} × ${v.reps} × ${v.hang}s` : `${v.sets} × ${v.hang}s`;
  const load = v.mode === 'lift' ? `lift ${v.lift}kg` : v.add ? `+${v.add}kg` : v.rem ? `−${v.rem}kg` : 'bodyweight';
  const hands = v.hands === 'LR' ? 'each hand' : v.hands === 'L' ? 'left' : v.hands === 'R' ? 'right' : '';
  return [reps, `${v.edge}mm`, load, hands, grip].filter(Boolean).join(' · ');
}

/** Move one item (returns a new array). */
export function moveItem<T>(xs: readonly T[], from: number, to: number): T[] {
  const out = [...xs];
  if (from < 0 || from >= out.length) return out;
  const [x] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, x!);
  return out;
}

export const cloneWorkout = (w: Workout): Workout => JSON.parse(JSON.stringify(w));

/** New exercise for protocol `k`: its recommended settings with `saved` on top (callers pass your load for it). */
export function makeBlock(k: string, p: Protocol, saved: Record<string, any> | undefined, opts: { grip?: string; fing?: string; restAfter?: number } = {}): WorkoutBlock {
  return { id: newId('b'), proto: k, vals: protoValues(p, saved), grip: opts.grip, fing: opts.fing, restAfter: opts.restAfter ?? DEFAULT_REST };
}

/** Values copied from a timer run back into an exercise, clamped to the same limits as the Hang page. */
export function sanitizeVals(v: Partial<BlockVals>, fallback: BlockVals): BlockVals {
  const out: any = { ...fallback };
  for (const k of BLOCK_KEYS) {
    const x = (v as any)[k];
    if (k === 'mode') { if (x === 'hang' || x === 'lift') out.mode = x; continue; }
    if (k === 'hands') { if (['both', 'L', 'R', 'LR'].includes(x)) out.hands = x; continue; }
    if (typeof x === 'number' && isFinite(x)) out[k] = clamp(x, LIMITS[k] ?? [0, 9999]);
  }
  return out as BlockVals;
}

/** Workouts read back from settings, dropping anything malformed (settings are free-form JSON). */
export function readWorkouts(raw: unknown): Workout[] {
  if (!Array.isArray(raw)) return [];
  const base = protoValues(PROTOCOLS.max!);
  return raw.filter(w => w && typeof w.id === 'string' && Array.isArray(w.blocks)).map(w => ({
    id: w.id, name: String(w.name ?? '').slice(0, 60) || 'Workout', updatedAt: +w.updatedAt || 0, ...(w.lastRunAt ? { lastRunAt: +w.lastRunAt } : {}),
    blocks: (w.blocks as any[]).filter(b => b && typeof b.proto === 'string').slice(0, MAX_BLOCKS).map(b => ({
      id: typeof b.id === 'string' ? b.id : newId('b'), proto: b.proto, vals: sanitizeVals(b.vals ?? {}, base),
      ...(typeof b.grip === 'string' && b.grip ? { grip: b.grip } : {}), ...(typeof b.fing === 'string' && b.fing ? { fing: b.fing } : {}),
      restAfter: clamp(Math.round(+b.restAfter || 0), REST_LIMITS),
      ...(typeof b.adj === 'string' && b.adj ? { adj: b.adj.slice(0, 120) } : {}),
    })),
  }));
}

// ---------- load progression ----------
export interface LoadAdjust {
  /** The settings to change (edge for Min Edge, otherwise added/assist/lift kg). */
  next: { add: number; rem: number; lift: number } | { edge: number };
  /** What the load was, so the change can be undone. */
  prev: { add: number; rem: number; lift: number; edge?: number };
  easier: boolean;
  /** "+12.5kg", "−2.5kg assist", "bodyweight", "14mm". */
  what: string;
}
/** Next time's load from how hard a session felt: easy (RPE ≤5) → +2.5kg, very hard (RPE ≥9) → −2.5kg.
 *  Min Edge shrinks or grows the edge by 1mm instead. Light-by-design protocols are left alone. */
export function loadAdjust(s: Pick<NewSession, 'protocolKey' | 'rpe' | 'mode' | 'edgeMm' | 'addedKg' | 'assistKg' | 'liftKg'>, p: Protocol | undefined): LoadAdjust | null {
  const k = s.protocolKey;
  if (!p || p.simple || k === 'warm' || k === 'abra' || s.rpe == null) return null;
  const d = s.rpe <= 5 ? 2.5 : s.rpe >= 9 ? -2.5 : 0;
  if (!d) return null;
  if (k === 'min' && s.mode !== 'lift') {
    const edge = clamp(s.edgeMm + (d > 0 ? -1 : 1), LIMITS.edge!);
    if (edge === s.edgeMm) return null;
    return { next: { edge }, prev: { add: s.addedKg, rem: s.assistKg, lift: s.liftKg, edge: s.edgeMm }, easier: d > 0, what: `${edge}mm` };
  }
  const v = { add: s.addedKg, rem: s.assistKg, lift: s.liftKg }, prev = { ...v };
  if (s.mode === 'lift') v.lift = Math.max(0, v.lift + d);
  else if (d > 0) { const fromAssist = Math.min(v.rem, d); v.rem -= fromAssist; v.add += d - fromAssist; }
  else { const fromAdd = Math.min(v.add, -d); v.add -= fromAdd; v.rem += -d - fromAdd; }
  const what = s.mode === 'lift' ? `${v.lift}kg lift` : v.add ? `+${v.add}kg` : v.rem ? `−${v.rem}kg assist` : 'bodyweight';
  return { next: v, prev, easier: d > 0, what };
}

// ---------- starter workouts ----------
export interface Template { key: string; name: string; desc: string; blocks: { proto: string; restAfter: number }[]; }
export const TEMPLATES: Template[] = [
  { key: 'strength', name: 'Strength day', desc: 'Warm up properly, then near-max hangs with full rest.', blocks: [{ proto: 'warm', restAfter: 120 }, { proto: 'max', restAfter: DEFAULT_REST }] },
  { key: 'strend', name: 'Strength + endurance', desc: 'Strength first while you’re fresh, then repeaters.', blocks: [{ proto: 'warm', restAfter: 120 }, { proto: 'max', restAfter: 300 }, { proto: 'rep', restAfter: DEFAULT_REST }] },
  { key: 'tendon', name: 'Tendon care', desc: 'A light day for between hard sessions.', blocks: [{ proto: 'abra', restAfter: 120 }, { proto: 'dens', restAfter: DEFAULT_REST }] },
  { key: 'start', name: 'Getting started', desc: 'For your first months of hangboarding.', blocks: [{ proto: 'warm', restAfter: 120 }, { proto: 'beg', restAfter: DEFAULT_REST }] },
];
export function fromTemplate(t: Template, protos: Record<string, Protocol>, saved: Record<string, Record<string, any>>): Workout {
  return {
    id: newId('w'), name: t.name, updatedAt: Date.now(),
    blocks: t.blocks.filter(b => protos[b.proto]).map(b => makeBlock(b.proto, protos[b.proto]!, personalVals(b.proto, saved[b.proto]), { restAfter: b.restAfter })),
  };
}

// ---------- syncing between devices ----------
// Settings sync as one blob and the most recently saved copy wins, which on its own would let a phone that
// hadn't seen a new workout wipe it. So workouts (and custom protocols) are merged one by one when settings
// load, and deletions are remembered for a while so a deleted one doesn't come back from an older copy.
/** id → when it was deleted (ms). */
export type Deleted = Record<string, number>;
const KEEP_DELETED = 180 * 864e5;
export function mergeDeleted(a?: Deleted | null, b?: Deleted | null, now = Date.now()): Deleted {
  const out: Deleted = {};
  for (const src of [a, b]) for (const [k, t] of Object.entries(src ?? {}))
    if (typeof t === 'number' && now - t < KEEP_DELETED) out[k] = Math.max(out[k] ?? 0, t);
  return out;
}
/** Both copies' workouts: each one's most recently changed version, minus any deleted since.
 *  Keeps the order of `newer`, with workouts only `older` has after them. */
export function mergeWorkouts(older: unknown, newer: unknown, deleted: Deleted = {}): Workout[] {
  const out = new Map<string, Workout>();
  for (const w of [...readWorkouts(newer), ...readWorkouts(older)]) {
    const x = out.get(w.id);
    if (!x || w.updatedAt > x.updatedAt) out.set(w.id, w);
  }
  return [...out.values()].filter(w => !(deleted[w.id] != null && deleted[w.id]! >= w.updatedAt));
}
