// Real multi-user backend on Supabase. See docs/SUPABASE.md and supabase/schema.sql.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Issue, IssueCategory, Comment, FeedItem, NewSession, PrivateData, Profile, Session, Store, Notif, InviteCode, SeasonChampion, ChallengeRow } from './types';

// ---------------------------------------------------------------------------
// Row <-> object mapping
// ---------------------------------------------------------------------------

/** Session fields (camelCase) -> sessions columns (snake_case). */
const SESSION_COLUMNS = {
  id: 'id',
  userId: 'user_id',
  createdAt: 'created_at',
  protocolKey: 'protocol_key',
  protocolName: 'protocol_name',
  mode: 'mode',
  hang: 'hang',
  rest: 'rest',
  sets: 'sets',
  reps: 'reps',
  setRest: 'set_rest',
  edgeMm: 'edge_mm',
  addedKg: 'added_kg',
  assistKg: 'assist_kg',
  liftKg: 'lift_kg',
  effortPct: 'effort_pct',
  hands: 'hands',
  grip: 'grip',
  fingers: 'fingers',
  board: 'board',
  edgeMaterial: 'edge_material',
  edgeProfile: 'edge_profile',
  feel: 'feel',
  rpe: 'rpe',
  tutS: 'tut_s',
  fullHangs: 'full_hangs',
  totalHangs: 'total_hangs',
  hangs: 'hangs',
  loadPct: 'load_pct',
  points: 'points',
  isPb: 'is_pb',
  note: 'note',
} as const satisfies Record<Exclude<keyof Session, 'pendingUpload'>, string>; // pendingUpload is client-only

const SESSION_SELECT = Object.values(SESSION_COLUMNS).join(',');
const COMMENT_SELECT = 'id,session_id,user_id,body,created_at';
const PAGE = 1000; // PostgREST default max rows per request

function rowToSession(r: any): Session {
  const s: any = {};
  for (const [key, col] of Object.entries(SESSION_COLUMNS)) s[key] = r[col];
  s.hangs = Array.isArray(s.hangs) ? s.hangs : [];
  s.note = s.note ?? '';
  return s as Session;
}

/** Only maps keys that are present (and not undefined), so it works for patches. */
function sessionToRow(s: Partial<NewSession>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [key, col] of Object.entries(SESSION_COLUMNS)) {
    if (key === 'id' || key === 'userId') continue; // never client-controlled
    const v = (s as any)[key];
    if (v !== undefined) row[col] = v;
  }
  return row;
}

function rowToProfile(r: any): Profile {
  return {
    id: r.id,
    name: r.name,
    avatarUrl: r.avatar_url ?? null,
    location: r.location ?? null,
    isAdmin: !!r.is_admin,
    createdAt: r.created_at,
  };
}

function rowToComment(r: any): Comment {
  return {
    id: r.id,
    sessionId: r.session_id,
    userId: r.user_id,
    body: r.body,
    createdAt: r.created_at,
  };
}

// ---------------------------------------------------------------------------
// Friendly errors
// ---------------------------------------------------------------------------

const INVITE_ERROR = "That invite code isn't valid";

