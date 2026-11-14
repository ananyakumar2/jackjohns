import { store, actions, pending, dueList, unread, value, TODAY } from './store.js';
import { icon, aed } from './ui.js';
import reqA from './views/req-a.js';
import reqB from './views/req-b.js';
import reqC from './views/req-c.js';
import reqD from './views/req-d.js';
import revA from './views/rev-a.js';
import revB from './views/rev-b.js';
import revC from './views/rev-c.js';
import revD from './views/rev-d.js';
import msgA from './views/msg-a.js';
import msgB from './views/msg-b.js';
import msgC from './views/msg-c.js';
import msgD from './views/msg-d.js';

const TABS = {
  requests: { name: 'Requests', icon: 'cal', views: { a: reqA, b: reqB, c: reqC, d: reqD } },
  revenue: { name: 'Revenue', icon: 'chart', views: { a: revA, b: revB, c: revC, d: revD } },
  messages: { name: 'Messages', icon: 'chat', views: { a: msgA, b: msgB, c: msgC, d: msgD } },
};
const OPTS = ['a', 'b', 'c', 'd'];

const embed = new URLSearchParams(location.search).has('embed');
if (embed) document.body.classList.add('embed');

const app = document.getElementById('app');
const uiState = {};
const lastOpt = { requests: 'a', revenue: 'a', messages: 'a' };
let route = parse();

function parse() {
  const [t, o] = location.hash.replace(/^#\/?/, '').split('/');
  const tab = TABS[t] ? t : 'requests';
  const opt = OPTS.includes(o) ? o : lastOpt[tab];
  lastOpt[tab] = opt;
  return { tab, opt };
}

function go(tab, opt = lastOpt[tab]) {
  location.hash = `#/${tab}/${opt}`;
}

function ui() {
  const k = `${route.tab}-${route.opt}`;
  const view = TABS[route.tab].views[route.opt];
  if (!uiState[k]) uiState[k] = { ...(view.init ? view.init() : {}) };
  return uiState[k];
}

function glance(tab) {
  if (tab === 'requests') {
    const n = pending().length;
    return n ? `<span class="nav-glance blue">${n} to confirm</span>` : '<span class="nav-glance">All clear</span>';
  }
  if (tab === 'revenue') {
    const due = dueList().reduce((s, b) => s + value(b), 0);
    return due ? `<span class="nav-glance gold">${aed(due, { short: true })} due</span>` : '<span class="nav-glance">Settled</span>';
  }
  const n = unread().length;
  return n ? `<span class="nav-glance blue">${n} unread</span>` : '<span class="nav-glance">Replied</span>';
}

function rail() {
  return `<nav class="rail" aria-label="Back office">
    <div class="mark" title="Jack Johns">JJ</div>
    ${Object.entries(TABS).map(([k, t]) => `
      <a class="nav-btn ${route.tab === k ? 'on' : ''}" href="#/${k}/${lastOpt[k]}" ${route.tab === k ? 'aria-current="page"' : ''}>
        ${icon(t.icon)}<span>${t.name}</span>${glance(k)}
      </a>`).join('')}
    <div class="rail-slot" aria-hidden="true" title="Room for more tabs"></div>
    <div class="rail-gap"></div>
  </nav>`;
}

function switcher() {
  const view = TABS[route.tab].views[route.opt];
  return `<div class="rv" role="toolbar" aria-label="Mockup switcher">
      ${Object.entries(TABS).map(([k, t]) => `<button class="${route.tab === k ? 'on' : ''}" data-tab="${k}">${t.name}</button>`).join('')}
      <span class="div"></span>
      ${OPTS.map((o) => `<button class="${route.opt === o ? 'on' : ''}" data-opt="${o}" aria-label="Option ${o.toUpperCase()}">${o.toUpperCase()}</button>`).join('')}
      <span class="div"></span>
      <button data-phone title="Preview on a phone" aria-label="Preview on a phone">${icon('phone')}</button>
    </div>
    <div class="rv-idea"><b>${TABS[route.tab].name} ${route.opt.toUpperCase()} · ${view.name}.</b> ${view.idea}</div>`;
}

function render() {
  const keep = {};
  app.querySelectorAll('[data-keep]').forEach((el) => (keep[el.dataset.keep] = [el.scrollTop, el.scrollLeft]));
  const view = TABS[route.tab].views[route.opt];
  app.innerHTML = `<div class="shell">${rail()}<main class="main" data-keep="main-${route.tab}-${route.opt}">${view.render(ui())}</main></div>${switcher()}`;
  app.querySelectorAll('[data-keep]').forEach((el) => {
    const k = keep[el.dataset.keep];
    if (k) [el.scrollTop, el.scrollLeft] = k;
    else if (el.dataset.scrollTo) el.scrollTop = +el.dataset.scrollTo;
  });
  if (view.after) view.after(app, ui());
}

function setUi(spec) {
  const s = ui();
  for (const part of spec.split(';')) {
    const i = part.indexOf(':');
    const key = part.slice(0, i);
    let v = part.slice(i + 1);
    if (v === '!') v = !s[key];
    else if (/^[+-]=/.test(v)) v = (s[key] || 0) + Number(v.slice(0, 1) + v.slice(2));
    else if (v === 'null') v = null;
    else if (v === 'true' || v === 'false') v = v === 'true';
    else if (v !== '' && !isNaN(v)) v = Number(v);
    s[key] = v;
  }
}

app.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab],[data-opt],[data-phone],[data-act],[data-ui]');
  if (!t) return;
  if (t.dataset.tab) return go(t.dataset.tab);
  if (t.dataset.opt) return go(route.tab, t.dataset.opt);
  if (t.hasAttribute('data-phone')) return phone();
  if (t.dataset.ui) {
    setUi(t.dataset.ui);
    if (t.dataset.read) actions.read(t.dataset.read);
    render();
  }
  if (t.dataset.act) {
    e.stopPropagation();
    const [act, id] = t.dataset.act.split(':');
    if (act === 'quote') {
      const v = prompt('Quote in AED', '8000');
      const n = Number(String(v || '').replace(/[^\d]/g, ''));
      if (n) actions.quote(id, n);
      return;
    }
    actions[act](id);
  }
});

app.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-send]');
  if (!f) return;
  e.preventDefault();
  const ta = f.querySelector('textarea');
  actions.send(f.dataset.send, ta.value);
});

app.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && e.target.matches('form[data-send] textarea')) {
    e.target.form.requestSubmit();
  }
});

// Templates and chips that drop text into the reply box.
app.addEventListener('click', (e) => {
  const t = e.target.closest('[data-fill]');
  if (!t) return;
  const ta = app.querySelector('form[data-send] textarea');
  if (ta) { ta.value = t.dataset.fill; ta.focus(); }
});

function phone() {
  const wrap = document.createElement('div');
  wrap.className = 'phone-wrap';
  wrap.innerHTML = `<div class="phone"><iframe title="Phone preview" src="${location.pathname}?embed${location.hash}"></iframe></div>
    <button class="btn btn-icon phone-close" aria-label="Close phone preview">${icon('close')}</button>`;
  const close = () => { wrap.remove(); removeEventListener('keydown', onKey); };
  const onKey = (e) => e.key === 'Escape' && close();
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('.phone-close')) close(); });
  addEventListener('keydown', onKey);
  document.body.appendChild(wrap);
}

addEventListener('hashchange', () => { route = parse(); render(); });
store.subscribe(render);
render();

export { TODAY };
