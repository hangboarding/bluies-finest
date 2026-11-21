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

/** Save a session; falls back to the outbox when offline. Returns the session either way. */
export async function saveOrQueue(s: NewSession): Promise<{ session: Session; queued: boolean }> {
  const withTime = { ...s, createdAt: s.createdAt ?? new Date().toISOString() };
  try {
    return { session: await state.store.addSession(withTime), queued: false };
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    const tempId = 'local-' + Date.now().toString(36);
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
        const i = state.sessions.findIndex(x => x.id === q.tempId);
        if (i >= 0) state.sessions[i] = saved; else state.sessions.unshift(saved);
        sent++;
      } catch (e) {
        if (isNetworkError(e)) break; // still offline — try again later
        // The server rejected it (e.g. invalid values). Drop it so it doesn't block the queue forever.
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
