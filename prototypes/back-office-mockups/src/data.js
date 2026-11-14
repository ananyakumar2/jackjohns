// Mock data for the back office. Seeded, so every load is identical.
// Seasonality follows the UAE: track days run in the cool months and stop in
// the summer heat, when sim coaching peaks because everyone is indoors.
// Commentating follows the event calendar (Dubai 24H in January, the Abu Dhabi
// GP and Gulf 12 Hours in December, sim league finals).

export const TODAY = new Date(2026, 10, 14, 10, 20);
export const RANGE = { from: new Date(2025, 8, 1), to: new Date(2027, 0, 31) };

export const SERVICES = {
  sim: { name: 'Sim coaching', short: 'Sim', rate: 500, unit: 'hour' },
  track: { name: 'Track day', short: 'Track', rate: 2500, unit: 'day' },
  commentary: { name: 'Commentating', short: 'Comms', rate: null, unit: 'inquiry' },
  racing: { name: 'Racing', short: 'Racing', rate: null, unit: 'inquiry' },
};
export const SERVICE_ORDER = ['sim', 'track', 'commentary', 'racing'];

const PEOPLE = [
  'Omar Haddad', 'Priya Nair', 'Lukas Brandt', 'Aisha Al Mansoori', 'Rahul Mehta', 'Sofia Rossi',
  'Khalid Al Suwaidi', 'Daniel Okafor', 'Mei Lin', 'Faisal Qureshi', 'Hannah Clarke', 'Yusuf Demir',
  'Arjun Kapoor', 'Noura Al Hashimi', 'Tom Fletcher', 'Elena Petrova', 'Hamad Al Ketbi', 'Jonas Weber',
  'Layla Saeed', 'Vikram Shetty', 'Chloe Martin', 'Saeed Al Falasi', 'Marco Bianchi', 'Zara Sheikh',
  'Ben Carter', 'Reem Al Nuaimi', 'Kenji Sato', 'Ana Costa', 'Ibrahim Saleh', 'Ollie Grant',
  'Nadia Karim', 'Ravi Iyer', 'Mariam Al Zaabi', 'Pierre Laurent', 'Jaime Ortiz', 'Fatima Rahman',
  'Sam Whitfield', 'Tariq Aziz', 'Isla Murray', 'Ahmed Fathy',
];

const ORGS = {
  commentary: ['Gulf Endurance Series', 'Torque TV', 'Apex Sim League', 'Yas Motorsport Media', 'UAE Touring Cars', 'Paddock Radio'],
  racing: ['GT Arabia Team', 'Dune Energy', 'Marina Motors', 'Corniche Events', 'Falcon Racing', 'Saffron Logistics'],
};

const VENUES = ['Yas Marina Circuit', 'Dubai Autodrome', 'Yas Marina North', 'Dubai Autodrome Club'];
const SIM_VENUE = 'Sim studio, Al Quoz';

// Month weights, January first.
const SIM_W = [0.8, 0.8, 0.9, 1.0, 1.25, 1.55, 1.7, 1.6, 1.15, 0.9, 0.8, 0.8];
const TRACK_W = [1.45, 1.3, 1.05, 0.6, 0.2, 0, 0, 0, 0.15, 0.85, 1.3, 1.5];

const EVENTS = [
  { kind: 'commentary', title: 'Gulf 12 Hours', start: [2025, 11, 12], days: 2, quote: 9000 },
  { kind: 'commentary', title: 'Abu Dhabi GP week, studio analyst', start: [2025, 11, 4], days: 3, quote: 14000 },
  { kind: 'commentary', title: 'Dubai 24 Hour, pit lane', start: [2026, 0, 16], days: 3, quote: 12000 },
  { kind: 'commentary', title: 'UAE Touring Cars round 3', start: [2026, 1, 21], days: 1, quote: 4500 },
  { kind: 'commentary', title: 'Apex Sim League spring final', start: [2026, 2, 28], days: 1, quote: 5000 },
  { kind: 'commentary', title: 'Apex Sim League summer final', start: [2026, 6, 25], days: 1, quote: 5000 },
  { kind: 'commentary', title: 'UAE Touring Cars round 1', start: [2026, 9, 24], days: 1, quote: 4500, passed: true },
  { kind: 'commentary', title: 'Apex Sim League autumn final', start: [2026, 8, 26], days: 1, quote: 5500 },
  { kind: 'commentary', title: 'Paddock Radio season preview', start: [2026, 9, 9], days: 1, quote: 3000 },
  { kind: 'racing', title: 'Corporate hot laps', start: [2025, 9, 18], days: 1, quote: 8000 },
  { kind: 'racing', title: 'GT4 guest drive, Gulf 12 Hours', start: [2025, 11, 12], days: 2, quote: 22000, passed: true },
  { kind: 'racing', title: 'Dealer launch hot laps', start: [2026, 1, 7], days: 1, quote: 9500 },
  { kind: 'racing', title: 'Sponsor content day', start: [2026, 3, 11], days: 1, quote: 12000 },
  { kind: 'racing', title: 'Driver coaching for team rookie', start: [2026, 2, 14], days: 1, quote: 7500 },
  { kind: 'racing', title: 'Livery reveal and demo laps', start: [2026, 9, 31], days: 1, quote: 10000 },
];

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const at = (y, m, d, h = 0, min = 0) => new Date(y, m, d, h, min);
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());

