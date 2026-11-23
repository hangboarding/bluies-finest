import type { Hands, Mode } from './types';

export interface Protocol {
  n: string; by: string; use: string; d: string; int: string; freq: string;
  hang: number; rest: number; sets: number; reps: number; edge: number;
  setRest?: number; mode?: Mode; hands?: Hands; sw?: number; effort?: number;
  simple?: boolean; custom?: boolean;
}

/** Sessions keep the protocol name they were saved with; built-in protocols renamed since show their new name. */
const RENAMED: Record<string, string> = { 'JUST LET ME HANG': 'QUICK SESH' };
export const currentName = (name: string) => RENAMED[name] ?? name;

export const PROTOCOLS: Record<string, Protocol> = {
  jlmh: { n: 'QUICK SESH', simple: true, by: 'No theory, no fuss', use: 'Quick hangs, minimal setup', hang: 10, rest: 60, sets: 6, reps: 1, edge: 20, int: 'Whatever feels right', freq: 'Any time', d: 'Just the basics: hang, rest, repeat.' },
  warm: { n: 'Warm-up', by: 'Standard practice, progressive loading', use: 'Prepping fingers before hard hangs', hang: 10, rest: 20, sets: 6, reps: 1, edge: 25, int: 'Easy, ~40–60%, feet on or assisted', freq: 'Before every hard session', d: 'Easy hangs on a big edge, building gradually. Pair with arm circles and a few easy climbs if you can.' },
  max: { n: 'Max Hangs', by: 'Eva López (2012–14 studies) · popularised by Eric Hörst', use: 'Max finger strength', hang: 10, rest: 180, sets: 5, reps: 1, edge: 20, int: '~85–90%, 2–3s in reserve', freq: '2×/week', d: 'Near-max load on a medium edge with full recovery between hangs.' },
  abra: { n: 'Abrahangs', by: "Emil Abrahamsson · based on Keith Baar's tendon research", use: 'Tendon health, rehab, recovery', hang: 10, rest: 20, sets: 10, reps: 1, edge: 20, int: '40–60%, never to failure (use assist or feet)', freq: 'Daily is fine', d: 'Light, feet-assisted hangs or lifts, done often to load tendons gently.' },
  rep: { n: 'Repeaters', by: "Mark & Mike Anderson, The Rock Climber's Training Manual", use: 'Strength-endurance', hang: 7, rest: 3, sets: 6, reps: 6, setRest: 180, edge: 20, int: '~60–80%', freq: '2×/week', d: '7s on / 3s off × 6 makes one set. Builds power you can repeat on a route.' },
  min: { n: 'Min Edge', by: 'Eva López, MinEdge protocol', use: 'Max strength on small holds', hang: 10, rest: 120, sets: 5, reps: 1, edge: 14, int: 'Bodyweight, smallest edge for 10s', freq: '2×/week', d: 'Instead of adding weight, shrink the edge until 10s is hard.' },
  dens: { n: 'Density Hangs', by: 'Tyler Nelson, Camp4 Human Performance', use: 'Connective-tissue adaptation', hang: 30, rest: 60, sets: 4, reps: 1, edge: 20, int: '~60–70%', freq: '2–3×/week', d: 'Long, moderate hangs (20–40s) to thicken and strengthen tendons.' },
  int: { n: 'IntHangs', by: 'Eva López, intermittent hangs', use: 'Base strength, early season', hang: 10, rest: 5, sets: 4, reps: 5, setRest: 60, edge: 20, int: 'Submaximal, ~70%', freq: '2×/week', d: '10s on / 5s off × 5 per set. A gentler lead-in to max hangs.' },
  s753: { n: '7/53', by: 'Eric Hörst, Training for Climbing', use: 'Max strength', hang: 7, rest: 53, sets: 3, reps: 3, setRest: 240, edge: 20, int: '~90%', freq: '1–2×/week', d: '7s heavy hang, 53s rest, 3 hangs per set. Long rests keep quality high.' },
  oneA: { n: 'One-Arm Max', by: 'Tom Randall & Ollie Torr, Lattice Training', use: 'Max strength, imbalance check', hang: 10, rest: 180, sets: 4, reps: 1, edge: 20, hands: 'LR', sw: 10, int: '~85–90%', freq: '1–2×/week', d: 'Single-arm hangs, left then right. Advanced climbers only.' },
  rec: { n: 'Recruitment Pulls', by: 'Tyler Nelson, Camp4 Human Performance', use: 'Neural recruitment / power', mode: 'lift', hang: 3, rest: 120, sets: 6, reps: 1, edge: 20, effort: 100, int: 'Maximal intent', freq: '2×/week', d: 'Short, explosive max pulls on a lifting edge or no-hang device.' },
  beg: { n: 'Beginner', by: 'Eric Hörst, Training for Climbing', use: 'First 6–12 months of hangboarding', hang: 10, rest: 120, sets: 4, reps: 1, edge: 25, int: '~60%, well short of failure', freq: '2×/week', d: 'Big edge, open hand, assistance if needed. Builds the habit safely.' },
};

