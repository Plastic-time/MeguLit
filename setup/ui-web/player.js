/* MeguLit installer: pre-rendered one-take player. Replaces the live three.js scene (glass.js, now in tools/setup-scene/ for the renderer).
   The camera path is ten H.264 clips per theme (setup/ui-web/video/<theme>/, see video/INTERFACE.md): five loops the window rests on and five
   transitions between them. The installer's real state picks the clip (Scene.goTo from host.js / skin.js), never a timer:
     intro -> welcome~ -> to-loc -> loc~ -> to-field -> field~ -> to-unpack -> unpack~ -> to-done -> done~      (~ = seamless loop)
   A transition waits for the running loop to reach its loop point (its first frame continues that pose) when that is <= 4 s away, else it
   cross-fades in over 0.25 s. Two <video> per theme play ping-pong: the next clip is loaded and parked on frame 0 while the current one runs.
   Route: the clips are only ever played along the chain welcome -> loc -> field -> unpack -> done (every step is a continuous camera cut); a target several stops ahead
   just chains the transitions, the loops in between are skipped. Progress is not drawn on the video: it stays in the UI's own text.
   First frame: the poster of `intro` (a real frame) is on screen at once; any decode error, a missing file or no video frame within the
   time limit tells the host (fatal), which closes this window and shows the classic setup window. Never a blank window.
   Speaks the old glass.js API (window.GL: ok, setCamera, setMix, update, draw, setScale) so scene.js and skin.js stay as they are. */
