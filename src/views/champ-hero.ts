// The gold "#1 overall" hero: shared by the leader's climber profile and the Ranks page card
// that only the leader sees.
import { avatar } from '../lib/ui';
import { ic } from '../lib/icons';
import { state, seasonsWon } from '../lib/state';
import { placeOf } from '../lib/leaderboard';
import { crownSvg } from '../lib/crown';

/** #1 on the Overall board (a shared #1 counts). */
export const isTopOverall = (uid: string) => /^#1=?$/.test(placeOf(uid));

export const sparks = (n = 16) => `<div class="champ-sparks" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<i style="--x:${(i * 37 + 11) % 100}%;--d:${(i * 0.37) % 4}s;--s:${0.6 + ((i * 7) % 5) / 6}"></i>`).join('')}</div>`;

/** Ranks page card, only for the signed-in climber and only while they're #1 overall. */
export function myChampCard(): string {
  const me = state.me; if (!me || !isTopOverall(me.id)) return '';
  return `<button type="button" class="card champ-home" data-uid="${me.id}" aria-label="You're number one overall. Open your profile">
    <div class="champ-hero">
      <div class="champ-rays" aria-hidden="true"></div>${sparks(12)}
      <div class="champ-crown">${crownSvg(me.id, seasonsWon(me.id))}</div>
      <div class="champ-av">${avatar(me, 'cav')}</div>
      <h2 class="champ-name">You’re #1</h2>
      <p class="champ-ribbon">${ic('tabRanks')} Overall</p>
    </div>
  </button>`;
}
