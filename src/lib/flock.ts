// The crew's weekly flock: every 30 points a climber earns this week brings one bird to the clearing.
// The birds fly off when the week ends (Monday 00:00, the same week as the This week board), and the
// next week brings a different species, in a fixed order so every phone shows the same birds.
import { weekStart, addDays, parseDayKey } from './scoring';
import type { Profile, Session } from './types';

export const POINTS_PER_BIRD = 30;
export const SPECIES_ORDER = ['currawong', 'galah', 'kingparrot', 'cockatoo', 'rosella', 'magpie', 'raven', 'woodduck', 'crimsonrosella', 'wattlebird', 'blackcockatoo'] as const;
export type SpeciesId = typeof SPECIES_ORDER[number];
/** Each bird's name, plural, and scientific name. */
export const SPECIES_NAMES: Record<SpeciesId, { one: string; many: string; sci: string }> = {
  currawong: { one: 'Pied currawong', many: 'Currawongs', sci: 'Strepera graculina' },
  galah: { one: 'Galah', many: 'Galahs', sci: 'Eolophus roseicapilla' },
  kingparrot: { one: 'Australian king parrot', many: 'King parrots', sci: 'Alisterus scapularis' },
  cockatoo: { one: 'Sulphur-crested cockatoo', many: 'Cockatoos', sci: 'Cacatua galerita' },
  rosella: { one: 'Eastern rosella', many: 'Eastern rosellas', sci: 'Platycercus eximius' },
  magpie: { one: 'Australian magpie', many: 'Magpies', sci: 'Gymnorhina tibicen' },
  raven: { one: 'Australian raven', many: 'Ravens', sci: 'Corvus coronoides' },
  woodduck: { one: 'Australian wood duck', many: 'Wood ducks', sci: 'Chenonetta jubata' },
  crimsonrosella: { one: 'Crimson rosella', many: 'Crimson rosellas', sci: 'Platycercus elegans' },
  wattlebird: { one: 'Red wattlebird', many: 'Red wattlebirds', sci: 'Anthochaera carunculata' },
  blackcockatoo: { one: 'Yellow-tailed black cockatoo', many: 'Black cockatoos', sci: 'Zanda funerea' },
};

/** A week's birds: one species, or all of them together. */
export type BirdWeek = SpeciesId | 'all';
/** The weekly cycle: a week for each species in turn, then a week with every one of them, then round again. */
export const ROTATION: readonly BirdWeek[] = [...SPECIES_ORDER, 'all'];
/** The all-birds week's names, in the same shape as a species' (sci: what goes in italics after the name). */
export const ALL_BIRDS = { one: 'All the birds', many: 'Birds', sci: `all ${SPECIES_ORDER.length} species together` };
export const weekNames = (id: BirdWeek) => (id === 'all' ? ALL_BIRDS : SPECIES_NAMES[id]);
export const isBirdWeek = (x: unknown): x is BirdWeek => typeof x === 'string' && (ROTATION as readonly string[]).includes(x);

/** The currawongs' first week. */
const EPOCH = parseDayKey('2026-11-23');
/** Weeks since the first flock (negative before it). Counted in calendar days, so daylight saving can't shift it. */
export function weekIndex(now = new Date()) {
  return Math.round((+weekStart(now) - +EPOCH) / (7 * 864e5));
}
/** The birds the weekly rotation brings, whatever an admin has picked. */
export function rotationOf(now = new Date()): BirdWeek {
  const n = ROTATION.length, i = weekIndex(now);
  return ROTATION[((i % n) + n) % n]!;
}
/** This week's birds: what an admin has picked for everyone (see chooseBird), or else the rotation's. */
export function speciesOfWeek(now = new Date()): BirdWeek { return chosen ?? rotationOf(now); }

/** Birds an admin has picked from the admin page (one species, or all of them), shown every week in place of the
 *  rotation until they set it back to automatic. Kept on the phone too, so the right bird is on the button before
 *  anything has loaded. */
