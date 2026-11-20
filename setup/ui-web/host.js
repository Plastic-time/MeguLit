/* Trial host adapter: connects the scene to the real downloader (tools/setup-trial/try-server.cjs). Loaded with ?host=1.
   Everything the scene shows comes from the engine's state: segment states and fractions, bytes, speed, source, phase.
   The camera moves are triggered by real events (user presses Install, the engine starts unpacking, the engine is done). */
(function () {
  const api = (type, extra) => fetch('/api/act', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ type }, extra || {})) }).then((r) => r.json()).catch(() => ({}));
  if (window.__waitConfirm) { const tag = document.createElement('div'); tag.id = 'trialTag'; tag.textContent = '试用版 · 装到测试目录，不碰正式安装'; document.querySelector('#ui-top .top').appendChild(tag); }
  const held = { speed: 0, t: -9, src: '', srcN: 0, ts: -9 };
  let info = null, state = null, N = 0, st = null, fr = null, doneAt = null, section = 'welcome', started = false, installed = false, lastPhase = '', checkTimer = null, firstState = false;
  const pathEl = document.getElementById('path');
  window.__waitConfirm = true;   /* the trial starts the download when Install is pressed, so the whole run can be watched */
  { const n = document.querySelector('#ui-loc .note'); if (n && window.__waitConfirm) n.textContent = Scene.tr('locNoteWait'); }
  const native = document.documentElement.classList.contains('native') && window.chrome && chrome.webview;
  const post = (type) => { try { chrome.webview.postMessage({ type }); } catch (e) { /* no host */ } };
  if (native) {
    const dr = document.getElementById('drag'); if (dr) dr.addEventListener('mousedown', (e) => { if (e.button === 0) post('drag'); });
    window.__askClose = () => document.getElementById('btnClose').click();
    window.addEventListener('install-failed', () => { const b = document.getElementById('install'); if (b) b.classList.remove('busy'); if (Scene.showInstallError) Scene.showInstallError(); });
    /* edge and corner hot zones (index.html .rz): the host starts the system size loop for the edge pressed */
    document.querySelectorAll('.rz').forEach((z) => z.addEventListener('mousedown', (e) => { if (e.button === 0) { try { chrome.webview.postMessage({ type: 'resize', edge: z.dataset.e }); } catch (x) { /* no host */ } e.preventDefault(); } }));
  }
  const clock = () => performance.now() / 1000;
  async function check(p) { const c = await api('checkpath', { path: p }); Scene.setFree(c.free || 0, c.need || (info && info.need) || 0, c.state === 'protected' ? 'protected' : c.state === 'readonly' ? 'readonly' : 'ok'); return c; }
  Scene.onAction = async (m) => {
    if (m.type === 'checkpath') { clearTimeout(checkTimer); checkTimer = setTimeout(() => check(m.path), 250); }
    else if (m.type === 'browse') { const r = await api('browse'); if (r.path) { pathEl.value = r.path; check(r.path); } }
    else if (m.type === 'install') { const c = await api('install', { path: pathEl.value, desktop: m.desktop, menu: m.menu }); const b = document.getElementById('install'); if (c.state && c.state !== 'ok') { if (b) b.classList.remove('busy'); Scene.setFree(c.free || 0, c.need || 0, c.state === 'protected' ? 'protected' : 'readonly'); return; } installed = true; goTo('field', 'under'); }   /* the host answers at once (the heavy copy runs after the reply); a later failure comes as install-failed */
    else if (m.type === 'retry') { api('retry'); }
    else if (m.type === 'copylog') api('copylog'); else if (m.type === 'manual') api('manual'); else if (m.type === 'launch') api('launch'); else if (m.type === 'minimize') { if (!native) api('minimize'); } else if (m.type === 'close') { api('close'); if (!native) setTimeout(() => window.close(), 400); }
  };
  function goTo(name, move) { if (section === name) return; Scene.goTo(name, move, section); section = name; }
  /* the engine's JSON becomes a scene snapshot */
  function snapshot() {
    let s = state; if (!s || !s.n) return null; if (!st || st.length !== s.n) { N = s.n; st = new Int8Array(N); fr = new Float32Array(N); doneAt = new Float32Array(N); }
    const t = clock(); for (let i = 0; i < N; i++) { const v = +s.st[i] || 0; if (v === 2 && st[i] !== 2) doneAt[i] = t; st[i] = v; fr[i] = (s.fr[i] || 0) / 100; }
    /* the engine reports 0 / no source for a moment while it re-ranks sources: hold the last real values for 2.5 s so the text does not flicker */
    const tn = clock(); if (s.speed > 0) { held.speed = s.speed; held.t = tn; } if (s.src) { held.src = s.src; held.srcN = s.srcN; held.ts = tn; }
    if (!(s.speed > 0) && s.phase === 'download' && tn - held.t < 2.5) s = Object.assign({}, s, { speed: held.speed });
    if (!s.src && s.phase === 'download' && tn - held.ts < 2.5) s = Object.assign({}, s, { src: held.src, srcN: held.srcN });
    const speed = s.speed || 0, total = s.total || 0, got = s.got || 0;
    let phase = s.phase === 'download' || s.phase === 'probe' ? (s.got > 0 || s.phase === 'download' ? 'download' : 'probe') : s.phase === 'downloaded' ? 'download' : s.phase === 'unpack' ? 'unpack' : s.phase === 'done' ? 'done' : 'probe';
    const out = { t: t, st, fr, doneAt, got, total, speed, eta: speed > 0 ? (total - got) / speed : 0, pack: s.pack || '', src: s.src || '', srcN: s.srcN || 0, dir: s.dir || '', phase, unpack: s.unpack || 0 };
    if (s.phase === 'failed') { out.err = { kind: s.kind || 'download' }; }
    return out;
  }
  async function poll() {
    try { const r = await fetch('/api/state', { cache: 'no-store' }); state = await r.json(); firstState = true; } catch (e) { /* server gone */ }
    setTimeout(poll, 150);
    if (!state) return; const p = state.phase;
    if (installed && (p === 'unpack') && section !== 'unpack' && section !== 'done') goTo('unpack', 'dive');
    if (p === 'done' && section !== 'done') { if (section === 'loc' || section === 'welcome') { installed = true; } goTo('done', 'pull'); }
    if (p === 'downloaded' && installed && section === 'field') { /* waiting for the engine to start unpacking */ }
  }
  function frame() { const s = snapshot(); if (s) Scene.render(s); setTimeout(() => requestAnimationFrame(frame), 33); }
  (async () => {
    info = await (await fetch('/api/info')).json(); pathEl.value = info.defaultTarget; Scene.setDrives(info.drives || []); await check(info.defaultTarget);
    poll(); requestAnimationFrame(frame);
    setTimeout(() => { if (section === 'welcome') goTo('loc', 'skim'); }, 2200);
  })();
})();
