import { $, esc, avatar, relTime, toast, confirmSheet, vibrate } from '../lib/ui';
import { ic, hydrateIcons } from '../lib/icons';
import { state, profileOf, refreshShared, shownName, protoLine, saveSettings } from '../lib/state';
import { refreshNotifs } from './notifs';
import type { FeedItem } from '../lib/types';
import { weeklyRecap } from '../lib/recap';
import { challengeCard, championBanner, maybeCelebrate } from './challenge-card';
import { checkUnlocks } from './unlocks';

let items: FeedItem[] = [];
let filter: 'all' | 'me' | 'pb' = 'all';
let open = '';
const liking = new Set<string>();

export async function renderFeed(root: HTMLElement) {
  feedRoot = root;
  root.innerHTML = `<div class="ptr" id="ptr" aria-hidden="true"><i class="ptr-sp"></i></div><div class="chips g g3" id="feedF" style="margin-bottom:12px">
      <span class="chip ${filter === 'all' ? 'on' : ''}" data-f="all" role="button" tabindex="0" aria-pressed="${filter === 'all'}">${ic('globe')} Everyone</span><span class="chip ${filter === 'me' ? 'on' : ''}" data-f="me" role="button" tabindex="0" aria-pressed="${filter === 'me'}">${ic('users')} Me</span><span class="chip ${filter === 'pb' ? 'on' : ''}" data-f="pb" role="button" tabindex="0" aria-pressed="${filter === 'pb'}">${ic('medal')} PBs</span></div>
    ${championBanner()}
    ${challengeCard()}
    ${recapCard()}
    <div id="feed"><p class="sub center">Loading…</p></div>`;
  hydrateIcons(root);
  maybeCelebrate(root);
  root.onclick = onClick;
  root.onkeydown = e => { if (e.key === 'Enter' && (e.target as HTMLElement).matches('.cmts input')) ((e.target as HTMLElement).nextElementSibling as HTMLElement).click(); };
  try { items = await state.store.feed(60); } catch (e: any) { $('#feed').innerHTML = `<p class="sub center">${esc(e.message)}</p>`; return; }
  if (focusId) { filter = 'all'; open = focusId; }
  draw();
  if (focusId) {
    const id = focusId; focusId = '';
    const el = document.querySelector(`.post[data-id="${CSS.escape(id)}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'center' }); el?.classList.add('flash');
  }
}

// ---------- pull to refresh ----------
let feedRoot: HTMLElement | null = null, pullY: number | null = null, pulled = 0, refreshing = false;
const PULL = 70; // how far to drag (px) before letting go refreshes
const feedVisible = () => !!feedRoot?.isConnected && !feedRoot.closest('.hide') && !document.querySelector('.modal');
/** dist = how far it's pulled; the spinner turns as you pull and spins while refreshing. */
function ptrShow(dist: number, spin = false, dragging = false) {
  const p = $('#ptr'); if (!p) return;
  p.style.height = `${dist}px`; p.classList.toggle('spin', spin); p.classList.toggle('drag', dragging);
  p.style.setProperty('--pull', String(Math.min(1, dist / PULL)));
}
export async function refreshFeed() {
  if (refreshing || !feedRoot) return;
  refreshing = true; ptrShow(48, true);
  try { await refreshShared(); refreshNotifs(); await renderFeed(feedRoot); }
  catch (e: any) { toast(e?.message ?? 'Couldn’t refresh. Check your connection.'); ptrShow(0); }
  finally { refreshing = false; }
}
addEventListener('touchstart', e => {
  pullY = feedVisible() && scrollY <= 0 && !refreshing && e.touches.length === 1 ? e.touches[0]!.clientY : null; pulled = 0;
}, { passive: true });
addEventListener('touchmove', e => {
  if (pullY == null) return;
  const dy = e.touches[0]!.clientY - pullY;
  if (dy <= 0 || scrollY > 0) { pulled = 0; ptrShow(0); return; }
  pulled = Math.min(110, dy * 0.5); // resistance, like the native gesture
  ptrShow(pulled, false, true);
}, { passive: true });
addEventListener('touchend', () => {
  if (pullY == null) return;
  pullY = null;
  if (pulled >= PULL) { vibrate(10); refreshFeed(); } else ptrShow(0);
  pulled = 0;
});

/** Open the feed at a particular post (used by notifications). */
let focusId = '';
export const focusPost = (id: string) => { focusId = id; };

function recapCard() {
  const r = weeklyRecap(state.sessions), name = (id: string) => esc(state.profiles.get(id)?.name ?? 'Someone');
  const range = `${r.from.getDate()} ${r.from.toLocaleString('en-GB', { month: 'short' })} – ${r.to.getDate()} ${r.to.toLocaleString('en-GB', { month: 'short' })}`;
  if (!r.sessions) return `<div class="card recap"><div class="recap-hd">${ic('party')}<b>Last week</b><small>${range}</small></div>
    <p class="sub" style="margin:6px 0 0">A quiet week. ${r.thisWeek ? `${r.thisWeek} session${r.thisWeek > 1 ? 's' : ''} so far this week. Keep it going!` : 'Be the first to hang this week 🧗'}</p></div>`;
  const mins = Math.round(r.tutS / 60);
  const pbLine = r.pbs.length ? r.pbs.slice(0, 3).map(p => `<b>${name(p.userId)}</b> set ${p.count} PB${p.count > 1 ? 's' : ''}`).join(', ') + (r.pbs.length > 3 ? ` and ${r.pbs.length - 3} more` : '') : '';
  return `<div class="card recap"><div class="recap-hd">${ic('party')}<b>Last week</b><small>${range}</small></div>
    <div class="recap-big">Everyone logged <b>${r.sessions}</b> session${r.sessions > 1 ? 's' : ''}${mins ? ` · <b>${mins}</b> min on the board` : ''}</div>
    <ul class="recap-list">
      ${pbLine ? `<li>${ic('medal')} ${pbLine}</li>` : ''}
      ${r.mostActive && r.climbers > 1 ? `<li>${ic('streak')} Most sessions: <b>${name(r.mostActive.userId)}</b> (${r.mostActive.count})</li>` : ''}
      ${r.topPoints ? `<li>${ic('award')} Top scorer: <b>${name(r.topPoints.userId)}</b> (${r.topPoints.points} pts)</li>` : ''}
      <li>${ic('users')} ${r.climbers} climber${r.climbers > 1 ? 's' : ''} trained${r.thisWeek ? ` · ${r.thisWeek} session${r.thisWeek > 1 ? 's' : ''} so far this week` : ''}</li>
    </ul></div>`;
}

function meta(s: FeedItem['session']) {
  const load = s.mode === 'lift' ? `lift ${s.liftKg}kg` : s.addedKg ? `+${s.addedKg}kg` : s.assistKg ? `−${s.assistKg}kg` : 'BW';
  const lr = s.hands === 'LR' ? (() => { const L = s.hangs.filter(h => h.hand === 'L').reduce((a, h) => a + h.held, 0), R = s.hangs.filter(h => h.hand === 'R').reduce((a, h) => a + h.held, 0); return `L ${L}s · R ${R}s`; })() : '';
  return [`${s.edgeMm}mm`, load, s.grip, `${s.fullHangs}/${s.totalHangs} full`, lr, s.rpe ? `RPE ${s.rpe}` : ''].filter(Boolean);
}

function draw() {
  // keep anything typed into comment boxes (a heart elsewhere redraws the whole feed)
  const drafts = new Map<string, string>(), focused = (document.activeElement as HTMLElement | null)?.closest?.('.post')?.getAttribute('data-id');
  document.querySelectorAll<HTMLInputElement>('#feed .post .cmts input').forEach(i => { const id = i.closest('.post')?.getAttribute('data-id'); if (id && i.value) drafts.set(id, i.value); });
  drawFeed();
  for (const [id, v] of drafts) { const i = document.querySelector<HTMLInputElement>(`#feed .post[data-id="${CSS.escape(id)}"] .cmts input`); if (i) i.value = v; }
  if (focused && document.activeElement === document.body) document.querySelector<HTMLInputElement>(`#feed .post[data-id="${CSS.escape(focused)}"] .cmts input`)?.focus({ preventScroll: true });
}
function drawFeed() {
  const me = state.me?.id;
  const xs = items.filter(x => filter === 'all' || (filter === 'me' && x.session.userId === me) || (filter === 'pb' && x.session.isPb));
  $('#feed').innerHTML = xs.map(({ session: s, likes, likedByMe, comments }) => {
    const p = profileOf(s.userId), mine = s.userId === me;
    return `<div class="card post" data-id="${s.id}">
      <div class="who" data-uid="${s.userId}">${avatar(p)}<span><b>${esc(p?.name ?? 'Climber')}${mine ? ' (you)' : ''}</b><small>${relTime(s.createdAt)}</small></span>${s.isPb ? `<span class="badge" style="margin-left:auto">${ic('medal')} PB</span>` : ''}</div>
      <div class="what">${esc(shownName(s))}${protoLine(s) ? `<small>${esc(protoLine(s))}</small>` : ''}</div><div class="meta">${meta(s).map(m => `<span>${esc(m)}</span>`).join('')}</div>
      ${s.note ? `<div class="note">${esc(s.note)}</div>` : ''}
      <div class="acts"><button class="${likedByMe ? 'on' : ''}" data-like aria-label="Heart, ${likes}" aria-pressed="${likedByMe}">${ic(likedByMe ? 'hearted' : 'heart')} ${likes}</button><button data-cm aria-label="Comments, ${comments.length}" aria-expanded="${open === s.id}">${ic('comment')} ${comments.length}</button></div>
      <div class="cmts ${open === s.id ? '' : 'hide'}">${comments.map(c => {
        const cp = profileOf(c.userId), canDel = c.userId === me || state.me?.isAdmin;
        return `<div class="cmt"><b>${esc(cp?.name ?? 'Climber')}</b>${esc(c.body)}${canDel ? `<button class="cdel" data-cdel="${c.id}" aria-label="Delete comment">✕</button>` : ''}</div>`; }).join('')}
        <div class="addrow"><input class="tx" maxlength="500" placeholder="Say something nice…" aria-label="Write a comment"><button data-send aria-label="Send">➤</button></div></div>
    </div>`;
  }).join('') || `<p class="sub center">Nothing here yet. Go hang! 🧗</p>`;
  hydrateIcons($('#feed'));
}

async function onClick(e: MouseEvent) {
  const t = e.target as HTMLElement;
  const f = t.closest('#feedF .chip') as HTMLElement | null;
  if (f) { filter = f.dataset.f as any; document.querySelectorAll('#feedF .chip').forEach(c => c.classList.toggle('on', c === f)); draw(); return; }
  const post = t.closest('.post') as HTMLElement | null; if (!post) return;
  const it = items.find(x => x.session.id === post.dataset.id)!;
  if (t.closest('[data-like]')) {
    if (liking.has(it.session.id)) return; // ignore double-taps while the last one is in flight
    liking.add(it.session.id);
    const want = !it.likedByMe;
    it.likedByMe = want; it.likes += want ? 1 : -1; if (want) vibrate(15); draw();
    try {
      await state.store.setLike(it.session.id, want);
      const F = state.settings.flags;
      if (want && it.session.userId === state.me?.id && !F.mirrorMirror) { F.mirrorMirror = true; saveSettings(); checkUnlocks(); } // Mirror Mirror
    }
    catch (err: any) { it.likedByMe = !want; it.likes += want ? -1 : 1; draw(); toast(err.message ?? 'Couldn’t save that heart'); }
    finally { liking.delete(it.session.id); }
    return;
  }
  if (t.closest('[data-send]')) {
    const i = post.querySelector('.cmts input') as HTMLInputElement, btn = post.querySelector('[data-send]') as HTMLButtonElement, body = i.value.trim(); if (!body) return;
    i.disabled = btn.disabled = true;
    try {
      const c = await state.store.addComment(it.session.id, body);
      it.comments.push(c); if (it.session.userId !== state.me?.id) { state.social.commentsGiven++; checkUnlocks(); } open = it.session.id; draw();
    } catch (err: any) { i.disabled = btn.disabled = false; toast(err.message ?? 'Couldn’t post that comment'); }
    return;
  }
  try {
    if (t.closest('[data-cm]')) {
      open = open === it.session.id ? '' : it.session.id; draw();
      if (open) (document.querySelector(`.post[data-id="${open}"] .cmts input`) as HTMLInputElement)?.focus();
    } else if (t.closest('[data-cdel]')) {
      if (!await confirmSheet('Delete comment?', 'This can’t be undone.', 'Delete')) return;
      const id = (t.closest('[data-cdel]') as HTMLElement).dataset.cdel!;
      await state.store.deleteComment(id); it.comments = it.comments.filter(c => c.id !== id); draw();
    }
  } catch (err: any) { toast(err.message ?? 'Something went wrong'); }
}
