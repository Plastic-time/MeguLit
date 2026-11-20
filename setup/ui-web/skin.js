/* Skin side of the real installer (host=2): runs inside the frameless WebView2 window of setup\setup-web.ps1.
   - guards: WebGL probe, script errors, a crawling frame rate. Any of them tells the host, which drops this window and shows the classic one.
   - bridge: /api/info, /api/state and /api/act are answered from messages the host posts (no server, no network). */
(function () {
  const q = new URLSearchParams(location.search); if (q.get('host') !== '2' || !(window.chrome && chrome.webview)) return;
  const T = q.get('t') || '', post = (o) => { try { chrome.webview.postMessage(o); } catch (e) { /* host gone */ } };
  let dead = false, isReady = false; const die = (why) => { if (dead) return; dead = true; post({ type: 'fatal', reason: String(why).slice(0, 300) }); };
  window.addEventListener('error', (e) => die('script error: ' + (e.message || e.filename || '?')));
  window.addEventListener('unhandledrejection', (e) => die('promise rejected: ' + (e.reason && e.reason.message || e.reason)));
  let gl = null; try { const c = document.createElement('canvas'); gl = c.getContext('webgl2') || c.getContext('webgl'); } catch (e) { /* none */ }
  if (!gl || T === 'nogl') { die('WebGL is not available'); return; }
  try { const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); } catch (e) { /* ignore */ }   /* the probe context is not needed any more: do not hold a GPU context while the scene creates its own */
  if (T === 'boom') { throw new Error('test: script error before the first frame'); }
  /* bridge */
  const pend = new Map(); let lastState = null, info = null, infoWait = [], nid = 0;
  chrome.webview.addEventListener('message', (e) => { const m = e.data || {};
    if (m.t === 'state') lastState = m.s; else if (m.t === 'info') { info = m.i; infoWait.forEach((f) => f(info)); infoWait = []; }
    else if (m.t === 'reply') { const f = pend.get(m.id); if (f) { pend.delete(m.id); f(m.r); } } });
  const nativeFetch = window.fetch.bind(window), resp = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
  window.fetch = (url, opt) => {
    const u = String(url); if (u.indexOf('/api/') !== 0) return nativeFetch(url, opt);
    if (u === '/api/info') return info ? Promise.resolve(resp(info)) : new Promise((ok) => { infoWait.push((i) => ok(resp(i))); post({ type: 'hello' }); });
    if (u === '/api/state') return Promise.resolve(resp(lastState || { phase: 'probe', n: 0, st: '', fr: [] }));
    let m = {}; try { m = JSON.parse(opt && opt.body || '{}'); } catch (e) { /* none */ }
    if (m.type === 'close' || m.type === 'minimize') return Promise.resolve(resp({ ok: true }));      /* the scene posts those itself */
    m.via = 'shim'; const wait = m.type === 'checkpath' || m.type === 'install' || m.type === 'browse';
    if (!wait) { post(m); return Promise.resolve(resp({ ok: true })); }
    m.id = ++nid; return new Promise((ok) => { pend.set(m.id, (r) => ok(resp(r || {}))); post(m); setTimeout(() => { if (pend.has(m.id)) { pend.delete(m.id); ok(resp({ state: 'ok' })); } }, 8000); });
  };
  window.__askClose = () => { post({ type: 'asked' }); const b = document.getElementById('btnClose'); if (b) b.click(); };
  /* first frame: the scene exists and two frames were drawn; then say ready (the host waits up to 10 s) */
  let frames = 0; const t0 = performance.now(), count = () => { frames++; if (!isReady && frames >= 2 && window.Scene && Scene.section && window.GL && GL.ok && T !== 'silent') { isReady = true; post({ type: 'ready' }); setTimeout(() => { const b = document.getElementById('boot'); if (b) { b.classList.add('gone'); setTimeout(() => b.remove(), 800); } }, 1800); if (T === 'lateboom') setTimeout(() => { throw new Error('test: script error after the first frame'); }, 3000); } requestAnimationFrame(count); };
  requestAnimationFrame(count);
  /* frame-rate guard: halve the render scale first, then give up on the skin */
  let slowChecks = 0, last = 0, lastT = performance.now(); setInterval(() => {
    if (!isReady) { last = frames; lastT = performance.now(); return; } const fps = (frames - last) / ((performance.now() - lastT) / 1000); last = frames; lastT = performance.now();
    if (T === 'slow') { die('test: frame rate too low'); return; }
    if (document.hidden) return; if (fps < 6) { if (++slowChecks >= 3) die('frame rate below 6 fps (' + fps.toFixed(1) + ')'); } else slowChecks = 0;
    if (fps < 20 && window.GL && GL.setScale && !window.__scaled) { window.__scaled = true; try { GL.setScale(0.5); } catch (e) { /* ignore */ } }
  }, 2000);
})();
