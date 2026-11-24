// The Ranks leaderboard: one card with the podium, who rules the board, the top 10 as bars and the gap to the next
// place; every board for this week, month, season or overall, moving through them by itself; and the boards with
// their own window (Weekly streak, Most improved) in a card of their own.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { session } from './helpers';

vi.mock('../src/main', () => ({ go: vi.fn(async () => true), ACCENTS: ['#8fb3d1'], applyTheme() {}, refreshHeader() {}, rerender: async () => {} }));

let S: typeof import('../src/lib/state');
let reduce = false;
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const sec = (n: number) => vi.advanceTimersByTime(n * 1000);
const period = () => $('.t10dot.on')?.dataset.spin;
const names = () => [...document.querySelectorAll('#t10 .t10r[data-uid] .t10n')].map(x => x.textContent);
const pick = (id: string) => { const s = $<HTMLSelectElement>('#rkBoard'); s.value = id; s.dispatchEvent(new Event('change')); };

async function openRanks() {
  // the Hang page is in the document too, with its own board picker (#board, for hangboards)
  document.body.innerHTML = '<div id="view-hang" class="hide"><select id="board"><option>Beastmaker 1000</option></select></div><div id="view-ranks"></div>';
  vi.resetModules();
  S = await import('../src/lib/state');
  const p = (id: string, name: string) => ({ id, name, avatarUrl: null, isAdmin: false, createdAt: '2026-01-01T00:00:00Z' });
  S.state.store = { kind: 'local', currentUserId: () => 'u1', savePrivate: async () => {} } as any;
  S.state.me = p('u1', 'Tess');
  S.state.profiles = new Map([['u1', S.state.me], ['u2', p('u2', 'Ann')], ['u3', p('u3', 'Bo')]]);
  S.state.priv = { bodyweightKg: 70, settings: {} };
  const ago = (days: number) => new Date(Date.now() - days * 864e5).toISOString();
  // this week Ann leads; over the month Bo's big session from 10 days ago puts him first
  S.state.sessions = [
    session({ id: 'a', userId: 'u2', createdAt: ago(0.1), points: 100, tutS: 120 }),
    session({ id: 't', userId: 'u1', createdAt: ago(0.1), points: 50, tutS: 60 }),
    session({ id: 'b', userId: 'u3', createdAt: ago(10), points: 300, tutS: 400 }),
  ];
  S.state.champions = []; S.state.challenges = [];
  S.state.settings = S.DEFAULT_SETTINGS();
  S.state.loaded = true;
  const ranks = await import('../src/views/ranks');
  ranks.renderRanks($('#view-ranks'));
  return ranks;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(new Date('2026-11-23T10:00:00Z'));
  reduce = false;
  window.matchMedia = ((q: string) => ({ matches: q.includes('reduce') ? reduce : false, media: q, addEventListener() {}, removeEventListener() {} })) as any;
  window.scrollTo = (() => {}) as any;
  localStorage.clear();
  await openRanks();
});
afterEach(() => { vi.useRealTimers(); });

describe('one leaderboard card', () => {
  it('has the podium, who rules it, the top 10 as bars and the gap to the next place, all for one board', async () => {
    expect(document.querySelectorAll('.t10card')).toHaveLength(1);
    expect(document.querySelectorAll('#view-ranks select')).toHaveLength(1); // one picker, not two
    $('.t10dot[data-spin="week"]').click();
    expect($('#podium .p1').textContent).toContain('Ann');
    expect($('#champ').textContent).toContain('Ann rules this week with 100 pts');
    expect(names()).toEqual(['Ann', 'You']);
    expect($('#gap').textContent).toBe('⬆ 50 pts to pass Ann');
  });
  it('the board list has Points, then the boards that work for any period; streak and most improved aren’t in it', async () => {
    const opts = [...$<HTMLSelectElement>('#rkBoard').options].map(o => o.value);
    expect(opts[0]).toBe('points');
    expect(opts).toContain('tut');
    expect(opts).toContain('half');
    expect(opts).toContain('consist');
    expect(opts).not.toContain('streak');
    expect(opts).not.toContain('improved');
    expect(opts).not.toContain('week'); // the points periods are the period row, not boards
  });
  it('other boards are worked out for the period picked', async () => {
    pick('tut');
    $('.t10dot[data-spin="week"]').click();
    expect(names()).toEqual(['Ann', 'You']);                 // Bo didn't train this week
    expect($('#champ').textContent).toContain('Ann rules hang time this week with 120 s');
    expect($('#catDesc').textContent).toContain('Time under tension, this week');
    $('.t10dot[data-spin="month"]').click();
    expect(names()).toEqual(['Bo', 'Ann', 'You']);
    $('.t10dot[data-spin="overall"]').click();
    expect($('#catDesc').textContent).toContain('over the last 90 days');
  });
  it('someone who hasn’t trained in the period is told how to get on the board', async () => {
    S.state.me = { ...S.state.me!, id: 'u3' };
    pick('tut');
    $('.t10dot[data-spin="week"]').click();
    expect($('#gap').textContent).toBe('Log a session this week to get on this board.');
  });
});

