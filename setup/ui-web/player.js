/* MeguLit installer: pre-rendered one-take player. Replaces the live three.js scene (glass.js, now in tools/setup-scene/ for the renderer).
   The camera path is ten H.264 clips per theme (setup/ui-web/video/<theme>/, see video/INTERFACE.md): five loops the window rests on and five
   transitions between them. The installer's real state picks the clip (Scene.goTo from host.js / skin.js), never a timer:
     intro -> welcome~ -> to-loc -> loc~ -> to-field -> field~ -> to-unpack -> unpack~ -> to-done -> done~      (~ = seamless loop)
   A transition waits for the running loop to reach its loop point (its first frame continues that pose) when that is <= 4 s away, else it
   cross-fades in over 0.25 s. Two <video> per theme play ping-pong: the next clip is loaded and parked on frame 0 while the current one runs.
   Progress: a 2D canvas over the video lights the glass plates of the frame on screen (requestVideoFrameCallback gives the exact frame), from
   the real download segments: core plate of group g = segments [g*N/K, (g+1)*N/K), ambient plates light once the total passes their threshold.
   Light / dark: one stack of videos per theme, the dark one fades over the light one (Scene.setTheme -> GL.setMix); default light.
   First frame: the poster of `intro` (a real frame) is on screen at once; any decode error, a missing file or no video frame within the
   time limit tells the host (fatal), which closes this window and shows the classic setup window. Never a blank window.
   Speaks the old glass.js API (window.GL: ok, setCamera, setMix, update, draw, setScale) so scene.js and skin.js stay as they are. */
