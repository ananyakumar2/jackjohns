import { store, state, isInquiry, isActive, end, TODAY, SERVICES } from '../store.js';
import { esc, money, when, who, what, chip, actionsFor, avatar, icon, fmt, sameDay, addDays, startOfDay } from '../ui.js';

export const itemsOn = (day, { all = false } = {}) =>
  store.items.filter((b) => {
    if (!all && !isActive(b) && b.status !== 'unlocked') return false;
    const s = startOfDay(b.start);
    const e = addDays(s, b.days - 1);
    return day >= s && day <= e;
  });

export const setTag = (b) => {
  if (!b.group) return '';
  const set = store.items.filter((x) => x.group === b.group);
  const i = set.indexOf(b) + 1;
  return `<span class="set-tag" title="Booked together. Rules for sets come later.">${icon('set')}${i} of ${set.length}</span>`;
};

// A request or booking as a card with everything Jack needs to decide.
export function card(b, { selected = false, ui = '', note = true, compact = false } = {}) {
  const org = isInquiry(b);
  return `<article class="bcard ${selected ? 'sel' : ''} ${compact ? 'compact' : ''}" ${ui ? `data-ui="${ui}"` : ''}>
    <div class="row">
      ${avatar(org ? b.org : b.client, org ? 'org' : '')}
      <div style="min-width:0;flex:1">
        <div class="hi trunc">${esc(who(b))}</div>
        <div class="dim small trunc">${org ? `${esc(b.client)} · ` : ''}${esc(what(b))}</div>
      </div>
      ${chip(b)}
    </div>
    <div class="bcard-meta">
      <span>${icon('clock')}${when(b)}</span>
      <span>${icon('pin')}${esc(b.venue)}</span>
      <span class="${b.price == null ? 'dim' : 'hi'}">${money(b.price)}</span>
      ${setTag(b)}
    </div>
    ${note && b.note ? `<p class="bcard-note">${esc(b.note)}</p>` : ''}
    ${actionsFor(b, { compact: true })}
  </article>`;
}

export const cardCss = `
.bcard { grid-template-columns: minmax(0, 1fr); padding: 14px; border-radius: var(--r); background: var(--panel); border: 1px solid var(--line); display: grid; gap: 10px; cursor: default; }
.bcard[data-ui] { cursor: pointer; }
.bcard[data-ui]:hover { border-color: var(--line-2); }
.bcard.sel { border-color: var(--blue); box-shadow: 0 0 0 1px var(--blue) inset; }
.bcard-meta { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 11px; color: var(--dim); }
.bcard-meta > span { display: inline-flex; align-items: center; gap: 5px; }
.bcard-meta .ic { width: 13px; height: 13px; }
.bcard-note { margin: 0; font-size: 11.5px; color: var(--type); line-height: 1.55; padding-left: 10px; border-left: 2px solid var(--line-2); }
.bcard.compact { gap: 8px; padding: 12px; }
`;

export const style = (id, css) => {
  if (document.getElementById(id)) return '';
  const el = document.createElement('style');
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
  return '';
};

export const legend = () => `<div class="key">
  <span><i class="tentative"></i>Tentative</span>
  <span><i class="confirmed"></i>Confirmed</span>
  <span><i class="due"></i>Cash due</span>
  <span><i class="paid"></i>Paid</span>
</div>`;

export const isToday = (d) => sameDay(d, TODAY);
export { fmt, SERVICES, state, end, TODAY };
