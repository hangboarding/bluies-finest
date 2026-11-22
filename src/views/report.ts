// "Report an issue": a member describes a problem or idea; it's saved for the admins, who get an
// in-app notification (and, when the server is set up for it, a phone notification and an email).
import { esc, sheet, toast } from '../lib/ui';
import { ic, hydrateIcons } from '../lib/icons';
import { state } from '../lib/state';
import type { IssueCategory } from '../lib/types';

export const ISSUE_CATS: Record<IssueCategory, string> = { bug: 'Something’s broken', idea: 'Idea', account: 'Account or sign-in', other: 'Other' };

/** Device, browser and screen details that help an admin reproduce a problem. */
function context() {
  const nav = navigator as any, standalone = matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
  return [
    `Page: ${location.hash.replace('#', '') || 'hang'}`,
    `${standalone ? 'Installed app' : 'Browser'} · ${innerWidth}×${innerHeight}`,
    navigator.userAgent,
  ].join(' | ');
}

export async function openReport() {
  let el!: HTMLElement, cat: IssueCategory = 'bug';
  const body = `<p class="sub" style="margin:0 0 12px">Tell the admins what went wrong or what you’d like. Your name is included so they can follow up.</p>
    <div class="chips rep-cats" role="radiogroup" aria-label="Type of issue">${(Object.keys(ISSUE_CATS) as IssueCategory[]).map(k =>
      `<button type="button" class="chip ${k === cat ? 'on' : ''}" data-cat="${k}" role="radio" aria-checked="${k === cat}">${esc(ISSUE_CATS[k])}</button>`).join('')}</div>
    <textarea class="tx rep-body" id="repBody" maxlength="2000" rows="6" placeholder="What happened? What did you expect? Steps to make it happen again help a lot." aria-label="Describe the issue"></textarea>
    <p class="sub" style="font-size:12px;margin:6px 0 0;text-align:left">${ic('lock')} Your device and browser type are attached to help fix it.</p>`;
  const done = sheet({
    title: `${ic('bug')} Report an issue`, body,
    buttons: [{ label: 'Send report', kind: 'primary' }, { label: 'Cancel', kind: 'ghost' }],
    onMount: e => {
      el = e; e.classList.add('report-sheet'); hydrateIcons(e);
      e.addEventListener('click', ev => {
        const c = (ev.target as HTMLElement).closest('[data-cat]') as HTMLElement | null; if (!c) return;
        cat = c.dataset.cat as IssueCategory;
        e.querySelectorAll<HTMLElement>('[data-cat]').forEach(b => { const on = b === c; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
      });
    },
  });
  // the sheet closes on any button, so read the text before it's lost and reopen on a mistake
  const text = () => (el.querySelector('#repBody') as HTMLTextAreaElement).value.trim();
  const choice = await done;
  if (choice !== 0) return;
  const msg = text();
  if (!msg) { toast('Describe the problem first'); return openReport(); }
  try {
    await state.store.reportIssue({ category: cat, body: msg, context: context() });
    toast('Thanks! Sent to the admins.', 3500);
  } catch (err: any) { toast(err.message ?? 'Couldn’t send that. Try again.', 4500); }
}
