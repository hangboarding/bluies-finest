import { describe, it, expect, beforeEach } from 'vitest';
import { speciesOfWeek, weekIndex, crewFlock, flockSize, newBirds, markSeen, flockEnds, SPECIES_ORDER, ROTATION, BANDS, chooseBird, chosenBird, rotationOf, weekNames } from '../src/lib/flock';
import { FACTS } from '../src/aviary/facts';
import type { Profile } from '../src/lib/types';
import { sessionAt } from './helpers';

const prof = (id: string, joined: string): Profile => ({ id, name: id.toUpperCase(), avatarUrl: null, isAdmin: false, createdAt: joined });
const profiles = new Map([prof('a', '2026-01-01T00:00:00Z'), prof('b', '2026-02-01T00:00:00Z'), prof('c', '2026-03-01T00:00:00Z')].map(p => [p.id, p]));
// Tuesday 24 Nov 2026: the currawongs' first week (Mon 23 – Sun 29 Nov)
const NOW = new Date(2026, 10, 24, 12);

describe('which bird it is this week', () => {
  it('starts with currawongs and changes every Monday, in order, with a week of all the birds, then round again', () => {
    expect(speciesOfWeek(new Date(2026, 10, 23, 0, 0))).toBe('currawong');
    expect(speciesOfWeek(new Date(2026, 10, 29, 23, 59))).toBe('currawong');
    expect(speciesOfWeek(new Date(2026, 10, 30, 0, 0))).toBe('galah');
    const seen = Array.from({ length: ROTATION.length + 1 }, (_, i) => speciesOfWeek(new Date(2026, 10, 25 + i * 7)));
    expect(seen).toEqual([...SPECIES_ORDER, 'all', 'currawong']);
    expect(speciesOfWeek(new Date(2027, 1, 10))).toBe('all'); // the week of 8 Feb 2027, after the black cockatoos
    expect(weekNames('all')).toEqual({ one: 'All the birds', many: 'Birds', sci: 'all 11 species together' });
    expect(SPECIES_ORDER).toEqual(['currawong', 'galah', 'kingparrot', 'cockatoo', 'rosella', 'magpie', 'raven', 'woodduck', 'crimsonrosella', 'wattlebird', 'blackcockatoo']);
  });
  it('counts weeks before the first one backwards', () => {
    expect(speciesOfWeek(new Date(2026, 10, 20))).toBe('all');
    expect(speciesOfWeek(new Date(2026, 10, 13))).toBe('blackcockatoo');
  });
  it('moves on exactly one week across a daylight-saving change', () => {
    expect(weekIndex(new Date(2027, 2, 29, 9)) - weekIndex(new Date(2027, 2, 22, 9))).toBe(1); // BST starts 28 Mar 2027
    expect(weekIndex(new Date(2027, 10, 1, 9)) - weekIndex(new Date(2027, 9, 25, 9))).toBe(1); // BST ends 31 Oct 2027
  });
  it('flies off at the start of next Monday', () => {
    expect(+flockEnds(NOW)).toBe(+new Date(2026, 10, 30));
  });
  it('shows the bird an admin picked every week, until they set it back to the rotation', () => {
    try {
      expect(chooseBird('galah')).toBe(true);
      expect(chosenBird()).toBe('galah');
      for (let i = 0; i < 4; i++) expect(speciesOfWeek(new Date(2026, 10, 25 + i * 7))).toBe('galah');
      expect(rotationOf(NOW)).toBe('currawong'); // the rotation carries on underneath
      expect(localStorage.getItem('bf.bird')).toBe('galah'); // remembered on the phone for next time
      expect(chooseBird('galah')).toBe(false); // nothing changed
      expect(chooseBird('all')).toBe(true); // all of them, every week
      expect(speciesOfWeek(new Date(2026, 11, 9))).toBe('all');
      expect(chooseBird('dodo')).toBe(true); // not one of ours: back to the rotation
      expect(speciesOfWeek(NOW)).toBe('currawong');
      chooseBird('magpie'); chooseBird(null);
      expect(chosenBird()).toBe(null); expect(speciesOfWeek(new Date(2026, 10, 30))).toBe('galah');
      expect(localStorage.getItem('bf.bird')).toBe(null);
    } finally { chooseBird(null); }
  });
  it('saves the pick for the whole crew, and only an admin can change it', async () => {
    const { LocalStore } = await import('../src/lib/local-store');
    const { state, applyAppSettings } = await import('../src/lib/state');
    try {
      localStorage.clear();
      const s = new LocalStore(); await s.ready();
      await expect(s.appSettings()).rejects.toThrow(/log in/i);
      // in demo mode the first account to sign up is the admin; the next isn't
      await s.signUp({ name: 'Ada', email: 'ada@example.test', password: 'pw-123456', inviteCode: 'bluies' });
      await s.saveAppSetting('bird', 'raven');
      expect(await s.appSettings()).toEqual({ bird: 'raven' });
      await s.signUp({ name: 'Bo', email: 'bo@example.test', password: 'pw-123456', inviteCode: 'bluies' });
      expect(await s.appSettings()).toEqual({ bird: 'raven' }); // everyone sees it
      await expect(s.saveAppSetting('bird', 'galah')).rejects.toThrow(/admin/i);
      await s.signIn('ada@example.test', 'pw-123456');
      await s.saveAppSetting('bird', null);
      expect(await s.appSettings()).toEqual({});
      applyAppSettings({ bird: 'woodduck' });
      expect(state.appSettings).toEqual({ bird: 'woodduck' }); expect(speciesOfWeek(NOW)).toBe('woodduck');
      applyAppSettings(null); // offline: keeps what it had
      expect(speciesOfWeek(NOW)).toBe('woodduck');
      applyAppSettings({}); // the admin set it back to Automatic
      expect(speciesOfWeek(NOW)).toBe('currawong');
    } finally { chooseBird(null); }
  });
});

