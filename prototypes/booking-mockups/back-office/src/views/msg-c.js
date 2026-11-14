import { store, state, isInquiry, end, TODAY } from '../store.js';
import { esc, icon, ago, avatar, fmt, money, what, when, chip, aed } from '../ui.js';
import { style, setTag } from './common.js';
import { last, booking, title, msgCss } from './msgs.js';

const css = `
${msgCss}
.mc { max-width: 780px; margin: 0 auto; overflow-x: clip; }
.mc-lights { display: flex; gap: 6px; justify-content: center; margin: 4px 0 22px; }
.mc-lights i { width: 26px; height: 8px; border-radius: 4px; background: rgb(198 206 217 / 0.08); transition: background 0.3s; }
.mc-lights i.done { background: var(--chrome-gold); }
.mc-lights i.here { background: var(--blue); box-shadow: 0 0 8px rgb(63 123 255 / 0.7); }
.mc-lights i.left { background: rgb(63 123 255 / 0.28); }
.mc-card { grid-template-columns: minmax(0, 1fr); padding: 26px 28px; border-radius: 18px; background: var(--panel); border: 1px solid var(--line-2); display: grid; gap: 20px; animation: mc-in 0.35s cubic-bezier(0.25, 1, 0.5, 1); }
@keyframes mc-in { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: none; } }
.mc-said { font-size: 17px; line-height: 1.6; color: var(--type-hi); margin: 0; }
.mc-prev { font-size: 11.5px; color: var(--dim); line-height: 1.55; padding-left: 12px; border-left: 2px solid var(--line-2); }
.mc-about { display: flex; flex-wrap: wrap; gap: 8px 18px; align-items: center; padding: 12px 14px; border-radius: 10px; background: var(--stage-2); font-size: 11px; color: var(--dim); }
.mc-answers { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
.mc-a { all: unset; box-sizing: border-box; cursor: pointer; padding: 14px 16px; border-radius: 12px; border: 1px solid var(--line-2); background: var(--stage-2); display: grid; gap: 6px; }
.mc-a:hover { border-color: rgb(198 206 217 / 0.4); }
.mc-a:focus-visible { outline: 1.5px solid var(--blue); }
.mc-a b { font-weight: 600; color: var(--type-hi); font-size: 12px; display: flex; align-items: center; gap: 8px; }
.mc-a span { font-size: 11px; color: var(--dim); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.mc-a.blue { border-color: var(--blue); background: var(--blue-soft); }
.mc-a.gold { border-color: #d9b45e; background: var(--gold-soft); }
.mc-own { display: flex; gap: 8px; align-items: flex-end; }
.mc-quote { display: flex; align-items: center; gap: 8px; }
.mc-quote input { width: 120px; }
.mc-done { text-align: center; padding: 70px 20px; display: grid; gap: 10px; justify-items: center; }
.mc-done .wheel { width: 64px; height: 64px; border-radius: 50%; background: var(--chrome-silver); display: grid; place-items: center; color: var(--ink); margin-bottom: 6px; }
.mc-done .wheel .ic { width: 30px; height: 30px; stroke-width: 2; }
.mc-nav { display: flex; justify-content: space-between; margin-top: 14px; }
@media (max-width: 760px) {
  .mc-card { padding: 18px 16px; gap: 16px; border-radius: 14px; }
  .mc-said { font-size: 15px; }
  .mc-lights { gap: 4px; flex-wrap: wrap; }
  .mc-answers { grid-template-columns: minmax(0, 1fr); }
  .mc-lights i { width: 14px; }
}
`;

