import { OPTIONS } from './data.js';
import { backButton, el, field, ink } from './ui.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isAsk = (ctx) => OPTIONS[ctx.state.option].kind === 'ask';
const firstName = (d) => (d.name || '').trim().split(/\s+/)[0] || '';

// what the request is, in as few words as possible
function what(s) {
  if (s.option.kind === 'book') return [s.name, s.when, s.price && el('span', { class: 'price', text: s.price })];
  return [s.name, s.when || s.topic || null];
}

function line(s, cls = 'd-line') {
  return el('div', { class: cls }, ...what(s).filter(Boolean).map((x) => (x.nodeType ? x : el('span', { text: x }))));
}

const doneBtn = (ctx) => el('button', { type: 'button', class: 'd-done up', text: 'Close', onclick: () => ctx.close() });

// ---------- emails: same words everywhere, each in its mockup's look ----------
function mailFrame(s, d, subject, ...body) {
  return el(
    'div',
    { class: 'mail' },
    el(
      'div',
      { class: 'mail-head' },
      el('div', {}, el('b', { text: 'Jack Johns' })),
      el('div', { text: `To ${d.email || 'you@example.com'}` }),
      el('div', { class: 'mail-subj', text: subject }),
    ),
    el('div', { class: 'mail-body' }, ...body),
  );
}

const subjectFor = (s) => (s.option.kind === 'book' ? `Request received: ${s.name}, ${s.when}` : `Message received: ${s.name}`);
const statusLine = (s) => (s.option.kind === 'book' ? 'Not confirmed yet. Jack confirms or declines by email.' : 'Jack replies by email.');
const cashLine = (s) => (s.option.kind === 'book' ? el('p', { class: 'mail-small price-row', text: `${s.price}, cash on the day.` }) : null);

// ---------- Card: one summary card with two fields ----------
function card(root, ctx) {
  const s = ctx.summary();
  if (ctx.state.sent) {
    root.append(
      el(
        'div',
        { class: 'd-card sent' },
        el('div', { class: 'd-check' }),
        el('h2', { class: 'd-big up', text: 'Received' }),
        line(s),
        el('p', { class: 'd-status', text: isAsk(ctx) ? 'Jack replies by email' : 'Held for you · not confirmed yet' }),
        doneBtn(ctx),
      ),
    );
    return;
  }
  const form = el(
    'form',
    { class: 'd-card', novalidate: true },
    line(s),
    el('div', { class: 'd-fields' }, field({ name: 'name', label: 'Name' }), field({ name: 'email', label: 'Email', type: 'email', required: true })),
    el('button', { type: 'submit', class: 'cta', text: isAsk(ctx) ? 'Send' : 'Request' }),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    if (!EMAIL_RE.test(d.email)) return form.querySelector('[name=email]').closest('.field').classList.add('bad');
    ctx.send(d);
  });
  form.addEventListener('input', (e) => e.target.closest('.field')?.classList.remove('bad'));
  root.append(backButton(ctx), form);
}

function cardEmail(s, d) {
  return mailFrame(
    s,
    d,
    subjectFor(s),
    el('p', { text: firstName(d) ? `Hi ${firstName(d)},` : 'Hi,' }),
    el('p', { text: s.option.kind === 'book' ? 'Your request is in.' : 'Your message is in.' }),
    el('div', { class: 'mail-card' }, line(s, 'mail-line')),
    el('p', { text: statusLine(s) }),
    cashLine(s),
    el('p', { class: 'mail-sign', text: 'Jack' }),
  );
}

