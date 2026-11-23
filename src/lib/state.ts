// App-wide state: the backend store, the signed-in user, cached data, and the
// user's private settings (synced to the backend, mirrored in localStorage).
import type { ChallengeRow, PrivateData, Profile, SeasonChampion, Session, Store } from './types';
import { seasonOf, championsFrom } from './seasons';
import { LocalStore } from './local-store';
import { BUILTIN_BOARDS, PROTOCOLS, type Protocol } from './protocols';
import { mergeWorkouts, mergeDeleted, readWorkouts, type Deleted, type Workout } from './workouts';
import type { Ctx } from './achievements';

export interface Settings {
  proto: string;
  vals: Record<string, Record<string, any>>;       // per protocol: your load, plus tweaks to the one in use (see personalVals)
  chips: Record<string, string>;                    // grip, fing, mat, prof, feel
  board?: string;
  boards: { list: string[]; def: string; custom: string[] };
  customProtos: Record<string, Protocol>;
  prefs: { sound: boolean; vib: boolean; icons: 'emoji' | 'flat'; pgrip: boolean; psetup: boolean; mode: 'dark' | 'light'; acc: string; nudges: boolean; warmup: boolean; ready?: number; pre?: number };
  panels: Record<string, boolean>;                  // remembered open/closed sections
  toursSeen: Record<string, boolean>;
  chart?: string;
  flags: Record<string, any>;                       // achievement event flags/counters
  savedAt?: number;                                 // ms timestamp of last change, newest copy wins
  owner?: string;                                   // user id the local copy belongs to
  iconsV?: number;                                  // settings migration marker
  /** Optional personal details. Private: stored with the user's private settings, never shown to others. */
  about?: { age?: number | null; heightCm?: number | null; location?: string; showLocation?: boolean };
  /** Load changes suggested from the last session's effort rating, per protocol (shown with an Undo). */
  suggest?: Record<string, { text: string; prev: { add: number; rem: number; lift: number; edge?: number } }>;
  /** Protocol to switch back to after a warm-up. */
  returnTo?: string;
  /** Saved workouts (queues of protocols), newest first. */
  workouts: Workout[];
  /** Hang page: a single protocol, or a saved workout. */
  hangMode?: 'single' | 'workout';
  /** Hang page: the workout picked in workout mode. */
  workoutSel?: string;
  /** Workouts and custom protocols deleted recently (id → ms), so the deletion syncs to other devices. */
  deleted?: Deleted;
}

export const DEFAULT_SETTINGS = (): Settings => ({
  proto: 'max', vals: {}, chips: {},
  boards: { list: [...BUILTIN_BOARDS], def: BUILTIN_BOARDS[0]!, custom: [] },
  customProtos: {}, workouts: [],
  prefs: { sound: true, vib: true, icons: 'flat', pgrip: true, psetup: true, mode: 'dark', acc: '#8fb3d1', nudges: true, warmup: true },
  panels: { extras: false }, toursSeen: {}, flags: {},
});

export const state = {
  store: null as unknown as Store & { ready(): Promise<void> },
  me: null as Profile | null,
  profiles: new Map<string, Profile>(),
  sessions: [] as Session[],          // everyone's sessions (small group, so we keep them all)
  priv: { bodyweightKg: null, settings: {} } as PrivateData,
  settings: DEFAULT_SETTINGS(),
  social: { heartsReceived: 0, commentsGiven: 0 },
  champions: [] as SeasonChampion[],
  challenges: [] as ChallengeRow[],
  /** True once the signed-in user's data has fully loaded; gates all settings writes. */
  loaded: false,
};

export async function initStore() {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined, key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (url && key) {
    const { SupabaseStore } = await import('./supabase-store');
    state.store = new SupabaseStore(url, key) as any;
  } else {
    state.store = new LocalStore() as any;
  }
  await state.store.ready();
}

