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
  { const n = document.querySelector('#ui-loc .note'); if (n && (window.__waitConfirm || window.__noPrefetch)) n.textContent = Scene.tr('locNoteWait'); }
  const native = document.documentElement.classList.contains('native') && window.chrome && chrome.webview;
  const post = (type) => { try { chrome.webview.postMessage({ type }); } catch (e) { /* no host */ } };
  if (native) {
    const dr = document.getElementById('drag'); if (dr) dr.addEventListener('mousedown', (e) => { if (e.button === 0) post('drag'); });
    window.addEventListener('install-failed', () => { const b = document.getElementById('install'); if (b) b.classList.remove('busy'); if (Scene.showInstallError) Scene.showInstallError(); });
    /* edge and corner hot zones (index.html .rz): the host starts the system size loop for the edge pressed */
    /* zone widths in PHYSICAL pixels: the page is zoomed (devicePixelRatio = DPI scale x zoom), so 8 CSS px can be 4 device px or less */
    const fitZones = () => { const d = window.devicePixelRatio || 1, st = document.documentElement.style; st.setProperty('--rz', Math.max(6, 9 / d).toFixed(1) + 'px'); st.setProperty('--rzc', Math.max(12, 18 / d).toFixed(1) + 'px'); st.setProperty('--rzg', Math.max(16, 24 / d).toFixed(1) + 'px'); };
    fitZones(); window.addEventListener('resize', fitZones);
    const zones = document.querySelectorAll('.rz'); let zinfoDone = false;
    zones.forEach((z) => z.addEventListener('mousedown', (e) => { if (e.button === 0) { try { chrome.webview.postMessage({ type: 'resize', edge: z.dataset.e, zoom: +(window.devicePixelRatio || 1).toFixed(3), dpr: window.devicePixelRatio }); } catch (x) { /* no host */ } e.preventDefault(); } }));
    /* one diagnostic line for setup-ui.log: are the zones there, and what sits on top at the window edge */
    const zinfo = () => { if (zinfoDone) return; zinfoDone = true; const el = document.elementFromPoint(2, innerHeight / 2); try { chrome.webview.postMessage({ type: 'rz-info', zones: zones.length, native: true, w: innerWidth, h: innerHeight, dpr: window.devicePixelRatio, px: getComputedStyle(document.documentElement).getPropertyValue('--rz'), top: el ? (el.className || el.id || el.tagName) : 'none' }); } catch (x) { /* no host */ } };
    setTimeout(zinfo, 2500);
  }
  const clock = () => performance.now() / 1000;
  async function check(p) { const c = await api('checkpath', { path: p }); Scene.setFree(c.free || 0, c.need || (info && info.need) || 0, c.state === 'protected' ? 'protected' : c.state === 'readonly' ? 'readonly' : 'ok'); return c; }
  /* in-page folder picker (the native window only): disks with free space, usual places, recent choices, one level of folders, new folder, and the modern Explorer dialog as a side door */
  const params = new URLSearchParams(location.search), statusOnly = params.get('boot') === 'progress';
  const EN = params.get('lang') === 'en', L = (zh, en) => (EN ? en : zh);
  const pk = document.getElementById('picker'), pkSide = document.getElementById('pkSide'), pkMain = document.getElementById('pkMain'), pkCrumb = document.getElementById('pkCrumb'), pkMsg = document.getElementById('pkMsg'), pkNew = document.getElementById('pkNew');
  let pkCur = '';
  const gb = (b) => (b / 1073741824 >= 100 ? Math.round(b / 1073741824) : (b / 1073741824).toFixed(1)) + ' GB';
  const pkBtn = (cls, label, sub, fn) => { const b = document.createElement('button'); if (cls) b.className = cls; b.textContent = label; if (sub) { const s = document.createElement('small'); s.textContent = sub; b.appendChild(s); } b.addEventListener('click', fn); return b; };
  const pkHead = (t) => { const h = document.createElement('h4'); h.textContent = t; return h; };
  const pkJoin = (a, b) => a.replace(/[\\/]+$/, '') + '\\' + b;
  async function pkGo(p) {
    pkMsg.textContent = ''; const r = await api('listdir', { path: p || '' }); pkCur = r.path || '';
    pkCrumb.textContent = pkCur || L('这台电脑', 'This PC'); pkSide.textContent = ''; pkMain.textContent = '';
    pkSide.appendChild(pkHead(L('磁盘', 'Drives'))); (r.drives || []).forEach((d) => pkSide.appendChild(pkBtn('', d.path + (d.label ? '  ' + d.label : ''), L('剩余 ', 'Free ') + gb(d.free), () => pkGo(d.path))));
    pkSide.appendChild(pkHead(L('常用位置', 'Places'))); (r.places || []).forEach((d) => pkSide.appendChild(pkBtn('', d.name.split('|')[EN ? 1 : 0], '', () => pkGo(d.path))));
    if ((r.recent || []).length) { pkSide.appendChild(pkHead(L('最近用过', 'Recent'))); r.recent.forEach((d) => pkSide.appendChild(pkBtn('', d.split('\\').slice(-2).join('\\'), d, () => pkGo(d)))); }
    if (r.parent) pkMain.appendChild(pkBtn('row up', L('上一级', 'Up'), '', () => pkGo(r.parent)));
    if (!pkCur) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = L('选一个磁盘或常用位置开始', 'Pick a drive or a place to start'); pkMain.appendChild(e); }
    else if (!(r.dirs || []).length) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = L('这里还没有文件夹', 'No folders here yet'); pkMain.appendChild(e); }
    (r.dirs || []).forEach((n) => pkMain.appendChild(pkBtn('row', n, '', () => pkGo(pkJoin(pkCur, n)))));
    document.getElementById('pkOk').disabled = !pkCur;
  }
  function pkChoose(p) { if (!p) return; const leaf = p.split('\\').filter(Boolean).pop() || ''; if (leaf.toLowerCase() !== 'megulit') p = pkJoin(p, 'MeguLit'); pathEl.value = p; pathEl.dispatchEvent(new Event('input', { bubbles: true })); check(p); pkClose(); }
  function pkClose() { pk.classList.remove('on'); }
  function openPicker() {
    document.getElementById('pkT').textContent = L('选择安装位置', 'Choose where to install'); document.getElementById('pkMk').textContent = L('新建文件夹', 'New folder'); pkNew.placeholder = L('文件夹名', 'Folder name');
    document.getElementById('pkMore').textContent = L('资源管理器…', 'Explorer…'); document.getElementById('pkCancel').textContent = L('取消', 'Cancel'); document.getElementById('pkOk').textContent = L('选这里', 'Use this folder');
    pk.classList.add('on'); const cur = (pathEl.value || '').replace(/[\\/]+$/, ''); pkGo(cur.slice(0, cur.lastIndexOf('\\')) || cur);
  }
  if (pk) {
    document.getElementById('pkClose').addEventListener('click', pkClose); document.getElementById('pkCancel').addEventListener('click', pkClose); document.getElementById('pkOk').addEventListener('click', () => pkChoose(pkCur));
    document.getElementById('pkMk').addEventListener('click', async () => { const n = pkNew.value.trim(); if (!pkCur || !n) { pkMsg.textContent = L('先进入一个位置并起个名字', 'Open a place and name the folder'); return; } const r = await api('mkdir', { path: pkCur, name: n }); if (r.ok) { pkNew.value = ''; pkGo(pkJoin(pkCur, n)); } else pkMsg.textContent = L('建不了这个文件夹', 'Could not create that folder'); });
    document.getElementById('pkMore').addEventListener('click', async () => { const r = await api('pickfolder', { path: pkCur || pathEl.value }); if (r.path) pkChoose(r.path); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pk.classList.contains('on')) { pkClose(); e.stopPropagation(); } }, true);
    pk.addEventListener('mousedown', (e) => { if (e.target === pk) pkClose(); });
  }
  Scene.onAction = async (m) => {
    if (m.type === 'checkpath') { clearTimeout(checkTimer); checkTimer = setTimeout(() => check(m.path), 250); }
    else if (m.type === 'browse') { if (native) openPicker(); else { const r = await api('browse'); if (r.path) { pathEl.value = r.path; check(r.path); } } }
    else if (m.type === 'install') { const c = await api('install', { path: pathEl.value, desktop: m.desktop, menu: m.menu }); const b = document.getElementById('install'); if (c.state && c.state !== 'ok') { if (b) b.classList.remove('busy'); Scene.setFree(c.free || 0, c.need || 0, c.state === 'protected' ? 'protected' : 'readonly'); return; } installed = true; goTo('field', 'under'); }   /* the host answers at once (the heavy copy runs after the reply); a later failure comes as install-failed */
    else if (m.type === 'retry') { api('retry'); }
    else if (m.type === 'copylog') api('copylog'); else if (m.type === 'manual') api('manual'); else if (m.type === 'launch') api('launch'); else if (m.type === 'minimize') { if (!native) api('minimize'); } else if (m.type === 'close') { api('close'); if (!native) setTimeout(() => window.close(), 400); }
  };
  function goTo(name, move) { if (section === name) return; Scene.goTo(name, move, section); section = name; }
  /* the engine's JSON becomes a scene snapshot */
  function snapshot() {
    let s = state; if (!s || (!statusOnly && !s.n && s.phase !== 'vc-runtime' && s.kind !== 'vc-runtime')) return null; if (!st || st.length !== s.n) { N = s.n; st = new Int8Array(N); fr = new Float32Array(N); doneAt = new Float32Array(N); }
    const t = clock(); for (let i = 0; i < N; i++) { const v = +s.st[i] || 0; if (v === 2 && st[i] !== 2) doneAt[i] = t; st[i] = v; fr[i] = (s.fr[i] || 0) / 100; }
    /* the engine reports 0 / no source for a moment while it re-ranks sources: hold the last real values for 2.5 s so the text does not flicker */
    const tn = clock(); if (s.speed > 0) { held.speed = s.speed; held.t = tn; } if (s.src) { held.src = s.src; held.srcN = s.srcN; held.ts = tn; }
    if (!(s.speed > 0) && s.phase === 'download' && tn - held.t < 2.5) s = Object.assign({}, s, { speed: held.speed });
    if (!s.src && s.phase === 'download' && tn - held.ts < 2.5) s = Object.assign({}, s, { src: held.src, srcN: held.srcN });
    const speed = s.speed || 0, total = s.total || 0, got = s.got || 0;
    let phase = s.phase === 'download' || s.phase === 'probe' ? (s.phase === 'download' || (!statusOnly && s.got > 0) ? 'download' : 'probe') : s.phase === 'downloaded' ? (statusOnly ? 'prepare' : 'download') : s.phase === 'verify' ? 'verify' : s.phase === 'unpack' ? 'unpack' : s.phase === 'done' ? 'done' : s.phase === 'idle' ? 'idle' : 'probe';
    const out = { t: t, st, fr, doneAt, got, total, speed, eta: speed > 0 ? (total - got) / speed : 0, pack: s.pack || '', src: s.src || '', srcN: s.srcN || 0, dir: s.dir || '', phase, unpack: s.unpack || 0 };
    if (s.phase === 'vc-runtime') out.phase = s.phase;
    if (s.phase === 'failed') { out.err = { kind: s.kind || 'download', message: s.message }; }
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
    if (statusOnly) {
      // The media bridge releases the loading layer only after a decoded frame.
      window.__installLocationChecked = true;
      goTo('loc', 'skim');
    } else setTimeout(() => { if (section === 'welcome') goTo('loc', 'skim'); }, 2200);
  })();
})();