export interface Values {
  hang: number; rest: number; sets: number; reps: number; setRest: number; edge: number;
  add: number; rem: number; lift: number; effort: number; sw: number; ready: number;
  mode: Mode; hands: Hands; simple?: boolean;
}
export const DEFAULTS: Omit<Values, 'hang' | 'rest' | 'sets' | 'edge'> = { add: 0, rem: 0, lift: 20, effort: 60, setRest: 180, sw: 10, ready: 10, reps: 1, mode: 'hang', hands: 'both' };

export type FieldKey = 'hang' | 'rest' | 'sets' | 'reps' | 'setRest' | 'edge' | 'add' | 'rem' | 'lift' | 'effort' | 'sw' | 'ready';
export interface Field { k: FieldKey; label: string; unit: string; step: number; icon: string; colour: string; show?: (v: Values) => boolean; }
export const FIELDS: Field[] = [
  { k: 'hang', label: 'Hang time', unit: 's', step: 1, icon: 'hang', colour: '#3ddc84' },
  { k: 'rest', label: 'Rest time', unit: 's', step: 1, icon: 'rest', colour: '#5aa9e6' },
  { k: 'sets', label: 'Sets', unit: '×', step: 1, icon: 'sets', colour: '#f2c14e' },
  { k: 'reps', label: 'Reps / set', unit: '×', step: 1, icon: 'reps', colour: '#f78fb3', show: v => !v.simple },
  { k: 'setRest', label: 'Rest between sets', unit: 's', step: 15, icon: 'setRest', colour: '#7ad7f0', show: v => v.reps > 1 && !v.simple },
  { k: 'edge', label: 'Edge size', unit: 'mm', step: 1, icon: 'edge', colour: '#ff9f43' },
  { k: 'add', label: 'Added weight', unit: 'kg', step: 0.5, icon: 'add', colour: '#ff5a4e', show: v => v.mode !== 'lift' },
  { k: 'rem', label: 'Assist (removed)', unit: 'kg', step: 0.5, icon: 'rem', colour: '#4ecdc4', show: v => v.mode !== 'lift' },
  { k: 'lift', label: 'Load lifted', unit: 'kg', step: 0.5, icon: 'lift', colour: '#ff5a4e', show: v => v.mode === 'lift' && !v.simple },
  { k: 'effort', label: 'Target effort', unit: '%', step: 5, icon: 'effort', colour: '#4ecdc4', show: v => v.mode === 'lift' && !v.simple },
  { k: 'sw', label: 'Hand switch rest', unit: 's', step: 1, icon: 'switch', colour: '#c9d1d9', show: v => v.hands === 'LR' && !v.simple },
];

/** Settings that belong to the climber rather than the protocol: the load and how it's applied (hang or
 *  no-hang lift), plus, for Min Edge (which gets harder by shrinking the edge), the edge. For your own
 *  (custom) protocols that's everything. These carry over when a
 *  protocol is picked; everything else (hang, rest, sets, reps, edge…) comes back to the protocol's
 *  recommended values. Keeping the load is also what lets "felt easy, +2.5kg next time" work. */
