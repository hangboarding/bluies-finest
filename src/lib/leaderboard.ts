// One ranking used everywhere (Ranks page, my Stats, climber profiles), so they never disagree.
import { CATEGORIES, type Category } from './scoring';
import { state, RECENT_DAYS } from './state';
import { seasonOf } from './seasons';
import type { Profile, Session } from './types';

export interface RankRow { p: Profile; v: number; place: number }

/** Sorted rows for a category. Everyone is measured on the same window (my own older history is
 *  loaded too, but mustn't count), and equal values share a place (1, 2, 2, 4). */
export function rankRows(c: Category = CATEGORIES[0]!, now = new Date()): RankRow[] {
  const cutoff = Math.min(+now - RECENT_DAYS * 864e5, +seasonOf(now).start);
  const pool = state.sessions.filter(s => +new Date(s.createdAt) >= cutoff && !s.pendingUpload);
  const by = new Map<string, Session[]>();
  for (const s of pool) (by.get(s.userId) ?? by.set(s.userId, []).get(s.userId)!).push(s);
  const rows = [...state.profiles.values()].map(p => ({ p, v: c.value(by.get(p.id) ?? [], pool, now) }))
    .filter((r): r is { p: Profile; v: number } => r.v != null && Number.isFinite(r.v) && ((c.id !== 'overall' && c.id !== 'season') || (by.get(r.p.id)?.length ?? 0) > 0))
    .sort((a, b) => (c.lower ? a.v - b.v : b.v - a.v) || a.p.name.localeCompare(b.p.name));
  return rows.map((r, i, all) => ({ ...r, place: i > 0 && all[i - 1]!.v === r.v ? 0 : i + 1 }))
    .map((r, i, all) => { if (!r.place) { let j = i; while (!all[j]!.place) j--; r.place = all[j]!.place; } return r; });
}

/** "#3", "#2=" for a shared place, or "–" when not on the board. */
export function placeOf(userId: string | undefined, c: Category = CATEGORIES[0]!): string {
  const rows = rankRows(c), r = rows.find(x => x.p.id === userId);
  if (!r) return '–';
  return `#${r.place}${rows.filter(x => x.place === r.place).length > 1 ? '=' : ''}`;
}
