// When a session ends, the climber's birds for the week come out along the top of the tab bar, then fly about the
// finish screen pecking at things until you leave it (the birds themselves are in aviary/parade.ts). This picks
// which birds they are, finds things on the page for them to stand on, and runs it.
import { state } from '../lib/state';
import { crewFlock, speciesOfWeek, weekIndex, hatsOn, SPECIES_ORDER, type SpeciesId } from '../lib/flock';
import { SPECIES, lookOf } from '../aviary/species';
import { hatOf } from '../aviary/hats';
import { Parade, PARADE_MAX, type Marcher, type Perch } from '../aviary/parade';
import type { Session } from '../lib/types';

/** The signed-in climber's birds this week, counting `added`: sessions just finished and not saved yet. The ones
 *  they bring go first, then the rest, at most PARADE_MAX. Each looks as it does in the clearing: this week's
 *  species (a mix in the all-birds week), the climber's band, and the same hat all week when hats are on. */
export function marchers(added: readonly { points: number; createdAt: string }[], now = new Date()): Marcher[] {
  const me = state.me?.id; if (!me) return [];
  const mine = (xs: readonly Session[]) => crewFlock(xs, state.profiles, now).find(m => m.userId === me);
  const extra = added.map((s, j) => ({ ...s, id: `parade${j}`, userId: me }) as unknown as Session);
  const m = mine([...extra, ...state.sessions]); if (!m?.birds) return [];
  const before = Math.min(m.birds, mine(state.sessions)?.birds ?? 0), week = weekIndex(now), bird = speciesOfWeek(now), hats = hatsOn();
  const order = [...Array.from({ length: m.birds - before }, (_, j) => before + j), ...Array.from({ length: before }, (_, j) => j)];
  return order.slice(0, PARADE_MAX).map(i => {
    const id: SpeciesId = bird === 'all' ? SPECIES_ORDER[(i + week) % SPECIES_ORDER.length]! : bird, sp = SPECIES[id];
    const b: Marcher = { sp, lk: lookOf(sp, (i * 7 + week) % 20 < 9), band: m.band, fresh: i >= before };
    if (hats) b.hat = hatOf(me, i, week);
    return b;
  });
}

/** Things on the finish screen to stand on, in the canvas's terms (the window's, above the tab bar `h` down): the
 *  mountain's two summits, the tops of the headline's letters and the points, the stat boxes, the cards, the note
 *  box and the Save button. Null when the finish screen isn't showing: you've saved, or gone somewhere else. */
export function finishPerches(h: number): Perch[] | null {
  const v = document.getElementById('v-done');
  if (!v || !v.getClientRects().length) return null;
  const top = (document.querySelector('header')?.getBoundingClientRect().bottom ?? 0) + 44, bottom = h - 50; // clear of the header and the bar
  const out: Perch[] = [];
  const add = (id: string, x0: number, x1: number, y: number) => { if (y > top && y < bottom && x1 >= x0) out.push({ id, x0, x1, y }); };
  const edge = (id: string, el: Element | null, inset: number) => {
    const r = el?.getBoundingClientRect(); if (r?.width) add(id, r.left + inset, r.right - inset, r.top);
  };
  const text = (id: string, el: Element | null) => { // along the tops of the letters, line by line
    if (!el) return;
    const range = document.createRange(); range.selectNodeContents(el);
    Array.from(range.getClientRects()).forEach((r, j) => { if (r.width > 20) add(`${id}${j}`, r.left + 4, r.right - 4, r.top + r.height * 0.2); });
  };
  const ic = v.querySelector('.hero-ic svg')?.getBoundingClientRect();
  if (ic?.width) { // the mountain icon's peaks, at (8, 3) and (17, 6) of 24
    add('peak0', ic.left + ic.width / 3, ic.left + ic.width / 3, ic.top + ic.height * 0.125 - 2);
    add('peak1', ic.left + ic.width * 0.708, ic.left + ic.width * 0.708, ic.top + ic.height * 0.25 - 2);
  }
  text('cheer', v.querySelector('#cheer'));
  text('pts', v.querySelector('#sPts'));
  v.querySelectorAll('.stat').forEach((el, j) => edge(`stat${j}`, el, 12));
  v.querySelectorAll(':scope > .card').forEach((el, j) => edge(`card${j}`, el, 22));
  edge('note', v.querySelector('#note'), 16);
  edge('save', v.querySelector('#saveSess'), 18);
  return out;
}

let running: (() => void) | null = null;
/** Start the parade for a session (or a workout's sessions) just finished. Nothing comes out for anyone who'd
 *  rather not see motion, or who has no birds yet this week. */
export function parade(added: readonly { points: number; createdAt: string }[]) {
  running?.();
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const birds = marchers(added); if (!birds.length) return;
  const cv = document.createElement('canvas'), c = cv.getContext('2d'); if (!c) return;
  cv.className = 'parade'; cv.setAttribute('aria-hidden', 'true');
  document.body.append(cv);
  const p = new Parade(birds, innerWidth, innerHeight), halo = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim();
  let dpr = 1;
  const fit = () => { // the whole window down to the top of the tab bar (or the bottom of the screen without one)
    const r = document.getElementById('tabs')?.getBoundingClientRect();
    p.w = innerWidth; p.h = Math.round(r && r.height ? r.top : innerHeight);
    dpr = Math.min(2, devicePixelRatio || 1); cv.style.height = p.h + 'px';
    cv.width = Math.round(p.w * dpr); cv.height = Math.round(p.h * dpr);
  };
  fit();
  let raf = 0, last = performance.now();
  const frame = (now: number) => {
    p.step(Math.min(0.05, (now - last) / 1000), finishPerches(p.h)); last = now;
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, p.w, p.h);
    if (p.done) { stop(); return; }
    p.draw(c, halo);
    raf = requestAnimationFrame(frame);
  };
  const stop = () => { cancelAnimationFrame(raf); removeEventListener('resize', fit); cv.remove(); if (running === stop) running = null; };
  addEventListener('resize', fit);
  raf = requestAnimationFrame(frame);
  running = stop;
  if (import.meta.env.DEV) (window as unknown as { __parade: Parade }).__parade = p; // to step through while developing
}
