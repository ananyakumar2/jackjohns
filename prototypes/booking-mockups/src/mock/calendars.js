import { OPTIONS, HOURS, byKey, days, dayFree, fmtDay, hh, priceLine, subscribe, trackState } from './data.js';
import { backButton, el, field, ink, legend, optionBar } from './ui.js';

// ---------- shared ----------
function stateFor(node, option) {
  const day = byKey[node.dataset.key];
  if (node.dataset.h) return day.hours[node.dataset.h];
  if (option === 'track') return trackState(day);
  // a sim day: free while any hour is free
  if (dayFree(day)) return 'free';
  return Object.values(day.hours).includes('held') ? 'held' : 'booked';
}

// Repaints every slot from the data; anything that changed since last time flashes gold.
function paint(root, option) {
  root.querySelectorAll('[data-key]').forEach((n) => {
    const s = stateFor(n, option);
    if (n.dataset.state && n.dataset.state !== s) {
      n.classList.remove('flip');
      void n.offsetWidth;
      n.classList.add('flip');
    }
    n.dataset.state = s;
    n.classList.remove('free', 'held', 'booked');
    n.classList.add('s', s);
    n.disabled = s !== 'free' && !n.classList.contains('picked');
    n.title = `${n.dataset.label ?? ''} · ${s === 'free' ? 'Free' : s === 'held' ? 'Held, request pending' : 'Booked'}`;
  });
}

const slotBtn = (attrs, ...kids) => ink(el('button', { type: 'button', 'data-label': attrs['aria-label'], ...attrs }, ...kids));

function pickIn(root, node) {
  root.querySelectorAll('.picked').forEach((p) => p !== node && p.classList.remove('picked'));
  node.classList.add('picked');
}

// What's picked, its price, and Continue.
function foot(ctx) {
  const line = el('div', { class: 'c-sum' });
  const go = el('button', { type: 'button', class: 'cta', text: 'Continue', disabled: true, onclick: () => ctx.next() });
  const update = () => {
    const s = ctx.summary();
    const o = OPTIONS[ctx.state.option];
    line.replaceChildren(el('span', { class: 'up', text: s.when || '' }));
    if (o.kind === 'book' && s.when) line.append(el('span', { class: 'price', text: priceLine(o) }));
    go.disabled = o.kind === 'book' ? !ctx.state.slot : !(ctx.state.message.trim() || (ctx.state.eventDate && ctx.state.option === 'commentating'));
  };
  update();
  return { node: el('div', { class: 'c-foot' }, line, go), update };
}

// Inquiries never take a slot: Commentating asks about an event, Racing about a deal.
function inquiry(ctx, onChange) {
  const s = ctx.state;
  const box = el('form', { class: `inq ${s.option}`, onsubmit: (e) => e.preventDefault() });
  if (s.option === 'commentating') {
    const ev = field({ name: 'event', label: 'Event', placeholder: 'Series, round, venue' });
    const date = field({ name: 'date', label: 'Date', type: 'date' });
    ev.querySelector('input').addEventListener('input', (e) => ((s.topic = e.target.value), onChange()));
    date.querySelector('input').min = days[0].key;
    date.querySelector('input').addEventListener('input', (e) => ((s.eventDate = e.target.value), onChange()));
    box.append(el('div', { class: 'inq-row' }, ev, date));
  } else {
    const chips = el('div', { class: 'chips', role: 'radiogroup' });
    for (const t of ['Sponsorship', 'Drive', 'Other']) {
      chips.append(
        ink(
          el('button', {
            type: 'button',
            class: 'chip',
            role: 'radio',
            'aria-checked': 'false',
            text: t,
            onclick: (e) => {
              s.topic = t;
              chips.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-checked', String(c === e.currentTarget)));
              onChange();
            },
          }),
        ),
      );
    }
    box.append(chips);
  }
  const msg = field({ name: 'message', label: 'Message', area: true, placeholder: s.option === 'commentating' ? 'What you need from Jack' : 'Tell Jack about it' });
  msg.querySelector('textarea').addEventListener('input', (e) => ((s.message = e.target.value), onChange()));
  box.append(msg);
  return box;
}

