// Demo backend: everything lives in this browser's localStorage, seeded with a few
// pretend climbers so the leaderboard and feed have something in them.
// Used when no Supabase keys are configured. Not secure — demo only.
import type { ChallengeRow, Comment, FeedItem, InviteCode, Issue, IssueCategory, NewSession, Notif, PrivateData, Profile, SeasonChampion, Session, Store } from './types';
import { championsFrom } from './seasons';
import { sessionPoints } from './scoring';
import { PROTOCOLS } from './protocols';

interface DB {
  users: { id: string; email: string; password: string }[];
  profiles: Profile[]; priv: Record<string, PrivateData>;
  sessions: Session[]; likes: { s: string; u: string }[]; comments: Comment[];
  me: string | null;
}
const KEY = 'bf.demo.v1';
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function rnd(seed: number) { const x = Math.sin(seed * 9301 + 49297) * 233280; return x - Math.floor(x); }

function seed(): DB {
  const names = ['Alex J.', 'Mika', 'Sam R.', 'Priya', 'Tom B.', 'Jo', 'Kai'];
  const strength = [1.32, 1.27, 1.2, 1.12, 1.0, 0.9, 1.06];
  const freq = [0.5, 0.45, 0.35, 0.55, 0.25, 0.6, 0.3];
  const profiles: Profile[] = names.map((n, i) => ({ id: 'demo' + i, name: n, avatarUrl: null, isAdmin: false, createdAt: new Date(Date.now() - 200 * 864e5).toISOString() }));
  const sessions: Session[] = [];
  const keys = ['max', 'max', 'rep', 'abra', 'min', 'dens', 'oneA', 'int'];
  const grips = ['Open', 'Half crimp', 'Full crimp', 'Open', 'Half crimp'];
  for (let i = 0; i < names.length; i++) for (let d = 120; d >= 0; d--) {
    if (rnd(i * 1000 + d) > freq[i]!) continue;
    const k = keys[Math.floor(rnd(i * 77 + d) * keys.length)]!, p = PROTOCOLS[k]!;
    const prog = 1 - d / 400, lp = Math.round(strength[i]! * prog * 1000) / 10;
    const bw = 70, add = Math.max(0, Math.round((lp / 100 * bw - bw) * 2) / 2), assist = add > 0 ? 0 : Math.round((bw - lp / 100 * bw) * 2) / 2;
    const hands = p.hands === 'LR' ? ['L', 'R'] as const : ['both'] as const;
    const hangs = [] as Session['hangs'];
    for (let s = 1; s <= p.sets; s++) for (let r = 1; r <= p.reps; r++) for (const h of hands) {
      const full = rnd(i + d + s * 7 + r) > 0.12; const held = full ? p.hang : Math.max(1, Math.floor(p.hang * 0.6));
      hangs.push({ set: s, rep: r, hand: h, target: p.hang, held, full });
    }
    const t = new Date(Date.now() - d * 864e5); t.setHours(7 + Math.floor(rnd(i * 3 + d) * 13), Math.floor(rnd(d + i) * 60));
    const base = {
      protocolKey: k, protocolName: p.n, mode: p.mode ?? 'hang', hang: p.hang, rest: p.rest, sets: p.sets, reps: p.reps, setRest: p.setRest ?? 180,
      edgeMm: k === 'min' ? Math.max(8, Math.round(18 - strength[i]! * 4 * prog)) : p.edge, addedKg: p.mode === 'lift' ? 0 : add, assistKg: p.mode === 'lift' ? 0 : assist,
      liftKg: p.mode === 'lift' ? Math.round(30 * strength[i]! * prog) : 0, effortPct: p.effort ?? 60, hands: p.hands ?? 'both',
      grip: grips[Math.floor(rnd(i * 5 + d) * grips.length)]!, fingers: 'All 4', board: 'Beastmaker 1000', edgeMaterial: 'Wood', edgeProfile: 'Flat',
      feel: '🙂', rpe: 6 + Math.floor(rnd(d * i + 1) * 4), tutS: hangs.reduce((a, h) => a + h.held, 0), fullHangs: hangs.filter(h => h.full).length,
      totalHangs: hangs.length, hangs, loadPct: p.mode === 'lift' ? null : lp, isPb: rnd(i * 11 + d) > 0.93, note: '',
    } as Omit<Session, 'id' | 'userId' | 'createdAt' | 'points'>;
    sessions.push({ ...base, id: uid(), userId: 'demo' + i, createdAt: t.toISOString(), points: 0 } as Session);
  }
  sessions.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  for (const s of sessions) s.points = sessionPoints(s, sessions.filter(x => x.userId === s.userId));
  const notes = ['New PB!! 💀', 'Forearms are toast 🍞', 'First time on this edge!', 'Week done ✅', 'Felt strong today', ''];
  sessions.slice(0, 12).forEach((s, i) => { s.note = notes[i % notes.length]!; });
  const likes = sessions.slice(0, 15).flatMap((s, i) => profiles.filter((_, j) => rnd(i * 13 + j) > 0.5 && 'demo' + j !== s.userId).map(p => ({ s: s.id, u: p.id })));
  const comments: Comment[] = [
    { id: uid(), sessionId: sessions[0]!.id, userId: 'demo1', body: 'absolute unit 😳', createdAt: new Date().toISOString() },
    { id: uid(), sessionId: sessions[0]!.id, userId: 'demo3', body: 'teach me your ways', createdAt: new Date().toISOString() },
    { id: uid(), sessionId: sessions[1]!.id, userId: 'demo0', body: 'toast but make it strong', createdAt: new Date().toISOString() },
  ];
  return { users: [], profiles, priv: {}, sessions, likes, comments, me: null };
}

