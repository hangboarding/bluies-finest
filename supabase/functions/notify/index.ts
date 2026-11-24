// Bluies Finest: "notify" Edge Function (Deno).
// Called by Supabase Database Webhooks on INSERT into public.likes, public.comments, public.issues and public.sessions.
// Hearts/comments: sends a Web Push notification to the owner of the session.
// Issues (problem reports): sends a Web Push notification to every admin and, if RESEND_API_KEY
// is set, an email to every admin as well.
// Sessions: anyone the new session knocked down from the top 3 of the Overall board gets an alert in the app's
// bell (public.rank_alerts) and a push notification.
// Deploy with: npx supabase functions deploy notify --no-verify-jwt   (see docs/PUSH.md)
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';
import { overtaken, poolStart, sydneyDay, type RankSession } from './rank.ts';

interface LikeRecord { session_id: string; user_id: string; created_at?: string }
interface CommentRecord extends LikeRecord { id: string; body: string }
interface IssueRecord { id: string; user_id: string; category: string; body: string; context?: string | null; created_at?: string }
interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: LikeRecord | CommentRecord | IssueRecord | RankSession | null;
  old_record: unknown;
}
interface SubRow { endpoint: string; p256dh: string; auth: string }
type Db = ReturnType<typeof createClient>;

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

