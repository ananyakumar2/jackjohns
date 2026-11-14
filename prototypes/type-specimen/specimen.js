const root = document.documentElement;
const switches = [...document.querySelectorAll('.switcher button')];

function setType(type) {
  root.dataset.type = type;
  for (const b of switches) b.setAttribute('aria-pressed', String(b.dataset.type === type));
}

setType(root.dataset.type);
for (const b of switches) {
  b.addEventListener('click', () => {
    setType(b.dataset.type);
    history.replaceState(null, '', `#${b.dataset.type}`);
  });
}

const options = [...document.querySelectorAll('.option')];
const details = [...document.querySelectorAll('.detail')];
for (const o of options) {
  o.addEventListener('click', () => {
    for (const x of options) x.setAttribute('aria-checked', String(x === o));
    for (const d of details) d.hidden = d.dataset.for !== o.dataset.kind;
  });
}

for (const group of document.querySelectorAll('.chips')) {
  group.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip || chip.disabled) return;
    for (const c of group.children) c.classList.toggle('picked', c === chip);
  });
}
