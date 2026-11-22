import { $, esc, toast } from '../lib/ui';
import { state } from '../lib/state';
import { animatedLogo, playLogo } from '../lib/logo-anim';

type Mode = 'in' | 'up' | 'forgot' | 'reset';

let logoPlayed = false;
const EYE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c4.67 0 8.68 2.84 10.36 6.89a1 1 0 0 1 0 .22 13.2 13.2 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 1.64 11.9a1 1 0 0 0 0 .2A10.75 10.75 0 0 0 12 19c1.67 0 3.24-.36 4.66-1.01"/><path d="M14.08 14.16a3 3 0 0 1-4.24-4.24"/><path d="m2 2 20 20"/></svg>';

export function renderAuth(root: HTMLElement, mode: Mode = 'in') {
  const demo = state.store.kind === 'local';
  const field = (id: string, ph: string, type = 'text', ac = '') => {
    const input = `<input class="tx" id="${id}" type="${type}" placeholder="${ph}" aria-label="${ph}" autocomplete="${ac}" style="margin-bottom:10px">`;
    return type === 'password' ? `<div class="pwwrap">${input}<button type="button" class="pweye" aria-label="Show password" aria-pressed="false">${EYE}</button></div>` : input;
  };
  root.innerHTML = `<div class="auth">
    ${animatedLogo(156)}
    <h1 class="auth-title">Bluies <span>Finest</span></h1>
    <p class="auth-tag center">Hangboard accountability and bragging rights.</p>
    <div class="card">
      ${mode === 'in' || mode === 'up' ? `<div class="seg" id="authSeg" style="margin-bottom:14px"><button data-m="in" class="${mode === 'in' ? 'on' : ''}">Log in</button><button data-m="up" class="${mode === 'up' ? 'on' : ''}">Sign up</button></div>` : ''}
      <form id="authForm" novalidate>
        ${mode === 'up' ? field('aName', 'Name', 'text', 'nickname') : ''}
        ${mode !== 'reset' ? field('aEmail', 'Email', 'email', 'email') : ''}
        ${mode === 'in' || mode === 'up' ? field('aPw', mode === 'up' ? 'Password (min 8 characters)' : 'Password', 'password', mode === 'up' ? 'new-password' : 'current-password') : ''}
        ${mode === 'reset' ? field('aPw', 'New password (min 8 characters)', 'password', 'new-password') + field('aPw2', 'Repeat new password', 'password', 'new-password') : ''}
        ${mode === 'up' ? field('aCode', 'Invite code', 'text', 'off') : ''}
        <button class="big" type="submit" id="aGo">${{ in: 'Send it', up: 'Create account', forgot: 'Send reset link', reset: 'Set new password' }[mode]}</button>
      </form>
      <div class="links">${mode === 'in' ? '<a data-go="forgot">Forgot password?</a>' : mode !== 'up' ? '<a data-go="in">Back to log in</a>' : ''}</div>
      ${demo ? `<p class="sub center" style="font-size:12px;margin:0">Demo mode: accounts live in this browser only. Invite code is <b>BLUIES</b>.</p>` : ''}
    </div>
    <p class="center" style="font-size:12px;margin:14px 0 0"><a class="sub" href="tour/" style="color:var(--mute)">Take the tour</a></p></div>`;
  // play the logo animation once; switching between Log in / Sign up shows it finished
  if (logoPlayed) root.querySelector('.logo-anim')?.classList.add('la-static', 'la-top'); else { logoPlayed = true; playLogo(root); }
  root.onclick = e => {
    const m = (e.target as HTMLElement).closest('[data-m],[data-go]') as HTMLElement | null;
    if (m) { e.preventDefault(); renderAuth(root, (m.dataset.m ?? m.dataset.go) as Mode); }
  };
  const form = $('#authForm') as HTMLFormElement;
  form.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest('.pweye') as HTMLButtonElement | null; if (!b) return;
    const i = b.previousElementSibling as HTMLInputElement, show = i.type === 'password';
    i.type = show ? 'text' : 'password';
    b.innerHTML = show ? EYE_OFF : EYE; b.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); b.setAttribute('aria-pressed', String(show));
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = (id: string) => (($(`#${id}`) as HTMLInputElement | null)?.value ?? '').trim();
    const btn = $('#aGo') as HTMLButtonElement; btn.disabled = true;
    try {
      if (mode !== 'reset' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('aEmail'))) throw new Error('Enter a valid email address');
      if (mode === 'in') await state.store.signIn(v('aEmail'), ($('#aPw') as HTMLInputElement).value);
      if (mode === 'up') {
        if (!v('aName')) throw new Error('Enter your name');
        if (($('#aPw') as HTMLInputElement).value.length < 8) throw new Error('Password must be at least 8 characters');
        await state.store.signUp({ name: v('aName').slice(0, 40), email: v('aEmail'), password: ($('#aPw') as HTMLInputElement).value, inviteCode: v('aCode') });
        if (!state.store.currentUserId()) { root.querySelector('.card')!.innerHTML = `<h2>Check your email ✉️</h2><p class="sub">We sent a confirmation link to <b>${esc(v('aEmail'))}</b>. Tap it, then come back and log in.</p><button class="big" id="back">Back to log in</button>`; $('#back').onclick = () => renderAuth(root, 'in'); }
      }
      if (mode === 'forgot') { await state.store.requestPasswordReset(v('aEmail')); toast('If that email has an account, a reset link is on its way', 4000); renderAuth(root, 'in'); }
      if (mode === 'reset') {
        const a = ($('#aPw') as HTMLInputElement).value;
        if (a.length < 8) throw new Error('Password must be at least 8 characters');
        if (a !== ($('#aPw2') as HTMLInputElement).value) throw new Error('Passwords don’t match');
        await state.store.updatePassword(a); history.replaceState(null, '', location.pathname); toast('Password updated. You’re logged in.'); location.reload();
      }
    } catch (err: any) { toast(err.message ?? 'Something went wrong', 4000); }
    finally { btn.disabled = false; }
  });
}
