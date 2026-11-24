// Small DOM helpers shared by every view.
export const $ = <T extends HTMLElement = HTMLElement>(s: string, root: ParentNode = document) => root.querySelector(s) as T;
export const $$ = <T extends HTMLElement = HTMLElement>(s: string, root: ParentNode = document) => [...root.querySelectorAll(s)] as T[];

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function toast(text: string, ms = 2200) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.append(t); }
  t.textContent = text; t.classList.add('on');
  clearTimeout((t as any)._h); (t as any)._h = setTimeout(() => t.classList.remove('on'), ms);
}

let sheetSeq = 0;
const X_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
/** Bottom sheet. Resolves with the clicked button index, or -1 when dismissed (✕, backdrop, Escape or closeSheet).
 *  Without `buttons` it has a ✕ in the top corner instead of a row of buttons.
 *  `title` and `body` are HTML: callers escape any user text they put in them. */
export function sheet(opts: { title?: string; body?: string; buttons?: { label: string; kind?: 'primary' | 'danger' | 'ghost' }[]; onMount?: (el: HTMLElement) => void;
  /** false: don't focus the first text box. Date, number and slider fields are never focused by themselves. */
  autofocus?: boolean;
  /** Centred in the part of the screen the phone keyboard leaves visible, rather than at the bottom (for typing). */
  mid?: boolean }): Promise<number> {
  return new Promise(res => {
    const m = document.createElement('div'); m.className = opts.mid ? 'modal mid' : 'modal';
    const btns = opts.buttons;
    const tid = `sheet-t${++sheetSeq}`, opener = document.activeElement as HTMLElement | null;
    m.innerHTML = `<div class="card sheet${btns ? '' : ' has-x'}" role="dialog" aria-modal="true"${opts.title ? ` aria-labelledby="${tid}"` : ''} tabindex="-1">${btns ? '' : `<div class="sheet-xw"><button type="button" class="sheet-x" aria-label="Close">${X_SVG}</button></div>`}${opts.title ? `<h2 id="${tid}">${opts.title}</h2>` : ''}${opts.body ?? ''}
      ${btns ? `<div class="row">${btns.map((b, i) => `<button type="button" class="big ${b.kind === 'primary' ? '' : 'ghost'} ${b.kind === 'danger' ? 'danger' : ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>` : ''}</div>`;
    document.body.append(m);
    const card = m.querySelector('.sheet') as HTMLElement;
    // keep a centred sheet in the visible part of the screen while the keyboard is open
    const vv = opts.mid ? window.visualViewport : null;
    const fit = () => { if (vv) Object.assign(m.style, { top: `${vv.offsetTop}px`, height: `${vv.height}px`, bottom: 'auto' }); };
    vv?.addEventListener('resize', fit); vv?.addEventListener('scroll', fit); fit();
    let closed = false;
    const done = (i: number) => {
      if (closed) return; closed = true;
      removeEventListener('keydown', onKey, true); vv?.removeEventListener('resize', fit); vv?.removeEventListener('scroll', fit);
      m.remove(); res(i);
      if (opener?.isConnected && !document.querySelector('.modal')) opener.focus({ preventScroll: true });
    };
    // Escape closes the top-most sheet; Tab stays inside it
    const onKey = (e: KeyboardEvent) => {
      if ([...document.querySelectorAll('.modal')].pop() !== m) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(-1); return; }
      if (e.key !== 'Tab') return;
      const f = [...card.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],[tabindex]:not([tabindex="-1"])')].filter(x => !x.hasAttribute('disabled') && x.getClientRects().length);
      if (!f.length) return;
      const first = f[0]!, last = f[f.length - 1]!;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === card)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    addEventListener('keydown', onKey, true);
    m.addEventListener('sheet:close', () => done(-1));
    m.addEventListener('click', e => {
      if (e.target === m || (e.target as HTMLElement).closest('.sheet-x')) return done(-1);
      const b = (e.target as HTMLElement).closest('[data-i]') as HTMLElement | null;
      if (b && b.closest('.sheet > .row')) done(+b.dataset.i!);
    });
    opts.onMount?.(card);
    // Only a box you type into gets focus: on a phone, focusing a date, number or slider field pops up its
    // picker or keypad (iPhone opens the date wheel straight away), which is jarring when nothing was tapped.
    const typing = 'textarea,input:not([type]),input[type="text"],input[type="search"],input[type="email"],input[type="password"]';
    const input = opts.autofocus === false ? null : m.querySelector(typing) as HTMLElement | null;
    (input ?? card).focus({ preventScroll: true });
  });
}
/** Close the sheet that contains `el` (its promise resolves with -1). */
export const closeSheet = (el: Element) => el.closest('.modal')?.dispatchEvent(new Event('sheet:close'));

export async function confirmSheet(title: string, body: string, yes: string, no = 'Cancel', danger = true) {
  return (await sheet({ title, body: `<p class="sub">${body}</p>`, buttons: [{ label: no, kind: 'ghost' }, { label: yes, kind: danger ? 'danger' : 'primary' }] })) === 1;
}

export async function promptSheet(title: string, body: string, placeholder: string, yes = 'Save', value = ''): Promise<string | null> {
  let input!: HTMLInputElement;
  const i = await sheet({
    title, body: `<p class="sub">${body}</p><input class="tx" style="margin-bottom:12px" placeholder="${esc(placeholder)}" value="${esc(value)}">`,
    buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: yes, kind: 'primary' }], mid: true,
    onMount: el => { input = el.querySelector('input')!; input.addEventListener('keydown', e => { if (e.key === 'Enter') (el.querySelectorAll('.row button')[1] as HTMLElement).click(); }); },
  });
  return i === 1 ? input.value.trim() : null;
}

/** Text fields under `root` matching `sel` pick all their text when tapped into, so typing replaces it (a name to rename). */
export function pickAllOnFocus(root: HTMLElement, sel: string) {
  let fresh: EventTarget | null = null;
  root.addEventListener('focusin', e => {
    const n = (e.target as HTMLElement).closest(sel) as HTMLInputElement | null; if (!n) return;
    const was = n.value; fresh = n; n.select();
    setTimeout(() => { if (document.activeElement === n && n.value === was) n.setSelectionRange(0, n.value.length); }, 0); // iOS (unless typing's begun)
    setTimeout(() => { if (fresh === n) fresh = null; }, 600);
  });
  // the mouseup that ends the tap would otherwise drop the caret where it landed
  root.addEventListener('mouseup', e => { if (e.target === fresh) e.preventDefault(); fresh = null; });
}

/** A sideways swipe on `el` (a touch, or a mouse drag on the page itself). Mostly-vertical moves (scrolling), short ones,
 *  ones held for ages, and ones that start on a text field, slider, number stepper or drag handle don't count. */
export function onSwipe(el: HTMLElement, on: (dir: 'left' | 'right') => void) {
  let x0 = 0, y0 = 0, t0 = 0, live = false;
  const begin = (x: number, y: number, t: EventTarget | null) => {
    live = !(t as HTMLElement)?.closest?.('input,textarea,select,.step,.wq-h,[data-noswipe]');
    x0 = x; y0 = y; t0 = Date.now();
  };
  const end = (x: number, y: number) => {
    if (!live) return false; live = false;
    const dx = x - x0, dy = y - y0;
    if (Math.abs(dx) < 70 || Math.abs(dx) < 1.8 * Math.abs(dy) || Date.now() - t0 > 2500 || document.querySelector('.modal,.tour')) return false;
    on(dx > 0 ? 'right' : 'left'); return true;
  };
  el.addEventListener('touchstart', e => { const p = e.touches[0]; if (e.touches.length === 1 && p) begin(p.clientX, p.clientY, e.target); else live = false; }, { passive: true });
  el.addEventListener('touchend', e => { const p = e.changedTouches[0]; if (p) end(p.clientX, p.clientY); }, { passive: true });
  el.addEventListener('touchcancel', () => { live = false; });
  // a mouse drag counts only from the page itself, not from a button or a chip (that's a click). Dragging over
  // text also selects it, so a drag that counts as a swipe clears that selection.
  el.addEventListener('mousedown', e => { if (e.button === 0 && !(e.target as HTMLElement).closest('button,a,label,.chip,[role="button"]')) begin(e.clientX, e.clientY, e.target); else live = false; });
  el.addEventListener('mouseup', e => { if (end(e.clientX, e.clientY)) getSelection()?.removeAllRanges(); });
}
/** Slide `el` in from the side it's coming from (after a swipe or a switch). */
export function slideIn(el: HTMLElement, dir: 'left' | 'right') {
  el.classList.remove('slide-l', 'slide-r'); void el.offsetWidth; // restart the animation
  el.classList.add(dir === 'left' ? 'slide-l' : 'slide-r');
  el.addEventListener('animationend', () => el.classList.remove('slide-l', 'slide-r'), { once: true });
}

/** A small floating explanation bubble used by the ⓘ tooltips. */
export function bubble(title: string, html: string) {
  $('.bub')?.remove();
  const d = document.createElement('div'); d.className = 'bub';
  d.innerHTML = `<b>${title}</b>${html}`;
  document.body.append(d);
  setTimeout(() => d.remove(), 6000);
}
document.addEventListener('click', e => { if (!(e.target as HTMLElement).closest('.tip')) $('.bub')?.remove(); }, true);
// Keyboard: Enter or Space on anything acting as a button (role="button" on a span/div/i) clicks it.
document.addEventListener('keydown', e => {
  const t = e.target as HTMLElement;
  if ((e.key === 'Enter' || e.key === ' ') && t.getAttribute?.('role') === 'button' && !/^(BUTTON|A|INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) { e.preventDefault(); t.click(); }
});

const SB = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '').trim().replace(/\/+$/, '');
const AVATAR_BASE = SB ? `${SB}/storage/v1/object/public/avatars/` : '';
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || '?';
export function avatar(p: { name: string; avatarUrl?: string | null } | undefined, cls = 'av') {
  if (!p) return `<span class="${cls}">?</span>`;
  // Only URLs with no characters that could break out of CSS url('…'), and only from this app's own
  // avatar storage (or the demo's data: URLs), so a profile can't load an image from someone else's
  // server and log who looked at it.
  const u = p.avatarUrl ?? '', clean = /^[^'"()\\\s<>]+$/.test(u);
  const safe = clean && (/^data:image\/(png|jpeg|webp);base64,/.test(u) || (AVATAR_BASE ? u.startsWith(AVATAR_BASE) : /^https:\/\//.test(u)));
  return safe
    ? `<span class="${cls}" style="background-image:url('${esc(p.avatarUrl)}')"></span>`
    : `<span class="${cls}" style="background:${colourFor(p.name)}">${esc(initials(p.name))}</span>`;
}
const PALETTE = ['#f2c14e', '#c9d1d9', '#c8814a', '#f78fb3', '#5aa9e6', '#b48cff', '#4ecdc4', '#ff9f43'];
export function colourFor(s: string) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return PALETTE[Math.abs(h) % PALETTE.length]; }

export function relTime(iso: string) {
  const d = (Date.now() - +new Date(iso)) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} hr ago`;
  if (d < 172800) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export const vibrate = (p: number | number[]) => {
  try { if ((window as any).__prefs?.vib !== false && (navigator as any).userActivation?.hasBeenActive !== false) navigator.vibrate?.(p); } catch { /* unsupported */ }
};
