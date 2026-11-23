// Admin tools (only shown to admins; the database enforces it too):
// invite codes, members overview, and removing sessions or comments.
import { esc, avatar, sheet, toast, confirmSheet, promptSheet, relTime, closeSheet } from '../lib/ui';
import { ic, hydrateIcons } from '../lib/icons';
import { state } from '../lib/state';
import type { ChallengeRow, Comment, InviteCode, Issue } from '../lib/types';
import { ISSUE_CATS } from './report';
import { forgetClimber } from './climber';
import { METRICS, todayISO, type Metric } from '../lib/challenges';
import { rescoreDay, scoringDay } from '../lib/scoring';

let root: HTMLElement | null = null;

export function openAdmin() {
  if (!state.me?.isAdmin) return toast('Only admins can open this');
  sheet({ body: '<div class="admin"><p class="sub center">Loading…</p></div>', onMount: el => { el.classList.add('admin-sheet'); root = el.querySelector('.admin'); } });
  draw();
  root!.addEventListener('click', onClick);
}

async function draw() {
  if (!root) return;
  let codes: InviteCode[] = [], comments: (Comment & { protocol: string })[] = [], codeErr = '';
  const [c, f] = await Promise.allSettled([state.store.listInviteCodes(), state.store.feed(60)]);
  if (c.status === 'fulfilled') codes = c.value;
  else codeErr = 'Run supabase/admin.sql in the Supabase SQL editor to manage invite codes from here.';
  let issues: Issue[] = [], issueErr = '';
  try { issues = await state.store.listIssues(); } catch { issueErr = 'Run supabase/issues.sql in the Supabase SQL editor to receive problem reports.'; }
  if (f.status === 'fulfilled') comments = f.value.flatMap(x => x.comments.map(cm => ({ ...cm, protocol: x.session.protocolName }))).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 25);
  if (!root?.isConnected) return;

  const who = (id: string) => state.profiles.get(id);
  let chals: ChallengeRow[] = [];
  try { chals = await state.store.listChallenges(); state.challenges = chals; } catch { /* seasons.sql not run yet */ }
  const today = todayISO(), [ty, tm] = today.split('-').map(Number);
  const monthStart = `${ty}-${String(tm).padStart(2, '0')}-01`, monthEnd = `${ty}-${String(tm).padStart(2, '0')}-${String(new Date(Date.UTC(ty!, tm!, 0)).getUTCDate()).padStart(2, '0')}`;
  const counts = new Map<string, number>(); for (const s of state.sessions) counts.set(s.userId, (counts.get(s.userId) ?? 0) + 1);
  const recent = [...state.sessions].filter(s => !s.pendingUpload).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 25);

  root.innerHTML = `
    <div class="adm-top"><button type="button" class="adm-back" data-act="close" aria-label="Close admin tools">← Back</button><h2>${ic('admin')} Admin tools</h2></div>
    <p class="sub" style="margin:4px 0 0">Only admins can see this page.</p>

    <h3>${ic('bug')} Reported issues${issues.some(i => i.status === 'open') ? ` (${issues.filter(i => i.status === 'open').length} open)` : ''}</h3>
    ${issueErr ? `<p class="sub">${issueErr}</p>` : issues.map(i => `<div class="iss ${i.status === 'resolved' ? 'done' : ''}" data-iss="${i.id}">
      <div class="iss-hd">${avatar(who(i.userId))}<b>${esc(who(i.userId)?.name ?? 'Climber')}</b> · ${esc(ISSUE_CATS[i.category] ?? i.category)}<small>${relTime(i.createdAt)}${i.status === 'resolved' ? ' · resolved' : ''}</small></div>
      <p>${esc(i.body)}</p>${i.context ? `<div class="ctx">${esc(i.context)}</div>` : ''}
      <div class="iss-act"><button class="pill" data-act="${i.status === 'open' ? 'resolve' : 'reopen'}">${i.status === 'open' ? `${ic('check')} Mark resolved` : 'Reopen'}</button>
        <button class="ed" data-act="deliss" aria-label="Delete report">${ic('trash')}</button></div></div>`).join('') || '<p class="sub">No reports. Members can send one from Profile → Report an issue.</p>'}

    <h3>${ic('ticket')} Invite codes</h3>
    ${codeErr ? `<p class="sub">${codeErr}</p>` : `
      ${codes.map(k => `<div class="lrow" data-code="${esc(k.code)}"><span class="nm"><span class="code">${esc(k.code)}</span>
        <small>Used ${k.uses}${k.maxUses == null ? ' · unlimited' : ` of ${k.maxUses}`}${k.maxUses != null && k.uses >= k.maxUses ? ' · used up' : ''}</small></span>
        <button class="ed" data-act="copy" aria-label="Copy ${esc(k.code)}">${ic('copy')}</button>
        <button class="ed" data-act="limit" aria-label="Change limit for ${esc(k.code)}">${ic('edit')}</button>
        <button class="ed" data-act="delcode" aria-label="Delete ${esc(k.code)}">${ic('trash')}</button></div>`).join('') || '<p class="sub">No codes yet. Nobody can join until you add one.</p>'}
      <div class="adm-new"><input class="tx" id="newCode" placeholder="NEW-CODE" maxlength="40" autocapitalize="characters" aria-label="New invite code">
        <input class="tx" id="newMax" type="number" min="1" inputmode="numeric" placeholder="∞ uses" aria-label="Maximum uses (blank for unlimited)">
        <button data-act="addcode" aria-label="Add code">+</button></div>
      <p class="sub" style="font-size:12px;margin:6px 0 0">Codes are saved in capitals and aren't case-sensitive when people sign up. Leave uses blank for unlimited. Deleting a code doesn't affect people who already joined.</p>`}

    <h3>${ic('ticket')} Group challenges</h3>
    ${chals.map(ch => `<div class="lrow" data-chal="${ch.id}"><span class="nm">${esc(ch.title)}<small>${METRICS[ch.metric]?.label ?? esc(ch.metric)}: ${ch.target.toLocaleString()} · ${ch.startsOn} → ${ch.endsOn}${ch.startsOn <= today && ch.endsOn >= today ? ' · running now' : ch.endsOn < today ? ' · finished' : ' · upcoming'}</small></span>
      <button class="ed" data-act="delchal" aria-label="Delete challenge">${ic('trash')}</button></div>`).join('') || '<p class="sub" style="margin:0 0 6px">No custom challenges. The app runs an automatic monthly hangs challenge.</p>'}
    <div class="adm-chal">
      <input class="tx" id="chTitle" maxlength="80" placeholder="Title, e.g. 500 hangs in December" aria-label="Challenge title">
      <div class="row2"><select id="chMetric" aria-label="What counts">${(Object.keys(METRICS) as Metric[]).map(k => `<option value="${k}">${METRICS[k].label}</option>`).join('')}</select>
        <input class="tx" id="chTarget" type="number" min="1" inputmode="numeric" placeholder="Target" aria-label="Target"></div>
      <div class="row2"><input class="tx" id="chStart" type="date" value="${monthStart}" aria-label="Start date"><input class="tx" id="chEnd" type="date" value="${monthEnd}" aria-label="End date"></div>
      <button class="big ghost" data-act="addchal">${ic('plus')} Set challenge</button>
    </div>
    <p class="sub" style="font-size:12px;margin:6px 0 0">Up to 3 months long. Everyone sees the running one at the top of Activity with a shared progress bar.</p>

    <h3>${ic('users')} Members (${state.profiles.size})</h3>
    ${[...state.profiles.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(p => `<div class="lrow">${avatar(p)}<span class="nm">${esc(p.name)}${p.isAdmin ? ' · admin' : ''}<small>Joined ${new Date(p.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · ${counts.get(p.id) ?? 0} recent sessions</small></span></div>`).join('')}

    <h3>${ic('calendar')} Recent sessions</h3>
    ${recent.map(s => `<div class="lrow" data-sid="${s.id}"><span class="nm">${esc(who(s.userId)?.name ?? 'Climber')} · ${esc(s.protocolName)}<small>${relTime(s.createdAt)} · ${s.edgeMm}mm · ${s.fullHangs}/${s.totalHangs} full · ${s.points} pts${s.note ? ` · “${esc(s.note.slice(0, 40))}”` : ''}</small></span>
      <button class="ed" data-act="delsess" aria-label="Remove session">${ic('trash')}</button></div>`).join('') || '<p class="sub">No sessions yet.</p>'}

    <h3>${ic('download')} Backup</h3>
    <p class="sub" style="margin:0 0 8px">Download every member's sessions, hearts, comments and profile (name and photo link only) as one file. Private details like bodyweight, age, height and location aren't included. Admins can't see those either. Worth doing every month or so; the free Supabase plan has no downloadable backups.</p>
    <button class="big ghost" data-act="backup">${ic('download')} Back up everything</button>

    <h3>${ic('comment')} Recent comments</h3>
    ${comments.map(cm => `<div class="lrow" data-cid="${cm.id}"><span class="nm">${esc(who(cm.userId)?.name ?? 'Climber')} on ${esc(cm.protocol)}<small>${relTime(cm.createdAt)} · “${esc(cm.body.slice(0, 80))}”</small></span>
      <button class="ed" data-act="delcm" aria-label="Remove comment">${ic('trash')}</button></div>`).join('') || '<p class="sub">No comments yet.</p>'}
    <br>`;
  hydrateIcons(root);
}

/** Every heart and comment. On Supabase this pages through the tables directly (a single
 *  request is capped at 1,000 rows); in demo mode it reads them from the feed. */
async function allHeartsAndComments(): Promise<{ hearts: { sessionId: string; userId: string; createdAt?: string }[]; comments: Comment[] }> {
  const client = (state.store as any).client;
  if (!client) {
    const feed = await state.store.feed(100000);
    return { hearts: feed.flatMap(x => Array.from({ length: x.likes }, () => ({ sessionId: x.session.id, userId: '' }))), comments: feed.flatMap(x => x.comments) };
  }
  const page = async (table: string, select: string) => {
    const out: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await client.from(table).select(select).order('created_at').range(from, from + 999);
      if (error) throw new Error(error.message);
      out.push(...(data ?? []));
      if (!data || data.length < 1000) return out;
    }
  };
  const [likes, comments] = await Promise.all([page('likes', 'session_id,user_id,created_at'), page('comments', 'id,session_id,user_id,body,created_at')]);
  return {
    hearts: likes.map(r => ({ sessionId: r.session_id, userId: r.user_id, createdAt: r.created_at })),
    comments: comments.map(r => ({ id: r.id, sessionId: r.session_id, userId: r.user_id, body: r.body, createdAt: r.created_at })),
  };
}