(function () {
  const Q = new URLSearchParams(location.search);
  if (Q.get('prerender') === '1') return;   /* the renderer page runs the real 3D scene instead */
  const view = document.getElementById('view'); if (!view) return;
  const REDUCE = Q.get('reduce') === '1' || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const VBASE = (Q.get('vbase') || 'video/').replace(/\/?$/, '/'), TIMEOUT = +(Q.get('vto') || 8000), FADE = 250, HOLD_MAX = 4;
  const LOOP = { welcome: 'welcome', loc: 'loc', field: 'field', unpack: 'unpack', done: 'done' };
  const INTO = { welcome: 'intro', loc: 'to-loc', field: 'to-field', unpack: 'to-unpack', done: 'to-done' };
  const FROM = { 'to-loc': 'welcome', 'to-field': 'loc', 'to-unpack': 'field', 'to-done': 'unpack' };   /* a transition's first frame = this loop's frame 0 */
  const THEMES = ['light', 'dark'];
  const post = (o) => { try { if (window.chrome && chrome.webview) chrome.webview.postMessage(o); } catch (e) { /* no host */ } };
  const log = []; const note = (k, d) => { const e = Object.assign({ t: Math.round(performance.now()), k }, d || {}); log.push(e); if (log.length > 400) log.shift(); };

  /* ---------- DOM ---------- */
  document.documentElement.classList.add('video');
  const css = document.createElement('style');
  css.textContent = '.video #world{display:none}#vstage{position:absolute;inset:0;overflow:hidden;background:var(--bg,#eef2f8)}'
    + '#vstage .vl{position:absolute;inset:0;transition:none}#vstage video,#vstage img.vp{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;opacity:0}'
    + '#vstage img.vp.on,#vstage video.on{opacity:1}#vov{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}';
  document.head.appendChild(css);
  const stage = document.createElement('div'); stage.id = 'vstage'; view.insertBefore(stage, view.firstChild);
  const canvas = document.createElement('canvas'); canvas.id = 'vov'; stage.appendChild(canvas); const ctx = canvas.getContext('2d');

  function mkLayer(theme) {
    const el = document.createElement('div'); el.className = 'vl'; el.dataset.theme = theme; stage.insertBefore(el, canvas);
    const poster = document.createElement('img'); poster.className = 'vp'; poster.alt = ''; poster.decoding = 'sync'; el.appendChild(poster);
    const vids = [0, 1].map(() => { const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.disablePictureInPicture = true; v.setAttribute('muted', ''); el.appendChild(v); return v; });
    vids.forEach((v) => v.addEventListener('error', () => fatal('video decode/load error ' + theme + ' ' + (v.dataset.id || '?') + ' code=' + (v.error && v.error.code))));
    return { theme, el, poster, vids, front: 0, id: null, live: false, man: null };
  }
  const layers = { light: mkLayer('light'), dark: mkLayer('dark') };
  layers.dark.el.style.opacity = '0';

  /* ---------- state ---------- */
  let mix = window.__themeDark ? 1 : 0, cur = null, target = 'welcome', switching = false, firstFrame = false, dead = false, started = false;
  let plates = null, K = 8, seen = null;
  let lastSnap = null, lastProg = 0, lastT = 0;
  const glass = {};   /* `${theme}/${id}` -> parsed glass json (or a promise) */
  const fpsOf = () => (base().man && base().man.fps) || 30;
  const base = () => (mix >= 1 ? layers.dark : layers.light);   /* the layer whose clock leads (fully covered layers may be paused) */
  const segOf = (L, id) => L.man && L.man.segments.find((s) => s.id === id);
  const url = (L, f) => VBASE + L.theme + '/' + f;

  function fatal(why) {
    if (dead) return; dead = true; note('fatal', { why }); window.__playerFatal = String(why);
    post({ type: 'fatal', reason: 'video player: ' + String(why).slice(0, 240) });
    try { window.dispatchEvent(new CustomEvent('player-fatal', { detail: String(why) })); } catch (e) { /* old engine */ }
  }

  /* ---------- clip loading ---------- */
  function park(L, v, id) {
    /* load clip `id` into video v and stop on frame 0; resolves when frame 0 can be shown */
    const s = segOf(L, id); if (!s) return Promise.reject(new Error('no segment ' + id + ' in ' + L.theme + ' manifest'));
    v.loop = false;
    if (v.dataset.id === id && v.readyState >= 2) { try { v.pause(); } catch (e) { /* ignore */ } if (v.currentTime !== 0) v.currentTime = 0; return seeked(v); }
    v.dataset.id = id; v.src = url(L, s.file); v.load();
    return new Promise((ok, bad) => { const done = () => { v.removeEventListener('loadeddata', done); ok(); }; v.addEventListener('loadeddata', done); v.addEventListener('error', () => bad(new Error('cannot load ' + s.file)), { once: true }); });
  }
  function seeked(v) { return new Promise((ok) => { if (!v.seeking) return ok(); v.addEventListener('seeked', ok, { once: true }); }); }
  function shown(v) { return new Promise((ok) => { if (v.paused) { const f = () => (v.readyState >= 2 && !v.seeking ? requestAnimationFrame(() => ok()) : requestAnimationFrame(f)); return f(); } if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => ok()); else { const f = () => (v.currentTime > 0 || v.readyState >= 3 ? ok() : requestAnimationFrame(f)); requestAnimationFrame(f); } }); }

  /* the layers that are on screen follow every switch; a covered one sleeps and catches up when it is uncovered */
  const liveLayers = () => THEMES.map((t) => layers[t]).filter((L) => L.man && (L.theme === 'dark' ? mix > 0 : mix < 1));

  async function switchTo(id, how) {
    /* how: 'cut' (next clip continues the pose: start it the moment the current one ends) or 'fade' (0.25 s cross-fade) */
    if (dead) return; switching = true; note('switch', { id, how, from: cur });
    const Ls = liveLayers();
    try {
      await Promise.all(Ls.map((L) => park(L, L.vids[1 - L.front], id)));
      const seg = segOf(Ls[0], id), loop = seg.kind === 'loop';
      await Promise.all(Ls.map(async (L) => {
        const nv = L.vids[1 - L.front], ov = L.vids[L.front];
        nv.loop = loop && !REDUCE; if (!REDUCE || !loop) { const p = nv.play(); if (p && p.catch) p.catch((e) => { if (!dead) fatal('play() refused: ' + e.message); }); }
        await shown(nv);
        if (how === 'fade' && ov.classList.contains('on') && !REDUCE) { nv.style.transition = 'opacity ' + FADE + 'ms linear'; nv.style.zIndex = 2; ov.style.zIndex = 1; nv.classList.add('on'); await new Promise((r) => setTimeout(r, FADE + 20)); nv.style.transition = ''; }
        else { nv.style.zIndex = 2; ov.style.zIndex = 1; nv.classList.add('on'); }
        ov.classList.remove('on'); try { ov.pause(); } catch (e) { /* ignore */ }
        L.front = 1 - L.front; L.id = id; L.poster.classList.remove('on');
      }));
      cur = id; note('on', { id });
      if (!firstFrame) { firstFrame = true; note('first-frame', {}); }
      watch(); prefetch();
    } catch (e) { fatal(e.message || String(e)); }
    finally { switching = false; }
    if (!loopOf(cur) && !REDUCE) { /* a transition: its `ended` (watch) moves on */ }
    else step();
  }
  const loopOf = (id) => Object.values(LOOP).includes(id);
  function step() {
    /* decide the next clip from where we are and where the installer wants to be */
    if (dead || switching || !cur) return;
    if (loopOf(cur)) {
      if (cur === target) return;
      const tr = INTO[target], frontV = base().vids[base().front];
      if (REDUCE) { switchTo(LOOP[target], 'fade'); return; }
      /* wait for the loop point when it is close and the transition starts from this loop's pose; otherwise cross-fade now */
      const left = (frontV.duration || 0) - (frontV.currentTime || 0);
      if (FROM[tr] === cur && left <= HOLD_MAX) { liveLayers().forEach((L) => { L.vids[L.front].loop = false; }); pending = { id: tr, how: 'cut' }; prefetch(); }
      else switchTo(tr, 'fade');
    }
  }
  let pending = null, watching = null;
  function watch() {
    /* frame clock of the clip on screen: overlay + the moment a transition (or a loop with a pending transition) reaches its last frame */
    const L = base(), v = L.vids[L.front]; watching = v; const fps = fpsOf();
    const tick = (now, md) => {
      if (watching !== v || dead) return;
      const t = md ? md.mediaTime : v.currentTime, frame = Math.min(((segOf(L, L.id) || {}).frames || 1) - 1, Math.max(0, Math.round(t * fps)));
      drawOverlay(L, L.id, frame); window.__playerFrame = { id: L.id, frame, theme: L.theme };
      const last = (v.duration || 0) - t <= 1.5 / fps;
      if (last || v.ended) { const loopNow = loopOf(L.id); if (!loopNow || pending) { const nx = loopNow ? pending : nextOf(L.id); pending = null; if (nx) { watching = null; switchTo(nx.id, nx.how); return; } } }
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(tick); else requestAnimationFrame(() => tick(0, null));
    };
    if (v.paused) requestAnimationFrame(() => tick(0, null));   /* reduced motion: a still frame, drawn once (and again on every update) */
    else if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(tick); else requestAnimationFrame(() => tick(0, null));
    v.onended = () => { if (watching === v) tick(0, { mediaTime: v.duration }); };
  }
  function nextOf(id) {
    /* a transition ended: on to its loop, or straight into the transition the installer already asked for (same pose: a cut) */
    const s = segOf(base(), id); const lp = s && s.next; if (!lp) return null;
    if (target !== lp && loopOf(lp) && INTO[target] && FROM[INTO[target]] === lp) return { id: INTO[target], how: 'cut' };
    if (target !== lp && INTO[target]) return { id: INTO[target], how: 'fade' };
    return { id: lp, how: 'cut' };
  }
  function prefetch() {
    /* park the clip that most likely comes next in the back video, so the switch has nothing to wait for */
    const s = segOf(base(), cur); if (!s) return;
    const nx = pending ? pending.id : !loopOf(cur) ? (nextOf(cur) || {}).id : (target !== cur ? INTO[target] : null);
    if (nx) liveLayers().forEach((L) => park(L, L.vids[1 - L.front], nx).catch(() => { /* reported when switched to */ }));
  }

  /* ---------- glass overlay ---------- */
  function glassOf(L, id) {
    const s = segOf(L, id); if (!s || !s.glass) return null; const k = L.theme + '/' + id; if (glass[k] !== undefined) return glass[k] && glass[k].polys ? glass[k] : null;
    glass[k] = null;
    (async () => {
      let j = null;
      const gz = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error('HTTP ' + r.status); return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json(); };
      /* plain or gzipped (<id>.glass.json.gz, shared by both themes under video/glass/ in the renderer's output) */
      if (/\.gz$/i.test(s.glass)) { try { j = await gz(url(L, s.glass)); } catch (e) { /* missing */ } }
      else { try { const r = await fetch(url(L, s.glass)); if (r.ok) j = await r.json(); } catch (e) { /* try the gzip copy */ } if (!j && window.DecompressionStream) { try { j = await gz(url(L, s.glass + '.gz')); } catch (e) { /* none */ } } }
      glass[k] = j || false; if (!j) note('glass-missing', { k });
    })();
    return null;
  }
  function groups(s) {
    /* real progress per glass group: done segments count 1, running ones their fraction */
    const out = { f: new Float32Array(K), lit: new Uint8Array(K), at: new Float32Array(K) };
    if (!s || !s.st || !s.st.length) return out; const N = s.st.length;
    for (let g = 0; g < K; g++) {
      const a = Math.floor(g * N / K), b = Math.max(a + 1, Math.floor((g + 1) * N / K)); let sum = 0, dn = 0, mx = 0;
      for (let i = a; i < Math.min(b, N); i++) { const st = s.st[i]; if (st === 2) { sum++; dn++; mx = Math.max(mx, (s.doneAt && s.doneAt[i]) || 0); } else if (st === 1 || st === 3) sum += +s.fr[i] || 0; }
      out.f[g] = sum / (b - a); out.lit[g] = dn === b - a ? 1 : 0; out.at[g] = mx;
    }
    return out;
  }
  let G = groups(null), dpr = 1;
  function fit() { const r = stage.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1); const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr)); if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; } }
  window.addEventListener('resize', fit);
  function drawOverlay(L, id, frame) {
    fit(); ctx.clearRect(0, 0, canvas.width, canvas.height);
    const j = glassOf(L, id), man = L.man; if (!j || !plates) return;
    const row = j.polys[Math.min(frame, j.polys.length - 1)]; if (!row) return;
    const sx = canvas.width / (man.width * (j.scale || 4)), sy = canvas.height / (man.height * (j.scale || 4)), dark = mix > 0.5;
    ctx.save(); ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    for (let i = 0; i < row.length; i++) {
      const pts = row[i], info = plates[i]; if (!pts || !info || pts.length < 6) continue;
      let f, lit, flash = 0;
      if (info.core) { const g = Math.min(K - 1, info.order | 0); f = G.f[g]; lit = G.lit[g]; flash = lit && G.at[g] ? Math.max(0, 1 - (lastT - G.at[g]) / 0.9) : 0; }
      else { lit = lastProg > (info.thr || 0) ? 1 : 0; f = lit; }
      if (!lit && f <= 0) continue;
      let cx = 0, cy = 0, rr = 0; const n = pts.length / 2;
      ctx.beginPath(); for (let k = 0; k < n; k++) { const x = pts[2 * k] * sx, y = pts[2 * k + 1] * sy; cx += x; cy += y; if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.closePath(); cx /= n; cy /= n;
      for (let k = 0; k < n; k++) rr = Math.max(rr, Math.hypot(pts[2 * k] * sx - cx, pts[2 * k + 1] * sy - cy));
      const inten = lit ? 1 : 0.3 + 0.7 * f;
      /* inner glow: cold white light filling the plate (red while its group is still coming in, like the old scene), plus an edge line */
      ctx.save(); ctx.clip();
      const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr * 1.05);
      const c = lit ? (dark ? '233,242,255' : '255,255,255') : '214,32,63';
      gr.addColorStop(0, `rgba(${c},${((lit ? 0.32 : 0.22 * f) + 0.45 * flash).toFixed(3)})`); gr.addColorStop(0.7, `rgba(${c},${((lit ? 0.16 : 0.12 * f) + 0.2 * flash).toFixed(3)})`); gr.addColorStop(1, `rgba(${c},${(lit ? 0.42 : 0.25 * f).toFixed(3)})`);
      ctx.fillStyle = gr; ctx.fillRect(cx - rr - 2, cy - rr - 2, rr * 2 + 4, rr * 2 + 4); ctx.restore();
      ctx.lineWidth = Math.max(1, 1.4 * dpr); ctx.strokeStyle = dark ? `rgba(233,242,255,${(0.18 + 0.6 * inten).toFixed(3)})` : `rgba(36,50,79,${(0.12 + 0.45 * inten).toFixed(3)})`; ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- theme ---------- */
  let joining = null;
  function setMix(m) {
    const was = mix; mix = Math.max(0, Math.min(1, m)); layers.dark.el.style.opacity = String(mix);
    /* the layer that becomes visible joins the running clip at the same time */
    const need = mix > 0 && was <= 0 ? layers.dark : mix < 1 && was >= 1 ? layers.light : null;
    if (need && cur && need.man && !joining) joining = join(need).finally(() => { joining = null; });
    if (mix <= 0) sleep(layers.dark); if (mix >= 1) sleep(layers.light);
    if (cur && watching && base().vids[base().front] !== watching) watch();
  }
  async function join(L) {
    const lead = (L === layers.dark ? layers.light : layers.dark), lv = lead.vids[lead.front], id = cur; if (!id) return;
    const v = L.vids[L.front]; await park(L, v, id); const seg = segOf(L, id); v.loop = seg.kind === 'loop' && !REDUCE && !(pending && loopOf(id));
    v.currentTime = Math.min((v.duration || 1) - 0.05, (lv.currentTime || 0) + 0.06); await seeked(v);
    if (!REDUCE || !loopOf(id)) await v.play().catch(() => { /* reported by the lead layer */ });
    await shown(v); v.classList.add('on'); L.id = id; L.poster.classList.remove('on'); L.vids[1 - L.front].classList.remove('on');
  }
  function sleep(L) { L.vids.forEach((v) => { try { v.pause(); } catch (e) { /* ignore */ } }); }

  /* ---------- start ---------- */
  async function load(L) { const r = await fetch(VBASE + L.theme + '/manifest.json', { cache: 'no-store' }); if (!r.ok) throw new Error('manifest ' + L.theme + ' HTTP ' + r.status); L.man = await r.json(); }
  async function start() {
    const probe = document.createElement('video');
    if (!probe.canPlayType || !probe.canPlayType('video/mp4; codecs="avc1.640028"')) { fatal('no H.264 decoder'); return; }
    const first = mix >= 1 ? layers.dark : layers.light;
    /* poster first: a real frame on screen before any video is decoded */
    first.poster.src = VBASE + first.theme + '/intro.jpg'; first.poster.classList.add('on');
    const timer = setTimeout(() => { if (!firstFrame) fatal('no video frame within ' + TIMEOUT + ' ms'); }, TIMEOUT);
    try { await Promise.all(THEMES.map((t) => load(layers[t]).catch((e) => { if (layers[t] === first) throw e; note('manifest-missing', { t, e: e.message }); }))); }
    catch (e) { clearTimeout(timer); fatal(e.message); return; }
    const mp = first.man.plates || {}; K = mp.cores || 8;
    plates = Array.isArray(mp.info) ? mp.info : Array.isArray(mp.group) ? mp.group.map((g) => ({ core: true, order: g })) : [];
    if (first.man.segments[0] && first.man.segments[0].poster) first.poster.src = url(first, segOf(first, 'intro') ? segOf(first, 'intro').poster : first.man.segments[0].poster);
    GL.ok = true; started = true; note('manifest', { theme: first.theme, draft: !!first.man.draft, segs: first.man.segments.length });
    if (REDUCE) await switchTo('welcome', 'cut'); else await switchTo('intro', 'cut');
    clearTimeout(timer);
    if (target !== 'welcome') step();
  }

  /* ---------- the GL API scene.js / skin.js talk to ---------- */
  const GL = window.GL = {
    ok: false, video: true, renderer: null,
    setCamera() { /* the camera lives in the clips */ },
    setScale() { /* nothing to scale: decoding is the GPU's video engine */ },
    draw() { /* drawn on video frames, see watch() */ },
    setMix,
    update(frames, m) { if (!m) return; lastSnap = m.s; lastT = m.t || 0; lastProg = m.prog || 0; G = groups(m.s); const L = base(), v = L.vids[L.front]; if (cur && v.paused && L.id) drawOverlay(L, L.id, Math.round((v.currentTime || 0) * fpsOf())); },
    pose() { return null; }
  };
  window.Player = {
    go(section) { if (!LOOP[section]) return; target = section; note('want', { section }); if (cur && !switching) { if (!loopOf(cur)) prefetch(); else step(); } },
    get state() { return { cur, target, firstFrame, dead, mix, pending: pending && pending.id, switching }; },
    log, layers,
    verdict() { const L = base(), v = L.vids[L.front]; const onScreen = firstFrame ? v.readyState >= 2 : (L.poster.complete && L.poster.naturalWidth > 0); return { result: onScreen ? 'ok' : 'blank', renderer: 'video' + (L.man && L.man.draft ? ' (draft)' : ''), std: onScreen ? 10 : 0, errs: 0, hw: true }; }
  };
  /* scene.js drives the stage changes: follow its goTo (host.js / skin.js call it on the installer's real events) */
  const hook = () => {
    const S = window.Scene; if (!S || S.__player) return !!S; S.__player = true;
    const go = S.goTo; S.goTo = function (name) { window.Player.go(name); return go.apply(this, arguments); };
    const intro = S.intro; S.intro = function () { return intro ? intro.apply(this, arguments) : null; };
    return true;
  };
  if (!hook()) { const iv = setInterval(() => { if (hook()) clearInterval(iv); }, 20); }
  start();
})();
