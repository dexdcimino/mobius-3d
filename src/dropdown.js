// A drawn dropdown over a hidden native <select>. The native list is painted
// by the operating system -- a bright system blue on Windows -- and no CSS
// reaches it. The <select> stays the source of truth: everything else reads
// select.value and listens for 'change', so it keeps working unchanged, and
// anything that sets the value by hand calls sync() (or dispatches 'change').
export function dropdown(select) {
  const wrap = document.createElement('div');
  wrap.className = 'dd';
  select.before(wrap); wrap.appendChild(select);
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'dd-button';
  button.setAttribute('aria-haspopup', 'listbox'); button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-label', select.getAttribute('aria-label') || '');
  button.id = `${select.id}-button`;
  const label = document.createElement('span');
  button.appendChild(label);
  const list = document.createElement('ul');
  list.className = 'dd-list'; list.setAttribute('role', 'listbox'); list.hidden = true;
  list.id = `${select.id}-list`;
  button.setAttribute('aria-controls', list.id);
  wrap.append(button);
  document.body.appendChild(list);   // fixed, so the panel's scroll box cannot clip it
  let active = -1, items = [];
  // Again whenever the options change -- the animation and blend shape lists
  // are a different set for every model.
  function rebuild() {
    items = [...select.options].map((option, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option'); li.dataset.value = option.value; li.textContent = option.textContent;
      li.onpointermove = () => highlight(i);
      li.onclick = () => choose(i);
      return li;
    });
    list.replaceChildren(...items);
    sync();
  }
  function highlight(i) { active = i; items.forEach((li, j) => li.classList.toggle('active', j === i)); items[i]?.scrollIntoView({ block: 'nearest' }); }
  function sync() {
    label.textContent = select.selectedOptions[0]?.textContent || '';
    items.forEach(li => li.setAttribute('aria-selected', String(li.dataset.value === select.value)));
  }
  function place() {
    const r = button.getBoundingClientRect();
    list.style.left = `${r.left}px`; list.style.width = `${r.width}px`;
    list.style.top = `${r.bottom + 6}px`; list.style.bottom = 'auto';
    const h = list.offsetHeight;
    if (r.bottom + 6 + h > innerHeight - 8 && r.top - 6 - h > 8) list.style.top = `${r.top - 6 - h}px`;
  }
  function open() {
    if (!list.hidden) return;
    list.hidden = false; button.setAttribute('aria-expanded', 'true');
    place(); highlight(select.selectedIndex);
  }
  function close(focus = false) {
    if (list.hidden) return;
    list.hidden = true; button.setAttribute('aria-expanded', 'false');
    if (focus) button.focus();
  }
  function choose(i) {
    const changed = select.selectedIndex !== i;
    select.selectedIndex = i; sync(); close(true);
    if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  button.onclick = () => list.hidden ? open() : close();
  button.addEventListener('keydown', e => {
    const n = items.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.hidden) { open(); return; }
      highlight((active + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
    } else if ((e.key === 'Enter' || e.key === ' ') && !list.hidden) {
      e.preventDefault(); choose(active);
    } else if (e.key === 'Escape' && !list.hidden) {
      // Claimed, so the website overlay behind does not close as well.
      e.preventDefault(); e.stopPropagation(); close(true);
    } else if (e.key === 'Tab') close();
  });
  document.addEventListener('pointerdown', e => { if (!list.contains(e.target) && !button.contains(e.target)) close(); }, true);
  addEventListener('resize', () => close());
  document.addEventListener('scroll', e => { if (e.target !== list) close(); }, true);
  select.addEventListener('change', sync);
  rebuild();
  return { sync, rebuild, close, button, list };
}