export class LocalStore implements Store {
  readonly kind = 'local' as const;
  private db: DB;
  private listeners: ((id: string | null) => void)[] = [];
  constructor() {
    let db: DB | null = null;
    try { db = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* storage blocked */ }
    this.db = db ?? seed();
    this.save();
  }
  async ready() { /* nothing to wait for */ }
  private save() { try { localStorage.setItem(KEY, JSON.stringify(this.db)); } catch { /* storage blocked or full */ } }
  private need() { if (!this.db.me) throw new Error('Please log in first'); return this.db.me; }
  private emit() { this.listeners.forEach(f => f(this.db.me)); }

  currentUserId() { return this.db.me; }
  onAuthChange(cb: (id: string | null) => void) { this.listeners.push(cb); }
  async signUp({ email, password, name, inviteCode }: { email: string; password: string; name: string; inviteCode: string }) {
    const code = this.codes().find(x => x.code === inviteCode.trim().toUpperCase());
    if (!code || (code.maxUses != null && code.uses >= code.maxUses)) throw new Error("That invite code isn't valid");
    if (this.db.users.some(u => u.email === email.toLowerCase())) throw new Error('An account with that email already exists');
    if (password.length < 8) throw new Error('Password must be at least 8 characters');
    code.uses++; // only once the sign-up will go through, like the server
    const id = uid();
    this.db.users.push({ id, email: email.toLowerCase(), password });
    this.db.profiles.push({ id, name, avatarUrl: null, isAdmin: this.db.users.length === 1, createdAt: new Date().toISOString() });
    this.db.priv[id] = { bodyweightKg: null, settings: {} };
    this.db.me = id; this.save(); this.emit();
  }
  async signIn(email: string, password: string) {
    const u = this.db.users.find(x => x.email === email.toLowerCase() && x.password === password);
    if (!u) throw new Error('Wrong email or password');
    this.db.me = u.id; this.save(); this.emit();
  }
  async signOut() { this.db.me = null; this.save(); this.emit(); }
  async requestPasswordReset() { throw new Error('Password reset emails only work once Supabase is connected'); }
  async updatePassword(p: string) { const u = this.db.users.find(x => x.id === this.need())!; u.password = p; this.save(); }
  async deleteAccount() {
    const me = this.need(), d = this.db;
    const mine = new Set(d.sessions.filter(s => s.userId === me).map(s => s.id));
    d.sessions = d.sessions.filter(s => s.userId !== me);
    d.likes = d.likes.filter(l => l.u !== me && !mine.has(l.s));
    d.comments = d.comments.filter(c => c.userId !== me && !mine.has(c.sessionId));
    d.profiles = d.profiles.filter(p => p.id !== me); d.users = d.users.filter(u => u.id !== me); delete d.priv[me];
    d.me = null; this.save(); this.emit();
  }