describe('the period carousel', () => {
  it('moves on by itself through Week, Month, Season and Overall, then round again', async () => {
    expect(period()).toBe('season');
    expect([...document.querySelectorAll('.t10dot')].map(d => d.textContent)).toEqual(['Week', 'Month', 'Season', 'Overall']);
    sec(5.1); expect(period()).toBe('overall');
    sec(5); expect(period()).toBe('week'); expect(names()[0]).toBe('Ann');
    sec(5); expect(period()).toBe('month'); expect(names()[0]).toBe('Bo');
    expect($('.t10dot.on').getAttribute('aria-pressed')).toBe('true');
  });
  it('carries on with whichever board is picked', async () => {
    pick('tut');
    expect(period()).toBe('season');
    sec(5.1); expect(period()).toBe('overall');
    expect($<HTMLSelectElement>('#rkBoard').value).toBe('tut');
  });
  it('tapping a period shows it and carries on from there', async () => {
    $('.t10dot[data-spin="week"]').click();
    expect(period()).toBe('week');
    sec(4); expect(period()).toBe('week'); // a full turn from the tap
    sec(1.1); expect(period()).toBe('month');
  });
  it('pause holds it, play carries on', async () => {
    $('#t10play').click();
    expect($('#t10play').getAttribute('aria-label')).toMatch(/^Play/);
    sec(20); expect(period()).toBe('season');
    $('#t10play').click();
    expect($('#t10play').getAttribute('aria-label')).toBe('Pause');
    sec(5.1); expect(period()).toBe('overall');
  });
  it('waits while the page is hidden, a sheet is open, or the pointer is on the chart', async () => {
    $('#view-ranks').classList.add('hide');
    sec(20); expect(period()).toBe('season');
    $('#view-ranks').classList.remove('hide');
    const modal = document.createElement('div'); modal.className = 'modal'; document.body.append(modal);
    sec(20); expect(period()).toBe('season');
    modal.remove();
    const over = new Event('pointerenter'); Object.assign(over, { pointerType: 'mouse' });
    $('#t10').dispatchEvent(over);
    sec(20); expect(period()).toBe('season');
    $('#t10').dispatchEvent(new Event('pointerleave'));
    sec(5.1); expect(period()).toBe('overall');
  });
  it('with reduced motion it starts paused, and play still works', async () => {
    reduce = true;
    await openRanks();
    expect($('#t10play').getAttribute('aria-label')).toMatch(/^Play/);
    sec(20); expect(period()).toBe('season');
    $('#t10play').click();
    sec(5.1); expect(period()).toBe('overall');
    expect($('#t10').classList.contains('morph')).toBe(false); // no sliding or counting: it just changes
    expect($('#podium').classList.contains('rise')).toBe(false); // nor rising: it's just there
  });
  it('leaving Ranks for good stops the timer', async () => {
    document.body.innerHTML = '';
    expect(() => sec(10)).not.toThrow();
  });
});

describe('moving from one period to the next', () => {
  it('climbers keep their rows and slide; bars and values move to the new ones; anyone new fades in', async () => {
    $('.t10dot[data-spin="week"]').click();          // Ann, Tess (Bo hasn't trained this week)
    expect(names()).toEqual(['Ann', 'You']);
    $('.t10dot[data-spin="month"]').click();         // Bo joins at the top
    const el = $('#t10');
    expect(el.classList.contains('morph')).toBe(true);
    expect($('#podium').classList.contains('rise')).toBe(true); // the podium rises again too
    expect(names()).toEqual(['Bo', 'Ann', 'You']);
    const row = (uid: string) => $(`#t10 .t10r[data-uid="${uid}"]`);
    expect(row('u3').classList.contains('t10new')).toBe(true);
    expect(row('u2').classList.contains('t10new')).toBe(false);
    // the bar ends at the new length (Ann: 100 of an axis up to 300)
    expect(parseFloat(row('u2').querySelector<HTMLElement>('.t10b')!.style.width)).toBeCloseTo(100 / 300 * 100, 0);
    expect(row('u2').querySelector<HTMLElement>('.t10b')!.style.transition).toBe('');
    expect(row('u2').dataset.v).toBe('100');
    expect(row('u2').getAttribute('aria-label')).toContain('Ann · 100 pts');
  });
  it('the first board grows its bars from nothing (adding up as they go), and the podium rises with the crown and its sparkles on top', async () => {
    expect($('#t10').classList.contains('morph')).toBe(true);
    expect(document.querySelectorAll('#t10 .t10new')).toHaveLength(0);           // every row grows where it is
    expect(document.querySelectorAll('#t10 .t10r[style*="translate"]')).toHaveLength(0);
    expect(parseFloat($('#t10 .t10r[data-uid="u2"] .t10b').style.width)).toBeGreaterThan(0); // heading for its full length
    expect($('#podium .p1').dataset.v).toBe('300');
    expect($('#podium').classList.contains('rise')).toBe(true);
    expect(document.querySelectorAll('#podium .p1 .crown .tw')).toHaveLength(4);
    expect(document.querySelectorAll('#podium .p2 .tw, #podium .p3 .tw')).toHaveLength(0); // only the winner's crown
  });
});

describe('streaks and progress', () => {
  it('has its own card with Weekly streak and Most improved, and no period', async () => {
    const card = $('#sideCard');
    expect(card.querySelector('.t10dot')).toBeNull();
    expect([...card.querySelectorAll('[data-side]')].map(c => c.textContent!.trim())).toEqual(['Weekly streak', 'Most improved']);
    expect($('#sideDesc').textContent).toContain('Consecutive weeks');
    expect($('#sideList').textContent).toContain('No one has a streak yet'); // a week with 2 days' training starts one
    card.querySelector<HTMLElement>('[data-side="improved"]')!.click();
    expect($('#sideDesc').textContent).toContain('this month vs the month before');
    expect(card.querySelector('[data-side="improved"]')!.getAttribute('aria-pressed')).toBe('true');
  });
});
