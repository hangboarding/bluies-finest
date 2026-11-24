// The crew's weekly flock: the bird button in the header opens a clearing where every 30 points anyone
// earns this week brings a bird. See lib/flock.ts for the counting and src/aviary/ for the birds.
import { $, esc, avatar, onSwipe, slideIn, toast } from '../lib/ui';
import { state, refreshShared } from '../lib/state';
import { crewFlock, flockSize, newBirds, seenBirds, markSeen, speciesOfWeek, weekIndex, SPECIES_NAMES, POINTS_PER_BIRD, type FlockMember, type SpeciesId } from '../lib/flock';
import { FACTS } from '../aviary/facts';
import { SPECIES } from '../aviary/species';
import { drawBird, restPose } from '../aviary/rig';
import { World } from '../aviary/sim';
import { paintSky, paintBack, paintForest, paintLand, paintCanopy, paintProps, skyAt, type Sprite, type Swayer } from '../aviary/scene';
import { drawWorld } from '../aviary/render';
import { birdSound, owlHoot, birdsMuted, setBirdsMuted } from '../aviary/sound';
import { unlockAudio, soundOn } from '../lib/timer';

const SPEAKER = '<path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z"/>';
const muteIcon = (muted: boolean) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SPEAKER}${muted ? '<path d="m22 9-6 6M16 9l6 6"/>' : '<path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.4 18.4a9 9 0 0 0 0-12.8"/>'}</svg>`;

/** At most this many birds on screen; the count still shows them all. */
const MAX_BIRDS = 120;
const labelOf = (id: SpeciesId) => `This week's ${SPECIES_NAMES[id].many.toLowerCase()}`;

export function flockBtnHtml() {
  return `<button class="flockbtn" id="flockBtn" aria-label="${labelOf(speciesOfWeek())}"><canvas width="64" height="64" aria-hidden="true"></canvas><i class="flock-dot hide"></i></button>`;
}

const icons = new Map<string, HTMLCanvasElement>();
/** The week's bird as a solid silhouette in `colour`, fitted to a 64×64 canvas. */
function silhouette(id: SpeciesId, colour: string): HTMLCanvasElement | null {
  const key = `${id}|${colour}`, hit = icons.get(key); if (hit) return hit;
  const big = document.createElement('canvas'); big.width = big.height = 240;
  const c = big.getContext('2d'); if (!c) return null;
  const sp = SPECIES[id];
  c.translate(150, 200); c.scale(-1.7, 1.7); // facing left, towards the app's name
  drawBird(c, sp, sp.look, restPose(sp), { sil: colour });
  const d = c.getImageData(0, 0, 240, 240).data;
  let x0 = 240, y0 = 240, x1 = 0, y1 = 0;
  for (let y = 0; y < 240; y++) for (let x = 0; x < 240; x++) if (d[(y * 240 + x) * 4 + 3]! > 30) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 <= x0) return null;
  const out = document.createElement('canvas'); out.width = out.height = 64;
  const s = Math.min(60 / (x1 - x0 + 1), 60 / (y1 - y0 + 1)), w = (x1 - x0 + 1) * s, h = (y1 - y0 + 1) * s;
  out.getContext('2d')!.drawImage(big, x0, y0, x1 - x0 + 1, y1 - y0 + 1, (64 - w) / 2, 62 - h, w, h);
  icons.set(key, out);
  return out;
}

/** Draw this week's bird on the header button, with a dot when new birds have arrived since you last looked. */
export function paintFlockButton() {
  const btn = $('#flockBtn'); if (!btn) return;
  const id = speciesOfWeek(), cv = btn.querySelector('canvas') as HTMLCanvasElement | null;
  try {
    const icon = silhouette(id, getComputedStyle(btn).color || '#eef2f6'), c = cv?.getContext('2d');
    if (icon && c) { c.clearRect(0, 0, 64, 64); c.drawImage(icon, 0, 0); }
  } catch { /* no canvas (tests) */ }
  const n = newBirds(crewFlock(state.sessions, state.profiles));
  btn.querySelector('.flock-dot')?.classList.toggle('hide', n === 0);
  btn.setAttribute('aria-label', labelOf(id) + (n ? `, ${n} new` : ''));
}

