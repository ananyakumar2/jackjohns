import { store, state, isInquiry } from '../store.js';
import { esc, icon, ago, avatar, money, what, when, chip, actionsFor } from '../ui.js';
import { style, setTag } from './common.js';
import { sorted, last, booking, title, bubbles, composer, msgCss } from './msgs.js';

const LANES = [
  { key: 'inq', name: 'Inquiries', test: (b) => isInquiry(b) && b.status === 'tentative' },
  { key: 'ask', name: 'To confirm', test: (b) => !isInquiry(b) && b.status === 'tentative' },
  { key: 'on', name: 'Booked', test: (b) => state(b) === 'confirmed' },
  { key: 'cash', name: 'Cash and after', test: (b) => ['due', 'paid', 'unlocked', 'declined'].includes(state(b)) },
];

const css = `
${msgCss}
.mb { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; align-items: start; }
.mb-lane { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; padding: 10px; border-radius: 14px; background: var(--stage-2); border: 1px solid var(--line); min-height: 200px; }
.mb-lane > header { display: flex; justify-content: space-between; align-items: center; padding: 4px 4px 6px; }
.mb-card { all: unset; box-sizing: border-box; cursor: pointer; display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0; gap: 10px; padding: 13px; border-radius: 11px; background: var(--panel); border: 1px solid var(--line); }
.mb-card:hover { border-color: var(--line-2); }
.mb-card.new { border-color: rgb(63 123 255 / 0.55); }
.mb-card:focus-visible { outline: 1.5px solid var(--blue); }
.mb-q { font-size: 11.5px; line-height: 1.5; color: var(--type); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.mb-q.jack { color: var(--dim); }
.mb-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 10.5px; color: var(--dim); }
.mb-scrim { position: fixed; inset: 0; z-index: 30; background: rgb(19 24 33 / 0.72); backdrop-filter: blur(3px); display: grid; place-items: center; padding: 24px; }
.mb-modal { width: min(760px, 100%); max-height: calc(100dvh - 48px); display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto minmax(0, 1fr) auto; background: var(--stage-2); border: 1px solid var(--line-2); border-radius: 18px; box-shadow: 0 30px 80px rgb(8 12 20 / 0.6); overflow: hidden; }
.mb-modal > header { padding: 16px 20px; display: flex; gap: 12px; align-items: center; border-bottom: 1px solid var(--line); }
.mb-strip { padding: 12px 20px; display: flex; gap: 10px 18px; align-items: center; flex-wrap: wrap; background: var(--panel); border-bottom: 1px solid var(--line); font-size: 11px; color: var(--dim); }
.mb-body { padding: 4px 20px 18px; overflow-y: auto; }
.mb-modal footer { padding: 14px 20px 18px; border-top: 1px solid var(--line); }
.mb-tabs { display: none; }
@media (max-width: 1100px) { .mb { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 760px) {
  .mb-tabs { display: flex; margin-bottom: 12px; overflow-x: auto; }
  .mb { grid-template-columns: minmax(0, 1fr); }
  .mb-lane:not(.on) { display: none; }
  .mb-lane > header { display: none; }
  .mb-lane { padding: 0; background: none; border: 0; }
  .mb-scrim { padding: 0; align-items: end; }
  .mb-modal { border-radius: 18px 18px 0 0; max-height: 92dvh; }
  .mb-modal footer { padding-bottom: calc(18px + env(safe-area-inset-bottom)); }
}
`;

function threadCard(t) {
  const b = booking(t);
  const m = last(t);
  return `<button class="mb-card ${t.read ? '' : 'new'}" data-ui="sel:${t.id}" data-read="${t.id}">
    <div class="row">${avatar(title(t), t.org ? 'org' : '')}<div style="min-width:0;flex:1"><div class="hi trunc">${esc(title(t))}</div><div class="dim small trunc">${esc(what(b))}</div></div>${t.read ? '' : '<span class="unread-dot"></span>'}</div>
    <div class="mb-q ${m.from === 'jack' ? 'jack' : ''}">${m.from === 'jack' ? 'You: ' : ''}${esc(m.text)}</div>
    <div class="mb-foot"><span class="trunc">${when(b)}</span>${chip(b)}</div>
  </button>`;
}

export default {
  name: 'Booking board',
  idea: 'Every conversation lives on its booking, in lanes by what it needs: inquiries, requests to confirm, booked, then cash. Open one to read, reply and act; confirm or mark Paid and the card moves along.',
  init: () => ({ sel: null, lane: 'inq' }),
  render(u) {
    style('msg-b', css);
    const threads = sorted();
    const t = u.sel ? store.threads.find((x) => x.id === u.sel) : null;
    const b = t ? booking(t) : null;
    const lanes = LANES.map((l) => ({ ...l, items: threads.filter((x) => l.test(booking(x))) }));

    return `<div class="page">
      <header class="head"><h1>Messages</h1></header>
      <div class="seg mb-tabs">${lanes.map((l) => `<button class="${u.lane === l.key ? 'on' : ''}" data-ui="lane:${l.key}">${l.name}${l.items.some((x) => !x.read) ? ' •' : ''}</button>`).join('')}</div>
      <div class="mb">${lanes.map((l) => `<section class="mb-lane ${u.lane === l.key ? 'on' : ''}">
        <header><span class="label">${l.name}</span>${l.items.filter((x) => !x.read).length ? `<span class="badge">${l.items.filter((x) => !x.read).length}</span>` : `<span class="tiny faint">${l.items.length}</span>`}</header>
        ${l.items.map(threadCard).join('') || '<div class="empty">Clear</div>'}
      </section>`).join('')}</div>

      ${t ? `<div class="mb-scrim" data-scrim="sel:null">
        <div class="mb-modal" role="dialog" aria-label="Conversation">
          <header>${avatar(title(t), t.org ? 'org' : '')}<div style="min-width:0;flex:1"><div class="hi trunc">${esc(title(t))}</div><div class="dim small trunc">${t.org ? `${esc(t.who)} · ` : ''}${esc(b.email)}</div></div><button class="btn btn-icon btn-ghost" data-ui="sel:null" aria-label="Close">${icon('close')}</button></header>
          <div class="mb-strip"><span class="hi">${esc(what(b))}</span><span>${when(b)}</span><span class="${b.price == null ? '' : 'hi'}">${money(b.price)}</span>${setTag(b)}${chip(b)}<span style="flex:1"></span>${actionsFor(b, { compact: true })}</div>
          <div class="mb-body">${bubbles(t)}</div>
          <footer>${composer(t, { placeholder: `Reply to ${t.who.split(' ')[0]}` })}</footer>
        </div>
      </div>` : ''}
    </div>`;
  },
  after(root) {
    const body = root.querySelector('.mb-body');
    if (body) body.scrollTop = body.scrollHeight;
  },
};
