import { $, esc, avatar, relTime, toast, confirmSheet, vibrate } from '../lib/ui';
import { ic, hydrateIcons } from '../lib/icons';
import { state, profileOf } from '../lib/state';
import type { FeedItem } from '../lib/types';
import { weeklyRecap } from '../lib/recap';

let items: FeedItem[] = [];
let filter: 'all' | 'me' | 'pb' = 'all';
let open = '';
const liking = new Set<string>();

export async function renderFeed(root: HTMLElement) {
  root.innerHTML = `<div class="chips g g3" id="feedF" style="margin-bottom:12px">
      <span class="chip ${filter === 'all' ? 'on' : ''}" data-f="all">${ic('globe')} Everyone</span><span class="chip ${filter === 'me' ? 'on' : ''}" data-f="me">${ic('users')} Me</span><span class="chip ${filter === 'pb' ? 'on' : ''}" data-f="pb">${ic('medal')} PBs</span></div>
    ${recapCard()}
    <div id="feed"><p class="sub center">Loading…</p></div>`;
  hydrateIcons(root);
  root.onclick = onClick;
  root.onkeydown = e => { if (e.key === 'Enter' && (e.target as HTMLElement).matches('.cmts input')) ((e.target as HTMLElement).nextElementSibling as HTMLElement).click(); };
  try { items = await state.store.feed(60); } catch (e: any) { $('#feed').innerHTML = `<p class="sub center">${esc(e.message)}</p>`; return; }
  if (focusId) { filter = 'all'; open = focusId; }
  draw();
  if (focusId) {
    const el = document.querySelector(`.post[data-id="${focusId}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'center' }); el?.classList.add('flash');
    focusId = '';
  }
}

/** Open the feed at a particular post (used by notifications). */
let focusId = '';
export const focusPost = (id: string) => { focusId = id; };

function recapCard() {
  const r = weeklyRecap(state.sessions), name = (id: string) => esc(state.profiles.get(id)?.name ?? 'Someone');
  const range = `${r.from.getDate()} ${r.from.toLocaleString('en-GB', { month: 'short' })} – ${r.to.getDate()} ${r.to.toLocaleString('en-GB', { month: 'short' })}`;
  if (!r.sessions) return `<div class="card recap"><div class="recap-hd">${ic('party')}<b>Last week</b><small>${range}</small></div>
    <p class="sub" style="margin:6px 0 0">A quiet week for the crew. ${r.thisWeek ? `${r.thisWeek} session${r.thisWeek > 1 ? 's' : ''} so far this week — keep it going!` : 'Be the first to hang this week 🧗'}</p></div>`;
  const mins = Math.round(r.tutS / 60);
  const pbLine = r.pbs.length ? r.pbs.slice(0, 3).map(p => `<b>${name(p.userId)}</b> set ${p.count} PB${p.count > 1 ? 's' : ''}`).join(', ') + (r.pbs.length > 3 ? ` and ${r.pbs.length - 3} more` : '') : '';
  return `<div class="card recap"><div class="recap-hd">${ic('party')}<b>Last week</b><small>${range}</small></div>
    <div class="recap-big">Crew logged <b>${r.sessions}</b> session${r.sessions > 1 ? 's' : ''}${mins ? ` · <b>${mins}</b> min on the board` : ''}</div>
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
  const me = state.me?.id;
  const xs = items.filter(x => filter === 'all' || (filter === 'me' && x.session.userId === me) || (filter === 'pb' && x.session.isPb));
  $('#feed').innerHTML = xs.map(({ session: s, likes, likedByMe, comments }) => {
    const p = profileOf(s.userId), mine = s.userId === me;
    return `<div class="card post" data-id="${s.id}">
      <div class="who" data-uid="${s.userId}">${avatar(p)}<span><b>${esc(p?.name ?? 'Climber')}${mine ? ' (you)' : ''}</b><small>${relTime(s.createdAt)}</small></span>${s.isPb ? `<span class="badge" style="margin-left:auto">${ic('medal')} PB</span>` : ''}</div>
      <div class="what">${esc(s.protocolName)}</div><div class="meta">${meta(s).map(m => `<span>${esc(m)}</span>`).join('')}</div>
      ${s.note ? `<div class="note">${esc(s.note)}</div>` : ''}
      <div class="acts"><button class="${likedByMe ? 'on' : ''}" data-like aria-label="Heart">${ic(likedByMe ? 'hearted' : 'heart')} ${likes}</button><button data-cm aria-label="Comments">${ic('comment')} ${comments.length}</button></div>
      <div class="cmts ${open === s.id ? '' : 'hide'}">${comments.map(c => {
        const cp = profileOf(c.userId), canDel = c.userId === me || state.me?.isAdmin;
        return `<div class="cmt"><b>${esc(cp?.name ?? 'Climber')}</b>${esc(c.body)}${canDel ? `<button class="cdel" data-cdel="${c.id}" aria-label="Delete comment">✕</button>` : ''}</div>`; }).join('')}
        <div class="addrow"><input class="tx" maxlength="500" placeholder="Say something nice…" aria-label="Write a comment"><button data-send aria-label="Send">➤</button></div></div>
    </div>`;
  }).join('') || `<p class="sub center">Nothing here yet — go hang! 🧗</p>`;
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
    try { await state.store.setLike(it.session.id, want); }
    catch (err: any) { it.likedByMe = !want; it.likes += want ? -1 : 1; draw(); toast(err.message ?? 'Couldn’t save that heart'); }
    finally { liking.delete(it.session.id); }
    return;
  }
  if (t.closest('[data-send]')) {
    const i = post.querySelector('.cmts input') as HTMLInputElement, btn = post.querySelector('[data-send]') as HTMLButtonElement, body = i.value.trim(); if (!body) return;
    i.disabled = btn.disabled = true;
    try {
      const c = await state.store.addComment(it.session.id, body);
      it.comments.push(c); if (it.session.userId !== state.me?.id) state.social.commentsGiven++; open = it.session.id; draw();
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