let isOpen = false;
export function openAviary() {
  if (isOpen) return;
  isOpen = true;
  unlockAudio();
  const devBird = import.meta.env.DEV ? new URLSearchParams(location.search).get('bird') : null; // ?bird=galah to try another week's bird
  const birdNow = () => (devBird && devBird in SPECIES_NAMES ? devBird as SpeciesId : speciesOfWeek());
  const id = birdNow(), names = SPECIES_NAMES[id], week = weekIndex();
  const opener = document.activeElement as HTMLElement | null;
  const el = document.createElement('div');
  el.className = 'aviary'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', labelOf(id));
  const facts = FACTS[id];
  el.innerHTML = `
    <div class="av-head">
      <div class="av-top">
        <button class="av-back" aria-label="Back"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="m15 18-6-6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <div class="av-tt"><b>Bird of the week</b><span>${esc(names.one)} <i>${esc(names.sci)}</i></span></div>
        <button class="av-mute" id="avMute"></button>
      </div>
      <div class="av-facts" role="group" aria-roledescription="carousel" aria-label="About the ${esc(names.one.toLowerCase())}: tap or swipe for more" tabindex="0">
        <div class="av-fact-list">${facts.map((f, i) => `<p class="${i ? '' : 'on'}"${i ? ' aria-hidden="true"' : ''}>${esc(f)}</p>`).join('')}</div>
      </div>
    </div>
    <div class="av-stage"><canvas role="img" aria-label="${esc(names.many)} in a Blue Mountains clearing"></canvas><div class="av-msg hide" id="avMsg"></div><div class="av-new hide" id="avNew"></div></div>
    <div class="av-foot"><div class="av-legend" id="avLegend"></div><p class="av-hint">Tap the ground to throw some seed, or a bird to startle it.</p></div>`;
  document.body.append(el);
  history.pushState({ aviary: 1 }, '');

  // ---- the facts: one at a time, moving on slowly. Tap (or swipe left) for the next, swipe right for the one before. ----
  let fact = 0, swiped = 0;
  const FACT_MS = 7000;
  let factT = setInterval(() => showFact(fact + 1), FACT_MS);
  const showFact = (i: number, by?: 'left' | 'right') => {
    fact = (i + facts.length) % facts.length;
    el.querySelectorAll('.av-fact-list p').forEach((p, j) => { p.classList.toggle('on', j === fact); p.setAttribute('aria-hidden', String(j !== fact)); });
    if (by) slideIn($('.av-fact-list', el), by);
    clearInterval(factT); factT = setInterval(() => showFact(fact + 1), FACT_MS); // a fresh 7 seconds to read it
  };
  const factsEl = $('.av-facts', el);
  onSwipe(factsEl, dir => { swiped = Date.now(); showFact(fact + (dir === 'left' ? 1 : -1), dir); });
  factsEl.addEventListener('click', () => { if (Date.now() - swiped > 400) showFact(fact + 1); }); // a mouse drag also ends in a click
  factsEl.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') showFact(fact - 1);
    else if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') showFact(fact + 1);
    else return;
    e.preventDefault();
  });

  const stage = $('.av-stage', el), cv = $('canvas', stage) as HTMLCanvasElement, ctx = cv.getContext('2d');
  const sky = document.createElement('canvas'), far = document.createElement('canvas'), land = document.createElement('canvas'), canopy = document.createElement('canvas');
  let sprites: (Sprite | null)[] = [], forest: Swayer[] = [], leaves: Swayer[] = [];
  const world = new World();
  let dpr = 1, hourPainted = -1, light = 1, raf = 0, last = performance.now();
  world.onSound = (b, k) => birdSound(b.sp.id, k, (b.x / world.w) * 1.4 - 0.7, 0.45 + 0.55 * Math.min(1, Math.max(0, (b.y - world.hor) / world.gh)));
  world.onOwl = x => owlHoot((x / world.w) * 1.4 - 0.7, 0.8);
  world.onFly = (k, x) => { if (k !== 'bat') birdSound(k, 'song', (x / world.w) * 1.4 - 0.7, 0.3); }; // a flock calling as it passes over
  // while developing: the world, and how long each frame's step and drawing take (ms, summed), in the console
  const probe = import.meta.env.DEV ? { world, step: 0, draw: 0, frames: 0 } : null;
  if (probe) (window as unknown as { __aviary: typeof probe }).__aviary = probe;

  // the real time of day; while developing, ?hour=22 (say) shows another time
  const fakeHour = import.meta.env.DEV ? new URLSearchParams(location.search).get('hour') : null;
  const hourNow = () => { if (fakeHour) return +fakeHour; const d = new Date(); return d.getHours() + d.getMinutes() / 60; };
  const paint = () => {
    const h = hourNow(); hourPainted = h; const s = skyAt(h); light = s.light; world.night = light < 0.25; world.hour = h;
    // each layer only as tall as what's in it: the sky and the far distance stop at the horizon, the crowns near the top
    const layer = (cvx: HTMLCanvasElement, tall: number) => {
      cvx.width = Math.round(world.w * dpr); cvx.height = Math.round(Math.min(world.h, tall) * dpr);
      const c = cvx.getContext('2d'); if (c) { c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, world.w, world.h); }
      return c;
    };
    let c = layer(sky, world.hor + 10); if (c) paintSky(c, world, h);
    c = layer(far, world.hor + 10); if (c) paintBack(c, world, h);
    c = layer(land, world.h); if (c) paintLand(c, world, h);
    c = layer(canopy, world.h * 0.26); leaves = c ? paintCanopy(c, world, dpr) : [];
    forest = paintForest(world, h, dpr);
    sprites = paintProps(world, dpr);
  };
  const fit = () => {
    const w = Math.max(200, stage.clientWidth), h = Math.max(240, stage.clientHeight);
    if (w === world.w && h === world.h && cv.width) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    world.resize(w, h); paint();
  };
  fit();

  // ---- birds: one per 30 points, per climber ----
  let members: FlockMember[] = [];
  const pending = (uid: string) => world.queue.filter(q => q.uid === uid).length;
  const sync = (first: boolean) => {
    members = crewFlock(state.sessions, state.profiles);
    const seen = first ? seenBirds() : {};
    let budget = MAX_BIRDS, delay = first ? 0.7 : 0.2, arriving = 0;
    for (const m of members) {
      const want = Math.min(m.birds, budget), have = world.count(m.userId) + pending(m.userId); budget -= want;
      if (want > have) {
        let place = first ? Math.min(seen[m.userId] ?? 0, want) : 0;
        for (let i = have; i < want; i++) {
          if (place-- > 0) { world.add(id, m.userId, m.band, 'place'); continue; }
          world.queue.push({ at: world.t + delay, uid: m.userId, run: () => world.add(id, m.userId, m.band, 'arrive') });
          delay += 0.5 + Math.random() * 0.8; arriving++;
        }
      } else if (want < have) {
        const drop = Math.min(pending(m.userId), have - want);
        for (let i = 0; i < drop; i++) { const q = world.queue.findIndex(x => x.uid === m.userId); if (q >= 0) world.queue.splice(q, 1); }
        world.remove(m.userId, have - want - drop);
      }
    }
    for (const uid of new Set(world.birds.map(b => b.uid))) if (!members.some(m => m.userId === uid)) world.remove(uid, world.count(uid));
    markSeen(members);
    const total = flockSize(members);
    const msg = $('#avMsg', el);
    msg.classList.toggle('hide', total > 0);
    msg.textContent = `No ${names.many.toLowerCase()} yet this week. Every ${POINTS_PER_BIRD} points anyone earns brings one in.`;
    if (arriving && total) { const n = $('#avNew', el); n.textContent = `+${arriving} new since you last looked`; n.classList.remove('hide'); n.style.animation = 'none'; void n.offsetWidth; n.style.animation = ''; }
    legend();
  };
  const legend = () => {
    const me = state.me?.id;
    $('#avLegend', el).innerHTML = members.map(m => {
      const p = state.profiles.get(m.userId);
      return `<button class="av-who${m.userId === me ? ' me' : ''}" data-who="${esc(m.userId)}" style="--band:${m.band}">${avatar(p)}<span><b>${esc(p?.name ?? 'Someone')}</b><small>${m.birds} ${m.birds === 1 ? 'bird' : 'birds'} · ${m.toNext} ${m.toNext === 1 ? 'pt' : 'pts'} to the next</small></span></button>`;
    }).join('') || '<p class="sub" style="margin:0">Nobody has trained yet this week.</p>';
  };
  sync(true);
  if (navigator.onLine) refreshShared().catch(() => {}); // pick up the crew's latest sessions; bf:sessions-changed re-syncs

  // ---- the loop ----
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t0 = probe ? performance.now() : 0;
    world.step(dt);
    const t1 = probe ? performance.now() : 0;
    if (ctx) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawWorld(ctx, world, { sky, back: far, land, canopy, props: sprites, forest, leaves, dpr }, light); }
    if (probe) { probe.step += t1 - t0; probe.draw += performance.now() - t1; probe.frames++; }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  // ---- input and housekeeping ----
  cv.addEventListener('pointerdown', e => { const r = cv.getBoundingClientRect(); world.tap(e.clientX - r.left, e.clientY - r.top); });
  $('#avLegend', el).addEventListener('click', e => { const b = (e.target as HTMLElement).closest('[data-who]') as HTMLElement | null; if (b) world.highlight(b.dataset.who!); });
  const ro = new ResizeObserver(() => fit()); ro.observe(stage);
  const onChange = () => { if (birdNow() !== id) { close(); openAviary(); } else sync(false); }; // a refresh may bring an admin's new pick
  document.addEventListener('bf:sessions-changed', onChange);
  const tick = setInterval(() => {
    if (weekIndex() !== week || birdNow() !== id) { close(); openAviary(); return; } // a new week, or an admin picked another bird: a new flock
    if (Math.abs(hourNow() - hourPainted) > 0.1) paint();
  }, 30e3);
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.modal')) back(); };
  addEventListener('keydown', onKey);
  const onPop = () => close();
  addEventListener('popstate', onPop);
  const back = () => { if (history.state?.aviary) history.back(); else close(); };
  $('.av-back', el).addEventListener('click', back);
  // the mute button: just the birds and animals (the app's Sound setting still rules everything)
  const muteBtn = $('#avMute', el);
  const paintMute = () => { const off = birdsMuted || !soundOn; muteBtn.innerHTML = muteIcon(off); muteBtn.setAttribute('aria-label', off ? 'Unmute the birds' : 'Mute the birds'); muteBtn.setAttribute('aria-pressed', String(off)); };
  paintMute();
  muteBtn.addEventListener('click', () => {
    if (!soundOn) { toast('Sound is off in Profile. Turn it on there to hear the birds.'); return; }
    setBirdsMuted(!birdsMuted); paintMute();
    if (!birdsMuted) { unlockAudio(); const b = world.birds.find(x => !x.leaving && x.alt < 1 && x.perch < 0); if (b) world.go(b, 'call'); } // someone sings to say hello
  });
  function close() {
    if (!isOpen) return;
    isOpen = false;
    cancelAnimationFrame(raf); ro.disconnect(); clearInterval(tick); clearInterval(factT);
    removeEventListener('keydown', onKey); removeEventListener('popstate', onPop); document.removeEventListener('bf:sessions-changed', onChange);
    el.remove(); paintFlockButton();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  }
  ($('.av-back', el) as HTMLElement).focus({ preventScroll: true });
}