function answers(t, b) {
  const first = t.who.split(' ')[0];
  const s = state(b);
  const A = (cls, act, label, say, extra = '') => `<button class="mc-a ${cls}" data-act="${act}:${b.id}" data-thread="${t.id}" data-say="${esc(say)}" ${extra}><b>${label}</b><span>${esc(say.replace('{amount}', '…'))}</span></button>`;
  if (isInquiry(b) && s === 'tentative' && b.price == null) {
    return `<div class="mc-quote"><span class="label">Quote AED</span><input class="field" id="mc-amt" inputmode="numeric" value="${b.service === 'racing' ? '25,000' : '8,000'}"></div>
      <div class="mc-answers">
        ${A('blue', 'quote', `${icon('quote')}Send quote`, `Thanks ${first}, I'd love to. My rate for this is AED {amount}. Happy to jump on a call to go through the details.`, 'data-amount-from="#mc-amt"')}
        ${A('', 'decline', `${icon('x')}Not this time`, `Thanks ${first}, I'm not available for that one, unfortunately. Please keep me in mind for the next.`)}
      </div>`;
  }
  if (s === 'tentative') {
    return `<div class="mc-answers">
      ${A('blue', 'confirm', `${icon('lock')}Confirm and reply`, `Hi ${first}, you're confirmed for ${fmt.day(b.start)}${b.service === 'sim' ? ` at ${fmt.time(b.start)}` : ''}. Cash on the day is perfect. See you then!`)}
      ${A('', 'none', `${icon('clock')}Ask for another time`, `Hi ${first}, that slot doesn't work for me, sorry. Could you pick another time that week?`)}
      ${A('', 'decline', `${icon('x')}Decline`, `Hi ${first}, I can't make that one work, unfortunately. Hope to see you another time.`)}
    </div>`;
  }
  if (s === 'due') {
    return `<div class="mc-answers">
      ${A('gold', 'paid', `${icon('cash')}Mark paid and thank`, `Got it, thanks ${first}!`)}
      ${A('', 'none', `${icon('reply')}That works`, `No problem ${first}, that works.`)}
    </div>`;
  }
  if (s === 'confirmed') {
    return `<div class="mc-answers">
      ${A('', 'none', `${icon('check')}All good`, `Sounds good ${first}, see you ${fmt.day(b.start)}.`)}
      ${A('', 'unlock', `${icon('unlock')}Unlock and reschedule`, `No problem ${first}, I've freed that slot. Book any open time and I'll lock it in.`)}
      ${A('gold', 'paid', `${icon('cash')}Paid in advance`, `Thanks ${first}, received. See you ${fmt.day(b.start)}.`)}
    </div>`;
  }
  return `<div class="mc-answers">${A('', 'none', `${icon('reply')}Thanks`, `Thanks ${first}!`)}</div>`;
}

export default {
  name: 'Pit stop',
  idea: 'Only what is waiting for an answer, one at a time, biggest first. Each comes with the two or three answers Jack actually gives, and one tap both replies and acts (confirm, quote, unlock, Paid), then the next one rolls in.',
  init: () => ({ skip: [], done: 0 }),
  render(u) {
    style('msg-c', css);
    const skip = Array.isArray(u.skip) ? u.skip : String(u.skip || '').split(',').filter(Boolean);
    const waiting = store.threads.filter((t) => last(t).from === 'client');
    // Soonest booking first: a request for Monday matters more than one for January.
    waiting.sort((a, b) => booking(a).start - booking(b).start);
    const queue = waiting.filter((t) => !skip.includes(t.id)).concat(waiting.filter((t) => skip.includes(t.id)));
    const answered = store.threads.filter((t) => last(t).from === 'jack' && last(t).at >= TODAY).length;
    const total = queue.length + answered;
    const t = queue[0];
    const lights = [...Array(Math.min(total, 16))].map((_, i) => `<i class="${i < answered ? 'done' : i === answered ? 'here' : 'left'}"></i>`).join('');

    if (!t) {
      return `<div class="page"><header class="head"><h1>Messages</h1></header><div class="mc"><div class="mc-lights">${lights}</div>
        <div class="panel mc-done"><span class="wheel">${icon('check')}</span><span class="hi" style="font-size:16px">All answered</span><span class="dim small">Nothing waiting on you.</span></div></div></div>`;
    }
    const b = booking(t);
    const msgs = t.messages;
    const said = last(t);
    const before = msgs.length > 1 ? msgs[msgs.length - 2] : null;
    if (!t.read) t.read = true;

    return `<div class="page">
      <header class="head"><h1>Messages</h1><div class="grow"></div><span class="dim small">${queue.length} waiting</span></header>
      <div class="mc">
        <div class="mc-lights" aria-hidden="true">${lights}</div>
        <article class="mc-card" data-thread-card="${t.id}">
          <div class="row">${avatar(title(t), t.org ? 'org' : '')}<div style="min-width:0;flex:1"><div class="hi">${esc(title(t))}</div><div class="dim small">${t.org ? `${esc(t.who)} · ` : ''}${ago(said.at)} ago</div></div>${chip(b)}</div>
          ${before ? `<div class="mc-prev">${before.from === 'jack' ? 'You' : esc(t.who.split(' ')[0])}: ${esc(before.text)}</div>` : ''}
          <p class="mc-said">${esc(said.text)}</p>
          <div class="mc-about"><span class="hi">${esc(what(b))}</span><span>${when(b)}</span><span>${esc(b.venue)}</span><span class="${b.price == null ? '' : 'hi'}">${money(b.price)}</span>${setTag(b)}</div>
          ${answers(t, b)}
          <form class="mc-own composer" data-send="${t.id}"><textarea class="reply" rows="1" placeholder="Or write your own"></textarea><button class="btn btn-blue btn-icon" aria-label="Send">${icon('send')}</button></form>
        </article>
        <div class="mc-nav">
          <span></span>
          ${queue.length > 1 ? `<button class="btn btn-ghost btn-sm" data-ui="skip:${[...skip.filter((x) => x !== t.id), t.id].join(',')}">Later ${icon('right')}</button>` : ''}
        </div>
      </div>
    </div>`;
  },
};
