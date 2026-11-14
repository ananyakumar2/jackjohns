import { store, state, value, isInquiry, TODAY, SERVICES } from '../store.js';
import { esc, icon, ago, avatar, fmt, money, what, when, chip, aed, actionsFor } from '../ui.js';
import { style, setTag } from './common.js';
import { last, composer, msgCss } from './msgs.js';

const css = `
${msgCss}
.md { display: grid; grid-template-columns: 320px minmax(0, 1fr); height: 100dvh; }
.md-dir { border-right: 1px solid var(--line); display: grid; grid-template-rows: auto minmax(0, 1fr); min-height: 0; }
.md-dir header { padding: 22px 16px 12px; display: grid; gap: 12px; }
.md-c { width: 100%; display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 11px 16px; border: 0; background: transparent; text-align: left; color: var(--type); }
.md-c:hover { background: var(--silver-soft); }
.md-c.on { background: var(--panel-2); box-shadow: inset 3px 0 0 var(--silver); }
.md-c .v { text-align: right; font-size: 11px; }
.md-c .v small { display: block; font-size: 9.5px; color: var(--faint); }
.md-group { padding: 14px 16px 6px; }
.md-p { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr) auto; min-height: 0; }
.md-p > header { grid-template-columns: minmax(0, 1fr); padding: 20px 26px 18px; border-bottom: 1px solid var(--line); display: grid; gap: 16px; }
.md-stats { display: flex; gap: 28px; flex-wrap: wrap; }
.md-stats > div { display: grid; gap: 3px; }
.md-stats .n { font-size: 17px; color: var(--type-hi); }
.md-tl { padding: 6px 26px 22px; }
.md-ev { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 12px; position: relative; padding: 9px 0; }
.md-ev::before { content: ''; position: absolute; left: 10px; top: 0; bottom: 0; width: 1px; background: var(--line); }
.md-ev .dot { position: relative; z-index: 1; width: 21px; height: 21px; border-radius: 50%; display: grid; place-items: center; background: var(--stage); border: 1px solid var(--line-2); color: var(--dim); margin-top: 2px; }
.md-ev .dot .ic { width: 12px; height: 12px; }
.md-ev .dot.paid { background: var(--chrome-gold); border-color: #d9b45e; color: var(--ink); }
.md-ev .dot.bk { border-color: var(--blue); color: var(--blue-ink); }
.md-ev .dot.msg.jack { background: var(--blue-soft); }
.md-book { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; padding: 10px 12px; border-radius: 10px; background: var(--panel); border: 1px solid var(--line); font-size: 11px; color: var(--dim); }
.md-ev .when { font-size: 9.5px; color: var(--faint); margin-bottom: 4px; letter-spacing: 0.04em; }
.md-foot { padding: 14px 26px 20px; border-top: 1px solid var(--line); }
@media (max-width: 1100px) { .md { grid-template-columns: 270px minmax(0, 1fr); } }
@media (max-width: 760px) {
  .md { grid-template-columns: minmax(0, 1fr); height: auto; min-height: 100%; }
  .md.open .md-dir { display: none; }
  .md:not(.open) .md-p { display: none; }
  .md-dir { border-right: 0; }
  .md-p > header { padding: 12px 14px; gap: 12px; }
  .md-stats { gap: 16px; }
  .md-tl { padding: 4px 14px 14px; }
  .md-foot { padding: 12px 14px 64px; }
}
`;

function clients() {
  const map = new Map();
  for (const b of store.items) {
    const key = b.org || b.client;
    if (!map.has(key)) map.set(key, { key, org: !!b.org, contact: b.client, items: [], thread: null });
    map.get(key).items.push(b);
  }
  for (const t of store.threads) {
    const key = t.org || t.who;
    if (map.has(key)) map.get(key).thread = t;
  }
  for (const c of map.values()) {
    c.paid = c.items.filter((b) => state(b) === 'paid').reduce((s, b) => s + value(b), 0);
    c.sessions = c.items.filter((b) => ['paid', 'confirmed', 'due'].includes(state(b))).length;
    c.cancels = c.items.filter((b) => b.status === 'unlocked').length;
    c.since = c.items.reduce((m, b) => (b.created < m ? b.created : m), TODAY);
    c.lastAt = Math.max(c.thread ? last(c.thread).at : 0, ...c.items.map((b) => Math.min(b.created, TODAY)));
    c.next = c.items.filter((b) => b.start >= TODAY && ['tentative', 'confirmed'].includes(b.status)).sort((a, b) => a.start - b.start)[0];
  }
  return [...map.values()];
}

