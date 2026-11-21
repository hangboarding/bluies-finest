// App-wide state: the backend store, the signed-in user, cached data, and the
// user's private settings (synced to the backend, mirrored in localStorage).
import type { PrivateData, Profile, Session, Store } from './types';
import { LocalStore } from './local-store';
import { BUILTIN_BOARDS, type Protocol } from './protocols';
import type { Ctx } from './achievements';

export interface Settings {
  proto: string;
  vals: Record<string, Record<string, any>>;       // per-protocol overrides
  chips: Record<string, string>;                    // grip, fing, mat, prof, feel
  board?: string;
  boards: { list: string[]; def: string; custom: string[] };
  customProtos: Record<string, Protocol>;
  prefs: { sound: boolean; vib: boolean; icons: 'emoji' | 'flat'; pgrip: boolean; psetup: boolean; mode: 'dark' | 'light'; acc: string };
  panels: Record<string, boolean>;                  // remembered open/closed sections
  toursSeen: Record<string, boolean>;
  chart?: string;
  flags: Record<string, any>;                       // achievement event flags/counters
  savedAt?: number;                                 // ms timestamp of last change, newest copy wins
  owner?: string;                                   // user id the local copy belongs to
}

export const DEFAULT_SETTINGS = (): Settings => ({
  proto: 'max', vals: {}, chips: {},
  boards: { list: [...BUILTIN_BOARDS], def: BUILTIN_BOARDS[0]!, custom: [] },
  customProtos: {},
  prefs: { sound: true, vib: true, icons: 'emoji', pgrip: true, psetup: true, mode: 'dark', acc: '#3ddc84' },
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
/** Load profile, private settings and sessions after sign-in. */
export async function loadUserData() {
  const s = state.store, id = s.currentUserId()!;
  const [profiles, priv, sessions, social] = await Promise.all([s.listProfiles(), s.getPrivate(), s.listSessions(), s.socialCounts()]);
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
  if (localNewer) { state.settings = merged; flushSettings(); }
  state.settings = merged;
  state.sessions = sessions;
  state.social = social;
}

let saveTimer: number | undefined;
/** Persist settings locally right away and to the backend shortly after. */
export function saveSettings() {
  state.settings.savedAt = Date.now();
  try { localStorage.setItem(LS_KEY, JSON.stringify(state.settings)); } catch { /* storage blocked */ }
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(flushSettings, 800);
}
/** Upload settings now (also used when the page is being hidden or closed). */
export function flushSettings() {
  clearTimeout(saveTimer);
  if (state.store?.currentUserId()) return state.store.savePrivate({ settings: state.settings as any }).catch(() => { /* retried on next change */ });
}
addEventListener('pagehide', () => { if (saveTimer) flushSettings(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && saveTimer) flushSettings(); });

export const mySessions = () => state.sessions.filter(s => s.userId === state.me?.id);
export const profileOf = (id: string) => state.profiles.get(id);

export function achievementCtx(sessions = mySessions()): Ctx {
  return {
    sessions, flags: state.settings.flags, hasAvatar: !!state.me?.avatarUrl,
    customBoards: state.settings.boards.custom.length, customProtocols: Object.keys(state.settings.customProtos).length,
    heartsReceived: state.social.heartsReceived, commentsGiven: state.social.commentsGiven,
    pointsTotal: sessions.reduce((a, s) => a + s.points, 0),
  };
}