(function () {
  const Q = new URLSearchParams(location.search);
  if (Q.get('prerender') === '1') return;   /* the renderer page runs the real 3D scene instead */
  const view = document.getElementById('view'); if (!view) return;
  const progressBoot = Q.get('boot') === 'progress';
  const REDUCE = Q.get('reduce') === '1' || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const VBASE = (Q.get('vbase') || 'video/').replace(/\/?$/, '/'), TIMEOUT = +(Q.get('vto') || 8000), FADE = 250, HOLD_MAX = 4;
  const LOOP = { welcome: 'welcome', loc: 'loc', field: 'field', unpack: 'unpack', done: 'done' };
  const INTO = { welcome: 'intro', loc: 'to-loc', field: 'to-field', unpack: 'to-unpack', done: 'to-done' };
  const FROM = { 'to-loc': 'welcome', 'to-field': 'loc', 'to-unpack': 'field', 'to-done': 'unpack' };   /* a transition's first frame = this loop's frame 0 */
  const THEMES = ['light', 'dark'];
  const post = (o) => { try { if (window.chrome && chrome.webview) chrome.webview.postMessage(o); } catch (e) { /* no host */ } };
  const marks = {}; const mark = (what) => { if (marks[what]) return; marks[what] = Math.round(performance.now()); post({ type: 'mark', what, at: marks[what] }); };
  const log = []; const note = (k, d) => { const e = Object.assign({ t: Math.round(performance.now()), k }, d || {}); log.push(e); if (log.length > 400) log.shift(); };

  /* ---------- DOM ---------- */
  document.documentElement.classList.add('video');
  const css = document.createElement('style');
  css.textContent = '.video #world{display:none}#vstage{position:absolute;inset:0;overflow:hidden;background:var(--bg,#eef2f8)}'
    + '#vstage .vl{position:absolute;inset:0;transition:none;z-index:1}#vstage .vl[data-theme=dark]{z-index:2}#vstage video,#vstage img.vp{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;opacity:0}'
    + '#vstage img.vp.on,#vstage video.on{opacity:1}';
  document.head.appendChild(css);
  const stage = document.createElement('div'); stage.id = 'vstage'; view.insertBefore(stage, view.firstChild);
  
  function mkLayer(theme) {
    const el = document.createElement('div'); el.className = 'vl'; el.dataset.theme = theme; stage.appendChild(el);
    const poster = document.createElement('img'); poster.className = 'vp'; poster.alt = ''; poster.decoding = 'sync'; el.appendChild(poster);
    const vids = [0, 1].map(() => { const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.disablePictureInPicture = true; v.setAttribute('muted', ''); el.appendChild(v); return v; });
    vids.forEach((v) => v.addEventListener('error', () => fatal('video decode/load error ' + theme + ' ' + (v.dataset.id || '?') + ' code=' + (v.error && v.error.code))));
    return { theme, el, poster, vids, front: 0, id: null, live: false, man: null };
  }
  const layers = { light: mkLayer('light'), dark: mkLayer('dark') };
  layers.dark.el.style.opacity = '0';

  /* ---------- state ---------- */
  /* player.js loads before scene.js now: read the remembered theme the same way scene.js does */
  let themeDark0 = window.__themeDark; if (themeDark0 === undefined) { try { themeDark0 = Q.get('theme') ? Q.get('theme') === 'night' : localStorage.getItem('megulit.setup.theme') === 'dark'; } catch (e) { themeDark0 = false; } }
  let mix = themeDark0 ? 1 : 0, cur = null, target = 'welcome', switching = false, firstFrame = false, dead = false, started = false;
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
    if (v.dataset.id === id) return new Promise((ok, bad) => { v.addEventListener('loadeddata', () => ok(), { once: true }); v.addEventListener('error', () => bad(new Error('cannot load ' + s.file)), { once: true }); });   /* the element the HTML already started */
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
      if (!firstFrame) { firstFrame = true; note('first-frame', {}); mark('frame1'); document.documentElement.classList.add('reveal'); const p0 = document.getElementById('vposter'); if (p0) { p0.style.transition = 'opacity .2s'; p0.style.opacity = '0'; setTimeout(() => p0.remove(), 300); } }
      watch(); prefetch();
    } catch (e) { fatal(e.message || String(e)); }
    finally { switching = false; }
    if (!loopOf(cur) && !REDUCE) { /* a transition: its `ended` (watch) moves on */ }
    else step();
  }
  const loopOf = (id) => Object.values(LOOP).includes(id);
  const ORDER = ['welcome', 'loc', 'field', 'unpack', 'done'];   /* the only route: stop k -> stop k+1 through INTO[stop k+1] (no skipping, no fades between non-adjacent clips) */
  const nextStop = (stop) => { const i = ORDER.indexOf(stop), g = ORDER.indexOf(target); return i >= 0 && g > i ? ORDER[i + 1] : null; };
  function step() {
    /* decide the next clip from where we are and where the installer wants to be: always the next transition on the chain */
    if (dead || switching || !cur) return;
    if (loopOf(cur)) {
      if (cur === target) return;
      if (REDUCE) { switchTo(LOOP[target], 'fade'); return; }
      const ns = nextStop(cur); if (!ns) return;   /* a target behind us is never played backwards: stay */
      const tr = INTO[ns], frontV = base().vids[base().front];
      /* wait for the loop point when it is close (the transition's first frame continues this loop's frame 0); otherwise a 0.25 s fade into the ADJACENT transition */
      const left = (frontV.duration || 0) - (frontV.currentTime || 0);
      if (left <= HOLD_MAX) { liveLayers().forEach((L) => { L.vids[L.front].loop = false; }); pending = { id: tr, how: 'cut' }; prefetch(); }
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
      window.__playerFrame = { id: L.id, frame, theme: L.theme };
      const last = (v.duration || 0) - t <= 1.5 / fps;
      if (last || v.ended) { const loopNow = loopOf(L.id); if (!loopNow || pending) { const nx = loopNow ? pending : nextOf(L.id); pending = null; if (nx) { watching = null; switchTo(nx.id, nx.how); return; } } }
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(tick); else requestAnimationFrame(() => tick(0, null));
    };
    if (v.paused) requestAnimationFrame(() => tick(0, null));   /* reduced motion: a still frame, drawn once (and again on every update) */
    else if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(tick); else requestAnimationFrame(() => tick(0, null));
    v.onended = () => { if (watching === v) tick(0, { mediaTime: v.duration }); };
  }
  function nextOf(id) {
    /* a transition ended: on to its loop; when the installer already wants a later stop, straight into the next transition on the chain (same pose: a cut), the stop in between is skipped */
    const s = segOf(base(), id); const lp = s && s.next; if (!lp) return null;
    const ns = nextStop(lp); if (ns) return { id: INTO[ns], how: 'cut' };
    return { id: lp, how: 'cut' };
  }
  function prefetch() {
    /* park the clip that most likely comes next in the back video, so the switch has nothing to wait for */
    const s = segOf(base(), cur); if (!s) return;
    const nx = pending ? pending.id : !loopOf(cur) ? (nextOf(cur) || {}).id : (nextStop(cur) ? INTO[nextStop(cur)] : null);
    if (nx) liveLayers().forEach((L) => park(L, L.vids[1 - L.front], nx).catch(() => { /* reported when switched to */ }));
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
    /* adopt the <video id=v0> the HTML started loading: it becomes this layer's back video, so the first switch (intro) finds it loaded */
    const v0 = document.getElementById('v0');
    if (v0 && v0.dataset.theme === first.theme) {
      const old = first.vids[0]; v0.removeAttribute('style'); v0.removeAttribute('id'); v0.dataset.id = 'intro';
      v0.addEventListener('error', () => fatal('video decode/load error ' + first.theme + ' intro code=' + (v0.error && v0.error.code)));
      first.el.replaceChild(v0, old); first.vids[0] = v0; first.front = 1; note('adopted-v0', { rs: v0.readyState });
    } else if (v0) v0.remove();
    if (!progressBoot) {
      /* The legacy entry uses the opening frame while the video decodes. */
      first.poster.src = VBASE + first.theme + '/intro.jpg'; first.poster.classList.add('on');
      /* the poster is a real frame: it replaces the boot screen at once, and the host logs when (cold-start timing) */
      const posterUp = () => { const b = document.getElementById('boot'); if (b && !b.classList.contains('gone')) { b.classList.add('gone'); setTimeout(() => b.remove(), 800); } mark('poster'); };
      if (window.__posterAt) marks.poster = window.__posterAt;   /* the static poster in index.html was first */
      if (first.poster.complete && first.poster.naturalWidth) posterUp(); else first.poster.addEventListener('load', posterUp, { once: true });
    }
    const timer = setTimeout(() => { if (!firstFrame) fatal('no video frame within ' + TIMEOUT + ' ms'); }, TIMEOUT);
    try { await Promise.all(THEMES.map((t) => load(layers[t]).catch((e) => { if (layers[t] === first) throw e; note('manifest-missing', { t, e: e.message }); }))); }
    catch (e) { clearTimeout(timer); fatal(e.message); return; }
    if (!progressBoot && first.man.segments[0] && first.man.segments[0].poster) first.poster.src = url(first, segOf(first, 'intro') ? segOf(first, 'intro').poster : first.man.segments[0].poster);
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
    draw() { /* nothing to draw */ },
    setMix,
    update() { /* progress is text/percent in the UI only */ },
    pose() { return null; }
  };
  window.Player = {
    go(section) { if (!LOOP[section]) return; target = section; note('want', { section }); if (cur && !switching) { if (!loopOf(cur)) prefetch(); else step(); } },
    get state() { return { cur, target, firstFrame, dead, mix, pending: pending && pending.id, switching }; },
    log, layers, marks,
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
  /* test switch (MEGULIT_SETUP_WEB_TEST=stall): the page comes up and says ready, but no video frame ever arrives and nothing
     is reported: only the host's watchdog can get the user out of this */
  if (Q.get('t') === 'stall') { GL.ok = true; const p = document.getElementById('vposter'); if (p && p.complete) mark('poster'); return; }
  start();
})();
