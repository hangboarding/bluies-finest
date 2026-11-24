// Naming a session: on the summary when it's saved, later in Edit session, and how the name shows in History,
// the feed and notifications. Also a database that hasn't had the update for names yet.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Session } from '../src/lib/types';
import { session } from './helpers';

vi.mock('../src/main', () => ({ go: vi.fn(async () => true), ACCENTS: ['#8fb3d1'], applyTheme() {}, refreshHeader() {}, rerender: async () => {} }));

let S: typeof import('../src/lib/state');
let added: any[];
let updates: { id: string; patch: Record<string, unknown> }[];
let updateError: ((patch: Record<string, unknown>) => Error | null) | null;

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const flush = () => vi.advanceTimersByTimeAsync(50);
const sheetButtons = () => [...document.querySelectorAll<HTMLButtonElement>('.modal .sheet > .row button')];

async function openApp(sessions: Session[] = []) {
  document.body.innerHTML = '<div id="view-hang"></div><div id="view-workouts"></div><div id="view-feed"></div>';
  vi.resetModules();
  S = await import('../src/lib/state');
  S.state.store = {
    kind: 'local', currentUserId: () => 'u1', savePrivate: async () => {},
    addSession: async (x: any) => { added.push(x); return { ...x, userId: 'u1' }; },
    updateSession: async (id: string, patch: Record<string, unknown>) => { const e = updateError?.(patch); if (e) throw e; updates.push({ id, patch: { ...patch } }); },
  } as any;
  S.state.me = { id: 'u1', name: 'Tess', avatarUrl: null, isAdmin: false, createdAt: '2026-01-01T00:00:00Z' };
  S.state.profiles = new Map([['u1', S.state.me]]);
  S.state.priv = { bodyweightKg: 70, settings: {} };
  S.state.sessions = sessions;
  S.state.settings = S.DEFAULT_SETTINGS();
  Object.assign(S.state.settings.prefs, { warmup: false, nudges: false });
  S.state.loaded = true;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance', 'Date'] });
  vi.setSystemTime(new Date('2026-11-23T10:00:00Z'));
  window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as any;
  window.scrollTo = (() => {}) as any;
  Element.prototype.scrollIntoView = () => {};
  localStorage.clear();
  added = []; updates = []; updateError = null;
  await openApp();
});
afterEach(() => { vi.useRealTimers(); });