describe('bird of the week', () => {
  it('has four short facts about every bird, none repeated', () => {
    const all = SPECIES_ORDER.flatMap(id => FACTS[id]);
    for (const id of SPECIES_ORDER) {
      expect(FACTS[id]).toHaveLength(4);
      for (const f of FACTS[id]) { expect(f.trim().length).toBeGreaterThan(20); expect(f.length).toBeLessThanOrEqual(110); expect(f).toMatch(/[.!]$/); }
    }
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('the crew flock', () => {
  const xs = [
    sessionAt(2026, 11, 22, 20, { userId: 'a', points: 500 }), // last week: doesn't count
    sessionAt(2026, 11, 23, 0, { userId: 'a', points: 40 }),
    sessionAt(2026, 11, 24, 9, { userId: 'a', points: 25 }),
    sessionAt(2026, 11, 24, 10, { userId: 'b', points: 29 }),
    sessionAt(2026, 11, 24, 11, { userId: 'c', points: 90, pendingUpload: true }), // still on the phone: counts
    sessionAt(2026, 11, 24, 11, { userId: 'ghost', points: 300 }), // not a member any more
  ];
  it('gives every climber a bird per 30 points this week', () => {
    const m = crewFlock(xs, profiles, NOW);
    expect(m.map(x => [x.userId, x.points, x.birds, x.toNext])).toEqual([['c', 90, 3, 30], ['a', 65, 2, 25], ['b', 29, 0, 1]]);
    expect(flockSize(m)).toBe(5);
  });
  it('gives each climber the same leg band every week, in the order they joined', () => {
    const m = crewFlock(xs, profiles, NOW);
    expect(m.find(x => x.userId === 'a')!.band).toBe(BANDS[0]);
    expect(m.find(x => x.userId === 'c')!.band).toBe(BANDS[2]);
  });
  it('is empty at the start of a new week', () => {
    expect(crewFlock(xs, profiles, new Date(2026, 10, 30, 8))).toEqual([]);
  });
});

describe('new birds since you last looked', () => {
  beforeEach(() => localStorage.clear());
  it('counts birds that arrived since the page was last opened, this week only', () => {
    const one = crewFlock([sessionAt(2026, 11, 24, 9, { userId: 'a', points: 60 })], profiles, NOW);
    expect(newBirds(one, NOW)).toBe(2);
    markSeen(one, NOW);
    expect(newBirds(one, NOW)).toBe(0);
    const more = crewFlock([sessionAt(2026, 11, 24, 9, { userId: 'a', points: 60 }), sessionAt(2026, 11, 25, 9, { userId: 'b', points: 31 })], profiles, NOW);
    expect(newBirds(more, NOW)).toBe(1);
    const nextWeek = new Date(2026, 10, 30, 9);
    expect(newBirds(crewFlock([sessionAt(2026, 11, 30, 8, { userId: 'a', points: 30 })], profiles, nextWeek), nextWeek)).toBe(1);
  });
});
