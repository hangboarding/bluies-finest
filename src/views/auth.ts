import { $, esc, toast } from '../lib/ui';
import { state } from '../lib/state';
import { animatedLogo, playLogo } from '../lib/logo-anim';

type Mode = 'in' | 'up' | 'forgot' | 'reset';

let logoPlayed = false;

export function renderAuth(root: HTMLElement, mode: Mode = 'in') {
  const demo = state.store.kind === 'local';
  const field = (id: string, ph: string, type = 'text', ac = '') => `<input class="tx" id="${id}" type="${type}" placeholder="${ph}" aria-label="${ph}" autocomplete="${ac}" style="margin-bottom:10px">`;
  root.innerHTML = `<div class="auth">
    ${animatedLogo(156)}
    <h1 class="auth-title">Bluies <span>Finest</span></h1>
    <p class="auth-tag center">Hangboard accountability and bragging rights.</p>
    <div class="card">
      ${mode === 'in' || mode === 'up' ? `<div class="seg" id="authSeg" style="margin-bottom:14px"><button data-m="in" class="${mode === 'in' ? 'on' : ''}">Sign in</button><button data-m="up" class="${mode === 'up' ? 'on' : ''}">Join</button></div>` : ''}
      <form id="authForm" novalidate>
        ${mode === 'up' ? field('aName', 'Name', 'text', 'nickname') : ''}
        ${mode !== 'reset' ? field('aEmail', 'Email', 'email', 'email') : ''}
        ${mode === 'in' || mode === 'up' ? field('aPw', mode === 'up' ? 'Password (min 6 characters)' : 'Password', 'password', mode === 'up' ? 'new-password' : 'current-password') : ''}
        ${mode === 'reset' ? field('aPw', 'New password (min 6 characters)', 'password', 'new-password') + field('aPw2', 'Repeat new password', 'password', 'new-password') : ''}
        ${mode === 'up' ? field('aCode', 'Invite code', 'text', 'off') + '<p class="sub" style="margin:-4px 0 10px;font-size:12px">Ask the crew for the code.</p>' : ''}
        <button class="big" type="submit" id="aGo">${{ in: 'Sign in', up: 'Create account', forgot: 'Send reset link', reset: 'Set new password' }[mode]}</button>
      </form>
      <div class="links">${mode === 'in' ? '<a data-go="forgot">Forgot password?</a>' : mode !== 'up' ? '<a data-go="in">Back to sign in</a>' : ''}</div>
      ${demo ? `<p class="sub center" style="font-size:12px;margin:0">Demo mode: accounts live in this browser only. Invite code is <b>BLUIES</b>.</p>` : ''}
    </div></div>`;
  // play the logo animation once; switching between Sign in / Join shows it finished
  if (logoPlayed) root.querySelector('.logo-anim')?.classList.add('la-static', 'la-top'); else { logoPlayed = true; playLogo(root); }
  root.onclick = e => {
    const m = (e.target as HTMLElement).closest('[data-m],[data-go]') as HTMLElement | null;
    if (m) { e.preventDefault(); renderAuth(root, (m.dataset.m ?? m.dataset.go) as Mode); }
  };
  $('#authForm').addEventListener('submit', async e => {
    e.preventDefault();
    const v = (id: string) => (($(`#${id}`) as HTMLInputElement | null)?.value ?? '').trim();
    const btn = $('#aGo') as HTMLButtonElement; btn.disabled = true;
    try {
      if (mode === 'in') await state.store.signIn(v('aEmail'), ($('#aPw') as HTMLInputElement).value);
      if (mode === 'up') {
        if (!v('aName')) throw new Error('Enter your name');
        await state.store.signUp({ name: v('aName').slice(0, 40), email: v('aEmail'), password: ($('#aPw') as HTMLInputElement).value, inviteCode: v('aCode') });
        if (!state.store.currentUserId()) { root.querySelector('.card')!.innerHTML = `<h2>Check your email ✉️</h2><p class="sub">We sent a confirmation link to <b>${esc(v('aEmail'))}</b>. Tap it, then come back and sign in.</p><button class="big" id="back">Back to sign in</button>`; $('#back').onclick = () => renderAuth(root, 'in'); }
      }
      if (mode === 'forgot') { await state.store.requestPasswordReset(v('aEmail')); toast('If that email has an account, a reset link is on its way', 4000); renderAuth(root, 'in'); }
      if (mode === 'reset') {
        const a = ($('#aPw') as HTMLInputElement).value;
        if (a.length < 6) throw new Error('Password must be at least 6 characters');
        if (a !== ($('#aPw2') as HTMLInputElement).value) throw new Error('Passwords don’t match');
        await state.store.updatePassword(a); history.replaceState(null, '', location.pathname); toast('Password updated — you’re signed in'); location.reload();
      }
    } catch (err: any) { toast(err.message ?? 'Something went wrong', 4000); }
    finally { btn.disabled = false; }
  });
}
