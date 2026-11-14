import { OPTIONS, aed, days, fmtDay, hh, hold, HOURS, protect, unprotect, slotId } from './data.js';
import { el } from './ui.js';
import './portals.css';
import './calendars.css';
import './details.css';
import { PORTALS } from './portals.js';
import { CALENDARS } from './calendars.js';
import { DETAILS } from './details.js';

const STAGES = [
  { id: 'portal', name: 'Portal', variants: PORTALS },
  { id: 'calendar', name: 'Calendar', variants: CALENDARS },
  { id: 'details', name: 'Details', variants: DETAILS },
];

// The portal is a rectangle, 80% of the screen each way and centred; the page
// shows round it, and a click there closes it.
globalThis.redlineHooks = {
  freeze: true,
  layout(layout, view) {
    const w = Math.round(view.W * 0.8);
    const h = Math.round(view.H * 0.8);
    layout.lens = { x: view.W / 2, y: view.H / 2, r: Math.min(w, h) / 2, w, h, cr: Math.round(Math.min(w, h) * 0.035) };
  },
};

const params = new URLSearchParams(location.search);
const choice = Object.fromEntries(STAGES.map((s) => [s.id, s.variants.some((v) => v.id === params.get(s.id)) ? params.get(s.id) : s.variants[0].id]));
let current = STAGES.some((s) => s.id === params.get('stage')) ? params.get('stage') : 'portal';

const portal = document.getElementById('portal');
const lens = document.getElementById('lens');
const book = document.getElementById('book');
const mail = document.getElementById('mail');
const switcher = document.getElementById('switcher');

const fresh = () => ({ stage: 'portal', option: null, slot: null, eventDate: '', topic: null, message: '', details: {}, sent: false });
let state = fresh();
let cleanup = null;

function firstFree() {
  for (const d of days) for (const h of HOURS) if (d.hours[h] === 'free') return { day: d, h };
  return null;
}

// Jumping straight to a later stage from the switcher fills in what the earlier stages would have.
function seed(stage) {
  state = fresh();
  state.stage = stage;
  if (stage === 'portal') return;
  state.option = 'sim';
  if (stage === 'details') state.slot = firstFree();
}

function summary() {
  const o = OPTIONS[state.option];
  let when = '';
  if (state.option === 'sim' && state.slot) when = `${fmtDay(state.slot.day.date)} · ${hh(state.slot.h)}`;
  else if (state.option === 'track' && state.slot) when = fmtDay(state.slot.day.date);
  else if (state.option === 'commentating' && state.eventDate) when = fmtDay(new Date(`${state.eventDate}T12:00`));
  return { option: o, name: o.name, when, price: o.kind === 'book' ? aed(o.price) : null, topic: state.topic, message: state.message };
}

function setProtected(on) {
  if (!state.slot) return;
  const id = slotId(state.slot.day, state.option === 'sim' ? state.slot.h : null);
  on ? protect(id) : unprotect(id);
}

const ctx = {
  get state() {
    return state;
  },
  summary,
  pick(option) {
    setProtected(false);
    Object.assign(state, { option, stage: 'calendar', slot: null, eventDate: '', topic: null, message: '' });
    show();
  },
  setSlot(slot) {
    setProtected(false);
    state.slot = slot;
    setProtected(true);
  },
  next() {
    state.stage = 'details';
    show();
  },
  back() {
    if (state.sent) return;
    state.stage = state.stage === 'details' ? 'calendar' : 'portal';
    if (state.stage === 'portal') setProtected(false);
    show();
  },
  send(details, { rerender = true } = {}) {
    state.details = details;
    state.sent = true;
    setProtected(false);
    if (state.slot && OPTIONS[state.option].kind === 'book') hold(state.slot.day, state.option === 'sim' ? state.slot.h : null);
    if (rerender) show();
    showMail();
  },
  close() {
    globalThis.redlineHooks.booking?.close();
  },
  restart() {
    hideMail();
    state = fresh();
    show();
  },
};

function show() {
  cleanup?.();
  cleanup = null;
  portal.replaceChildren();
  const stage = STAGES.find((s) => s.id === state.stage);
  const variant = stage.variants.find((v) => v.id === choice[stage.id]);
  portal.dataset.stage = stage.id;
  portal.dataset.variant = variant.id;
  current = stage.id;
  cleanup = variant.render(portal, ctx) ?? null;
  syncSwitcher();
}

function showMail() {
  const variant = DETAILS.find((v) => v.id === choice.details);
  mail.replaceChildren(variant.email(summary(), state.details));
  mail.dataset.variant = variant.id;
  mail.hidden = false;
  portal.classList.add('sent');
  requestAnimationFrame(() => mail.classList.add('shown'));
}

function hideMail() {
  portal.classList.remove('sent');
  mail.classList.remove('shown');
  mail.hidden = true;
}

// open / close follow the Book pill
new MutationObserver(() => {
  if (book.getAttribute('aria-expanded') === 'true') show();
  else {
    hideMail();
    setProtected(false);
    state = fresh();
    setTimeout(() => {
      if (book.getAttribute('aria-expanded') !== 'true') portal.replaceChildren();
    }, 400);
  }
}).observe(book, { attributes: true, attributeFilter: ['aria-expanded'] });

// ---------- switcher: stage and option, for Ananya and Jack, not part of the design ----------
function go(stageId, variantId) {
  if (variantId) choice[stageId] = variantId;
  const q = new URLSearchParams({ stage: stageId, ...choice });
  if (document.body.classList.contains('hide-prices')) q.set('prices', '0');
  history.replaceState(null, '', `?${q}`);
  hideMail();
  seed(stageId);
  if (book.getAttribute('aria-expanded') === 'true') show();
  else book.click();
}

function syncSwitcher() {
  switcher.querySelectorAll('[data-stage]').forEach((b) => b.classList.toggle('on', b.dataset.stage === current));
  switcher.querySelectorAll('.variants').forEach((g) => (g.hidden = g.dataset.for !== current));
  switcher.querySelectorAll('[data-variant]').forEach((b) => b.classList.toggle('on', choice[b.closest('.variants').dataset.for] === b.dataset.variant));
}

if (params.get('prices') === '0') document.body.classList.add('hide-prices');
switcher.append(
  el(
    'div',
    { class: 'stages' },
    STAGES.map((s) => el('button', { type: 'button', 'data-stage': s.id, text: s.name, onclick: () => go(s.id) })),
    el('button', {
      type: 'button',
      class: 'prices',
      title: 'Show or hide prices',
      text: 'AED',
      onclick: (e) => {
        document.body.classList.toggle('hide-prices');
        e.currentTarget.classList.toggle('off', document.body.classList.contains('hide-prices'));
        if (state.sent) showMail();
      },
    }),
  ),
  ...STAGES.map((s) =>
    el(
      'div',
      { class: 'variants', 'data-for': s.id },
      s.variants.map((v) => el('button', { type: 'button', 'data-variant': v.id, title: v.idea, text: v.name, onclick: () => go(s.id, v.id) })),
    ),
  ),
);
switcher.querySelector('.prices').classList.toggle('off', document.body.classList.contains('hide-prices'));
syncSwitcher();

await import('../redline.js');

if (params.has('stage')) {
  seed(current);
  book.click();
}
