// Activity-page cards: the crew challenge progress bar, and a banner announcing the
// latest season champion for the first two weeks of a new season.
import { esc } from '../lib/ui';
import { ic } from '../lib/icons';
import { state, saveSettings } from '../lib/state';
import { activeChallenge, progress, daysLeftIn, METRICS, type Challenge } from '../lib/challenges';
import { seasonOf, seasonNameFromStart } from '../lib/seasons';
import { confetti } from '../lib/confetti';

export function challengeCard(): string {
  const c: Challenge = activeChallenge(state.challenges as Challenge[], state.sessions);
  const p = progress(c, state.sessions), m = METRICS[c.metric], left = daysLeftIn(c);
  const name = (id: string) => esc(state.profiles.get(id)?.name ?? 'Someone');
  const top = p.top.slice(0, 3).map(t => `<b>${name(t.userId)}</b> ${t.v}`).join(' · ');
  return `<div class="card chal ${p.done ? 'done' : ''}" id="chalCard" data-cid="${esc(c.id)}" data-done="${p.done ? 1 : 0}">
    <div class="chal-hd">${ic('ticket')}<b>Crew challenge</b><small>${left ? `${left + 1} days left` : 'Last day!'}</small></div>
    <div class="chal-title">${esc(c.title)}</div>
    <div class="chal-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${c.target}" aria-valuenow="${p.total}"><i style="width:${p.pct}%"></i></div>
    <div class="chal-nums"><span><b>${p.total.toLocaleString()}</b> / ${c.target.toLocaleString()} ${m.unit}</span><span>${p.pct}%</span></div>
    ${p.done ? `<div class="chal-done">${ic('party')} Challenge smashed — nice work, crew!</div>` : ''}
    ${top && c.metric !== 'climbers' ? `<div class="chal-top">Top contributors: ${top}</div>` : ''}
    ${c.auto ? '<div class="chal-top">Automatic monthly challenge — admins can set custom ones in Admin tools.</div>' : ''}
  </div>`;
}

/** Celebrate once per challenge, the first time someone sees it completed. */
export function maybeCelebrate(root: HTMLElement) {
  const el = root.querySelector('#chalCard') as HTMLElement | null; if (!el || el.dataset.done !== '1') return;
  const seen = (state.settings.flags.chalSeen ??= {}) as Record<string, boolean>;
  if (seen[el.dataset.cid!]) return;
  seen[el.dataset.cid!] = true; saveSettings(); setTimeout(confetti, 300);
}

/** "Spring 2026 champion: Mika" for the first 14 days of the next season. */
export function championBanner(): string {
  const latest = state.champions[0]; if (!latest) return '';
  const cur = seasonOf(new Date());
  if (Date.now() - +cur.start > 14 * 864e5) return '';
  const prevStart = seasonOf(new Date(+cur.start - 864e5)).key + '-01';
  if (latest.seasonStart !== prevStart) return '';
  const winners = state.champions.filter(c => c.seasonStart === prevStart);
  const names = winners.map(w => `<b data-uid="${w.userId}">${esc(state.profiles.get(w.userId)?.name ?? 'Someone')}</b>`).join(' & ');
  const meWon = winners.some(w => w.userId === state.me?.id);
  return `<div class="card recap champ-banner"><div class="recap-hd">${ic('crown')}<b>${seasonNameFromStart(prevStart)} champion${winners.length > 1 ? 's' : ''}</b></div>
    <div class="recap-big">${meWon ? 'That’s you! 👑 ' : ''}${names} won the season with <b>${winners[0]!.points.toLocaleString()}</b> points.</div>
    <p class="sub" style="margin:0">${cur.name} has started — everyone’s back to zero.</p></div>`;
}