export function generate() {
  const r = rng(20261114);
  const pick = (a) => a[Math.floor(r() * a.length)];
  // Regulars come back: weight the first names more heavily.
  // The last name is a newcomer whose first request is below, so keep him out of history.
  const pool = PEOPLE.slice(0, -1);
  const person = () => pool[Math.min(pool.length - 1, Math.floor(Math.pow(r(), 1.7) * pool.length))];

  const items = [];
  const fullDays = new Set();
  const hours = new Map();
  let n = 0;

  const free = (start, hrs, fullDay) => {
    const k = dayKey(start);
    if (fullDays.has(k)) return false;
    if (fullDay) return !hours.has(k);
    const used = hours.get(k) || [];
    for (let h = start.getHours(); h < start.getHours() + hrs; h++) if (used.includes(h)) return false;
    return true;
  };
  const occupy = (start, hrs, fullDay, days = 1) => {
    for (let i = 0; i < days; i++) {
      const k = dayKey(addDays(start, i));
      if (fullDay) fullDays.add(k);
      else {
        const used = hours.get(k) || [];
        for (let h = start.getHours(); h < start.getHours() + hrs; h++) used.push(h);
        hours.set(k, used);
      }
    }
  };

  const add = (b) => {
    const svc = b.service;
    const fullDay = svc !== 'sim';
    const item = {
      id: b.id || `b${++n}`,
      service: svc,
      client: b.client,
      org: b.org || null,
      title: b.title || null,
      start: b.start,
      hours: b.hours || (svc === 'sim' ? 1 : svc === 'track' ? 4 : 8),
      days: b.days || 1,
      venue: b.venue || (svc === 'sim' ? SIM_VENUE : svc === 'track' ? pick(VENUES) : b.venue || 'On location'),
      price: svc === 'sim' ? SERVICES.sim.rate * (b.hours || 1) : svc === 'track' ? SERVICES.track.rate : b.price ?? null,
      status: b.status,
      paid: !!b.paid,
      paidAt: b.paid ? b.paidAt || b.start : null,
      created: b.created,
      group: b.group || null,
      note: b.note || '',
      email: b.email || emailFor(b.org || b.client),
      phone: b.phone || phoneFor(b.client, r),
    };
    items.push(item);
    occupy(item.start, item.hours, fullDay, item.days);
    return item;
  };

  // Hand-written near-term items; the message threads refer to these by id.
  const T = TODAY;
  const fixed = [
    { id: 'r1', service: 'sim', client: 'Ahmed Fathy', start: at(2026, 10, 16, 18), hours: 2, status: 'tentative', created: at(2026, 10, 13, 21, 40), note: 'First time on a rig. Drives a Golf R on weekends.' },
    { id: 'r2', service: 'track', client: 'Priya Nair', start: at(2026, 10, 28, 8), venue: 'Yas Marina Circuit', status: 'tentative', created: at(2026, 10, 14, 9, 12), note: 'Own car, GR86 on track tyres.' },
    { id: 'r3', service: 'sim', client: 'Lukas Brandt', start: at(2026, 10, 17, 19), hours: 1, status: 'tentative', created: at(2026, 10, 14, 7, 55), note: 'Wants to work on Spa in ACC.' },
    { id: 'r4', service: 'sim', client: 'Zara Sheikh', start: at(2026, 10, 21, 11), hours: 1, status: 'tentative', created: at(2026, 10, 12, 16, 3) },
    { id: 'r5', service: 'track', client: 'Hamad Al Ketbi', start: at(2026, 11, 19, 8), venue: 'Dubai Autodrome', status: 'tentative', created: at(2026, 10, 11, 13, 30) },
    { id: 's1', service: 'track', client: 'Khalid Al Suwaidi', start: at(2026, 9, 24, 8), venue: 'Dubai Autodrome', status: 'confirmed', paid: true, created: at(2026, 9, 2, 10), group: 'g1' },
    { id: 's2', service: 'track', client: 'Khalid Al Suwaidi', start: at(2026, 10, 21, 8), venue: 'Dubai Autodrome', status: 'confirmed', created: at(2026, 9, 2, 10), group: 'g1' },
    { id: 's3', service: 'track', client: 'Khalid Al Suwaidi', start: at(2026, 11, 12, 8), venue: 'Dubai Autodrome', status: 'unlocked', created: at(2026, 9, 2, 10), group: 'g1', note: 'Cancelled the third day, travelling.' },
    { id: 'd1', service: 'sim', client: 'Hannah Clarke', start: at(2026, 10, 7, 17), hours: 2, status: 'confirmed', created: at(2026, 10, 3, 12) },
    { id: 'd2', service: 'track', client: 'Faisal Qureshi', start: at(2026, 9, 31, 8), venue: 'Yas Marina North', status: 'confirmed', created: at(2026, 9, 12, 18) },
    { id: 'm1', service: 'sim', client: 'Daniel Okafor', start: at(2026, 10, 19, 20), hours: 1, status: 'confirmed', created: at(2026, 10, 9, 11) },
    { id: 'f1', service: 'sim', client: 'Mei Lin', start: at(2026, 10, 10, 18), hours: 2, status: 'confirmed', paid: true, created: at(2026, 10, 4, 9) },
    { id: 'a1', service: 'sim', client: 'Arjun Kapoor', start: at(2026, 10, 18, 18), hours: 1, status: 'confirmed', created: at(2026, 10, 10, 15) },
    { id: 'a2', service: 'sim', client: 'Arjun Kapoor', start: at(2026, 10, 20, 18), hours: 1, status: 'confirmed', created: at(2026, 10, 10, 15) },
    { id: 'p1', service: 'sim', client: 'Sofia Rossi', start: at(2026, 10, 14, 15), hours: 1, status: 'confirmed', created: at(2026, 10, 8, 10) },
    { id: 'p2', service: 'sim', client: 'Ben Carter', start: at(2026, 10, 14, 17), hours: 2, status: 'confirmed', created: at(2026, 10, 9, 10) },
    { id: 'c1', service: 'commentary', client: 'Rania Fares', org: 'Gulf Endurance Series', title: 'Gulf 12 Hours, co-commentary', start: at(2026, 11, 11, 9), days: 2, venue: 'Yas Marina Circuit', status: 'tentative', created: at(2026, 10, 13, 15, 20) },
    { id: 'c2', service: 'commentary', client: 'James Holt', org: 'Torque TV', title: 'Abu Dhabi GP week, studio analyst', start: at(2026, 11, 3, 10), days: 3, venue: 'Torque TV studio, Abu Dhabi', price: 14000, status: 'tentative', created: at(2026, 10, 6, 10) },
    { id: 'rc1', service: 'racing', client: 'Karim Nasser', org: 'GT Arabia Team', title: 'Dubai 24 Hour, GT4 seat', start: at(2027, 0, 15, 8), days: 3, venue: 'Dubai Autodrome', status: 'tentative', created: at(2026, 10, 12, 19, 5) },
    { id: 'rc2', service: 'racing', client: 'Leena Saif', org: 'Dune Energy', title: 'Corporate hot laps', start: at(2026, 10, 22, 14), venue: 'Yas Marina Circuit', price: 9500, status: 'confirmed', created: at(2026, 9, 28, 9) },
    { id: 'c3', service: 'commentary', client: 'Ali Mirza', org: 'Apex Sim League', title: 'Winter final, lead commentary', start: at(2027, 0, 9, 18), venue: 'Online broadcast', status: 'tentative', created: at(2026, 10, 14, 8, 41) },
  ];
  fixed.forEach(add);

  // Inquiry history.
  for (const e of EVENTS) {
    const start = at(e.start[0], e.start[1], e.start[2], 9);
    if (!free(start, 8, true)) continue;
    const org = pick(ORGS[e.kind]);
    const isPast = start < T;
    const status = e.passed ? 'declined' : isPast ? 'confirmed' : r() < 0.5 ? 'confirmed' : 'tentative';
    add({
      service: e.kind, client: contactFor(org), org, title: e.title, start, days: e.days,
      venue: e.kind === 'commentary' && /Sim/.test(e.title) ? 'Online broadcast' : pick(VENUES),
      price: e.quote, status, paid: status === 'confirmed' && isPast && r() < 0.9,
      paidAt: addDays(start, Math.floor(r() * 12)), created: addDays(start, -20 - Math.floor(r() * 30)),
    });
  }

  // Coaching across the whole range.
  for (let d = new Date(RANGE.from); d <= RANGE.to; d = addDays(d, 1)) {
    const m = d.getMonth();
    const dow = d.getDay();
    const weekend = dow === 5 || dow === 6 || dow === 0;

    if (weekend && r() < TRACK_W[m] * 0.32) {
      const start = at(d.getFullYear(), m, d.getDate(), 8);
      const lead = 7 + Math.floor(r() * 40);
      const created = addDays(start, -lead);
      if (created < T && free(start, 4, true)) add({ service: 'track', client: person(), start, status: status(start, r), created, ...payFor(start, r) });
    }

    const expected = 0.7 * SIM_W[m] * (weekend ? 1.35 : 1);
    let count = Math.floor(expected) + (r() < expected % 1 ? 1 : 0);
    while (count-- > 0) {
      const hrs = r() < 0.68 ? 1 : r() < 0.88 ? 2 : 3;
      const h = 10 + Math.floor(r() * (22 - hrs - 10));
      const start = at(d.getFullYear(), m, d.getDate(), h);
      const created = addDays(start, -(1 + Math.floor(r() * 14)));
      if (created < T && free(start, hrs, false)) add({ service: 'sim', client: person(), start, hours: hrs, status: status(start, r), created, ...payFor(start, r) });
    }
  }

  // Fix up payment for generated items now that status is known.
  for (const b of items) {
    if (b.status !== 'confirmed') { b.paid = false; b.paidAt = null; }
  }

  items.sort((a, b) => a.start - b.start);
  return { items, threads: threads(items) };
}