  async listProfiles() { return structuredClone(this.db.profiles); }
  async updateProfile(p: { name?: string; location?: string | null }) { const pr = this.db.profiles.find(x => x.id === this.need())!; if (p.name) pr.name = p.name; if (p.location !== undefined) pr.location = p.location?.trim().slice(0, 60) || null; this.save(); }
  async uploadAvatar(file: Blob) {
    const url = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file); });
    this.db.profiles.find(x => x.id === this.need())!.avatarUrl = url; this.save(); return url;
  }
  async getPrivate() { return structuredClone(this.db.priv[this.need()] ?? { bodyweightKg: null, settings: {} }); }
  async savePrivate(d: Partial<PrivateData>) { const me = this.need(); this.db.priv[me] = structuredClone({ ...(this.db.priv[me] ?? { bodyweightKg: null, settings: {} }), ...d }); this.save(); } // a copy, like a real upload

  async listSessions(o: { userId?: string; sinceIso?: string } = {}) {
    return structuredClone(this.db.sessions.filter(s => (!o.userId || s.userId === o.userId) && (!o.sinceIso || s.createdAt >= o.sinceIso)));
  }
  async addSession(s: NewSession) {
    const given = (s as any).id as string | undefined, dup = given && this.db.sessions.find(x => x.id === given);
    if (dup) return structuredClone(dup);
    const full: Session = { ...s, id: given || uid(), userId: this.need(), createdAt: s.createdAt ?? new Date().toISOString() } as Session;
    this.db.sessions.unshift(full); this.save(); return structuredClone(full);
  }
  async updateSession(id: string, patch: Partial<NewSession>) {
    const s = this.db.sessions.find(x => x.id === id && x.userId === this.need()); if (!s) throw new Error('Session not found');
    Object.assign(s, patch); this.save();
  }
  async deleteSession(id: string) {
    const me = this.need(), admin = this.db.profiles.find(p => p.id === me)?.isAdmin;
    const s = this.db.sessions.find(x => x.id === id);
    if (!s || !(s.userId === me || admin)) throw new Error("That session doesn't exist or you can't delete it.");
    this.db.sessions = this.db.sessions.filter(x => x.id !== id);
    this.db.likes = this.db.likes.filter(l => l.s !== id); this.db.comments = this.db.comments.filter(c => c.sessionId !== id); this.save();
  }

  async feed(limit = 50): Promise<FeedItem[]> {
    const me = this.db.me;
    return this.db.sessions.slice(0, limit).map(s => ({
      session: structuredClone(s), likes: this.db.likes.filter(l => l.s === s.id).length, likedByMe: this.db.likes.some(l => l.s === s.id && l.u === me),
      comments: this.db.comments.filter(c => c.sessionId === s.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    }));
  }
  async setLike(sessionId: string, liked: boolean) {
    const me = this.need(); this.db.likes = this.db.likes.filter(l => !(l.s === sessionId && l.u === me));
    if (liked) this.db.likes.push({ s: sessionId, u: me, at: new Date().toISOString() } as any); this.save();
  }
  async addComment(sessionId: string, body: string) {
    const c: Comment = { id: uid(), sessionId, userId: this.need(), body: body.slice(0, 500), createdAt: new Date().toISOString() };
    this.db.comments.push(c); this.save(); return c;
  }
  async deleteComment(id: string) {
    const me = this.need(), admin = this.db.profiles.find(p => p.id === me)?.isAdmin;
    this.db.comments = this.db.comments.filter(c => !(c.id === id && (c.userId === me || admin))); this.save();
  }
  async notifications(limit = 40): Promise<Notif[]> {
    const me = this.need(), mine = new Map(this.db.sessions.filter(s => s.userId === me).map(s => [s.id, s]));
    const out: Notif[] = [
      ...this.db.likes.filter(l => mine.has(l.s) && l.u !== me).map(l => ({ kind: 'like' as const, sessionId: l.s, protocolName: mine.get(l.s)!.protocolName, fromUserId: l.u, createdAt: (l as any).at ?? mine.get(l.s)!.createdAt })),
      ...this.db.comments.filter(c => mine.has(c.sessionId) && c.userId !== me).map(c => ({ kind: 'comment' as const, sessionId: c.sessionId, protocolName: mine.get(c.sessionId)!.protocolName, fromUserId: c.userId, body: c.body, createdAt: c.createdAt })),
    ];
    if (this.db.profiles.find(p => p.id === me)?.isAdmin)
      out.push(...this.issues().filter(i => i.status === 'open' && i.userId !== me).map(i => ({ kind: 'issue' as const, sessionId: i.id, protocolName: '', fromUserId: i.userId, body: i.body, createdAt: i.createdAt })));
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }
  private codes(): InviteCode[] { return ((this.db as any).codes ??= [{ code: 'BLUIES', maxUses: null, uses: this.db.users.length, createdAt: new Date().toISOString() }]); }
  private needAdmin() { const me = this.need(); if (!this.db.profiles.find(p => p.id === me)?.isAdmin) throw new Error('Only admins can do that'); }
  async listInviteCodes() { this.needAdmin(); return structuredClone(this.codes()); }
  async saveInviteCode(code: string, maxUses: number | null) {
    this.needAdmin(); const c = code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,40}$/.test(c)) throw new Error('Codes are 3–40 letters, numbers, - or _.');
    const list = this.codes(), hit = list.find(x => x.code === c);
    if (hit) hit.maxUses = maxUses; else list.push({ code: c, maxUses, uses: 0, createdAt: new Date().toISOString() });
    this.save();
  }
  async deleteInviteCode(code: string) { this.needAdmin(); (this.db as any).codes = this.codes().filter(x => x.code !== code); this.save(); }
  async seasonChampions(): Promise<SeasonChampion[]> { this.need(); return championsFrom(this.db.sessions); }
  private issues(): Issue[] { return ((this.db as any).issues ??= []); }
  async reportIssue(i: { category: IssueCategory; body: string; context: string }) {
    const me = this.need(), body = i.body.trim().slice(0, 2000);
    if (!body) throw new Error('Describe the problem first');
    this.issues().unshift({ id: uid(), userId: me, category: i.category, body, context: i.context.slice(0, 500), status: 'open', createdAt: new Date().toISOString() }); this.save();
  }
  async listIssues() { this.needAdmin(); return structuredClone(this.issues()); }
  async setIssueStatus(id: string, status: Issue['status']) { this.needAdmin(); const x = this.issues().find(i => i.id === id); if (x) { x.status = status; this.save(); } }
  async deleteIssue(id: string) { this.needAdmin(); (this.db as any).issues = this.issues().filter(i => i.id !== id); this.save(); }
  private challenges(): ChallengeRow[] { return ((this.db as any).challenges ??= []); }
  async listChallenges() { this.need(); return structuredClone(this.challenges()); }
  async saveChallenge(c: Omit<ChallengeRow, 'id'> & { id?: string }) {
    this.needAdmin(); const list = this.challenges();
    if (c.id) Object.assign(list.find(x => x.id === c.id) ?? {}, c); else list.unshift({ ...c, id: uid() } as ChallengeRow);
    this.save();
  }
  async deleteChallenge(id: string) { this.needAdmin(); (this.db as any).challenges = this.challenges().filter(x => x.id !== id); this.save(); }
  async socialCounts() {
    const me = this.need(), mine = new Set(this.db.sessions.filter(s => s.userId === me).map(s => s.id));
    return {
      heartsReceived: this.db.likes.filter(l => mine.has(l.s) && l.u !== me).length,
      commentsGiven: this.db.comments.filter(c => c.userId === me && !mine.has(c.sessionId)).length,
    };
  }
}