/** Friendly message, keeping the original Postgres/HTTP code so callers can tell retryable errors apart. */
function friendly(err: unknown, fallback = 'Something went wrong. Please try again.'): Error {
  const e = friendlyMessage(err, fallback);
  return Object.assign(e, { code: String((err as any)?.code ?? ''), status: (err as any)?.status });
}
function friendlyMessage(err: unknown, fallback: string): Error {
  const raw = String((err as any)?.message ?? err ?? '');
  const msg = raw.toLowerCase();
  const code = String((err as any)?.code ?? '');

  if (msg.includes('invalid_invite_code') || msg.includes('database error saving new user')) {
    return new Error(INVITE_ERROR);
  }
  if (msg.includes('invalid login credentials')) return new Error('Wrong email or password.');
  if (msg.includes('email not confirmed')) {
    return new Error('Please confirm your email first - check your inbox for the link.');
  }
  if (msg.includes('already registered') || msg.includes('already been registered') || code === 'user_already_exists') {
    return new Error('An account with that email already exists. Try signing in instead.');
  }
  if (msg.includes('rate limit') || msg.includes('too many') || code === 'over_email_send_rate_limit') {
    return new Error('Too many attempts. Please wait a minute and try again.');
  }
  if (msg.includes('should be different from the old password') || code === 'same_password') {
    return new Error('Your new password must be different from the old one.');
  }
  if (msg.includes('password should') || msg.includes('weak password') || code === 'weak_password') {
    return new Error('That password is too weak. Use at least 8 characters (longer is better).');
  }
  if (msg.includes('unable to validate email') || msg.includes('invalid email') || code === 'email_address_invalid') {
    return new Error("That email address doesn't look right.");
  }
  if (msg.includes('auth session missing') || msg.includes('jwt expired') || code === 'PGRST301') {
    return new Error('Your session has expired. Please sign in again.');
  }
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('network request failed')) {
    return new Error("Can't reach the server. Check your internet connection.");
  }
  if (msg.includes('row-level security') || code === '42501') {
    return new Error("You don't have permission to do that.");
  }
  if (msg.includes('cannot change admin')) return new Error("You can't change admin status.");
  if (code === '23514') return new Error('Some of that data is invalid (too long or out of range).');
  if (msg.includes('payload too large') || msg.includes('exceeded the maximum allowed size')) {
    return new Error('That image is too big (max 2 MB).');
  }
  if (msg.includes('mime type') || msg.includes('invalid_mime_type')) {
    return new Error('Please choose a JPEG, PNG or WebP image.');
  }
  console.warn('[SupabaseStore]', err);
  return new Error(raw && raw.length < 200 ? raw : fallback);
}

