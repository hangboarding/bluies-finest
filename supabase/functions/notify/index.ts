// Bluies Finest: "notify" Edge Function (Deno).
// Called by Supabase Database Webhooks on INSERT into public.likes and public.comments.
// Sends a Web Push notification to the owner of the session that was hearted or commented on.
// Deploy with: npx supabase functions deploy notify --no-verify-jwt   (see docs/PUSH.md)
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

interface LikeRecord { session_id: string; user_id: string; created_at?: string }
interface CommentRecord extends LikeRecord { id: string; body: string }
interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: LikeRecord | CommentRecord | null;
  old_record: unknown;
}
interface SubRow { endpoint: string; p256dh: string; auth: string }

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Compare secrets without leaking how many leading characters matched. */
function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function truncate(s: string, max = 80): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return json(405, { error: 'POST only' });
    const secret = env('WEBHOOK_SECRET');
    if (!safeEqual(req.headers.get('x-webhook-secret') ?? '', secret)) return json(401, { error: 'Bad or missing x-webhook-secret header' });

    const payload = (await req.json()) as WebhookPayload;
    if (payload.type !== 'INSERT' || payload.schema !== 'public' || !payload.record) return json(200, { skipped: 'not an insert' });
    if (payload.table !== 'likes' && payload.table !== 'comments') return json(200, { skipped: `table ${payload.table}` });
    const rec = payload.record;

    const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

    const { data: session, error: sErr } = await db.from('sessions').select('user_id, protocol_name').eq('id', rec.session_id).maybeSingle();
    if (sErr) throw new Error(`Session lookup failed: ${sErr.message}`);
    if (!session) return json(200, { skipped: 'session not found' });
    if (session.user_id === rec.user_id) return json(200, { skipped: 'own action' });

    const [{ data: actor }, { data: subs, error: subErr }] = await Promise.all([
      db.from('profiles').select('name').eq('id', rec.user_id).maybeSingle(),
      db.from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', session.user_id),
    ]);
    if (subErr) throw new Error(`Subscription lookup failed: ${subErr.message}`);
    if (!subs?.length) return json(200, { skipped: 'owner has no push subscriptions' });

    const who = (actor?.name as string | undefined)?.trim() || 'Someone';
    const what = (session.protocol_name as string)?.trim() || 'session';
    const isComment = payload.table === 'comments';
    const message = {
      title: isComment ? `${who} commented on your ${what}` : `${who} ❤️ hearted your ${what}`,
      body: isComment ? `“${truncate((rec as CommentRecord).body ?? '')}”` : 'Tap to see it in Activity',
      url: `?post=${encodeURIComponent(rec.session_id)}#feed`, // resolved against the app's scope by push-sw.js
      tag: `session-${rec.session_id}`,                         // repeated hearts on one post collapse into one
    };

    webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
    const body = JSON.stringify(message);
    const results = await Promise.allSettled((subs as SubRow[]).map((s) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 60 * 60 * 24 })));

    // Devices that uninstalled or revoked permission answer 404/410: forget them.
    const gone: string[] = [];
    let sent = 0;
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') { sent++; return; }
      const code = (r.reason as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) gone.push(subs[i]!.endpoint);
      else console.error('Push failed', code ?? '', (r.reason as Error)?.message ?? r.reason);
    });
    if (gone.length) {
      const { error } = await db.from('push_subscriptions').delete().in('endpoint', gone);
      if (error) console.error('Could not delete expired subscriptions:', error.message);
    }
    return json(200, { sent, removed: gone.length, failed: results.length - sent - gone.length });
  } catch (e) {
    console.error(e);
    return json(500, { error: 'internal error — see function logs' });
  }
});