// The frame every calendar shares: back, the four options, the variant's body, the footer.
function frame(root, ctx, cls, body) {
  const f = foot(ctx);
  const wrap = el('div', { class: `cal ${cls} opt-${ctx.state.option}` }, backButton(ctx), el('div', { class: 'c-top' }, optionBar(ctx)));
  const o = OPTIONS[ctx.state.option];
  if (o.kind === 'ask') {
    wrap.append(el('div', { class: 'c-body' }, inquiry(ctx, f.update)), f.node);
    root.append(wrap);
    return null;
  }
  const inner = el('div', { class: 'c-body' });
  wrap.append(inner, el('div', { class: 'c-legend' }, legend()), f.node);
  root.append(wrap);
  const api = body(inner, f.update);
  const repaint = () => paint(inner, ctx.state.option);
  repaint();
  const off = subscribe(() => {
    api?.live?.();
    repaint();
  });
  return () => off();
}

const choose = (ctx, update, root, node, slot) => {
  if (node.disabled) return;
  pickIn(root, node);
  ctx.setSlot(slot);
  update();
};

// ---------- Month: a month grid; a sim day opens its hours underneath ----------
function month(root, ctx) {
  return frame(root, ctx, 'month', (body, update) => {
    let page = 0;
    const months = [...new Set(days.map((d) => `${d.date.getFullYear()}-${d.date.getMonth()}`))];
    const head = el('div', { class: 'm-head' });
    const grid = el('div', { class: 'm-grid' });
    const hours = el('div', { class: 'm-hours' });
    const sim = ctx.state.option === 'sim';
    const showHours = (day) => {
      hours.replaceChildren(
        ...HOURS.map((h) => {
          const b = slotBtn({ class: 'm-hour', 'data-key': day.key, 'data-h': h, 'aria-label': hh(h), text: hh(h) });
          b.addEventListener('click', () => choose(ctx, update, body, b, { day, h }));
          return b;
        }),
      );
      paint(hours, 'sim');
    };
    const draw = () => {
      const [y, m] = months[page].split('-').map(Number);
      head.replaceChildren(
        el('button', { type: 'button', class: 'arrow l', 'aria-label': 'Earlier', disabled: page === 0, onclick: () => (page--, draw()) }),
        el('span', { class: 'up', text: new Date(y, m, 1).toLocaleDateString('en-GB', { month: 'long' }) }),
        el('button', { type: 'button', class: 'arrow r', 'aria-label': 'Later', disabled: page === months.length - 1, onclick: () => (page++, draw()) }),
      );
      grid.replaceChildren(...['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => el('span', { class: 'm-dow', text: d })));
      const first = new Date(y, m, 1);
      for (let i = 0; i < (first.getDay() + 6) % 7; i++) grid.append(el('span'));
      const n = new Date(y, m + 1, 0).getDate();
      for (let d = 1; d <= n; d++) {
        const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const day = byKey[key];
        if (!day) {
          grid.append(el('span', { class: 'm-day off', text: d }));
          continue;
        }
        const b = slotBtn({ class: 'm-day', 'data-key': key, 'aria-label': fmtDay(day.date) }, el('span', { text: d }));
        if (sim) b.append(el('i', { class: 'm-fill', style: { '--f': dayFree(day) / HOURS.length } }));
        b.addEventListener('click', () => {
          if (b.disabled) return;
          if (sim) {
            pickIn(grid, b);
            ctx.setSlot(null);
            update();
            showHours(day);
          } else choose(ctx, update, body, b, { day });
        });
        grid.append(b);
      }
      paint(grid, ctx.state.option);
    };
    draw();
    body.append(head, grid);
    if (sim) body.append(hours);
    return {
      live: () => body.querySelectorAll('.m-fill').forEach((f) => f.style.setProperty('--f', dayFree(byKey[f.parentNode.dataset.key]) / HOURS.length)),
    };
  });
}

// ---------- Strip: ten days side by side; hours are cells, a track day is the whole column ----------
function strip(root, ctx) {
  return frame(root, ctx, 'strip', (body, update) => {
    const sim = ctx.state.option === 'sim';
    let from = 0;
    const N = root.clientWidth > root.clientHeight ? 14 : 7;
    const cols = el('div', { class: 'st-cols' });
    const nav = el('div', { class: 'st-nav' });
    const draw = () => {
      cols.replaceChildren(sim ? el('div', { class: 'st-axis' }, ...HOURS.map((h) => el('span', { text: h % 3 === 1 ? hh(h) : '' }))) : el('div', { class: 'st-axis' }));
      for (const day of days.slice(from, from + N)) {
        const col = el(
          'div',
          { class: 'st-col' },
          el('span', { class: 'st-dow', text: day.date.toLocaleDateString('en-GB', { weekday: 'narrow' }) }),
          el('span', { class: 'st-date', text: day.date.getDate() }),
        );
        if (sim) {
          for (const h of HOURS) {
            const b = slotBtn({ class: 'st-cell', 'data-key': day.key, 'data-h': h, 'aria-label': `${fmtDay(day.date)} ${hh(h)}` });
            b.addEventListener('click', () => choose(ctx, update, body, b, { day, h }));
            col.append(b);
          }
        } else {
          const b = slotBtn({ class: 'st-day', 'data-key': day.key, 'aria-label': fmtDay(day.date) });
          b.addEventListener('click', () => choose(ctx, update, body, b, { day }));
          col.append(b);
        }
        cols.append(col);
      }
      const pick = ctx.state.slot;
      if (pick) cols.querySelector(`[data-key="${pick.day.key}"]${sim ? `[data-h="${pick.h}"]` : ''}`)?.classList.add('picked');
      nav.replaceChildren(
        el('button', { type: 'button', class: 'arrow l', 'aria-label': 'Earlier', disabled: from === 0, onclick: () => ((from -= N), draw()) }),
        el('span', { class: 'up', text: `${fmtDay(days[from].date, { day: 'numeric', month: 'short' })} – ${fmtDay(days[Math.min(from + N, days.length) - 1].date, { day: 'numeric', month: 'short' })}` }),
        el('button', { type: 'button', class: 'arrow r', 'aria-label': 'Later', disabled: from + N >= days.length, onclick: () => ((from += N), draw()) }),
      );
      paint(cols, ctx.state.option);
    };
    draw();
    body.append(nav, cols);
  });
}

// ---------- Gauge: a rev counter; the needle swings to the hour (sim) or the day (track) ----------
function gauge(root, ctx) {
  return frame(root, ctx, 'gauge', (body, update) => {
    const sim = ctx.state.option === 'sim';
    const SWEEP = 240;
    let day = days.find((d) => dayFree(d)) ?? days[0];
    const dial = el('div', { class: 'g-dial' });
    const needle = el('div', { class: 'g-needle' });
    const readout = el('div', { class: 'g-read' });
    const dates = el('div', { class: 'g-dates' });
    const angle = (i, n) => -SWEEP / 2 + (SWEEP * i) / (n - 1);
    const aim = (i, n, label) => {
      needle.style.setProperty('--a', `${angle(i, n)}deg`);
      readout.textContent = label;
    };
    const marks = () => {
      dial.querySelectorAll('.g-mark').forEach((m) => m.remove());
      const items = sim ? HOURS.map((h) => ({ day, h, label: hh(h), short: String(h) })) : days.slice(0, 14).map((d) => ({ day: d, label: fmtDay(d.date), short: String(d.date.getDate()) }));
      items.forEach((it, i) => {
        const b = slotBtn({ class: 'g-mark', 'data-key': it.day.key, 'data-h': it.h, 'aria-label': it.label, style: { '--a': `${angle(i, items.length)}deg` } }, el('span', { text: it.short }));
        b.addEventListener('pointerenter', () => !b.disabled && aim(i, items.length, it.label));
        b.addEventListener('click', () => {
          if (b.disabled) return;
          aim(i, items.length, it.label);
          choose(ctx, update, dial, b, sim ? { day: it.day, h: it.h } : { day: it.day });
        });
        dial.append(b);
      });
      readout.textContent = sim ? fmtDay(day.date) : '';
      needle.style.setProperty('--a', `${-SWEEP / 2 - 8}deg`);
      paint(dial, ctx.state.option);
    };
    if (sim) {
      for (const d of days.slice(0, root.clientWidth > root.clientHeight ? 14 : 7)) {
        const b = slotBtn({ class: 'g-date', 'data-key': d.key, 'aria-label': fmtDay(d.date) }, el('span', { text: d.date.toLocaleDateString('en-GB', { weekday: 'narrow' }) }), el('b', { text: d.date.getDate() }));
        b.addEventListener('click', () => {
          if (b.disabled) return;
          day = d;
          dates.querySelectorAll('.on').forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
          ctx.setSlot(null);
          update();
          marks();
        });
        if (d === day) b.classList.add('on');
        dates.append(b);
      }
      body.append(dates);
    }
    dial.append(el('div', { class: 'g-arc' }), needle, el('div', { class: 'g-hub' }), readout);
    body.append(dial);
    marks();
  });
}

// ---------- Agenda: soonest first, like a race calendar; the next opening leads ----------
function agenda(root, ctx) {
  return frame(root, ctx, 'agenda', (body, update) => {
    const sim = ctx.state.option === 'sim';
    const list = el('div', { class: 'ag-list' });
    for (const day of days.slice(0, 21)) {
      const row = el('div', { class: 'ag-row' }, el('span', { class: 'ag-day up', text: fmtDay(day.date, { weekday: 'short', day: 'numeric', month: 'short' }) }));
      if (sim) {
        const times = el('div', { class: 'ag-times' });
        for (const h of HOURS) {
          const b = slotBtn({ class: 'ag-time', 'data-key': day.key, 'data-h': h, 'aria-label': `${fmtDay(day.date)} ${hh(h)}`, text: hh(h) });
          b.addEventListener('click', () => choose(ctx, update, list, b, { day, h }));
          times.append(b);
        }
        row.append(times);
      } else {
        const b = slotBtn({ class: 'ag-whole', 'data-key': day.key, 'aria-label': fmtDay(day.date) }, el('span', { class: 'ag-state' }));
        b.addEventListener('click', () => choose(ctx, update, list, b, { day }));
        row.append(b);
      }
      list.append(row);
    }
    body.append(list);
    const lead = () => {
      list.querySelectorAll('.ag-row.next').forEach((r) => r.classList.remove('next'));
      const first = [...list.querySelectorAll('[data-key]')].find((n) => stateFor(n, ctx.state.option) === 'free');
      first?.closest('.ag-row').classList.add('next');
      list.querySelectorAll('.ag-state').forEach((s) => (s.textContent = { free: 'Whole day', held: 'Held', booked: 'Booked' }[stateFor(s.parentNode, 'track')]));
    };
    lead();
    return { live: () => requestAnimationFrame(lead) };
  });
}

export const CALENDARS = [
  { id: 'month', name: 'Month', idea: 'A month grid: each day shows how full it is; a sim day opens its hours', render: month },
  { id: 'strip', name: 'Strip', idea: 'Two weeks side by side (one on a phone): hours are cells, a track day is the whole column', render: strip },
  { id: 'gauge', name: 'Gauge', idea: 'A rev counter: the needle swings to the hour or the day', render: gauge },
  { id: 'agenda', name: 'Agenda', idea: 'Soonest first, like a race calendar; the next opening leads', render: agenda },
];