function status(start, r) {
  const ahead = (start - TODAY) / 864e5;
  const x = r();
  if (ahead < 0) return x < 0.06 ? 'declined' : x < 0.17 ? 'unlocked' : 'confirmed';
  if (ahead < 4) return x < 0.12 ? 'tentative' : x < 0.2 ? 'unlocked' : 'confirmed';
  if (ahead < 21) return x < 0.42 ? 'tentative' : x < 0.5 ? 'unlocked' : 'confirmed';
  return x < 0.5 ? 'tentative' : x < 0.55 ? 'unlocked' : 'confirmed';
}

function payFor(start, r) {
  const ahead = (start - TODAY) / 864e5;
  // Cash on the day, mostly. A few recent ones are still owed; a few pay ahead.
  if (ahead < -30) return { paid: r() < 0.97, paidAt: addDays(start, r() < 0.8 ? 0 : 1 + Math.floor(r() * 6)) };
  if (ahead < 0) return { paid: r() < 0.82, paidAt: addDays(start, r() < 0.7 ? 0 : 1 + Math.floor(r() * 4)) };
  return { paid: r() < 0.1, paidAt: addDays(TODAY, -Math.floor(r() * 5)) };
}

function contactFor(org) {
  const c = { 'Gulf Endurance Series': 'Rania Fares', 'Torque TV': 'James Holt', 'Apex Sim League': 'Ali Mirza', 'Yas Motorsport Media': 'Sara Kamal', 'UAE Touring Cars': 'Hassan Obaid', 'Paddock Radio': 'Will Archer', 'GT Arabia Team': 'Karim Nasser', 'Dune Energy': 'Leena Saif', 'Marina Motors': 'Nikhil Rao', 'Corniche Events': 'Dana Yousef', 'Falcon Racing': 'Matteo Ricci', 'Saffron Logistics': 'Amal Haddad' };
  return c[org] || 'Events team';
}

