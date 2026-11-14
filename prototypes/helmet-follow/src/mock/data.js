// Mocked availability. Real Google Calendar sync replaces this later; the shape
// (days → hours → state) is what the back end will serve.
// States: free, held (a pending request locks it tentatively), booked (Jack confirmed).

export const OPTIONS = {
  sim: { id: 'sim', name: 'Sim coaching', kind: 'book', price: 500, unit: 'hour', note: '1 hour' },
  track: { id: 'track', name: 'Track day', kind: 'book', price: 2500, unit: 'day', note: '3 to 4 hours on track, flat' },
  commentating: { id: 'commentating', name: 'Commentating', kind: 'ask' },
  racing: { id: 'racing', name: 'Racing', kind: 'ask' },
};
export const ORDER = ['sim', 'track', 'commentating', 'racing'];

export const HOURS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
const DAYS = 42;

export const aed = (n) => `AED ${n.toLocaleString('en-US')}`;
export const priceLine = (o) => (o.kind === 'book' ? `${aed(o.price)} / ${o.unit}` : 'Inquire');
export const hh = (h) => `${String(h).padStart(2, '0')}:00`;
export const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const fmtDay = (d, o = { weekday: 'short', day: 'numeric', month: 'short' }) => d.toLocaleDateString('en-GB', o);

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const start = new Date();
start.setHours(0, 0, 0, 0);
start.setDate(start.getDate() + 1);

export const days = [];
{
  const r = rng(20261114);
  for (let i = 0; i < DAYS; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const hours = {};
    const busy = r();
    for (const h of HOURS) {
      const x = r();
      hours[h] = busy < 0.62 ? 'free' : x < 0.13 ? 'booked' : x < 0.22 ? 'held' : 'free';
    }
    const day = { key: dayKey(date), date, hours, track: null };
    // a whole-day booking takes every hour of the day
    const t = r();
    if (t < 0.1) day.track = 'booked';
    else if (t < 0.17) day.track = 'held';
    if (day.track) for (const h of HOURS) hours[h] = day.track;
    days.push(day);
  }
}

export const byKey = Object.fromEntries(days.map((d) => [d.key, d]));

// A track day needs the whole day; any taken hour makes the day unavailable.
export function trackState(day) {
  if (day.track) return day.track;
  const v = Object.values(day.hours);
  if (v.includes('booked')) return 'booked';
  if (v.includes('held')) return 'held';
  return 'free';
}
export const hourState = (day, h) => day.hours[h];
export const dayFree = (day) => HOURS.filter((h) => day.hours[h] === 'free').length;

// ---------- live ----------
// Every few seconds someone else's request holds a free slot, or Jack confirms
// a held one, so every view can show availability changing under the client.
const listeners = new Set();
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const protectedSlots = new Set();
export const protect = (id) => protectedSlots.add(id);
export const unprotect = (id) => protectedSlots.delete(id);
export const slotId = (day, h) => (h == null ? `${day.key}` : `${day.key}@${h}`);

function emit(change) {
  for (const fn of listeners) fn(change);
}

export function hold(day, h) {
  if (h == null) {
    day.track = 'held';
    for (const x of HOURS) day.hours[x] = 'held';
  } else day.hours[h] = 'held';
  emit({ day, h, state: 'held', mine: true });
}

const live = rng(Date.now() % 100000);
setInterval(() => {
  if (document.hidden || !listeners.size) return;
  const day = days[Math.floor(live() * 21)];
  if (live() < 0.3) {
    const held = HOURS.filter((h) => day.hours[h] === 'held' && !day.track);
    if (held.length) {
      const h = held[0];
      day.hours[h] = 'booked';
      return emit({ day, h, state: 'booked' });
    }
  }
  const free = HOURS.filter((h) => day.hours[h] === 'free' && !protectedSlots.has(slotId(day, h)) && !protectedSlots.has(slotId(day)));
  if (!free.length) return;
  const h = free[Math.floor(live() * free.length)];
  day.hours[h] = 'held';
  emit({ day, h, state: 'held' });
}, 6500);
