import { OPTIONS, ORDER, priceLine } from './data.js';

export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
}

// Blue ink spreads from where the pointer came in (the lens slots on the main page do the same).
export function ink(node) {
  node.addEventListener('pointerenter', (e) => {
    const r = node.getBoundingClientRect();
    node.style.setProperty('--ix', `${e.clientX - r.left}px`);
    node.style.setProperty('--iy', `${e.clientY - r.top}px`);
  });
  return node;
}

export const price = (o, cls = 'price') => (o.kind === 'book' ? el('span', { class: cls, text: priceLine(o) }) : el('span', { class: `${cls} ask`, text: 'Inquire' }));

// The four options as a slim switch along the top of the lens, so a client can
// change their mind without going back.
export function optionBar(ctx) {
  return el(
    'div',
    { class: 'optbar', role: 'tablist' },
    ORDER.map((id) =>
      el('button', {
        type: 'button',
        role: 'tab',
        class: id === ctx.state.option ? 'on' : '',
        'aria-selected': String(id === ctx.state.option),
        text: OPTIONS[id].name,
        onclick: () => ctx.pick(id),
      }),
    ),
  );
}

export const backButton = (ctx) => el('button', { type: 'button', class: 'back', 'aria-label': 'Back', onclick: () => ctx.back() });

export const field = ({ name, label, type = 'text', required = false, value = '', area = false, placeholder }) =>
  el(
    'label',
    { class: `field${area ? ' area' : ''}` },
    el('span', { text: label }),
    area
      ? el('textarea', { name, rows: 3, placeholder })
      : el('input', { name, type, required, value, placeholder, autocomplete: type === 'email' ? 'email' : name === 'name' ? 'name' : 'off' }),
  );

export const legend = () =>
  el(
    'div',
    { class: 'legend' },
    el('span', { class: 'free' }, 'Free'),
    el('span', { class: 'held' }, 'Held'),
    el('span', { class: 'booked' }, 'Booked'),
  );