/** Unwraps a Supabase { data, error } result, throwing a friendly Error. */
function check<T>(res: { data: T; error: any }): T {
  if (res.error) throw friendly(res.error);
  return res.data;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export class SupabaseStore implements Store {
  readonly kind = 'supabase' as const;
  readonly client: SupabaseClient;

  private uid: string | null = null;
  private listeners: Array<(userId: string | null) => void> = [];
  private readyPromise: Promise<void>;

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // PKCE keeps the app's own "#reset" hash intact on password-reset links.
        flowType: 'pkce',
      },
    });

    this.client.auth.onAuthStateChange((_event, session) => {
      // Never await Supabase calls inside this callback (supabase-js deadlock), so
      // just update the cache and notify listeners on the next tick.
      this.setUid(session?.user?.id ?? null);
    });

    this.readyPromise = this.client.auth
      .getSession()
      .then(({ data }) => { this.setUid(data.session?.user?.id ?? null); })
      .catch((e) => { console.warn('[SupabaseStore] could not restore session', e); });
  }

  /** Resolves once the stored session (if any) has been restored. Await before first render. */
  ready(): Promise<void> {
    return this.readyPromise;
  }

  private setUid(next: string | null) {
    if (next === this.uid) return;
    this.uid = next;
    for (const cb of this.listeners) {
      setTimeout(() => {
        try { cb(next); } catch (e) { console.error(e); }
      }, 0);
    }
  }

  private requireUid(): string {
    if (!this.uid) throw new Error('You need to be signed in to do that.');
    return this.uid;
  }

  private get appUrl(): string {
    return location.origin + import.meta.env.BASE_URL;
  }

  // ---------------------------------------------------------------- auth

  currentUserId(): string | null {
    return this.uid;
  }

  onAuthChange(cb: (userId: string | null) => void): void {
    this.listeners.push(cb);
  }

  async signUp(p: { email: string; password: string; name: string; inviteCode: string }): Promise<void> {
    const name = p.name.trim();
    const inviteCode = p.inviteCode.trim().toUpperCase();
    if (!name) throw new Error('Please enter your name.');
    if (name.length > 40) throw new Error('Name must be 40 characters or fewer.');
    if (!inviteCode) throw new Error('Please enter your invite code.');

    // Friendly pre-check (the database trigger enforces it for real).
    const pre = await this.client.rpc('check_invite_code', { p_code: inviteCode });
    if (!pre.error && pre.data === false) throw new Error(INVITE_ERROR);

    const { data, error } = await this.client.auth.signUp({
      email: p.email.trim(),
      password: p.password,
      options: {
        data: { name, invite_code: inviteCode },
        emailRedirectTo: this.appUrl,
      },
    });
    if (error) throw friendly(error);
    // With email confirmation on, an existing email returns a user with no identities.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error('An account with that email already exists. Try signing in instead.');
    }
    if (data.session) this.setUid(data.session.user.id);
  }

  async signIn(email: string, password: string): Promise<void> {
    const { data, error } = await this.client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw friendly(error);
    this.setUid(data.session?.user?.id ?? null);
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) {
      // Still clear the local session so the user is never stuck signed in.
      await this.client.auth.signOut({ scope: 'local' }).catch(() => {});
    }
    this.setUid(null);
  }

  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await this.client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: location.origin + import.meta.env.BASE_URL + '#reset',
    });
    if (error) throw friendly(error);
  }

  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await this.client.auth.updateUser({ password: newPassword });
    if (error) throw friendly(error);
  }

  async deleteAccount(): Promise<void> {
    const uid = this.requireUid();
    // Remove avatar files first (Storage files can't be deleted from SQL).
    try {
      const { data: files } = await this.client.storage.from('avatars').list(uid, { limit: 1000 });
      if (files?.length) {
        await this.client.storage.from('avatars').remove(files.map((f) => `${uid}/${f.name}`));
      }
    } catch (e) {
      console.warn('[SupabaseStore] could not remove avatar files', e);
    }
    check(await this.client.rpc('delete_account'));
    await this.client.auth.signOut({ scope: 'local' }).catch(() => {});
    this.setUid(null);
  }

  // ---------------------------------------------------------------- profiles

  async listProfiles(): Promise<Profile[]> {
    // location needs supabase/profile-location.sql; fall back without it so the app still loads
    let res = await this.client.from('profiles').select('id,name,avatar_url,location,is_admin,created_at').order('created_at', { ascending: true });
    if (res.error && /location/.test(res.error.message)) res = await this.client.from('profiles').select('id,name,avatar_url,is_admin,created_at').order('created_at', { ascending: true }) as any;
    const rows = check(res);
    return (rows ?? []).map(rowToProfile);
  }

  async updateProfile(p: { name?: string; location?: string | null }): Promise<void> {
    const uid = this.requireUid();
    const patch: Record<string, unknown> = {};
    if (p.name !== undefined) {
      const name = p.name.trim();
      if (!name) throw new Error('Please enter your name.');
      if (name.length > 40) throw new Error('Name must be 40 characters or fewer.');
      patch.name = name;
    }
    if (p.location !== undefined) patch.location = p.location?.trim().slice(0, 60) || null;
    if (!Object.keys(patch).length) return;
    check(await this.client.from('profiles').update(patch).eq('id', uid));
  }

  async uploadAvatar(file: Blob): Promise<string> {
    const uid = this.requireUid();
    const fileName = `avatar-${Date.now()}.jpg`;
    const path = `${uid}/${fileName}`;
    const bucket = this.client.storage.from('avatars');

    check(await bucket.upload(path, file, {
      upsert: true,
      contentType: file.type || 'image/jpeg',
      cacheControl: '31536000',
    }));
    const url = bucket.getPublicUrl(path).data.publicUrl;
    check(await this.client.from('profiles').update({ avatar_url: url }).eq('id', uid));

    // Best-effort cleanup of older avatars.
    try {
      const { data: files } = await bucket.list(uid, { limit: 1000 });
      const old = (files ?? []).filter((f) => f.name !== fileName).map((f) => `${uid}/${f.name}`);
      if (old.length) await bucket.remove(old);
    } catch { /* ignore */ }

    return url;
  }

  async getPrivate(): Promise<PrivateData> {
    const uid = this.requireUid();
    const row: any = check(
      await this.client.from('private_data').select('bodyweight_kg,settings').eq('id', uid).maybeSingle(),
    );
    return {
      bodyweightKg: row?.bodyweight_kg == null ? null : Number(row.bodyweight_kg),
      settings: row?.settings && typeof row.settings === 'object' ? row.settings : {},
    };
  }

  /** Writes only the fields given. `settings`, if given, replaces the whole settings object. */
  async savePrivate(d: Partial<PrivateData>): Promise<void> {
    const uid = this.requireUid();
    const row: Record<string, unknown> = { id: uid };
    if (d.bodyweightKg !== undefined) row.bodyweight_kg = d.bodyweightKg;
    if (d.settings !== undefined) row.settings = d.settings ?? {};
    if (Object.keys(row).length === 1) return;
    check(await this.client.from('private_data').upsert(row, { onConflict: 'id' }));
  }

  // ---------------------------------------------------------------- sessions

  /** Newest first. Fetches all matching rows (paged past the 1000-row API limit). */
  async listSessions(opts: { userId?: string; sinceIso?: string } = {}): Promise<Session[]> {
    const out: Session[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = this.client
        .from('sessions')
        .select(SESSION_SELECT)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (opts.userId) q = q.eq('user_id', opts.userId);
      if (opts.sinceIso) q = q.gte('created_at', opts.sinceIso);
      const rows = check(await q) as any[];
      out.push(...(rows ?? []).map(rowToSession));
      if (!rows || rows.length < PAGE) break;
    }
    return out;
  }

  async addSession(s: NewSession): Promise<Session> {
    const uid = this.requireUid();
    const id = (s as any).id as string | undefined; // set by the offline queue so retries can't duplicate
    const row: Record<string, unknown> = { ...sessionToRow(s), user_id: uid };
    if (id && /^[0-9a-f-]{36}$/i.test(id)) row.id = id;
    const res = await this.client.from('sessions').insert(row).select(SESSION_SELECT).single();
    if (res.error && (res.error as any).code === '23505' && row.id) {
      // Already saved (an earlier attempt reached the server but its reply was lost).
      return rowToSession(check(await this.client.from('sessions').select(SESSION_SELECT).eq('id', row.id as string).single()));
    }
    return rowToSession(check(res));
  }

  async updateSession(id: string, patch: Partial<NewSession>): Promise<void> {
    this.requireUid();
    const row = sessionToRow(patch);
    if (!Object.keys(row).length) return;
    const rows = check(await this.client.from('sessions').update(row).eq('id', id).select('id')) as any[];
    if (!rows?.length) throw new Error("That session doesn't exist or isn't yours to edit.");
  }

  async deleteSession(id: string): Promise<void> {
    this.requireUid();
    const rows = check(await this.client.from('sessions').delete().eq('id', id).select('id')) as any[];
    if (!rows?.length) throw new Error("That session doesn't exist or you can't delete it.");
  }

  // ---------------------------------------------------------------- social

  /** Latest sessions with likes and comments, in a single request (embedded resources). */
  async feed(limit = 50): Promise<FeedItem[]> {
    const uid = this.requireUid();
    const rows = check(
      await this.client
        .from('sessions')
        .select(`${SESSION_SELECT},likes(user_id),comments(${COMMENT_SELECT})`)
        .order('created_at', { ascending: false })
        .order('created_at', { referencedTable: 'comments', ascending: true })
        .limit(limit),
    ) as any[];
    return (rows ?? []).map((r) => {
      const likes: any[] = r.likes ?? [];
      const comments = ((r.comments ?? []) as any[])
        .map(rowToComment)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return {
        session: rowToSession(r),
        likes: likes.length,
        likedByMe: likes.some((l) => l.user_id === uid),
        comments,
      };
    });
  }

  async setLike(sessionId: string, liked: boolean): Promise<void> {
    const uid = this.requireUid();
    if (liked) {
      check(await this.client
        .from('likes')
        .upsert({ session_id: sessionId, user_id: uid }, { onConflict: 'session_id,user_id', ignoreDuplicates: true }));
    } else {
      check(await this.client.from('likes').delete().eq('session_id', sessionId).eq('user_id', uid));
    }
  }

  async addComment(sessionId: string, body: string): Promise<Comment> {
    const uid = this.requireUid();
    const text = body.trim();
    if (!text) throw new Error('Comment is empty.');
    if (text.length > 1000) throw new Error('Comments can be at most 1000 characters.');
    const row = check(
      await this.client
        .from('comments')
        .insert({ session_id: sessionId, user_id: uid, body: text })
        .select(COMMENT_SELECT)
        .single(),
    );
    return rowToComment(row);
  }

  async deleteComment(id: string): Promise<void> {
    this.requireUid();
    const rows = check(await this.client.from('comments').delete().eq('id', id).select('id')) as any[];
    if (!rows?.length) throw new Error("That comment doesn't exist or you can't delete it.");
  }

  async socialCounts(): Promise<{ heartsReceived: number; commentsGiven: number }> {
    const uid = this.requireUid();
    const [hearts, comments] = await Promise.all([
      this.client
        .from('likes')
        .select('session_id,sessions!inner(user_id)', { count: 'exact', head: true })
        .eq('sessions.user_id', uid)
        .neq('user_id', uid),
      this.client
        .from('comments')
        .select('id,sessions!inner(user_id)', { count: 'exact', head: true })
        .eq('user_id', uid)
        .neq('sessions.user_id', uid),
    ]);
    if (hearts.error) throw friendly(hearts.error);
    if (comments.error) throw friendly(comments.error);
    return { heartsReceived: hearts.count ?? 0, commentsGiven: comments.count ?? 0 };
  }

  async notifications(limit = 40): Promise<Notif[]> {
    const uid = this.requireUid();
    const [likes, comments] = await Promise.all([
      this.client.from('likes')
        .select('session_id,user_id,created_at,sessions!inner(user_id,protocol_name)')
        .eq('sessions.user_id', uid).neq('user_id', uid)
        .order('created_at', { ascending: false }).limit(limit),
      this.client.from('comments')
        .select('session_id,user_id,body,created_at,sessions!inner(user_id,protocol_name)')
        .eq('sessions.user_id', uid).neq('user_id', uid)
        .order('created_at', { ascending: false }).limit(limit),
    ]);
    if (likes.error) throw friendly(likes.error);
    if (comments.error) throw friendly(comments.error);
    // Admins also hear about open problem reports. The database only shows other people's reports to
    // admins, so everyone else gets none; an error (issues.sql not run yet) is ignored.
    const issues = await this.client.from('issues').select('id,user_id,body,created_at').eq('status', 'open').neq('user_id', uid).order('created_at', { ascending: false }).limit(limit);
    const out: Notif[] = [
      ...((issues.error ? [] : issues.data) as any[]).map(r => ({ kind: 'issue' as const, sessionId: r.id, protocolName: '', fromUserId: r.user_id, body: r.body, createdAt: r.created_at })),
      ...(likes.data as any[]).map(r => ({ kind: 'like' as const, sessionId: r.session_id, protocolName: r.sessions?.protocol_name ?? '', fromUserId: r.user_id, createdAt: r.created_at })),
      ...(comments.data as any[]).map(r => ({ kind: 'comment' as const, sessionId: r.session_id, protocolName: r.sessions?.protocol_name ?? '', fromUserId: r.user_id, body: r.body, createdAt: r.created_at })),
    ];
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }

  async reportIssue(i: { category: IssueCategory; body: string; context: string }): Promise<void> {
    this.requireUid();
    const body = i.body.trim().slice(0, 2000);
    if (!body) throw new Error('Describe the problem first');
    const { error } = await this.client.from('issues').insert({ category: i.category, body, context: i.context.slice(0, 500) });
    if (error) throw error.code === '42P01' || /relation .*issues/.test(error.message) ? new Error('Problem reports aren’t set up yet. Ask an admin to run supabase/issues.sql.') : friendly(error);
  }

  async listIssues(): Promise<Issue[]> {
    this.requireUid();
    const rows = check(await this.client.from('issues').select('id,user_id,category,body,context,status,created_at').order('created_at', { ascending: false }).limit(200)) as any[];
    return rows.map(r => ({ id: r.id, userId: r.user_id, category: r.category, body: r.body, context: r.context ?? '', status: r.status, createdAt: r.created_at }));
  }

  async setIssueStatus(id: string, status: Issue['status']): Promise<void> {
    this.requireUid(); check(await this.client.from('issues').update({ status }).eq('id', id));
  }

  async deleteIssue(id: string): Promise<void> {
    this.requireUid(); check(await this.client.from('issues').delete().eq('id', id));
  }

  async listInviteCodes(): Promise<InviteCode[]> {
    this.requireUid();
    const rows = check(await this.client.from('invite_codes').select('code,max_uses,uses,created_at').order('created_at', { ascending: true })) as any[];
    return rows.map(r => ({ code: r.code, maxUses: r.max_uses, uses: r.uses, createdAt: r.created_at }));
  }

  async saveInviteCode(code: string, maxUses: number | null): Promise<void> {
    this.requireUid();
    const c = code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,40}$/.test(c)) throw new Error('Codes are 3–40 letters, numbers, - or _.');
    check(await this.client.from('invite_codes').upsert({ code: c, max_uses: maxUses }, { onConflict: 'code' }).select('code'));
  }

  async deleteInviteCode(code: string): Promise<void> {
    this.requireUid();
    const rows = check(await this.client.from('invite_codes').delete().eq('code', code).select('code')) as any[];
    if (!rows?.length) throw new Error("Couldn't delete that code. Are you an admin?");
  }

  async seasonChampions(): Promise<SeasonChampion[] | null> {
    this.requireUid();
    const { data, error } = await this.client.rpc('season_champions');
    if (error) {
      // seasons.sql not run yet — the app falls back to working champions out locally
      if ((error as any).code === 'PGRST202' || /could not find the function|schema cache/i.test(error.message)) return null;
      throw friendly(error);
    }
    return ((data ?? []) as any[]).map(r => ({ seasonStart: String(r.season_start), userId: r.user_id, points: Math.round(r.points) }));
  }

  async listChallenges(): Promise<ChallengeRow[]> {
    this.requireUid();
    const { data, error } = await this.client.from('challenges').select('id,title,metric,target,starts_on,ends_on').order('starts_on', { ascending: false }).limit(50);
    if (error) { if (/challenges|schema cache|relation/i.test(error.message)) return []; throw friendly(error); }
    return ((data ?? []) as any[]).map(r => ({ id: r.id, title: r.title, metric: r.metric, target: r.target, startsOn: r.starts_on, endsOn: r.ends_on }));
  }

  async saveChallenge(c: Omit<ChallengeRow, 'id'> & { id?: string }): Promise<void> {
    this.requireUid();
    const row = { title: c.title.trim().slice(0, 80), metric: c.metric, target: Math.round(c.target), starts_on: c.startsOn, ends_on: c.endsOn };
    const q = c.id ? this.client.from('challenges').update(row).eq('id', c.id) : this.client.from('challenges').insert(row);
    const rows = check(await q.select('id')) as any[];
    if (!rows?.length) throw new Error("Couldn't save that challenge. Are you an admin?");
  }

  async deleteChallenge(id: string): Promise<void> {
    this.requireUid();
    const rows = check(await this.client.from('challenges').delete().eq('id', id).select('id')) as any[];
    if (!rows?.length) throw new Error("Couldn't delete that challenge. Are you an admin?");
  }
}
