/* Skin side of the real installer (host=2): runs inside the frameless WebView2 window of setup\setup-web.ps1.
   - guards: no video picture in time (player.js), script errors, a crawling frame rate. Any of them tells the host, which drops this window and shows the classic one.
   - bridge: /api/info, /api/state and /api/act are answered from messages the host posts (no server, no network). */
(function () {
  const q = new URLSearchParams(location.search); if (q.get('host') !== '2' || !(window.chrome && chrome.webview)) return;
  const statusOnly = q.get('boot') === 'progress', T = q.get('t') || '', post = (o) => { try { chrome.webview.postMessage(o); } catch (e) { /* host gone */ } };
  /* attempts: every page load is one attempt; a failed one reloads after a pause until the time limit (the profile is cold only for the first seconds) */
  let S = null; try { S = JSON.parse(sessionStorage.getItem('skinTry') || 'null'); } catch (e) { /* none */ } if (!S) S = { n: 0, t0: Date.now() }; S.n++; try { sessionStorage.setItem('skinTry', JSON.stringify(S)); } catch (e) { /* none */ }
  const LIMIT_MS = 26000, since = () => Date.now() - S.t0;
  window.__skin = { n: S.n, fail(reason) { retrying = true; post({ type: 'gl-attempt', attempt: S.n, result: 'fail', reason: String(reason).slice(0, 120), ms: since() }); if (since() < LIMIT_MS) setTimeout(() => location.reload(), 450); else die('scene did not start within ' + LIMIT_MS + ' ms: ' + reason, true); } };
  let dead = false, isReady = false, retrying = false; const die = (why, force) => { if (dead || (retrying && !force)) return; dead = true; post({ type: 'fatal', reason: String(why).slice(0, 300) }); };
  window.addEventListener('error', (e) => die('script error: ' + (e.message || e.filename || '?')));
  window.addEventListener('unhandledrejection', (e) => die('promise rejected: ' + (e.reason && e.reason.message || e.reason)));
  window.__glErrs = 0; const ce = console.error.bind(console); console.error = function () { try { if (/WebGL|OES_|context/i.test(Array.prototype.join.call(arguments, ' '))) window.__glErrs++; } catch (e) { /* ignore */ } return ce.apply(console, arguments); };
  /* No WebGL any more: the scene is pre-rendered video (player.js), decoded by the system's video engine. nogl stays as the test switch for "no picture". */
  if (T === 'nogl') { die('no picture (test)'); return; }
  if (T === 'boom') { throw new Error('test: script error before the first frame'); }
  /* bridge */
  const pend = new Map(); let lastState = null, info = null, infoWait = [], nid = 0;
  chrome.webview.addEventListener('message', (e) => { const m = e.data || {};
    if (m.t === 'state') lastState = m.s; else if (m.t === 'info') { info = m.i; infoWait.forEach((f) => f(info)); infoWait = []; }
    else if (m.t === 'installfail') { try { window.dispatchEvent(new CustomEvent('install-failed')); } catch (e) { /* old engine */ } }
    else if (m.t === 'reply') { const f = pend.get(m.id); if (f) { pend.delete(m.id); f(m.r); } } });
  const nativeFetch = window.fetch.bind(window), resp = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
  window.fetch = (url, opt) => {
    const u = String(url); if (u.indexOf('/api/') !== 0) return nativeFetch(url, opt);
    if (u === '/api/info') return info ? Promise.resolve(resp(info)) : new Promise((ok) => { infoWait.push((i) => ok(resp(i))); post({ type: 'hello' }); });
    if (u === '/api/state') return Promise.resolve(resp(lastState || { phase: statusOnly ? 'idle' : 'probe', n: 0, st: '', fr: [] }));
    let m = {}; try { m = JSON.parse(opt && opt.body || '{}'); } catch (e) { /* none */ }
    if (m.type === 'close' || m.type === 'minimize') return Promise.resolve(resp({ ok: true }));      /* the scene posts those itself */
    m.via = 'shim'; const wait = m.type === 'checkpath' || m.type === 'install' || m.type === 'browse' || m.type === 'listdir' || m.type === 'mkdir' || m.type === 'pickfolder';
    if (!wait) { post(m); return Promise.resolve(resp({ ok: true })); }
    m.id = ++nid; return new Promise((ok) => { pend.set(m.id, (r) => ok(resp(r || {}))); post(m); setTimeout(() => { if (pend.has(m.id)) { pend.delete(m.id); ok(resp({ state: statusOnly ? 'readonly' : 'ok' })); } }, 8000); });
  };
  /* verdict for the host (written to setup-ui.log as one line): pixels of the drawn canvas, renderer string, GL errors seen */
  const verdict = () => { if (window.Player && Player.verdict) return Player.verdict(); const o = { std: -1, renderer: '?', errs: window.__glErrs | 0 };
    try { const g = document.getElementById('gl'); if (g) { const x = g.getContext('webgl2') || g.getContext('webgl'); const ex = x && x.getExtension('WEBGL_debug_renderer_info'); if (ex) o.renderer = String(x.getParameter(ex.UNMASKED_RENDERER_WEBGL)).slice(0, 80); const c = document.createElement('canvas'); c.width = 48; c.height = 30; const c2 = c.getContext('2d'); c2.drawImage(g, 0, 0, 48, 30); const d = c2.getImageData(0, 0, 48, 30).data; let m = 0, n = d.length / 4; for (let i = 0; i < d.length; i += 4) m += d[i] + d[i + 1] + d[i + 2]; m /= n * 3; let v = 0; for (let i = 0; i < d.length; i += 4) { const a = (d[i] + d[i + 1] + d[i + 2]) / 3 - m; v += a * a; } o.std = +Math.sqrt(v / n).toFixed(2); } } catch (e) { o.err = String(e).slice(0, 60); }
    o.hw = !/swiftshader|software|llvmpipe|basic render/i.test(o.renderer); o.result = o.std >= 0 && o.std < 4 ? 'blank' : (!o.hw ? 'degraded' : 'ok'); return o; };
  window.__askClose = () => { post({ type: 'asked' }); const b = document.getElementById('btnClose'); if (b) b.click(); };
  /* first frame: the scene exists and two frames were drawn; then say ready (the host waits up to 10 s) */
  let frames = 0; const t0 = performance.now(), count = () => { frames++; if (frames === 1 && !window.__frame1) window.__frame1 = Math.round(performance.now()); if (!isReady && frames >= 2 && window.Scene && Scene.section && window.GL && GL.ok && (!statusOnly || (window.__installLocationChecked && Player.state.firstFrame)) && T !== 'silent') { isReady = true; const tStart = performance.now(); let settled = false; const poll = () => { if (settled || dead) return; const v = verdict(); v.type = 'gl-report'; v.attempt = S.n; v.pageMs = Math.round(performance.now()); v.sinceStart = since(); v.created = window.__glT ? window.__glT.created : -1; v.frame1 = window.__frame1 || -1; v.settleMs = Math.round(performance.now() - tStart);
        /* the scene is not drawn in the first frames (the canvas is only the background colour until the city exists): look again every 300 ms for up to 7 s before calling it blank */
        if (v.result === 'ok' || T === 'noverify') { settled = true; post({ type: 'ready' }); post(v); const b = document.getElementById('boot'); if (b) { b.classList.add('gone'); setTimeout(() => b.remove(), 800); } if (T === 'lateboom') setTimeout(() => { throw new Error('test: script error after the first frame'); }, 3000); }
        else if (performance.now() - tStart > 7000) { settled = true; window.__skin.fail('verification ' + v.result + ' std=' + v.std + ' renderer=' + v.renderer); }
        else setTimeout(poll, 300); }; setTimeout(poll, 600); } requestAnimationFrame(count); };
  requestAnimationFrame(count);
  /* frame-rate guard: halve the render scale first, then give up on the skin */
  let slowChecks = 0, last = 0, lastT = performance.now(); setInterval(() => {
    if (!isReady) { last = frames; lastT = performance.now(); return; } const fps = (frames - last) / ((performance.now() - lastT) / 1000); last = frames; lastT = performance.now();
    if (T === 'slow') { die('test: frame rate too low'); return; }
    if (document.hidden) return; if (fps < 6) { if (++slowChecks >= 3) die('frame rate below 6 fps (' + fps.toFixed(1) + ')'); } else slowChecks = 0;
    if (fps < 20 && window.GL && GL.setScale && !window.__scaled) { window.__scaled = true; try { GL.setScale(0.5); } catch (e) { /* ignore */ } }
  }, 2000);
})();