function timeline(c) {
  const ev = [];
  for (const b of c.items) {
    ev.push({ at: b.created, kind: 'book', b });
    if (b.paidAt && state(b) === 'paid') ev.push({ at: b.paidAt, kind: 'paid', b });
  }
  if (c.thread) for (const m of c.thread.messages) ev.push({ at: m.at, kind: 'msg', m });
  ev.sort((a, b) => a.at - b.at);
  return ev.slice(-30).map((e) => {
    if (e.kind === 'msg') {
      return `<div class="md-ev"><span class="dot msg ${e.m.from}">${icon(e.m.from === 'jack' ? 'reply' : 'chat')}</span><div><div class="when">${fmt.day(e.at)} · ${fmt.time(e.at)}</div><div class="bubble ${e.m.from === 'jack' ? 'jack' : ''}" style="margin-left:0">${esc(e.m.text)}</div></div></div>`;
    }
    if (e.kind === 'paid') {
      return `<div class="md-ev"><span class="dot paid">${icon('cash')}</span><div><div class="when">${fmt.day(e.at)}</div><div class="small"><span class="gold-t">AED ${aed(value(e.b))}</span> <span class="dim">cash for ${fmt.dm(e.b.start)}</span></div></div></div>`;
    }
    const b = e.b;
    const live = ['tentative', 'confirmed', 'due'].includes(state(b));
    return `<div class="md-ev"><span class="dot bk">${icon('cal')}</span><div><div class="when">${fmt.day(e.at)} · requested</div>
      <div class="md-book"><span class="hi">${esc(what(b))}</span><span>${when(b)}</span><span class="${b.price == null ? '' : 'hi'}">${money(b.price)}</span>${setTag(b)}${chip(b)}${live ? `<span style="flex:1"></span>${actionsFor(b, { compact: true, labels: false })}` : ''}</div></div></div>`;
  }).join('');
}

export default {
  name: 'Client book',
  idea: 'People first. A directory of every client and organisation with what they are worth, and for each one a single timeline of every request, payment and message, with the reply box at the bottom. Jack can write to anyone, not only those who wrote first.',
  init: () => ({ sel: 'Priya Nair', open: false }),
  render(u) {
    style('msg-d', css);
    const all = clients().sort((a, b) => b.lastAt - a.lastAt);
    const c = all.find((x) => x.key === u.sel) || all[0];
    const recent = all.filter((x) => x.thread);
    const rest = all.filter((x) => !x.thread).sort((a, b) => b.paid - a.paid);
    const row = (x) => `<button class="md-c ${x.key === c.key ? 'on' : ''}" data-ui="sel:${esc(x.key)};open:true" ${x.thread ? `data-read="${x.thread.id}"` : ''} data-name="${esc(x.key.toLowerCase())}">
      ${avatar(x.key, x.org ? 'org' : '')}
      <div style="min-width:0"><div class="hi trunc">${esc(x.key)}</div><div class="dim tiny trunc">${x.next ? `Next ${fmt.dm(x.next.start)}` : `Since ${fmt.mon(x.since)} ${x.since.getFullYear()}`}</div></div>
      <div class="v">${x.thread && !x.thread.read ? '<span class="unread-dot" style="display:inline-block"></span>' : `<span class="hi">${aed(x.paid, { short: true })}</span><small>${x.sessions} booked</small>`}</div>
    </button>`;
    const thread = c.thread || { id: `new-${c.key}`, who: c.contact, messages: [{ from: 'jack', at: TODAY, text: '' }], booking: null };

    return `<div class="md ${u.open ? 'open' : ''}">
      <section class="md-dir">
        <header>
          <span style="font-size:15px;letter-spacing:.16em;text-transform:uppercase;color:var(--type-hi)">Clients</span>
          <input class="field" type="search" placeholder="Find a client" aria-label="Find a client" data-find>
        </header>
        <div class="scroll" data-keep="md-dir">
          <div class="md-group label">In conversation</div>${recent.map(row).join('')}
          <div class="md-group label">Everyone else</div>${rest.map(row).join('')}
        </div>
      </section>

      <section class="md-p">
        <header>
          <div class="row">
            <button class="btn btn-icon btn-ghost only-phone" data-ui="open:false" aria-label="Back">${icon('left')}</button>
            ${avatar(c.key, c.org ? 'org' : '')}
            <div style="min-width:0;flex:1"><div class="hi" style="font-size:15px">${esc(c.key)}</div><div class="dim small trunc">${c.org ? `${esc(c.contact)} · ` : ''}${esc(c.items[0].email)} · ${esc(c.items[0].phone)}</div></div>
          </div>
          <div class="md-stats">
            <div><span class="label">Paid to date</span><span class="n gold-t">AED ${aed(c.paid)}</span></div>
            <div><span class="label">Booked</span><span class="n">${c.sessions}</span></div>
            <div><span class="label">Unlocked</span><span class="n">${c.cancels}</span></div>
            <div><span class="label">Mostly</span><span class="n">${SERVICES[mostly(c)].name}</span></div>
          </div>
        </header>
        <div class="md-tl scroll">${timeline(c)}</div>
        <div class="md-foot">${c.thread ? composer(c.thread, { placeholder: `Write to ${c.contact.split(' ')[0]}` }) : `<form class="composer" onsubmit="event.preventDefault();this.querySelector('textarea').value='';this.querySelector('.tiny').textContent='Sent (mock). New conversations get wired to email later.'"><div class="row" style="align-items:flex-end"><textarea class="reply" rows="2" placeholder="Write to ${esc(c.contact.split(' ')[0])}"></textarea><button class="btn btn-blue btn-icon" aria-label="Send">${icon('send')}</button></div><div class="tiny faint">Starts a new conversation by email</div></form>`}</div>
      </section>
    </div>`;
  },
  after(root) {
    const tl = root.querySelector('.md-tl');
    if (tl) tl.scrollTop = tl.scrollHeight;
    const find = root.querySelector('[data-find]');
    if (find) find.addEventListener('input', () => {
      const q = find.value.trim().toLowerCase();
      root.querySelectorAll('.md-c').forEach((el) => { el.style.display = !q || el.dataset.name.includes(q) ? '' : 'none'; });
    });
  },
};

function mostly(c) {
  const n = {};
  for (const b of c.items) n[b.service] = (n[b.service] || 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0][0];
}
