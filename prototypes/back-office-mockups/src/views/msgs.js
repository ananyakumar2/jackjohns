import { store, state, isInquiry, TODAY } from '../store.js';
import { esc, icon, ago, avatar, fmt } from '../ui.js';

export const sorted = () => [...store.threads].sort((a, b) => last(b).at - last(a).at);
export const last = (t) => t.messages[t.messages.length - 1];
export const booking = (t) => (t.booking ? store.byId[t.booking] : null);
export const isInq = (t) => { const b = booking(t); return b ? isInquiry(b) : false; };
export const history = (name) => store.items.filter((b) => b.client === name).sort((a, b) => b.start - a.start);
export const title = (t) => t.org || t.who;

export function bubbles(t) {
  let lastDay = '';
  return t.messages.map((m) => {
    const day = fmt.day(m.at);
    const sep = day !== lastDay ? `<div class="msg-day">${day}</div>` : '';
    lastDay = day;
    return `${sep}<div class="msg ${m.from}"><div class="bubble ${m.from === 'jack' ? 'jack' : ''}">${esc(m.text)}</div><span class="msg-t">${fmt.time(m.at)}</span></div>`;
  }).join('');
}

// Quick replies tuned to what the thread is about.
export function suggestions(t) {
  const b = booking(t);
  const first = t.who.split(' ')[0];
  if (!b) return [];
  const s = state(b);
  if (isInquiry(b) && b.price == null) return [`Thanks ${first}, I'm interested. My rate for this is AED 8,000; happy to talk through the details.`, `Thanks ${first}, I'm not available on those dates, unfortunately. Please keep me in mind for the next one.`];
  if (s === 'tentative') return [`Hi ${first}, confirmed! See you ${fmt.day(b.start)}. Cash on the day is perfect.`, `Hi ${first}, that slot doesn't work for me. Could you do another time that week?`];
  if (s === 'due') return [`Hi ${first}, just a reminder about the AED ${b.price?.toLocaleString('en-GB')} from ${fmt.dm(b.start)} when you're next nearby.`];
  return [`Thanks ${first}, see you ${fmt.day(b.start)}.`, `No problem ${first}, I've moved it. Pick any free slot and I'll lock it in.`];
}

export const composer = (t, { placeholder = 'Reply' } = {}) => `<form class="composer" data-send="${t.id}">
  <div class="chips">${suggestions(t).map((s) => `<button type="button" class="qr" data-fill="${esc(s)}">${esc(s.length > 46 ? `${s.slice(0, 44)}…` : s)}</button>`).join('')}</div>
  <div class="row" style="align-items:flex-end"><textarea class="reply" rows="2" placeholder="${placeholder}"></textarea><button class="btn btn-blue btn-icon" aria-label="Send">${icon('send')}</button></div>
  <div class="tiny faint">Sends from Jack's email · Ctrl+Enter</div>
</form>`;

export const msgCss = `
.msg { display: grid; justify-items: start; gap: 3px; }
.msg.jack { justify-items: end; }
.msg + .msg { margin-top: 10px; }
.msg-t { font-size: 9.5px; color: var(--faint); padding: 0 4px; }
.msg-day { text-align: center; font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--faint); margin: 18px 0 12px; }
.composer { display: grid; gap: 8px; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.qr { height: 28px; padding: 0 11px; border-radius: 999px; border: 1px solid var(--line-2); background: transparent; color: var(--type); font-size: 10.5px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qr:hover { border-color: var(--blue); color: var(--type-hi); }
.unread-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--blue); flex: none; box-shadow: 0 0 6px rgb(63 123 255 / 0.6); }
`;

export { avatar, ago, TODAY };