const LS_KEY = 'bf.settings';
/** How far back other climbers' sessions are loaded at startup, and the window leaderboards use. */
export const RECENT_DAYS = 90;
/** Load profile, private settings and sessions after sign-in. */
export async function loadUserData() {
  const s = state.store, id = s.currentUserId()!;
  // Startup only loads everyone's recent sessions (leaderboards use the last RECENT_DAYS days)
  // plus my own full history (for my stats and achievements). Older sessions of others load on demand.
  // …and always back to the start of the current season, so season standings are complete.
  const since = new Date(Math.min(Date.now() - RECENT_DAYS * 864e5, +seasonOf(new Date()).start)).toISOString();
  const [profiles, priv, mine, recent, social, champions, challenges] = await Promise.all([s.listProfiles(), s.getPrivate(), s.listSessions({ userId: id }), s.listSessions({ sinceIso: since }), s.socialCounts(),
    s.seasonChampions().catch(() => [] as SeasonChampion[]), s.listChallenges().catch(() => [])]);
  const byId = new Map<string, Session>();
  for (const x of [...mine, ...recent]) byId.set(x.id, x);
  const sessions = [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  state.profiles = new Map(profiles.map(p => [p.id, p]));
  state.me = state.profiles.get(id) ?? null;
  state.priv = priv;
  let local: Partial<Settings> = {};
  try { local = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { /* storage blocked */ }
  const d = DEFAULT_SETTINGS(), remoteRaw = (priv.settings ?? {}) as Partial<Settings>;
  // Whichever copy was saved most recently wins (the local copy can be newer if the
  // page closed before the debounced upload finished). Ignore a local copy left by another user.
  const localOk = !local.owner || local.owner === id;
  const localNewer = localOk && (local.savedAt ?? 0) > (remoteRaw.savedAt ?? 0);
  const older = localNewer ? remoteRaw : localOk ? local : {}, newer = localNewer ? local : remoteRaw;
  const merged = { ...d, ...older, ...newer } as Settings;
  merged.prefs = { ...d.prefs, ...(older.prefs ?? {}), ...(newer.prefs ?? {}) };
  merged.boards = { ...d.boards, ...(newer.boards ?? older.boards ?? {}) };
  merged.panels = { ...d.panels, ...(older.panels ?? {}), ...(newer.panels ?? {}) };
  merged.owner = id;
  merged.about = { ...(older.about ?? {}), ...(newer.about ?? {}) };
  // Achievement flags and tour progress only ever get added, so keep what either copy has:
  // a flag earned on one phone isn't lost because another phone saved something later.
  merged.flags = { ...(older.flags ?? {}), ...(newer.flags ?? {}) };
  merged.toursSeen = { ...(older.toursSeen ?? {}), ...(newer.toursSeen ?? {}) };
  // Workouts and custom protocols merge one by one (see mergeWorkouts), so a device that hadn't seen
  // a new one can't wipe it just by saving its settings later.
  merged.deleted = mergeDeleted(older.deleted, newer.deleted);
  merged.workouts = mergeWorkouts(older.workouts, newer.workouts, merged.deleted);
  merged.customProtos = Object.fromEntries(Object.entries({ ...(older.customProtos ?? {}), ...(newer.customProtos ?? {}) }).filter(([k]) => merged.deleted![k] == null));
  merged.vals = { ...(older.vals ?? {}), ...(newer.vals ?? {}) };
  // the merge brought back something the newest copy was missing: upload the merged copy
  const restored = JSON.stringify(merged.workouts) !== JSON.stringify(readWorkouts(newer.workouts))
    || Object.keys(merged.customProtos).length !== Object.keys(newer.customProtos ?? {}).length;
  // One-time migration: flat icons became the default; earlier accounts saved "emoji".
  const migrate = (merged.iconsV ?? 0) < 1;
  if (migrate) { merged.prefs.icons = 'flat'; merged.iconsV = 1; }
  state.settings = merged;
  state.sessions = sessions;
  state.social = social;
  // Server-side champions cover all history; if that isn't set up yet, work out what we can locally.
  // Only seasons fully inside what we loaded can be worked out locally (older ones would be missing other climbers).
  state.champions = champions ?? championsFrom(sessions).filter(c => c.seasonStart >= since.slice(0, 10));
  state.challenges = challenges;
  state.loaded = true;
  if (localNewer || migrate || restored) saveSettings();
}

/** Re-fetch what other people change (profiles, recent sessions, challenges) without touching my
 *  settings. Sessions still waiting to upload from this phone are kept. Used by pull-to-refresh. */
export async function refreshShared() {
  const s = state.store, id = s.currentUserId(); if (!id) return;
  const since = new Date(Math.min(Date.now() - RECENT_DAYS * 864e5, +seasonOf(new Date()).start)).toISOString();
  const [profiles, mine, recent, social, challenges] = await Promise.all([s.listProfiles(), s.listSessions({ userId: id }), s.listSessions({ sinceIso: since }),
    s.socialCounts().catch(() => state.social), s.listChallenges().catch(() => state.challenges)]);
  const byId = new Map<string, Session>();
  for (const x of [...mine, ...recent]) byId.set(x.id, x);
  const pending = state.sessions.filter(x => x.pendingUpload && !byId.has(x.id));
  state.sessions = [...pending, ...[...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))];
  state.profiles = new Map(profiles.map(p => [p.id, p]));
  state.me = state.profiles.get(id) ?? state.me;
  state.social = social; state.challenges = challenges;
  document.dispatchEvent(new CustomEvent('bf:sessions-changed'));
}

let saveTimer: number | undefined;
/** Persist settings locally right away and to the backend shortly after.
 *  Does nothing until the user's real settings have loaded, so defaults can never overwrite them. */
export function saveSettings() {
  if (!state.loaded) return;
  state.settings.savedAt = Date.now();
  try { localStorage.setItem(LS_KEY, JSON.stringify(state.settings)); } catch { /* storage blocked */ }
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(flushSettings, 800);
}
/** Upload pending settings now (also used when the page is being hidden or closed). */
export async function flushSettings() {
  clearTimeout(saveTimer); saveTimer = undefined;
  if (!state.loaded || !state.store?.currentUserId()) return;
  try { await state.store.savePrivate({ settings: state.settings as any }); } catch { /* retried on next change */ }
}
addEventListener('pagehide', () => { if (saveTimer) flushSettings(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && saveTimer) flushSettings(); });

/** Built-in protocols plus the user's own. */
export const allProtos = (): Record<string, Protocol> => ({ ...PROTOCOLS, ...state.settings.customProtos });

export const mySessions = () => state.sessions.filter(s => s.userId === state.me?.id);
export const profileOf = (id: string) => state.profiles.get(id);

export function achievementCtx(sessions = mySessions()): Ctx {
  return {
    sessions, flags: state.settings.flags, hasAvatar: !!state.me?.avatarUrl,
    customBoards: state.settings.boards.custom.length, customProtocols: Object.keys(state.settings.customProtos).length,
    heartsReceived: state.social.heartsReceived, commentsGiven: state.social.commentsGiven,
    pointsTotal: sessions.reduce((a, s) => a + s.points, 0),
    seasonsWon: seasonsWon(state.me?.id),
  };
}

/** Number of seasons a climber has won (shared titles count). */
export const seasonsWon = (userId?: string) => userId ? new Set(state.champions.filter(c => c.userId === userId).map(c => c.seasonStart)).size : 0;
