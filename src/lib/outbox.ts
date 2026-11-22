// Offline-safe session saving. If a session can't reach the server (bad gym wifi),
// it's kept on this device and uploaded automatically when the connection returns.
import type { NewSession, Session } from './types';
import { state } from './state';
import { toast } from './ui';

const KEY = 'bf.outbox';
interface Queued { tempId: string; userId: string; session: NewSession; }

function read(): Queued[] { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
function write(q: Queued[]) { try { localStorage.setItem(KEY, JSON.stringify(q)); } catch { /* storage full/blocked */ } }

/** True when an error looks like "no connection" rather than "the server said no". */
export const isNetworkError = (e: any) =>
  !navigator.onLine || /reach the server|failed to fetch|network|load failed|timed? ?out|offline/i.test(String(e?.message ?? e));

/** Sessions waiting to upload for the signed-in user, shaped like real sessions (for stats). */
export function queuedSessions(): Session[] {
  const me = state.me?.id; if (!me) return [];
  return read().filter(q => q.userId === me).map(q => ({ ...q.session, id: q.tempId, userId: me, createdAt: q.session.createdAt!, pendingUpload: true } as Session));
}
export const queuedCount = () => queuedSessions().length;

/** Errors where the server definitely rejected the data — retrying won't help. Anything else
 *  (offline, expired login, server hiccup) keeps the session queued so it's never lost. */
const REJECTED = new Set(['23514', '23502', '22P02', '22003', '23503', '22001']);
const isRejected = (e: any) => REJECTED.has(String(e?.code ?? ''));
const isNetwork = (e: any) => e instanceof TypeError || /fetch|network|load failed|timed? ?out/i.test(String(e?.message ?? ''));
/** Forget queued sessions the server already has (the save landed but the reply was lost). */
export function dropUploaded(serverIds: Set<string>) {
  const q = read(), keep = q.filter(x => !serverIds.has(x.tempId));
  if (keep.length !== q.length) write(keep);
}
const newId = () => (crypto as any).randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); });

/** Save a session; falls back to the outbox when offline. Returns the session either way. */
export async function saveOrQueue(s: NewSession): Promise<{ session: Session; queued: boolean }> {
  // The id is chosen here, so if a save reaches the server but the reply is lost, the retry
  // recognises it instead of creating a duplicate.
  const withTime = { ...s, id: newId(), createdAt: s.createdAt ?? new Date().toISOString() } as NewSession & { id: string };
  try {
    return { session: await state.store.addSession(withTime), queued: false };
  } catch (e) {
    if (isRejected(e)) throw e;
    const tempId = withTime.id;
    write([...read(), { tempId, userId: state.me!.id, session: withTime }]);
    return { session: { ...withTime, id: tempId, userId: state.me!.id, pendingUpload: true } as Session, queued: true };
  }
}

let flushing = false;
/** Try to upload everything waiting. Replaces local placeholders with the saved rows. */
export async function flushOutbox() {
  const me = state.me?.id;
  if (flushing || !me || !navigator.onLine) return;
  flushing = true;
  let sent = 0;
  try {
    for (const q of read().filter(x => x.userId === me)) {
      try {
        const saved = await state.store.addSession(q.session);
        write(read().filter(x => x.tempId !== q.tempId));
        // replace the placeholder (and any copy already loaded from the server) with the saved row
        const i = state.sessions.findIndex(x => x.id === q.tempId);
        state.sessions = state.sessions.filter(x => x.id !== q.tempId);
        state.sessions.splice(i >= 0 ? i : 0, 0, saved);
        sent++;
      } catch (e) {
        if (!isRejected(e)) {
          if (!navigator.onLine || isNetwork(e)) break; // offline or server unreachable: try again later
          continue; // some other problem with just this one: keep it queued, but don't let it block the rest
        }
        // The server rejected the data itself (e.g. out-of-range values). Drop it so it doesn't block the queue.
        write(read().filter(x => x.tempId !== q.tempId));
        state.sessions = state.sessions.filter(x => x.id !== q.tempId);
        toast(`A saved-offline session couldn't be uploaded: ${(e as any)?.message ?? 'rejected'}`, 6000);
      }
    }
  } finally { flushing = false; }
  if (sent) { toast(`${sent} offline session${sent > 1 ? 's' : ''} uploaded ✓`); document.dispatchEvent(new CustomEvent('bf:sessions-changed')); }
}

addEventListener('online', () => { flushOutbox(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') flushOutbox(); });
setInterval(() => { if (queuedCount()) flushOutbox(); }, 60_000);
