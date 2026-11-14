import { store, state, isInquiry, unread } from '../store.js';
import { esc, icon, ago, avatar, fmt, money, who, what, when, chip } from '../ui.js';
import { style, card, cardCss } from './common.js';
import { sorted, last, booking, isInq, history, title, bubbles, composer, msgCss } from './msgs.js';

const css = `
${cardCss}
${msgCss}
.ma { display: grid; grid-template-columns: 330px minmax(0, 1fr) 330px; height: calc(100dvh - 0px); }
.ma-list { border-right: 1px solid var(--line); display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); min-height: 0; }
.ma-list header { padding: 22px 18px 12px; display: grid; gap: 14px; }
.ma-th { width: 100%; display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 12px; padding: 13px 18px; border: 0; border-bottom: 1px solid var(--line); background: transparent; text-align: left; color: var(--type); }
.ma-th:hover { background: var(--silver-soft); }
.ma-th.on { background: var(--panel-2); box-shadow: inset 3px 0 0 var(--blue); }
.ma-th .pv { font-size: 11px; color: var(--dim); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-top: 2px; line-height: 1.45; }
.ma-th.new .hi { color: #fff; }
.ma-conv { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr) auto; min-height: 0; }
.ma-conv > header { padding: 18px 24px; border-bottom: 1px solid var(--line); display: flex; align-items: center; gap: 12px; }
.ma-body { padding: 8px 24px 20px; }
.ma-foot { padding: 14px 24px 20px; border-top: 1px solid var(--line); }
.ma-ctx { border-left: 1px solid var(--line); padding: 22px 18px; display: grid; gap: 14px; align-content: start; overflow-y: auto; }
.ma-hist { display: grid; gap: 6px; }
.ma-hist div { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; }
@media (max-width: 1240px) { .ma { grid-template-columns: 300px minmax(0, 1fr); } .ma-ctx { display: none; } }
@media (max-width: 760px) {
  .ma { grid-template-columns: minmax(0, 1fr); height: auto; min-height: 100%; }
  .ma.open .ma-list { display: none; }
  .ma:not(.open) .ma-conv { display: none; }
  .ma-list { border-right: 0; }
  .ma-conv > header { padding: 12px 14px; position: sticky; top: 0; background: var(--stage); z-index: 2; }
  .ma-body { padding: 4px 14px 14px; }
  .ma-foot { padding: 12px 14px 64px; }
  .ma-ctx-phone { padding: 0 14px 14px; }
}
`;

export default {
  name: 'Three panes',
  idea: 'The familiar mail layout, tuned to bookings: threads on the left, the conversation in the middle, and the booking it is about on the right, so Jack can reply and confirm or mark Paid without leaving.',
  init: () => ({ sel: null, f: 'all', open: false }),
  render(u) {
    style('msg-a', css);
    const list = sorted().filter((t) => (u.f === 'unread' ? !t.read : u.f === 'inq' ? isInq(t) : true));
    const t = store.threads.find((x) => x.id === u.sel) || sorted()[0];
    const b = booking(t);
    const hist = history(t.who).filter((x) => x !== b).slice(0, 5);
    const ctx = `${b ? card(b) : ''}
      <div class="panel pad stack small">
        <div class="row">${icon('mail')}<span class="trunc">${esc(b?.email || '')}</span></div>
        <div class="row">${icon('phone')}<span>${esc(b?.phone || '')}</span></div>
      </div>
      ${hist.length ? `<div><span class="label">Before</span><div class="ma-hist" style="margin-top:10px">${hist.map((h) => `<div><span class="dim">${fmt.dm(h.start)} · ${esc(what(h))}</span>${chip(h)}</div>`).join('')}</div></div>` : ''}`;

    return `<div class="ma ${u.open ? 'open' : ''}">
      <section class="ma-list">
        <header>
          <div class="row between"><h1 class="head" style="margin:0;min-height:0"><span style="font-size:15px;letter-spacing:.16em;text-transform:uppercase;color:var(--type-hi)">Messages</span></h1>${unread().length ? `<span class="badge">${unread().length}</span>` : ''}</div>
          <div class="seg"><button class="${u.f === 'all' ? 'on' : ''}" data-ui="f:all">All</button><button class="${u.f === 'unread' ? 'on' : ''}" data-ui="f:unread">Unread</button><button class="${u.f === 'inq' ? 'on' : ''}" data-ui="f:inq">Inquiries</button></div>
        </header>
        <div class="scroll" data-keep="ma-list">${list.map((x) => `<button class="ma-th ${x.id === t.id ? 'on' : ''} ${x.read ? '' : 'new'}" data-ui="sel:${x.id};open:true" data-read="${x.id}">
          ${avatar(title(x), x.org ? 'org' : '')}
          <div style="min-width:0"><div class="hi trunc">${esc(title(x))}</div><div class="pv">${last(x).from === 'jack' ? 'You: ' : ''}${esc(last(x).text)}</div></div>
          <div style="display:grid;justify-items:end;gap:6px"><span class="tiny faint">${ago(last(x).at)}</span>${x.read ? '' : '<span class="unread-dot"></span>'}</div>
        </button>`).join('') || '<div class="empty">Nothing here</div>'}</div>
      </section>

      <section class="ma-conv">
        <header>
          <button class="btn btn-icon btn-ghost only-phone" data-ui="open:false" aria-label="Back">${icon('left')}</button>
          ${avatar(title(t), t.org ? 'org' : '')}
          <div style="min-width:0;flex:1"><div class="hi trunc">${esc(title(t))}</div><div class="dim small trunc">${t.org ? `${esc(t.who)} · ` : ''}${b ? esc(what(b)) : ''}</div></div>
          ${b ? chip(b) : ''}
        </header>
        <div class="ma-body scroll" >${bubbles(t)}<div class="only-phone" style="margin-top:18px">${b ? card(b, { note: false }) : ''}</div></div>
        <div class="ma-foot">${composer(t, { placeholder: `Reply to ${t.who.split(' ')[0]}` })}</div>
      </section>

      <aside class="ma-ctx">${ctx}</aside>
    </div>`;
  },
  after(root) {
    const body = root.querySelector('.ma-body');
    if (body) body.scrollTop = body.scrollHeight;
  },
};
