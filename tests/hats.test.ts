// Hats on the birds: which bird wears which, the drawing, and the admin's switch for the whole crew.
import { describe, it, expect, beforeAll } from 'vitest';
import { HATS, hatOf, drawHat } from '../src/aviary/hats';
import { drawBird, restPose } from '../src/aviary/rig';
import { SPECIES } from '../src/aviary/species';
import { World } from '../src/aviary/sim';
import { SPECIES_ORDER, hatsOn, setHats, chooseBird } from '../src/lib/flock';

/** A stand-in 2D context (jsdom has no canvas) that remembers every colour it was asked to paint with. */
function recorder() {
  const fills: string[] = [], strokes: string[] = [];
  const noop = () => ({ addColorStop() {} });
  const c = new Proxy({} as Record<string | symbol, unknown>, {
    get: (t, k) => (k in t ? t[k] : noop),
    set: (t, k, v) => { if (k === 'fillStyle') fills.push(v); if (k === 'strokeStyle') strokes.push(v); t[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { c, fills, strokes };
}
beforeAll(() => { (globalThis as any).Path2D ??= class { moveTo() {} lineTo() {} quadraticCurveTo() {} bezierCurveTo() {} closePath() {} }; });

describe('which hat each bird wears', () => {
  it('gives a climber’s birds all different hats until there are more birds than hats, the same ones all week', () => {
    const mine = Array.from({ length: HATS.length }, (_, i) => hatOf('ada', i, 3));
    expect(new Set(mine).size).toBe(HATS.length);
    expect(hatOf('ada', HATS.length, 3)).toBe(mine[0]); // the 12th bird starts round again
    expect(Array.from({ length: 5 }, (_, i) => hatOf('ada', i, 3))).toEqual(mine.slice(0, 5)); // every time the page opens
  });
  it('shuffles them afresh each week, and differently for each climber', () => {
    const week = (uid: string, w: number) => Array.from({ length: HATS.length }, (_, i) => hatOf(uid, i, w)).join();
    expect(week('ada', 3)).not.toBe(week('ada', 4));
    expect(week('ada', 3)).not.toBe(week('bo', 3));
  });
  it('has eleven kinds: classic, sporty, party and Aussie', () => {
    expect([...HATS]).toEqual(['tophat', 'bowler', 'flatcap', 'beanie', 'cap', 'bucket', 'party', 'crown', 'fez', 'akubra', 'cork']);
  });
});

describe('drawing the hats', () => {
  it('draws every hat in the climber’s band colour', () => {
    for (const k of HATS) {
      const r = recorder();
      drawHat(r.c, k, 10, '#5aa9e6', false, 0, 1, 0.5);
      expect(r.fills, k).toContain('#5aa9e6');
    }
  });
  it('draws them flat in one colour for the silhouette on the button', () => {
    for (const k of HATS) {
      const r = recorder();
      drawHat(r.c, k, 10, '#eef2f6', true);
      expect(new Set(r.fills), k).toEqual(new Set(['#eef2f6']));
    }
  });
  it('puts a hat on a bird only when asked, on every species', () => {
    for (const id of SPECIES_ORDER) {
      const sp = SPECIES[id], bare = recorder(), hatted = recorder();
      drawBird(bare.c, sp, sp.look, restPose(sp), { band: '#3ddc84' });
      drawBird(hatted.c, sp, sp.look, restPose(sp), { band: '#3ddc84', hat: 'party', t: 1 });
      expect(bare.fills, id).not.toContain('#3ddc84'); // without one, the band colour is only on the leg
      expect(hatted.fills, id).toContain('#3ddc84');
    }
  });
  it('keeps the hat a bird was given, and the clearing starts with hats off', () => {
    const w = new World(); w.resize(400, 600);
    expect(w.hats).toBe(false);
    const b = w.add('galah', 'ada', '#ff5a4e', 'place', 'fez');
    expect(b.hat).toBe('fez');
    expect(HATS).toContain(w.add('galah', 'bo', '#f2c14e', 'place').hat); // one is picked if none is given
  });
});

describe('the admin’s hats switch', () => {
  it('turns the hats on for the whole crew, and remembers it on the phone', async () => {
    const { LocalStore } = await import('../src/lib/local-store');
    const { state, applyAppSettings } = await import('../src/lib/state');
    try {
      localStorage.clear(); setHats(false);
      const s = new LocalStore(); await s.ready();
      await s.signUp({ name: 'Ada', email: 'ada@example.test', password: 'pw-123456', inviteCode: 'bluies' });
      await s.saveAppSetting('hats', true);
      await s.saveAppSetting('bird', 'magpie');
      expect(await s.appSettings()).toEqual({ hats: true, bird: 'magpie' });
      applyAppSettings(await s.appSettings());
      expect(hatsOn()).toBe(true); expect(state.appSettings.hats).toBe(true);
      expect(localStorage.getItem('bf.hats')).toBe('1');
      await s.signUp({ name: 'Bo', email: 'bo@example.test', password: 'pw-123456', inviteCode: 'bluies' });
      await expect(s.saveAppSetting('hats', null)).rejects.toThrow(/admin/i); // only an admin can take them off
      applyAppSettings(null); // offline: keeps them on
      expect(hatsOn()).toBe(true);
      applyAppSettings({ bird: 'magpie' }); // the admin turned them off
      expect(hatsOn()).toBe(false); expect(localStorage.getItem('bf.hats')).toBe(null);
      expect(setHats('yes')).toBe(false); // only true turns them on
      expect(setHats(true)).toBe(true); expect(setHats(true)).toBe(false);
    } finally { setHats(false); chooseBird(null); }
  });
});
