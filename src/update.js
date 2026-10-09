// The desktop app's "Update?" prompt, bottom left (Dex, 2026-10-09): an info
// icon whose tip lists what changed, the question, Yes and No. It appears only
// when the desktop says a newer release exists -- never on the website, which
// has no bridge -- and No hides it until a NEWER version than the one refused.
// desktop/main.cjs does the finding, downloading and installing.
const SKIP = 'mobius.update.skip';
const read = () => { try { return localStorage.getItem(SKIP); } catch { return null; } };
const write = v => { try { localStorage.setItem(SKIP, v); } catch { /* storage refused: it asks again next time */ } };

export function initUpdate(bridge) {
  const box = document.getElementById('update');
  if (!box || !bridge?.onUpdate) return;
  const text = document.getElementById('update-text');
  const yes = document.getElementById('update-yes');
  const no = document.getElementById('update-no');
  const notes = document.getElementById('update-notes');
  let offered = null;
  const show = on => { box.hidden = !on; document.body.classList.toggle('has-update', on); };
  const ask = (label, yesLabel) => {
    text.textContent = label; yes.textContent = yesLabel; yes.hidden = no.hidden = false; yes.disabled = false;
  };
  bridge.onUpdate(payload => {
    if (payload.state === 'available') {
      if (read() === payload.version) return;
      offered = payload;
      notes.replaceChildren();
      const head = document.createElement('strong');
      head.textContent = `Version ${payload.version}`;
      notes.append(head);
      const lines = payload.notes?.length ? payload.notes : ['Fixes and improvements.'];
      const list = document.createElement('ul');
      for (const line of lines) { const li = document.createElement('li'); li.textContent = line; list.append(li); }
      notes.append(list);
      ask('Update?', 'Yes');
      yes.dataset.act = 'update';
      show(true);
    } else if (payload.state === 'downloading') {
      text.textContent = `Updating… ${payload.percent || 0}%`;
      yes.hidden = no.hidden = true;
    } else if (payload.state === 'installing') {
      text.textContent = 'Restarting…';
    } else if (payload.state === 'failed') {
      ask('Update from the website?', 'Open');
      yes.dataset.act = 'page';
    }
  });
  yes.addEventListener('click', () => {
    if (yes.dataset.act === 'page') { bridge.updatePage?.(); show(false); return; }
    yes.disabled = true;
    bridge.update?.();
  });
  no.addEventListener('click', () => { if (offered) write(offered.version); show(false); });
}