const BIRD_KEY = 'bf.bird';
const validBird = (id: unknown): BirdWeek | null => (isBirdWeek(id) ? id : null);
let chosen: BirdWeek | null = (() => { try { return validBird(localStorage.getItem(BIRD_KEY)); } catch { return null; } })();
/** Sets (or, with null or anything that isn't a bird, clears) the admin's pick. Returns whether it changed. */
export function chooseBird(id: unknown): boolean {
  const next = validBird(id), changed = next !== chosen;
  chosen = next;
  try { if (next) localStorage.setItem(BIRD_KEY, next); else localStorage.removeItem(BIRD_KEY); } catch { /* storage blocked */ }
  return changed;
}
export const chosenBird = () => chosen;

/** Hats on the birds: an admin turns them on (or off) for everyone. Kept on the phone too, like the bird. */
const HATS_KEY = 'bf.hats';
let hats = (() => { try { return localStorage.getItem(HATS_KEY) === '1'; } catch { return false; } })();
/** Turns the hats on (only for `true`) or off. Returns whether that changed anything. */
export function setHats(on: unknown): boolean {
  const next = on === true, changed = next !== hats;
  hats = next;
  try { if (next) localStorage.setItem(HATS_KEY, '1'); else localStorage.removeItem(HATS_KEY); } catch { /* storage blocked */ }
  return changed;
}
export const hatsOn = () => hats;
/** When this week's flock flies off: next Monday 00:00 (local time). */
export const flockEnds = (now = new Date()) => addDays(weekStart(now), 7);

/** Leg-band colours, one per climber (in the order they joined, so a climber keeps theirs). */
export const BANDS = ['#ff5a4e', '#f2c14e', '#3ddc84', '#5aa9e6', '#b48cff', '#ff9f43', '#f78fb3', '#2bb5a0', '#f5f5f5', '#a3e635', '#c8814a', '#22d3ee'];
export function bandOf(userId: string, profiles: Iterable<Profile>) {
  const all = [...profiles].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const i = Math.max(0, all.findIndex(p => p.id === userId));
  return BANDS[i % BANDS.length]!;
}

export interface FlockMember { userId: string; points: number; birds: number; toNext: number; band: string }
/** Everyone who's earned points this week, most birds first. Sessions still waiting to upload from this phone
 *  count too: you earned them, and the bird shouldn't wait for a signal. */
export function crewFlock(sessions: readonly Session[], profiles: Map<string, Profile>, now = new Date()): FlockMember[] {
  const from = +weekStart(now), to = +flockEnds(now), pts = new Map<string, number>();
  for (const s of sessions) {
    const t = +new Date(s.createdAt);
    if (t >= from && t < to && profiles.has(s.userId)) pts.set(s.userId, (pts.get(s.userId) ?? 0) + Math.max(0, s.points || 0));
  }
  return [...pts].map(([userId, points]) => ({
    userId, points: Math.round(points), birds: Math.floor(Math.round(points) / POINTS_PER_BIRD),
    toNext: POINTS_PER_BIRD - (Math.round(points) % POINTS_PER_BIRD), band: bandOf(userId, profiles.values()),
  })).sort((a, b) => b.birds - a.birds || b.points - a.points || (profiles.get(a.userId)?.name ?? '').localeCompare(profiles.get(b.userId)?.name ?? ''));
}
export const flockSize = (m: readonly FlockMember[]) => m.reduce((a, x) => a + x.birds, 0);

// ---- which birds this phone has already seen arrive (so only new ones fly in) ----
const SEEN_KEY = 'bf:flock-seen';
interface Seen { week: number; birds: Record<string, number> }
function readSeen(now: Date): Record<string, number> {
  try {
    const s = JSON.parse(localStorage.getItem(SEEN_KEY) || 'null') as Seen | null;
    return s && s.week === weekIndex(now) && s.birds && typeof s.birds === 'object' ? s.birds : {};
  } catch { return {}; }
}
/** Birds each climber had last time this phone looked (this week only). */
export const seenBirds = (now = new Date()) => readSeen(now);
export function markSeen(m: readonly FlockMember[], now = new Date()) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify({ week: weekIndex(now), birds: Object.fromEntries(m.map(x => [x.userId, x.birds])) } satisfies Seen)); } catch { /* storage blocked */ }
}
/** How many birds have arrived since this phone last looked. */
export function newBirds(m: readonly FlockMember[], now = new Date()) {
  const seen = readSeen(now);
  return m.reduce((a, x) => a + Math.max(0, x.birds - (seen[x.userId] ?? 0)), 0);
}
