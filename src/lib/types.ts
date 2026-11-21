// Shared data types. The Store interface is implemented by LocalStore (demo mode,
// browser-only) and SupabaseStore (real multi-user backend).

export type Mode = 'hang' | 'lift';
export type Hands = 'both' | 'L' | 'R' | 'LR';

export interface Profile {
  id: string;
  name: string;
  avatarUrl: string | null;
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
export interface Notif { kind: 'like' | 'comment'; sessionId: string; protocolName: string; fromUserId: string; body?: string; createdAt: string; }
/** Admin-only view of a sign-up code. */
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
  updateProfile(p: { name?: string }): Promise<void>;
  uploadAvatar(file: Blob): Promise<string>; // returns public URL
  getPrivate(): Promise<PrivateData>;
  savePrivate(d: Partial<PrivateData>): Promise<void>;
  // sessions
  listSessions(opts?: { userId?: string; sinceIso?: string }): Promise<Session[]>;
  addSession(s: NewSession): Promise<Session>;
  updateSession(id: string, patch: Partial<NewSession>): Promise<void>;
  deleteSession(id: string): Promise<void>;
  // social
  feed(limit?: number): Promise<FeedItem[]>;
  setLike(sessionId: string, liked: boolean): Promise<void>;
  addComment(sessionId: string, body: string): Promise<Comment>;
  deleteComment(id: string): Promise<void>;
  /** Hearts received on my sessions + comments I've written on others' (for achievements). */
  socialCounts(): Promise<{ heartsReceived: number; commentsGiven: number }>;
  /** Hearts and comments others left on my sessions, newest first. */
  notifications(limit?: number): Promise<Notif[]>;
  // admin (the database only allows these for admins)
  listInviteCodes(): Promise<InviteCode[]>;
  saveInviteCode(code: string, maxUses: number | null): Promise<void>;
  deleteInviteCode(code: string): Promise<void>;
}
