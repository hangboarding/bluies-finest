// Admin tools (only shown to admins; the database enforces it too):
// invite codes, members overview, and removing sessions or comments.
import { esc, avatar, sheet, toast, confirmSheet, promptSheet, relTime } from '../lib/ui';
import { ic, hydrateIcons } from '../lib/icons';
import { state } from '../lib/state';
import type { Comment, InviteCode } from '../lib/types';

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
  if (f.status === 'fulfilled') comments = f.value.flatMap(x => x.comments.map(cm => ({ ...cm, protocol: x.session.protocolName }))).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 25);
  if (!root?.isConnected) return;

  const who = (id: string) => state.profiles.get(id);
  const counts = new Map<string, number>(); for (const s of state.sessions) counts.set(s.userId, (counts.get(s.userId) ?? 0) + 1);
  const recent = [...state.sessions].filter(s => !s.pendingUpload).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 25);

  root.innerHTML = `
    <h2 style="display:flex;align-items:center;gap:8px;margin:0">${ic('admin')} Admin tools</h2>
    <p class="sub" style="margin:4px 0 0">Only admins can see this page.</p>

    <h3>${ic('ticket')} Invite codes</h3>
    ${codeErr ? `<p class="sub">${codeErr}</p>` : `
      ${codes.map(k => `<div class="lrow" data-code="${esc(k.code)}"><span class="nm"><span class="code">${esc(k.code)}</span>
        <small>Used ${k.uses}${k.maxUses == null ? ' · unlimited' : ` of ${k.maxUses}`}${k.maxUses != null && k.uses >= k.maxUses ? ' · used up' : ''}</small></span>
        <button class="ed" data-act="copy" aria-label="Copy ${esc(k.code)}">${ic('copy')}</button>
        <button class="ed" data-act="limit" aria-label="Change limit for ${esc(k.code)}">${ic('edit')}</button>
        <button class="ed" data-act="delcode" aria-label="Delete ${esc(k.code)}">${ic('trash')}</button></div>`).join('') || '<p class="sub">No codes — nobody can join until you add one.</p>'}
      <div class="adm-new"><input class="tx" id="newCode" placeholder="NEW-CODE" maxlength="40" autocapitalize="characters" aria-label="New invite code">
        <input class="tx" id="newMax" type="number" min="1" inputmode="numeric" placeholder="∞ uses" aria-label="Maximum uses (blank for unlimited)">
        <button data-act="addcode" aria-label="Add code">+</button></div>
      <p class="sub" style="font-size:12px;margin:6px 0 0">Codes are saved in capitals and aren't case-sensitive when people sign up. Leave uses blank for unlimited. Deleting a code doesn't affect people who already joined.</p>`}

    <h3>${ic('users')} Members (${state.profiles.size})</h3>
    ${[...state.profiles.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(p => `<div class="lrow">${avatar(p)}<span class="nm">${esc(p.name)}${p.isAdmin ? ' · admin' : ''}<small>Joined ${new Date(p.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · ${counts.get(p.id) ?? 0} recent sessions</small></span></div>`).join('')}

    <h3>${ic('calendar')} Recent sessions</h3>
    ${recent.map(s => `<div class="lrow" data-sid="${s.id}"><span class="nm">${esc(who(s.userId)?.name ?? 'Climber')} · ${esc(s.protocolName)}<small>${relTime(s.createdAt)} · ${s.edgeMm}mm · ${s.fullHangs}/${s.totalHangs} full · ${s.points} pts${s.note ? ` · “${esc(s.note.slice(0, 40))}”` : ''}</small></span>
      <button class="ed" data-act="delsess" aria-label="Remove session">${ic('trash')}</button></div>`).join('') || '<p class="sub">No sessions yet.</p>'}

    <h3>${ic('comment')} Recent comments</h3>
    ${comments.map(cm => `<div class="lrow" data-cid="${cm.id}"><span class="nm">${esc(who(cm.userId)?.name ?? 'Climber')} on ${esc(cm.protocol)}<small>${relTime(cm.createdAt)} · “${esc(cm.body.slice(0, 80))}”</small></span>
      <button class="ed" data-act="delcm" aria-label="Remove comment">${ic('trash')}</button></div>`).join('') || '<p class="sub">No comments yet.</p>'}
    <br>`;
  hydrateIcons(root);
}

async function onClick(e: MouseEvent) {
  const b = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null; if (!b) return;
  const row = b.closest('.lrow') as HTMLElement | null, code = row?.dataset.code ?? '';
  try {
    switch (b.dataset.act) {
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
        await state.store.deleteSession(row!.dataset.sid!); state.sessions = state.sessions.filter(x => x.id !== row!.dataset.sid); toast('Session removed'); break;
      }
      case 'delcm':
        if (!await confirmSheet('Remove comment?', 'This permanently removes the comment.', 'Remove')) return;
        await state.store.deleteComment(row!.dataset.cid!); toast('Comment removed'); break;
    }
    draw();
  } catch (err: any) { toast(err.message ?? 'That didn’t work', 4000); }
}