const PERSONAL = ['add', 'rem', 'lift', 'mode'], PERSONAL_MIN = [...PERSONAL, 'edge'];
export function personalVals(k: string, saved: Record<string, any> | undefined): Record<string, any> {
  if (k.startsWith('c_')) return { ...(saved ?? {}) }; // your own protocol: everything you set is the protocol
  const keep = k === 'min' ? PERSONAL_MIN : PERSONAL;
  return Object.fromEntries(Object.entries(saved ?? {}).filter(([x]) => keep.includes(x)));
}

/** Sensible limits per setting — stops typos (and gaming) like 0s hangs or 10,000 sets. */
export const LIMITS: Record<string, [number, number]> = {
  hang: [1, 300], rest: [0, 900], sets: [1, 50], reps: [1, 30], setRest: [0, 1800], edge: [3, 60],
  add: [0, 150], rem: [0, 150], lift: [0, 200], effort: [5, 100], sw: [0, 120], ready: [0, 60],
};

export const TIPS: Record<string, [string, string]> = {
  add: ['Added weight', 'Extra weight on a harness or belt. Can’t be combined with Assist.'],
  rem: ['Assist (removed)', 'Weight taken off you, like a pulley counterweight or feet on a chair. Can’t be combined with Added weight.'],
  sw: ['Hand switch rest', 'Rest between your left-hand and right-hand hang in “L then R” mode.'],
  ready: ['Get-ready', 'Countdown before the first hang so you can chalk up and get into position. Change it in Profile → Settings.'],
  lift: ['Load lifted', 'Weight you pull off the floor with a lifting edge or block, per hand.'],
  effort: ['Target effort', 'How hard to pull, as % of your max. Abrahangs ≈ 40–60%, recruitment pulls ≈ 100%.'],
  setRest: ['Rest between sets', 'Longer rest after finishing all reps in a set.'],
  mode: ['Load method', 'Hang: you hang off the board, adding or removing weight. No-hang: you stand and lift a weight with a portable edge, which makes the load easier to control.'],
  bodyweight: ['Why bodyweight?', 'Used to work out load as a % of bodyweight so scoring is fair. Your bodyweight itself is never shown to anyone. Others only see the rounded %, which keeps it approximate.'],
};

export const QUOTES: [string, string][] = [
  ['The board has been humbled.', 'You walked in, hung, and left it shook. Iconic.'],
  ['Do the mahi, get the treat', '🍭🍬🍭🍬🍭'],
  ['Fierce. Fabulous. Forearms.', 'Rest up, superstar. You earned every second 😘'],
  ['Ate and left no crimps.', "That was a full-course meal. Chef's kiss 👩‍🍳"],
  ['Look at the big strong boi', 'Take a bow, then go hydrate, queen.'],
  ['Not you making it look easy 🙄💖', 'Rude of you to be this strong. Keep it up.'],
  ['King of the castle.', '👑🏰'],
  ['Slay of the day 🔥', 'Rest well, legend.'],
  ["Consistency looks gorgeous on you.", 'Keep up the good work'],
  ['Bask in the dopamine', "You've earned it."],
];

/** Near-maximal protocols: warm up first, and don't overdo them. */
export const MAX_EFFORT = new Set(['max', 'min', 's753', 'oneA', 'rec']);

/** Grip names (as stored on sessions) with their icon keys. */
export const GRIPS: [string, string][] = [['Open', 'open'], ['Drag', 'drag'], ['Half crimp', 'half'], ['Full crimp', 'full'], ['Pinch', 'pinch'], ['Sloper', 'sloper']];
export const FINGERS = ['All 4', 'Front 3', 'Back 3', 'Front 2', 'Middle 2', 'Back 2', 'Mono', 'Custom'];
export const MATERIALS = ['Wood', 'Resin', 'Metal', 'Other'];
export const PROFILES = ['Flat', 'Rounded'];
/** Pre-session feel, worst to best. */
export const FEELS = ['😭', '🤕', '😫', '😴', '😐', '🙂', '💪', '🔥'];
/** How hard a session felt (RPE 1–10). */
export const RPE_WORDS = ['', 'Very easy', 'Easy', 'Easy', 'Moderate', 'Moderate', 'Hard', 'Hard', 'Very hard', 'Very hard', 'Max'];

export const BUILTIN_BOARDS = ['Beastmaker 1000', 'Beastmaker 2000', 'Tension Block', 'Lattice Edge', 'Gym board'];