function emailFor(name) {
  return name.toLowerCase().replace(/[^a-z ]/g, '').trim().replace(/\s+/g, '.') + '@mail.com';
}

function phoneFor(name, r) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `+971 5${h % 10} ${String(h % 900 + 100)} ${String((h >> 8) % 9000 + 1000)}`;
}

// Message threads. Offsets are minutes before TODAY.
function threads(items) {
  const byId = Object.fromEntries(items.map((b) => [b.id, b]));
  const ago = (min) => new Date(TODAY.getTime() - min * 60000);
  const T = (id, who, booking, msgs) => ({
    id, who, org: booking && byId[booking] ? byId[booking].org : null, booking,
    messages: msgs.map(([from, min, text]) => ({ from, at: ago(min), text })),
    read: msgs[msgs.length - 1][0] === 'jack',
  });
  return [
    T('t1', 'Priya Nair', 'r2', [
      ['client', 68, 'Hi Jack, I just requested the Yas day on the 28th. Do I need my own helmet, and is the GR86 on Nankang AR-1s fine or should I bring a second set?'],
    ]),
    T('t2', 'Lukas Brandt', 'r3', [
      ['client', 145, 'Booked Tuesday 7pm. I want to go through Spa in ACC, especially Pouhon and the Bus Stop. I can send my replay file beforehand if that helps.'],
    ]),
    T('t3', 'Rania Fares', 'c1', [
      ['client', 1140, 'Hello Jack, Gulf Endurance Series here. We are looking for a co-commentator alongside our lead for the Gulf 12 Hours, 11 and 12 December, both stints. Could you share your day rate and availability?'],
    ]),
    T('t4', 'Ahmed Fathy', 'r1', [
      ['client', 760, 'Hey! First time on a proper rig. Anything I should bring? I usually drive in trainers, is that ok?'],
    ]),
    T('t5', 'Karim Nasser', 'rc1', [
      ['client', 2350, 'Jack, we have a seat in our GT4 for the Dubai 24H in January and would love you in the line-up as the pro. Can we talk budget and a test day in December?'],
    ]),
    T('t6', 'Daniel Okafor', 'm1', [
      ['client', 300, 'Something came up at work Thursday. Any chance we can move to the same time next week? Sorry for the short notice.'],
    ]),
    T('t7', 'Ali Mirza', 'c3', [
      ['client', 99, 'Hi Jack, Apex Sim League winter final is 9 January. We would like you on lead commentary for the main broadcast, about four hours. Interested?'],
    ]),
    T('t8', 'James Holt', 'c2', [
      ['client', 11500, 'Jack, Torque TV would like you in the studio for GP week, Thursday to Saturday. Can you send a quote?'],
      ['jack', 11320, 'Thanks James, happy to. AED 14,000 for the three days, including the qualifying and race shows. Hotel in Abu Dhabi if we finish late on the Saturday.'],
      ['client', 4200, 'Works for us. Waiting on final sign-off from our producer, will confirm by Wednesday.'],
    ]),
    T('t9', 'Faisal Qureshi', 'd2', [
      ['jack', 15400, 'Great day at Yas North, Faisal. Sector two is where the time is, as we said.'],
      ['client', 9800, 'Thanks Jack, loved it. Sorry, I forgot the cash on the day. Can I drop it at the studio Tuesday?'],
      ['jack', 9750, 'No problem, Tuesday works.'],
    ]),
    T('t10', 'Arjun Kapoor', 'a1', [
      ['client', 3100, 'Can I pay for both sessions this week on Wednesday? Cash is fine.'],
      ['jack', 3000, 'Of course, see you Wednesday.'],
    ]),
    T('t11', 'Mei Lin', 'f1', [
      ['client', 5600, 'That session was brilliant. Knocked 1.2 seconds off at Kyalami this morning. Booking again next month for sure.'],
      ['jack', 5420, 'Brilliant, Mei! Keep the brake release smooth into turn one and there is more to come.'],
    ]),
    T('t12', 'Khalid Al Suwaidi', 's3', [
      ['client', 20160, 'Jack, I have to cancel the 12 December day, I will be travelling. The 21st is still on.'],
      ['jack', 20100, 'Understood, I have unlocked the 12th. See you on the 21st.'],
    ]),
    T('t13', 'Leena Saif', 'rc2', [
      ['client', 25000, 'Dune Energy would like you for hot laps at our client day on 22 November, about 2 hours of laps. Rate?'],
      ['jack', 24600, 'AED 9,500 for the afternoon including the car briefing. Happy to sign a few things for your guests too.'],
      ['client', 21000, 'Confirmed, thank you! Payment in cash on the day as agreed.'],
    ]),
    T('t14', 'Hannah Clarke', 'd1', [
      ['jack', 9000, 'Hi Hannah, just a reminder about the AED 1,000 from last Saturday when you are next near the studio.'],
    ]),
  ];
}