const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Send one message to each subscription, then forget devices that have gone away. */
async function pushTo(db: Db, subs: SubRow[], message: Record<string, string>) {
  webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
  const body = JSON.stringify(message);
  const results = await Promise.allSettled(subs.map((s) =>
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
  return { sent, removed: gone.length, failed: results.length - sent - gone.length };
}

/** A session was saved: tell anyone it knocked out of their top-3 place on the Overall board. */
async function onSession(db: Db, rec: RankSession) {
  const now = Date.now();
  // a session logged for an earlier day (or uploaded long after) doesn't announce anything
  if (now - +new Date(rec.created_at) > 2 * 864e5) return { skipped: 'not a recent session' };
  // everyone's sessions in the leaderboard window, a page at a time (the API returns at most 1000 rows per request)
  const pool: RankSession[] = [], since = new Date(poolStart(now)).toISOString(), PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from('sessions').select('id, user_id, created_at, points, tut_s')
      .gte('created_at', since).order('created_at').order('id').range(from, from + PAGE - 1);
    if (error) throw new Error(`Session lookup failed: ${error.message}`);
    pool.push(...((data ?? []) as RankSession[]));
    if ((data?.length ?? 0) < PAGE) break;
  }
  const hits = overtaken(pool, rec, now);
  if (!hits.length) return { skipped: 'no one dropped down the top 3' };

  const { data: actor } = await db.from('profiles').select('name').eq('id', rec.user_id).maybeSingle();
  const who = (actor?.name as string | undefined)?.trim() || 'Someone', day = sydneyDay(now);
  const results: unknown[] = [];
  for (const h of hits) {
    // once a day for each pair, so two climbers trading places all evening don't buzz each other every time
    const { data: first, error: logErr } = await db.from('notify_log')
      .upsert({ key: `rank:${day}:${h.userId}:${rec.user_id}` }, { onConflict: 'key', ignoreDuplicates: true }).select('key');
    if (logErr) console.error('notify_log unavailable (run supabase/schema.sql):', logErr.message);
    else if (!first?.length) { results.push({ skipped: 'already told today' }); continue; }

    const { error: aErr } = await db.from('rank_alerts').insert({ user_id: h.userId, by_user_id: rec.user_id, session_id: rec.id, old_place: h.was, new_place: h.now });
    if (aErr) console.error('rank_alerts unavailable (run supabase/schema.sql):', aErr.message);

    if (!Deno.env.get('VAPID_PRIVATE_KEY')) { results.push({ skipped: 'push not configured' }); continue; }
    const { data: subs, error: subErr } = await db.from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', h.userId);
    if (subErr) { console.error('Subscription lookup failed:', subErr.message); continue; }
    if (!subs?.length) { results.push({ skipped: 'no devices with notifications on' }); continue; }
    results.push(await pushTo(db, subs as SubRow[], {
      title: h.was === 1 ? `👑 ${who} just took your #1 spot` : `${who} just took your #${h.was} spot`,
      body: h.now > 3 ? `You’re #${h.now} on the Overall board now, out of the top 3. Time to hang 💪` : `You’re #${h.now} on the Overall board now. Time to hang 💪`,
      url: '#ranks',
      tag: 'rank', // a newer alert replaces an older one
    }));
  }
  return { overtaken: hits.length, results };
}

const CATS: Record<string, string> = { bug: 'Something’s broken', idea: 'Idea', account: 'Account or log-in', other: 'Other' };

/** A member reported a problem: tell every admin by push and, if configured, by email. */
async function onIssue(db: Db, rec: IssueRecord) {
  const { data: admins, error: aErr } = await db.from('profiles').select('id').eq('is_admin', true);
  if (aErr) throw new Error(`Admin lookup failed: ${aErr.message}`);
  const adminIds = (admins ?? []).map((a) => a.id as string).filter((id) => id !== rec.user_id);
  if (!adminIds.length) return { skipped: 'no other admins' };

  const { data: reporter } = await db.from('profiles').select('name').eq('id', rec.user_id).maybeSingle();
  const who = (reporter?.name as string | undefined)?.trim() || 'Someone';
  const cat = CATS[rec.category] ?? rec.category;

  // Phone notifications (skipped when push isn't set up).
  let push: unknown = { skipped: 'push not configured' };
  if (Deno.env.get('VAPID_PRIVATE_KEY')) {
    const { data: subs, error } = await db.from('push_subscriptions').select('endpoint, p256dh, auth').in('user_id', adminIds);
    if (error) console.error('Subscription lookup failed:', error.message);
    else if (subs?.length) push = await pushTo(db, subs as SubRow[], {
      title: `🐞 ${who} reported an issue`,
      body: `${cat}: ${truncate(rec.body, 100)}`,
      url: '#profile', // admins open Admin tools from Profile
      tag: `issue-${rec.id}`,
    });
    else push = { skipped: 'no admin devices have notifications on' };
  }

  // Email through Resend (https://resend.com), only when RESEND_API_KEY is set.
  let email: unknown = { skipped: 'RESEND_API_KEY not set' };
  const key = Deno.env.get('RESEND_API_KEY');
  if (key) {
    const to: string[] = [];
    for (const id of adminIds) {
      const { data, error } = await db.auth.admin.getUserById(id);
      if (error) console.error('Admin email lookup failed:', error.message);
      else if (data.user?.email) to.push(data.user.email);
    }
    if (!to.length) email = { skipped: 'no admin email addresses found' };
    else {
      const appUrl = Deno.env.get('APP_URL') ?? '';
      const device = rec.context ?? 'unknown';
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: Deno.env.get('ISSUE_EMAIL_FROM') ?? 'Bluies Finest <onboarding@resend.dev>',
          to,
          subject: `Bluies Finest: ${who} reported an issue (${cat})`,
          text: [`${who} reported an issue.`, `Type: ${cat}`, rec.body, `Device: ${device}`,
            appUrl ? `Open the app: ${appUrl}` : '', 'Mark it resolved under Profile → Admin tools.'].filter(Boolean).join('\n\n'),
          html: `<p><b>${escHtml(who)}</b> reported an issue.</p><p><b>Type:</b> ${escHtml(cat)}</p>`
            + `<blockquote style="border-left:3px solid #8fb3d1;margin:0;padding:4px 12px;white-space:pre-wrap">${escHtml(rec.body)}</blockquote>`
            + `<p style="color:#667;font-size:12px">Device: ${escHtml(device)}</p>`
            + (appUrl ? `<p><a href="${escHtml(appUrl)}">Open Bluies Finest</a></p>` : '')
            + `<p style="color:#667;font-size:12px">Mark it resolved under Profile → Admin tools.</p>`,
        }),
      });
      if (res.ok) email = { sent: to.length };
      else { email = { failed: res.status }; console.error('Resend failed', res.status, await res.text()); }
    }
  }
  return { push, email };
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return json(405, { error: 'POST only' });
    const secret = env('WEBHOOK_SECRET');
    if (!safeEqual(req.headers.get('x-webhook-secret') ?? '', secret)) return json(401, { error: 'Bad or missing x-webhook-secret header' });

    const payload = (await req.json()) as WebhookPayload;
    if (payload.type !== 'INSERT' || payload.schema !== 'public' || !payload.record) return json(200, { skipped: 'not an insert' });

    const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
    if (payload.table === 'issues') return json(200, await onIssue(db, payload.record as IssueRecord));
    if (payload.table === 'sessions') return json(200, await onSession(db, payload.record as unknown as RankSession));
    if (payload.table !== 'likes' && payload.table !== 'comments') return json(200, { skipped: `table ${payload.table}` });
    const rec = payload.record as LikeRecord | CommentRecord;

    // '*' rather than naming title: a database not yet updated for session names has no title column
    const { data: session, error: sErr } = await db.from('sessions').select('*').eq('id', rec.session_id).maybeSingle();
    if (sErr) throw new Error(`Session lookup failed: ${sErr.message}`);
    if (!session) return json(200, { skipped: 'session not found' });
    if (session.user_id === rec.user_id) return json(200, { skipped: 'own action' });

    // Hearts notify once per person per session: un-hearting and hearting again doesn't buzz the owner again.
    if (payload.table === 'likes') {
      const { data: first, error: logErr } = await db.from('notify_log')
        .upsert({ key: `like:${rec.session_id}:${rec.user_id}` }, { onConflict: 'key', ignoreDuplicates: true }).select('key');
      if (logErr) console.error('notify_log unavailable (run supabase/schema.sql):', logErr.message);
      else if (!first?.length) return json(200, { skipped: 'already notified for this heart' });
    }

    const [{ data: actor }, { data: subs, error: subErr }] = await Promise.all([
      db.from('profiles').select('name').eq('id', rec.user_id).maybeSingle(),
      db.from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', session.user_id),
    ]);
    if (subErr) throw new Error(`Subscription lookup failed: ${subErr.message}`);
    if (!subs?.length) return json(200, { skipped: 'owner has no push subscriptions' });

    const who = (actor?.name as string | undefined)?.trim() || 'Someone';
    // the climber's own name for it, or else its protocol's (JUST LET ME HANG has been renamed since)
    const what = (session.title as string | undefined)?.trim() || ((session.protocol_name as string)?.trim() || 'session').replace(/^JUST LET ME HANG$/, 'QUICK SESH');
    const isComment = payload.table === 'comments';
    return json(200, await pushTo(db, subs as SubRow[], {
      title: isComment ? `${who} commented on your ${what}` : `${who} ❤️ hearted your ${what}`,
      body: isComment ? `“${truncate((rec as CommentRecord).body ?? '')}”` : 'Tap to see it in Activity',
      url: `?post=${encodeURIComponent(rec.session_id)}#feed`, // resolved against the app's scope by push-sw.js
      tag: `session-${rec.session_id}`,                         // repeated hearts on one post collapse into one
    }));
  } catch (e) {
    console.error(e);
    return json(500, { error: 'internal error, see function logs' });
  }
});
