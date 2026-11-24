// Shared data types. The Store interface is implemented by LocalStore (demo mode,
// browser-only) and SupabaseStore (real multi-user backend).

export type Mode = 'hang' | 'lift';
export type Hands = 'both' | 'L' | 'R' | 'LR';

export interface Profile {
  id: string;
  name: string;
  avatarUrl: string | null;
  /** Only set when the member chose to show it on their profile. */
  location?: string | null;
  isAdmin: boolean;
  createdAt: string;
}

/** One logged hang inside a session. */
export interface HangResult {
  set: number;
  rep: number;
  hand: 'L' | 'R' | 'both';
  target: number; // seconds
  held: number;   // seconds actually held
  full: boolean;
}

export interface Session {
  id: string;
  userId: string;
  createdAt: string;      // ISO timestamp the session finished
  protocolKey: string;
  protocolName: string;
  /** The climber's own name for it ("Birthday hang"). Empty or missing: it goes by protocolName (see sessionName). */
  title?: string;
  mode: Mode;
  hang: number; rest: number; sets: number; reps: number; setRest: number;
  edgeMm: number;
  addedKg: number; assistKg: number; liftKg: number; effortPct: number;
  hands: Hands;
  grip: string; fingers: string; board: string; edgeMaterial: string; edgeProfile: string;
  feel: string;
  rpe: number | null;
  tutS: number;           // total seconds under tension
  fullHangs: number;
  totalHangs: number;
  hangs: HangResult[];
  /** (bodyweight + added − assist) / bodyweight × 100. Bodyweight itself is never shared. */
  loadPct: number | null;
  points: number;
  isPb: boolean;
  note: string;
  /** Client-only: saved on this device, waiting to upload. */
  pendingUpload?: boolean;
}
export type NewSession = Omit<Session, 'id' | 'userId' | 'createdAt'> & { createdAt?: string };

export interface Comment { id: string; sessionId: string; userId: string; body: string; createdAt: string; }
export interface FeedItem { session: Session; likes: number; likedByMe: boolean; comments: Comment[]; }

/** Someone hearted or commented on one of my sessions. */
export type IssueCategory = 'bug' | 'idea' | 'account' | 'other';
export interface Issue { id: string; userId: string; category: IssueCategory; body: string; context: string; status: 'open' | 'resolved'; createdAt: string; }
/** kind 'issue' only reaches admins: sessionId is then the issue id.
 *  kind 'rank': fromUserId's session knocked me from place `was` (top 3 on the Overall board) to `now`. */
export interface Notif { kind: 'like' | 'comment' | 'issue' | 'rank'; sessionId: string; /** what the session is called (its name, or its protocol's) */ protocolName: string; fromUserId: string; body?: string; createdAt: string; was?: number; now?: number; }
/** Admin-only view of a sign-up code. */
export interface SeasonChampion { seasonStart: string; userId: string; points: number; }
export interface ChallengeRow { id: string; title: string; metric: 'hangs' | 'sessions' | 'minutes' | 'pbs' | 'climbers'; target: number; startsOn: string; endsOn: string; }
export interface InviteCode { code: string; maxUses: number | null; uses: number; createdAt: string; }

/** Everything only the owner can see: bodyweight, preferences, saved settings. */
export interface PrivateData {
  bodyweightKg: number | null;
  settings: Record<string, any>; // free-form JSON (protocol values, boards, prefs, tour flags…)
}

export interface Store {
  readonly kind: 'local' | 'supabase';
  // auth
  currentUserId(): string | null;
  onAuthChange(cb: (userId: string | null) => void): void;
  signUp(p: { email: string; password: string; name: string; inviteCode: string }): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(newPassword: string): Promise<void>;
  deleteAccount(): Promise<void>;
  // profiles
  listProfiles(): Promise<Profile[]>;
  updateProfile(p: { name?: string; location?: string | null }): Promise<void>;
  uploadAvatar(file: Blob): Promise<string>; // returns public URL
  getPrivate(): Promise<PrivateData>;
  savePrivate(d: Partial<PrivateData>): Promise<void>;
  // sessions
  listSessions(opts?: { userId?: string; sinceIso?: string }): Promise<Session[]>;
  addSession(s: NewSession): Promise<Session>;
  updateSession(id: string, patch: Partial<NewSession>): Promise<void>;
  /** Give my logged sessions of protocol `key` (one of my own, renamed) its new name. */
  renameProtocol(key: string, name: string): Promise<void>;
  deleteSession(id: string): Promise<void>;
  // social
  feed(limit?: number): Promise<FeedItem[]>;
  setLike(sessionId: string, liked: boolean): Promise<void>;
  addComment(sessionId: string, body: string): Promise<Comment>;
  deleteComment(id: string): Promise<void>;
  /** Hearts received on my sessions + comments I've written on others' (for achievements). */
  socialCounts(): Promise<{ heartsReceived: number; commentsGiven: number }>;
  /** Hearts and comments others left on my sessions, and top-3 places I've lost, newest first. */
  notifications(limit?: number): Promise<Notif[]>;
  // admin (the database only allows these for admins)
  listInviteCodes(): Promise<InviteCode[]>;
  saveInviteCode(code: string, maxUses: number | null): Promise<void>;
  deleteInviteCode(code: string): Promise<void>;
  // problem reports: anyone can send one; only admins can list and update them
  reportIssue(i: { category: IssueCategory; body: string; context: string }): Promise<void>;
  listIssues(): Promise<Issue[]>;
  setIssueStatus(id: string, status: Issue['status']): Promise<void>;
  deleteIssue(id: string): Promise<void>;
  // seasons & challenges
  /** Winners of every finished season (ties share the title). */
  /** null = the season_champions function isn't installed on the server yet. */
  seasonChampions(): Promise<SeasonChampion[] | null>;
  listChallenges(): Promise<ChallengeRow[]>;
  /** Admin only. Creates when id is empty, otherwise updates. */
  saveChallenge(c: Omit<ChallengeRow, 'id'> & { id?: string }): Promise<void>;
  deleteChallenge(id: string): Promise<void>;
  // crew-wide settings: everyone reads them, only admins change them (e.g. bird: the bird an admin picked)
  /** Every setting (key → value). null = the app_settings table isn't set up on the server yet. */
  appSettings(): Promise<Record<string, unknown> | null>;
  /** Admin only. null removes the setting. */
  saveAppSetting(key: string, value: unknown): Promise<void>;
}
