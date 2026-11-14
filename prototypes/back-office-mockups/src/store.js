import { generate, TODAY, SERVICES, SERVICE_ORDER } from './data.js';

const data = generate();
const listeners = new Set();

export const store = {
  items: data.items,
  threads: data.threads,
  byId: Object.fromEntries(data.items.map((b) => [b.id, b])),
  subscribe: (fn) => listeners.add(fn),
};

const emit = () => listeners.forEach((fn) => fn());

// The single state a booking shows, in order of what matters to Jack.
// tentative: requested, slot held but not promised.
// confirmed: Jack said yes, slot locked.
// due: confirmed, the session has happened, the cash hasn't arrived.
// paid: cash in hand; only this counts as revenue.
// unlocked: Jack freed the slot (client cancelled). declined: Jack said no.
export function state(b) {
  if (b.status === 'confirmed') {
    if (b.paid) return 'paid';
    return end(b) < TODAY ? 'due' : 'confirmed';
  }
  return b.status;
}

export const STATE_LABEL = {
  tentative: 'Tentative', confirmed: 'Confirmed', due: 'Cash due', paid: 'Paid', unlocked: 'Unlocked', declined: 'Declined',
};

export const isInquiry = (b) => b.service === 'commentary' || b.service === 'racing';
export const isActive = (b) => b.status === 'tentative' || b.status === 'confirmed';
export const end = (b) => new Date(b.start.getTime() + ((b.days - 1) * 24 + b.hours) * 3600e3);
export const value = (b) => b.price ?? 0;

export const actions = {
  confirm(id) { const b = store.byId[id]; b.status = 'confirmed'; emit(); },
  decline(id) { const b = store.byId[id]; b.status = 'declined'; b.paid = false; emit(); },
  unlock(id) { const b = store.byId[id]; b.status = 'unlocked'; b.paid = false; b.paidAt = null; emit(); },
  relock(id) { const b = store.byId[id]; b.status = 'confirmed'; emit(); },
  paid(id) { const b = store.byId[id]; b.status = 'confirmed'; b.paid = true; b.paidAt = new Date(TODAY); emit(); },
  unpaid(id) { const b = store.byId[id]; b.paid = false; b.paidAt = null; emit(); },
  quote(id, amount) { const b = store.byId[id]; b.price = amount; emit(); },
  read(id) { const t = store.threads.find((x) => x.id === id); if (t && !t.read) { t.read = true; emit(); } },
  send(id, text) {
    const t = store.threads.find((x) => x.id === id);
    if (!t || !text.trim()) return;
    t.messages.push({ from: 'jack', at: new Date(TODAY), text: text.trim() });
    t.read = true;
    emit();
  },
};

// Requests waiting on Jack: tentative and not yet past.
export const pending = () => store.items.filter((b) => b.status === 'tentative' && end(b) >= TODAY);
export const dueList = () => store.items.filter((b) => state(b) === 'due');
export const unread = () => store.threads.filter((t) => !t.read);

// Money for a window [from, to). Bookings count by session date.
export function totals(from, to, filter = () => true) {
  const out = {
    requests: 0, active: 0, cancelled: 0, declined: 0,
    potential: 0, confirmed: 0, unconfirmed: 0, paid: 0, unpaid: 0, due: 0,
    byService: Object.fromEntries(SERVICE_ORDER.map((s) => [s, { paid: 0, potential: 0, count: 0 }])),
    pendingQuotes: 0,
  };
  for (const b of store.items) {
    if (b.start < from || b.start >= to || !filter(b)) continue;
    out.requests++;
    const st = state(b);
    if (st === 'unlocked') { out.cancelled++; continue; }
    if (st === 'declined') { out.declined++; continue; }
    out.active++;
    const v = value(b);
    if (b.price == null) out.pendingQuotes++;
    out.potential += v;
    const svc = out.byService[b.service];
    svc.potential += v;
    svc.count++;
    if (st === 'tentative') out.unconfirmed += v;
    else {
      out.confirmed += v;
      if (st === 'paid') { out.paid += v; svc.paid += v; } else out.unpaid += v;
      if (st === 'due') out.due += v;
    }
  }
  return out;
}

// Calendar periods.
export function periodRange(kind, offset = 0) {
  const y = TODAY.getFullYear();
  const m = TODAY.getMonth();
  if (kind === 'month') {
    const s = new Date(y, m + offset, 1);
    return { from: s, to: new Date(s.getFullYear(), s.getMonth() + 1, 1), label: s.toLocaleString('en-GB', { month: 'long', year: 'numeric' }), short: s.toLocaleString('en-GB', { month: 'short' }) };
  }
  if (kind === 'quarter') {
    const q = Math.floor(m / 3) + offset;
    const s = new Date(y, q * 3, 1);
    const qi = Math.floor(s.getMonth() / 3) + 1;
    return { from: s, to: new Date(s.getFullYear(), s.getMonth() + 3, 1), label: `Q${qi} ${s.getFullYear()}`, short: `Q${qi}` };
  }
  const h = Math.floor(m / 6) + offset;
  const s = new Date(y, h * 6, 1);
  const hi = s.getMonth() < 6 ? 1 : 2;
  return { from: s, to: new Date(s.getFullYear(), s.getMonth() + 6, 1), label: `H${hi} ${s.getFullYear()}`, short: `H${hi}` };
}

// Paid revenue per service per calendar month for the 12 months to the end of
// last month: what did well at which time of year.
export function seasonality() {
  const rows = SERVICE_ORDER.map((s) => ({ service: s, months: Array(12).fill(0) }));
  const from = new Date(TODAY.getFullYear() - 1, TODAY.getMonth(), 1);
  const to = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
  for (const b of store.items) {
    if (b.start < from || b.start >= to || state(b) !== 'paid') continue;
    rows[SERVICE_ORDER.indexOf(b.service)].months[b.start.getMonth()] += value(b);
  }
  return { rows, from, to };
}

export function monthly(count = 15, offsetEnd = 2) {
  const out = [];
  for (let i = -count + offsetEnd; i <= offsetEnd; i++) {
    const p = periodRange('month', i);
    out.push({ ...p, t: totals(p.from, p.to), current: i === 0, future: i > 0 });
  }
  return out;
}

export { TODAY, SERVICES, SERVICE_ORDER };