/** Gets to the summary without running the timer: logs a Max Hangs session for yesterday. */
async function finishASession() {
  const hang = await import('../src/views/hang');
  hang.renderHang($('#view-hang'));
  $('#backlog').click(); await flush();
  const d = new Date(Date.now() - 864e5);
  $<HTMLInputElement>('#blWhen').value = new Date(+d - d.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
  sheetButtons().find(b => b.textContent === 'I promise')!.click(); await flush();
  expect($('#v-done').classList.contains('hide')).toBe(false);
  return $<HTMLInputElement>('#sTitle');
}

describe('naming it when it’s saved', () => {
  it('the summary starts with the protocol’s name, and a new name is saved with it', async () => {
    const name = await finishASession();
    expect(name.value).toBe('Max Hangs');
    expect($('#sTitleW').classList.contains('hide')).toBe(false);
    name.value = '  Birthday hang  ';
    $('#saveSess').click(); await flush();
    expect(added[0]!.title).toBe('Birthday hang');
    expect(added[0]!.protocolName).toBe('Max Hangs'); // what it was stays as it was
    expect(S.state.sessions[0]!.title).toBe('Birthday hang');
  });
  it('left as it is, or cleared, it has no name of its own', async () => {
    await finishASession();
    $('#saveSess').click(); await flush();
    const name = await finishASession();
    name.value = '';
    $('#saveSess').click(); await flush();
    expect(added.map(x => x.title)).toEqual(['', '']);
  });
  it('a name is at most 60 characters', async () => {
    const name = await finishASession();
    expect(name.maxLength).toBe(60);
    name.value = 'x'.repeat(80); // pasted past the limit
    $('#saveSess').click(); await flush();
    expect(added[0]!.title).toHaveLength(60);
  });
  it('a database without names yet saves the session and says the name wasn’t kept', async () => {
    (S.state.store as any).addSession = async (x: any) => { added.push(x); return { ...x, userId: 'u1', title: '' }; };
    const name = await finishASession();
    name.value = 'Birthday hang';
    $('#saveSess').click(); await flush();
    expect(added).toHaveLength(1);
    expect($('#toast').textContent).toContain('without its name');
  });
});

describe('renaming it in Edit session', () => {
  const open = async (s: Session) => {
    await openApp([s]);
    const wk = await import('../src/views/workouts');
    wk.renderWorkouts($('#view-workouts'));
    $(`#recent .lrow[data-sid="${s.id}"] [data-ed]`).click(); await flush();
    return $<HTMLInputElement>('.modal #seTitle');
  };
  it('shows its name, and saves a new one without touching anything else', async () => {
    const s = session({ id: 'n1' });
    const name = await open(s);
    expect(name.value).toBe('Max Hangs');
    expect(name.placeholder).toBe('Max Hangs');
    expect(document.activeElement).not.toBe(name); // no keyboard popping up on open
    name.value = 'Deload day';
    sheetButtons()[1]!.click(); await flush();
    expect(updates[0]!.patch).toMatchObject({ title: 'Deload day' });
    expect(Object.keys(updates[0]!.patch).sort()).toEqual(['points', 'title']);
    expect(s.title).toBe('Deload day');
    expect($('#recent .lrow .nm').textContent).toMatch(/^Deload day · 20mm/);
    expect($('#recent .lrow .nm small').textContent).toContain('Max Hangs');
  });
  it('clearing the name, or typing the protocol’s, goes back to the protocol’s name', async () => {
    const s = session({ id: 'n2', title: 'Deload day' });
    const name = await open(s);
    expect(name.value).toBe('Deload day');
    name.value = ' ';
    sheetButtons()[1]!.click(); await flush();
    expect(updates[0]!.patch.title).toBe('');
    expect($('#recent .lrow .nm').textContent).toMatch(/^Max Hangs · /);
    const again = await open(session({ id: 'n3', title: 'Deload day' }));
    again.value = 'Max Hangs';
    sheetButtons()[1]!.click(); await flush();
    expect(updates[1]!.patch.title).toBe('');
  });
  it('an unchanged name isn’t sent', async () => {
    const name = await open(session({ id: 'n4', title: 'Deload day' }));
    expect(name.value).toBe('Deload day');
    $<HTMLTextAreaElement>('.modal [data-f="note"]').value = 'Easy';
    sheetButtons()[1]!.click(); await flush();
    expect(updates[0]!.patch).not.toHaveProperty('title');
  });
  it('a database without names yet saves the rest and says the name needs the update', async () => {
    updateError = p => ('title' in p ? Object.assign(new Error('Naming sessions needs the latest database update.'), { code: 'no_title' }) : null);
    const s = session({ id: 'n5' });
    const name = await open(s);
    name.value = 'Deload day';
    $<HTMLTextAreaElement>('.modal [data-f="note"]').value = 'Easy';
    sheetButtons()[1]!.click(); await flush();
    expect(updates).toHaveLength(1);
    expect(updates[0]!.patch).toMatchObject({ note: 'Easy' });
    expect(updates[0]!.patch).not.toHaveProperty('title');
    expect(s.title ?? '').toBe('');
    expect($('#toast').textContent).toContain('the name');
  });
  it('only the name changed on such a database: nothing is saved, and it says why', async () => {
    updateError = p => ('title' in p ? Object.assign(new Error('Naming sessions needs the latest database update.'), { code: 'no_title' }) : null);
    const name = await open(session({ id: 'n6' }));
    name.value = 'Deload day';
    sheetButtons()[1]!.click(); await flush();
    expect(updates).toHaveLength(0);
    expect($('#toast').textContent).toContain('Naming sessions needs');
  });
});

describe('where the name shows', () => {
  it('the feed shows the name, with the protocol under it', async () => {
    const named = session({ id: 'f1', title: 'Birthday hang' }), plain = session({ id: 'f2' });
    await openApp([named, plain]);
    (S.state.store as any).feed = async () => [named, plain].map(s => ({ session: s, likes: 0, likedByMe: false, comments: [] }));
    const feed = await import('../src/views/feed');
    await feed.renderFeed($('#view-feed'));
    const what = [...document.querySelectorAll('.post .what')].map(x => x.textContent);
    expect(what).toEqual(['Birthday hangMax Hangs', 'Max Hangs']);
    expect($('.post .what small').textContent).toBe('Max Hangs');
  });
  it('hearts and comments on a named session use its name (demo mode)', async () => {
    const { LocalStore } = await import('../src/lib/local-store');
    const store = new LocalStore();
    await store.signUp({ email: 'a@x.test', password: 'password1', name: 'Ann', inviteCode: 'BLUIES' });
    const named = await store.addSession({ ...session({ title: 'Birthday hang' }), createdAt: new Date().toISOString() } as any);
    const plain = await store.addSession({ ...session(), createdAt: new Date().toISOString() } as any);
    await store.signUp({ email: 'b@x.test', password: 'password1', name: 'Bo', inviteCode: 'BLUIES' });
    await store.setLike(named.id, true);
    await store.addComment(plain.id, 'Strong!');
    await store.signIn('a@x.test', 'password1');
    const ns = (await store.notifications()).filter(n => n.kind === 'like' || n.kind === 'comment');
    expect(ns.map(n => [n.kind, n.protocolName]).sort()).toEqual([['comment', 'Max Hangs'], ['like', 'Birthday hang']]);
    // and renaming it later is kept
    await store.updateSession(named.id, { title: 'Big day' });
    expect((await store.listSessions()).find(s => s.id === named.id)!.title).toBe('Big day');
  });
  it('a name of only spaces is no name', async () => {
    const { sessionName } = await import('../src/lib/protocols');
    expect(sessionName({ title: 'Birthday hang', protocolName: 'Max Hangs' })).toBe('Birthday hang');
    expect(sessionName({ title: '  ', protocolName: 'Max Hangs' })).toBe('Max Hangs');
    expect(sessionName({ protocolName: 'Max Hangs' })).toBe('Max Hangs');
  });
});

describe('a database without the update for names (Supabase)', () => {
  /** A stand-in for the Supabase client: records each query, and fails any that mention `title` if `old`. */
  function fake(old: boolean) {
    const calls: { table: string; op: string; cols: string; row: any }[] = [];
    const client = {
      from(table: string) {
        const q = { table, op: 'select', cols: '', row: null as any };
        const b: any = {
          select(c: string) { q.cols = c; return b; },
          insert(r: any) { q.op = 'insert'; q.row = { ...r }; return b; },
          update(r: any) { q.op = 'update'; q.row = { ...r }; return b; },
          then(ok: any, bad: any) {
            calls.push({ ...q });
            const title = /\btitle\b/.test(q.cols) || (q.row && 'title' in q.row);
            const out = old && title
              ? { data: null, error: q.op === 'select' ? { code: '42703', message: 'column sessions.title does not exist' } : { code: 'PGRST204', message: "Could not find the 'title' column of 'sessions' in the schema cache" } }
              : q.op === 'insert' ? { data: { ...q.row, id: 'new', user_id: 'u1', hangs: [] }, error: null }
              : q.op === 'update' ? { data: [{ id: 'x' }], error: null }
              : { data: [{ id: 's1', protocol_name: 'Max Hangs', ...(old ? {} : { title: 'Birthday hang' }), hangs: [] }], error: null };
            return Promise.resolve(out).then(ok, bad);
          },
        };
        for (const m of ['order', 'range', 'eq', 'neq', 'gte', 'limit', 'single']) b[m] = () => b;
        return b;
      },
    };
    return { client, calls };
  }
  async function store(old: boolean) {
    const { SupabaseStore } = await import('../src/lib/supabase-store');
    const f = fake(old), st: any = Object.create(SupabaseStore.prototype);
    Object.assign(st, { client: f.client, uid: 'u1', hasTitle: true });
    return { st, calls: f.calls };
  }
  const newSession = (title: string) => { const { id, userId, createdAt, ...rest } = session({ title }); void id; void userId; void createdAt; return rest; };

  it('an updated database reads and saves names', async () => {
    const { st, calls } = await store(false);
    expect((await st.listSessions())[0].title).toBe('Birthday hang');
    expect(calls[0]!.cols).toContain('title');
    expect((await st.addSession(newSession('Birthday hang'))).title).toBe('Birthday hang');
    await st.updateSession('s1', { title: 'Deload day' });
    expect(calls.at(-1)!.row).toEqual({ title: 'Deload day' });
  });
  it('reading sessions: tries once with names, then reads them without', async () => {
    const { st, calls } = await store(true);
    const xs = await st.listSessions();
    expect(xs[0].protocolName).toBe('Max Hangs');
    expect(xs[0].title).toBe('');
    expect(calls.map(c => c.cols.includes('title'))).toEqual([true, false]);
    await st.feed();
    expect(calls.at(-1)!.cols).not.toContain('title'); // remembered: no failed try first
    expect(calls).toHaveLength(3);
  });
  it('saving a named session: saved without its name', async () => {
    const { st, calls } = await store(true);
    const s = await st.addSession(newSession('Birthday hang'));
    expect(s.title).toBe('');
    expect(calls.map(c => c.op)).toEqual(['insert', 'insert']);
    expect(calls[1]!.row).not.toHaveProperty('title');
  });
  it('an unnamed session never sends an empty name', async () => {
    const { st, calls } = await store(false);
    await st.addSession(newSession(''));
    expect(calls[0]!.row).not.toHaveProperty('title');
  });
  it('renaming: a clear error, so Edit session can save the rest', async () => {
    const { st, calls } = await store(true);
    await expect(st.updateSession('s1', { title: 'Deload day' })).rejects.toMatchObject({ code: 'no_title' });
    await expect(st.updateSession('s1', { title: 'Deload day' })).rejects.toMatchObject({ code: 'no_title' }); // known now: not sent again
    expect(calls).toHaveLength(1);
    await st.updateSession('s1', { note: 'Easy' });
    expect(calls).toHaveLength(2);
  });
  it('notifications use the name where there is one', async () => {
    const { st } = await store(false);
    st.client.from = (table: string) => {
      const b: any = {};
      for (const m of ['select', 'order', 'eq', 'neq', 'limit']) b[m] = () => b;
      b.then = (ok: any) => Promise.resolve(table === 'likes'
        ? { data: [{ session_id: 's1', user_id: 'u2', created_at: '2026-11-23T09:00:00Z', sessions: { user_id: 'u1', protocol_name: 'JUST LET ME HANG', title: '' } },
                   { session_id: 's2', user_id: 'u2', created_at: '2026-11-23T08:00:00Z', sessions: { user_id: 'u1', protocol_name: 'Max Hangs', title: 'Birthday hang' } }], error: null }
        : { data: [], error: null }).then(ok);
      return b;
    };
    const ns = await st.notifications();
    expect(ns.map((n: any) => n.protocolName)).toEqual(['QUICK SESH', 'Birthday hang']);
  });
});