// ---------- Steps: one question at a time, email first; three LEDs fill as you go ----------
function steps(root, ctx) {
  const s = ctx.summary();
  const leds = el('div', { class: 'leds' }, el('i'), el('i'), el('i'));
  if (ctx.state.sent) {
    leds.classList.add('done');
    root.append(
      el(
        'div',
        { class: 'd-steps sent' },
        leds,
        el('h2', { class: 'd-big up', text: 'Received' }),
        el('p', { class: 'd-status', text: isAsk(ctx) ? 'Jack replies by email' : 'Not confirmed yet' }),
        line(s),
        doneBtn(ctx),
      ),
    );
    return;
  }
  const qs = [
    { name: 'email', q: 'Your email', type: 'email', required: true },
    { name: 'name', q: 'Your name' },
    { name: 'note', q: 'Anything Jack should know?' },
  ];
  const d = {};
  let i = 0;
  const stage = el('div', { class: 'd-q' });
  const wrap = el('form', { class: 'd-steps', novalidate: true }, line(s), leds, stage);
  const ask = () => {
    const q = qs[i];
    leds.querySelectorAll('i').forEach((l, j) => l.classList.toggle('on', j < i));
    const input = el('input', { name: q.name, type: q.type || 'text', placeholder: q.q, 'aria-label': q.q, autocomplete: q.name === 'email' ? 'email' : q.name === 'name' ? 'name' : 'off' });
    const next = el('button', { type: 'submit', class: 'd-next', 'aria-label': i === qs.length - 1 ? 'Send' : 'Next' });
    const skip = q.required ? null : el('button', { type: 'button', class: 'd-skip up', text: i === qs.length - 1 ? 'Send' : 'Skip', onclick: () => advance(true) });
    stage.replaceChildren(el('div', { class: 'd-qrow' }, input, next));
    if (skip) stage.append(skip);
    stage.animate([{ opacity: 0, transform: 'translateY(1.5cqi)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' });
    setTimeout(() => input.focus(), 60);
  };
  const advance = (skipped) => {
    const q = qs[i];
    const v = skipped ? '' : stage.querySelector('input').value.trim();
    if (q.required && !EMAIL_RE.test(v)) {
      stage.querySelector('.d-qrow').animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-1cqi)' }, { transform: 'translateX(1cqi)' }, { transform: 'translateX(0)' }], { duration: 260 });
      return;
    }
    d[q.name] = v;
    if (++i >= qs.length) return ctx.send(d);
    ask();
  };
  wrap.addEventListener('submit', (e) => {
    e.preventDefault();
    advance(false);
  });
  root.append(backButton(ctx), wrap);
  ask();
}

function stepsEmail(s, d) {
  return mailFrame(
    s,
    d,
    s.option.kind === 'book' ? `Got it: ${s.name}, ${s.when}` : `Got your message`,
    el('p', { text: firstName(d) ? `Hi ${firstName(d)},` : 'Hi,' }),
    el('p', {
      text:
        s.option.kind === 'book'
          ? `Thanks for asking for ${s.name.toLowerCase()} on ${s.when}. I've pencilled it in, but it isn't confirmed yet. I'll confirm or decline by email soon.`
          : `Thanks for getting in touch about ${s.name.toLowerCase()}. I'll reply by email soon.`,
    }),
    cashLine(s),
    el('div', { class: 'mail-leds' }, el('i'), el('i'), el('i')),
    el('p', { class: 'mail-sign', text: 'Jack' }),
  );
}

// ---------- Pass: a pit pass you fill in; sending flips it to the back ----------
function pass(root, ctx) {
  const s = ctx.summary();
  const front = el(
    'form',
    { class: 'p-face p-front', novalidate: true },
    el('div', { class: 'p-band up', text: 'Jack Johns' }),
    el('div', { class: 'p-what up', text: s.name }),
    s.when ? el('div', { class: 'p-when', text: s.when }) : null,
    s.price ? el('div', { class: 'p-price price', text: s.price }) : null,
    el('div', { class: 'p-fields' }, field({ name: 'name', label: 'Name' }), field({ name: 'email', label: 'Email', type: 'email', required: true })),
    el('button', { type: 'submit', class: 'cta', text: isAsk(ctx) ? 'Send' : 'Request' }),
  );
  const back = el(
    'div',
    { class: 'p-face p-back' },
    el('div', { class: 'p-band up', text: 'Jack Johns' }),
    el('div', { class: 'p-holo' }),
    el('h2', { class: 'd-big up', text: 'Received' }),
    el('p', { class: 'd-status', text: isAsk(ctx) ? 'Jack replies by email' : 'Held · not confirmed yet' }),
    el('div', { class: 'p-what up small', text: s.name }),
    s.when ? el('div', { class: 'p-when', text: s.when }) : null,
    doneBtn(ctx),
  );
  const card = el('div', { class: `p-card${ctx.state.sent ? ' flipped' : ''}` }, front, back);
  front.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(front));
    if (!EMAIL_RE.test(d.email)) return front.querySelector('[name=email]').closest('.field').classList.add('bad');
    card.classList.add('flipped');
    root.querySelector('.back')?.remove();
    setTimeout(() => ctx.send(d, { rerender: false }), 650);
  });
  front.addEventListener('input', (e) => e.target.closest('.field')?.classList.remove('bad'));
  if (!ctx.state.sent) root.append(backButton(ctx));
  root.append(el('div', { class: 'p-wrap' }, card));
}

