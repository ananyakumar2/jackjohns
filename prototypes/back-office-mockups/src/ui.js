import { state, STATE_LABEL, SERVICES, TODAY, isInquiry, end } from './store.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export const aed = (n, { short = false } = {}) => {
  if (n == null) return 'By inquiry';
  if (short && n >= 1000) return `${(n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '')}k`;
  return n.toLocaleString('en-GB');
};
export const money = (n, opts) => (n == null ? 'Quote pending' : `AED ${aed(n, opts)}`);

const D = (d, o) => d.toLocaleString('en-GB', o);
export const fmt = {
  day: (d) => D(d, { weekday: 'short', day: 'numeric', month: 'short' }),
  dayLong: (d) => D(d, { weekday: 'long', day: 'numeric', month: 'long' }),
  date: (d) => D(d, { day: 'numeric', month: 'short', year: 'numeric' }),
  dm: (d) => D(d, { day: 'numeric', month: 'short' }),
  time: (d) => D(d, { hour: '2-digit', minute: '2-digit', hour12: false }),
  month: (d) => D(d, { month: 'long', year: 'numeric' }),
  mon: (d) => D(d, { month: 'short' }),
};

export const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const startOfWeek = (d) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));

export function ago(d) {
  const min = Math.round((TODAY - d) / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  if (min < 1440) return `${Math.round(min / 60)}h`;
  if (min < 10080) return `${Math.round(min / 1440)}d`;
  return fmt.dm(d);
}

export function when(b) {
  if (b.service === 'sim') return `${fmt.day(b.start)} · ${fmt.time(b.start)}–${fmt.time(end(b))}`;
  if (b.days > 1) return `${fmt.dm(b.start)}–${fmt.dm(new Date(b.start.getTime() + (b.days - 1) * 864e5))}`;
  return `${fmt.day(b.start)} · ${b.service === 'track' ? 'Full day' : fmt.time(b.start)}`;
}

export const who = (b) => (b.org ? `${b.org}` : b.client);
export const what = (b) => b.title || (b.service === 'sim' ? `Sim coaching · ${b.hours} h` : SERVICES[b.service].name);

export const chip = (b, extra = '') => {
  const s = typeof b === 'string' ? b : state(b);
  return `<span class="st st-${s} ${extra}">${STATE_LABEL[s]}</span>`;
};
export const svcTag = (s) => `<span class="svc svc-${s}">${SERVICES[s].name}</span>`;

// One inline icon set, drawn on a 20 grid, stroke only.
const P = {
  check: 'M4.5 10.5l3.5 3.5 7.5-8',
  x: 'M5.5 5.5l9 9M14.5 5.5l-9 9',
  unlock: 'M6.5 9V6.5a3.5 3.5 0 016.8-1.2M5 9h10v7.5H5z',
  lock: 'M6.5 9V6.5a3.5 3.5 0 017 0V9M5 9h10v7.5H5z',
  cash: 'M2.5 5.5h15v9h-15zM10 12.2a2.2 2.2 0 100-4.4 2.2 2.2 0 000 4.4zM5 8v4M15 8v4',
  cal: 'M3.5 5h13v11.5h-13zM3.5 8.5h13M7 3v3.5M13 3v3.5',
  chart: 'M3.5 16.5h13M5.5 13.5v-4M9 13.5v-8M12.5 13.5v-6M16 13.5v-3',
  chat: 'M3.5 4.5h13v9h-7l-4 3v-3h-2z',
  send: 'M3.5 10l13-6-4.5 13-2.5-5.5z',
  phone: 'M7 2.5h6a1 1 0 011 1v13a1 1 0 01-1 1H7a1 1 0 01-1-1v-13a1 1 0 011-1zM9 15h2',
  left: 'M12 4.5L6.5 10l5.5 5.5',
  right: 'M8 4.5l5.5 5.5L8 15.5',
  pin: 'M10 17s-5-4.8-5-8.5a5 5 0 0110 0C15 12.2 10 17 10 17zM10 10.2a1.7 1.7 0 100-3.4 1.7 1.7 0 000 3.4z',
  mail: 'M3 5h14v10H3zM3 5.5l7 5 7-5',
  clock: 'M10 17a7 7 0 100-14 7 7 0 000 14zM10 6v4l2.5 2',
  set: 'M4 6h12M4 10h12M4 14h7',
  quote: 'M5 4.5h10v11H5zM7.5 8h5M7.5 11h5',
  reply: 'M8 5L3.5 9.5 8 14M3.5 9.5H12a4.5 4.5 0 014.5 4.5v1',
  undo: 'M6.5 6L3.5 9l3 3M3.5 9h8.5a4.5 4.5 0 010 9H9',
  dot: 'M10 11a1 1 0 100-2 1 1 0 000 2z',
  plus: 'M10 4v12M4 10h12',
  close: 'M5.5 5.5l9 9M14.5 5.5l-9 9',
};
export const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 20 20" aria-hidden="true"><path d="${P[name]}"/></svg>`;

// Action buttons for one booking, in the order Jack works through them.
export function actionsFor(b, { compact = false, labels = true } = {}) {
  const s = state(b);
  const btn = (act, ic, label, cls = '') =>
    `<button class="btn ${cls} ${compact ? 'btn-sm' : ''}" data-act="${act}:${b.id}" title="${label}">${icon(ic)}${labels ? `<span>${label}</span>` : ''}</button>`;
  const out = [];
  if (s === 'tentative') {
    if (isInquiry(b) && b.price == null) out.push(btn('quote', 'quote', 'Quote', 'btn-ghost'));
    out.push(btn('confirm', 'lock', 'Confirm', 'btn-blue'));
    out.push(btn('decline', 'x', 'Decline', 'btn-ghost'));
  } else if (s === 'confirmed' || s === 'due') {
    out.push(btn('paid', 'cash', 'Paid', 'btn-gold'));
    out.push(btn('unlock', 'unlock', 'Unlock', 'btn-ghost'));
  } else if (s === 'paid') {
    out.push(btn('unpaid', 'undo', 'Undo paid', 'btn-ghost'));
  } else if (s === 'unlocked' && end(b) > TODAY) {
    out.push(btn('relock', 'lock', 'Lock again', 'btn-ghost'));
  }
  return `<div class="acts">${out.join('')}</div>`;
}

export const initials = (name) => name.split(' ').filter((w) => /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join('');
export const avatar = (name, cls = '') => `<span class="av ${cls}">${esc(initials(name))}</span>`;
