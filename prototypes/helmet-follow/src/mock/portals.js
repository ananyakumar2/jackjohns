import { OPTIONS, ORDER, priceLine } from './data.js';
import { el, ink, price } from './ui.js';

// ---------- Quadrants: the lens repeats the hero, four quarters round the helmet ----------
function quadrants(root, ctx) {
  const wrap = el('div', { class: 'quads' });
  ORDER.forEach((id, i) => {
    const o = OPTIONS[id];
    wrap.append(
      ink(
        el(
          'button',
          { type: 'button', class: `quad q${i} ${o.kind}`, onclick: () => ctx.pick(id) },
          el('span', { class: 'q-text' }, el('span', { class: 'up q-name', text: o.name }), price(o)),
        ),
      ),
    );
  });
  wrap.append(el('div', { class: 'quad-ring' }));
  root.append(wrap);
}

// ---------- Gate: an H-pattern shifter; the knob runs the gate into the option ----------
function gate(root, ctx) {
  const G = { l: 22, r: 78, t: 18, b: 82, m: 50 }; // % of the gate box
  const pos = { sim: [G.l, G.t], track: [G.r, G.t], commentating: [G.l, G.b], racing: [G.r, G.b] };
  const box = el('div', { class: 'gate' });
  box.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="gch" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f3f6fa"/><stop offset="0.46" stop-color="#a9b2be"/><stop offset="0.54" stop-color="#e4e9f0"/><stop offset="1" stop-color="#7d8693"/></linearGradient></defs>
    <path d="M${G.l} ${G.t}V${G.b}M${G.r} ${G.t}V${G.b}M${G.l} ${G.m}H${G.r}" class="slot-bed"/>
    <path d="M${G.l} ${G.t}V${G.b}M${G.r} ${G.t}V${G.b}M${G.l} ${G.m}H${G.r}" class="slot-line"/>
  </svg>`;
  const knob = el('div', { class: 'knob' });
  box.append(knob);
  let at = [G.m, G.m];
  let timer = 0;
  const place = ([x, y]) => {
    knob.style.left = `${x}%`;
    knob.style.top = `${y}%`;
    at = [x, y];
  };
  // a real gate: out of the row first, across through neutral, then into the row
  const travel = (to) => {
    clearTimeout(timer);
    const steps = [];
    if (at[1] !== G.m) steps.push([at[0], G.m]);
    if (at[0] !== to[0]) steps.push([to[0], G.m]);
    steps.push(to);
    const run = () => {
      const s = steps.shift();
      if (!s) return;
      place(s);
      if (steps.length) timer = setTimeout(run, 140);
    };
    run();
  };
  place(at);
  for (const id of ORDER) {
    const o = OPTIONS[id];
    const [x, y] = pos[id];
    box.append(
      el(
        'button',
        {
          type: 'button',
          class: `gate-opt ${o.kind} ${y < 50 ? 'top' : 'bottom'} ${x < 50 ? 'left' : 'right'}`,
          style: { left: `${x}%`, top: `${y}%` },
          onpointerenter: () => travel(pos[id]),
          onfocus: () => travel(pos[id]),
          onclick: () => {
            travel(pos[id]);
            knob.classList.add('in');
            setTimeout(() => ctx.pick(id), 420);
          },
        },
        el('span', { class: 'up', text: o.name }),
        price(o),
      ),
    );
  }
  box.addEventListener('pointerleave', () => travel([G.m, G.m]));
  root.append(box);
  return () => clearTimeout(timer);
}

// ---------- Wheel: the lens becomes his steering wheel; the buttons are the options ----------
function wheel(root, ctx) {
  const disp = el('div', { class: 'w-display' }, el('span', { class: 'up w-name', text: 'Book' }), el('span', { class: 'w-price', text: '' }));
  const face = el('div', { class: 'w-face' });
  const rim = el('div', { class: 'w-rim' });
  face.append(rim, el('div', { class: 'w-spoke l' }), el('div', { class: 'w-spoke r' }), el('div', { class: 'w-spoke b' }), disp);
  const show = (id, turn) => {
    const o = id && OPTIONS[id];
    disp.firstChild.textContent = o ? o.name : 'Book';
    disp.lastChild.textContent = o ? (o.kind === 'book' ? priceLine(o) : 'Inquire') : '';
    disp.lastChild.className = `w-price${o && o.kind === 'book' ? ' price' : ''}`;
    face.style.setProperty('--turn', `${turn}deg`);
  };
  ORDER.forEach((id, i) => {
    const o = OPTIONS[id];
    const side = i < 2 ? 'l' : 'r';
    face.append(
      el(
        'button',
        {
          type: 'button',
          class: `w-btn ${side} n${i % 2} ${o.kind}`,
          onpointerenter: () => show(id, side === 'l' ? -7 : 7),
          onfocus: () => show(id, side === 'l' ? -7 : 7),
          onpointerleave: () => show(null, 0),
          onclick: () => ctx.pick(id),
        },
        el('span', { class: 'w-cap' }),
        el('span', { class: 'up w-label', text: o.name }),
      ),
    );
  });
  root.append(face);
}

// ---------- Tower: a timing tower, one row per option, slid out like a pass ----------
function tower(root, ctx) {
  const list = el('div', { class: 'tower' });
  for (const id of ORDER) {
    const o = OPTIONS[id];
    list.append(
      ink(
        el(
          'button',
          { type: 'button', class: `t-row ${o.kind}`, onclick: () => ctx.pick(id) },
          el('span', { class: 't-flag' }),
          el('span', { class: 'up t-name', text: o.name }),
          price(o, 'price t-price'),
        ),
      ),
    );
  }
  root.append(list);
}

export const PORTALS = [
  { id: 'quadrants', name: 'Quadrants', idea: 'Four quarters round the helmet, like the hero', render: quadrants },
  { id: 'gate', name: 'Gate', idea: 'An H-pattern shifter: the knob runs the gate into an option', render: gate },
  { id: 'wheel', name: 'Wheel', idea: 'His steering wheel: the buttons are the options, the display shows the price', render: wheel },
  { id: 'tower', name: 'Tower', idea: 'A timing tower, one row per option', render: tower },
];