/** Everything the group can see, in one JSON file: profiles, every session (full history,
 *  not just the recent window the app keeps loaded), hearts, comments and invite codes. */
async function backupAll(btn: HTMLButtonElement) {
  btn.disabled = true; const label = btn.innerHTML; btn.textContent = 'Preparing backup…';
  try {
    const [profiles, sessions, codes, social] = await Promise.all([
      state.store.listProfiles(), state.store.listSessions(), // listSessions pages through everything
      state.store.listInviteCodes().catch(() => [] as InviteCode[]),
      allHeartsAndComments(),
    ]);
    const data = {
      app: 'Bluies Finest', kind: 'full-backup', version: 1, exportedAt: new Date().toISOString(), exportedBy: state.me?.name,
      counts: { members: profiles.length, sessions: sessions.length, hearts: social.hearts.length, comments: social.comments.length },
      profiles: profiles.map(p => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl, isAdmin: p.isAdmin, createdAt: p.createdAt })),
      sessions,
      hearts: social.hearts,
      comments: social.comments,
      inviteCodes: codes,
    };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = `bluies-finest-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast(`Backup downloaded: ${data.counts.sessions} sessions, ${data.counts.members} members`, 4000);
  } finally { btn.disabled = false; btn.innerHTML = label; }
}

async function onClick(e: MouseEvent) {
  const b = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null; if (!b) return;
  const row = b.closest('.lrow') as HTMLElement | null, code = row?.dataset.code ?? '';
  try {
    switch (b.dataset.act) {
      case 'close': closeSheet(root!); return;
      case 'backup': await backupAll(b as HTMLButtonElement); return;
      case 'resolve': case 'reopen':
        await state.store.setIssueStatus((b.closest('.iss') as HTMLElement).dataset.iss!, b.dataset.act === 'resolve' ? 'resolved' : 'open'); break;
      case 'deliss':
        if (!await confirmSheet('Delete report?', 'This permanently removes the report.', 'Delete')) return;
        await state.store.deleteIssue((b.closest('.iss') as HTMLElement).dataset.iss!); toast('Report deleted'); break;
      case 'addchal': {
        const v = (id: string) => (root!.querySelector(id) as HTMLInputElement).value.trim();
        const title = v('#chTitle'), target = Math.floor(+v('#chTarget')), startsOn = v('#chStart'), endsOn = v('#chEnd');
        if (!title) return toast('Give the challenge a title');
        if (!(target > 0)) return toast('Set a target above 0');
        if (!startsOn || !endsOn || endsOn < startsOn) return toast('Check the dates. The end must be after the start.');
        if ((+new Date(endsOn) - +new Date(startsOn)) / 864e5 > 92) return toast('Challenges can be up to 3 months long');
        await state.store.saveChallenge({ title, metric: v('#chMetric') as Metric, target, startsOn, endsOn });
        toast('Challenge set 🎯'); break;
      }
      case 'delchal':
        if (!await confirmSheet('Delete challenge?', 'It disappears for everyone. If nothing else is running, the automatic monthly challenge takes over.', 'Delete')) return;
        await state.store.deleteChallenge(row!.dataset.chal!); toast('Challenge deleted'); break;
      case 'copy':
        try { await navigator.clipboard.writeText(code); toast(`Copied ${code}`); } catch { toast(code); }
        return;
      case 'limit': {
        const v = await promptSheet(`Limit for ${esc(code)}`, 'How many people can join with this code in total? Leave blank for unlimited.', 'Unlimited', 'Save');
        if (v === null) return;
        const n = v.trim() === '' ? null : Math.floor(+v);
        if (n !== null && (!isFinite(n) || n < 0)) return toast('Enter a whole number, or leave it blank');
        await state.store.saveInviteCode(code, n); toast('Limit updated'); break;
      }
      case 'delcode':
        if (!await confirmSheet('Delete invite code?', `Nobody new will be able to join with <b>${esc(code)}</b>. People who already joined aren't affected.`, 'Delete')) return;
        await state.store.deleteInviteCode(code); toast('Code deleted'); break;
      case 'addcode': {
        const c = (root!.querySelector('#newCode') as HTMLInputElement).value, m = (root!.querySelector('#newMax') as HTMLInputElement).value.trim();
        if (!c.trim()) return toast('Type a code first');
        await state.store.saveInviteCode(c, m === '' ? null : Math.max(1, Math.floor(+m))); toast(`Code ${c.trim().toUpperCase()} added`); break;
      }
      case 'delsess': {
        const s = state.sessions.find(x => x.id === row!.dataset.sid);
        if (!await confirmSheet('Remove session?', `This permanently removes ${esc(state.profiles.get(s?.userId ?? '')?.name ?? 'this climber')}’s ${esc(s?.protocolName ?? '')} session, with its hearts and comments.`, 'Remove')) return;
        await state.store.deleteSession(row!.dataset.sid!); state.sessions = state.sessions.filter(x => x.id !== row!.dataset.sid); if (s) rescoreDay(state.sessions, s.userId, scoringDay(s.createdAt)); forgetClimber(s?.userId); toast('Session removed'); break;
      }
      case 'delcm':
        if (!await confirmSheet('Remove comment?', 'This permanently removes the comment.', 'Remove')) return;
        await state.store.deleteComment(row!.dataset.cid!); toast('Comment removed'); break;
    }
    draw();
  } catch (err: any) { toast(err.message ?? 'That didn’t work', 4000); }
}