function passEmail(s, d) {
  return mailFrame(
    s,
    d,
    subjectFor(s),
    el(
      'div',
      { class: 'mail-pass' },
      el('div', { class: 'p-band up', text: 'Jack Johns' }),
      el('div', { class: 'mail-pass-what up', text: s.name }),
      s.when ? el('div', { text: s.when }) : null,
      el('div', { class: 'mail-pass-status', text: s.option.kind === 'book' ? 'Held · not confirmed yet' : 'Received' }),
    ),
    el('p', { text: firstName(d) ? `Hi ${firstName(d)}, your request is in.` : 'Your request is in.' }),
    el('p', { text: statusLine(s) }),
    cashLine(s),
  );
}

// ---------- Slot: no form at all; the picked slot takes your email and turns gold ----------
function slot(root, ctx) {
  const s = ctx.summary();
  const pill = el('div', { class: `sl-pill${ctx.state.sent ? ' held' : ''}` }, line(s, 'd-line sl-line'));
  const input = el('input', { name: 'email', type: 'email', placeholder: 'Your email', 'aria-label': 'Email', autocomplete: 'email' });
  const go = ink(el('button', { type: 'submit', class: 'sl-go', 'aria-label': isAsk(ctx) ? 'Send' : 'Request' }));
  const form = el('form', { class: 'sl-form', novalidate: true }, input, go);
  const status = el('p', { class: 'd-status sl-status', text: isAsk(ctx) ? 'Jack replies by email' : 'Held for you · not confirmed yet' });
  const wrap = el('div', { class: `sl${ctx.state.sent ? ' sent' : ''}` }, pill, ctx.state.sent ? status : form, ctx.state.sent ? doneBtn(ctx) : null);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!EMAIL_RE.test(input.value.trim())) return form.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-1cqi)' }, { transform: 'translateX(1cqi)' }, { transform: 'translateX(0)' }], { duration: 260 });
    ctx.send({ email: input.value.trim() });
  });
  if (!ctx.state.sent) root.append(backButton(ctx));
  root.append(wrap);
  if (!ctx.state.sent) setTimeout(() => input.focus(), 400);
}

function slotEmail(s, d) {
  return mailFrame(
    s,
    d,
    s.option.kind === 'book' ? `Held: ${s.name}, ${s.when}` : `Received: ${s.name}`,
    el('div', { class: `mail-slot${s.option.kind === 'book' ? ' held' : ''}` }, line(s, 'mail-line')),
    el('p', { text: s.option.kind === 'book' ? 'Held for you. Not confirmed yet: Jack confirms or declines by email.' : 'Your message is in. Jack replies by email.' }),
    cashLine(s),
  );
}

export const DETAILS = [
  { id: 'card', name: 'Card', idea: 'One summary card, name and email, a drawn check when sent', render: card, email: cardEmail },
  { id: 'steps', name: 'Steps', idea: 'One question at a time, email first; three LEDs fill', render: steps, email: stepsEmail },
  { id: 'pass', name: 'Pass', idea: 'A pit pass you fill in; sending flips it to the back', render: pass, email: passEmail },
  { id: 'slot', name: 'Slot', idea: 'No form: the picked slot takes your email and turns gold', render: slot, email: slotEmail },
];
