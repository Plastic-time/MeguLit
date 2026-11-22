/* Demo driver: a deterministic simulation of the real segment feed (same shape as the engine snapshot, see
   setup/ui-web/SEGMENT-FEED.md) plus the user's clicks, on one GSAP master timeline so a recorder can seek frame by frame.
   Open index.html?demo=1 (live preview) or ?demo=1&paused=1 (a recorder drives Demo.seek). Not shipped logic. */
(function () {
  const N = 142, SEG = 4 * 1048576, TOTAL = N * SEG, T0 = 2.4, PACKS = [['base', 0], ['reading', 27], ['voice', 75]];
  const SRC = ['cn-dl.megulit.com', 'dl.megulit.com', 'github.com'];
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const start = [], end = [], src = [], retry = {}; const free = Array.from({ length: 8 }, (_, i) => T0 + 0.1 * i);
  for (let i = 0; i < N; i++) {
    let k = 0; for (let j = 1; j < 8; j++) if (free[j] < free[k]) k = j;
    const s = src.push(k % 8 < 4 ? 0 : k % 8 < 7 ? 1 : 2) - 1, f = [1.0, 0.85, 0.5][src[s]];
    const d = (0.2 + rnd() * 0.24) / f; start[i] = free[k]; end[i] = free[k] + d;
    if (i === 96 || i === 97) { retry[i] = [start[i] + d * 0.55, 1.1]; end[i] += 1.5; src[i] = 1; }
    free[k] = end[i];
  }
  const TEND = Math.max(...end), U0 = TEND + 0.7, UD = 2.0, DONE = U0 + UD;
  function gotAt(t) { let g = 0; for (let i = 0; i < N; i++) { if (t >= end[i]) g += SEG; else if (t > start[i]) g += SEG * (t - start[i]) / (end[i] - start[i]) * 0.9; } return g; }
  function at(t, o) {
    o = o || {}; const st = new Int8Array(N), fr = new Float32Array(N), da = new Float32Array(N); let first = N;
    for (let i = 0; i < N; i++) {
      da[i] = end[i];
      if (t >= end[i]) st[i] = 2; else if (t >= start[i]) {
        const r = retry[i]; if (r && t >= r[0] && t < r[0] + r[1]) { st[i] = 3; fr[i] = (r[0] - start[i]) / (end[i] - start[i]); }
        else { st[i] = 1; fr[i] = r && t >= r[0] + r[1] ? (t - r[0] - r[1]) / (end[i] - r[0] - r[1]) : (t - start[i]) / (end[i] - start[i]); }
      }
      if (st[i] !== 2 && i < first) first = i;
    }
    const got = gotAt(t), g0 = gotAt(t - 1), speed = t > T0 + 0.8 && t < TEND ? Math.max(0, got - g0) : 0;
    let pack = PACKS[0][0]; for (const p of PACKS) if (Math.min(first, N - 1) >= p[1]) pack = p[0];
    const busy = {}; for (let i = 0; i < N; i++) if (st[i] === 1) busy[src[i]] = 1; const nb = Object.keys(busy).length;
    const lead = SRC[+Object.keys(busy)[0] || 0];
    const s = { t, st, fr, doneAt: da, got: Math.min(TOTAL, got), total: TOTAL, speed, eta: speed > 0 ? (TOTAL - got) / speed : 0, pack, src: lead, srcN: nb, dir: 'D:/MeguLit/runtime',
      phase: t < T0 ? 'probe' : t < TEND + 0.4 ? 'download' : t < DONE ? 'unpack' : 'done', unpack: Math.max(0, Math.min(1, (t - U0) / UD)) };
    if (s.phase === 'unpack' || s.phase === 'done') s.got = TOTAL;
    if (o.progress !== undefined) { const x = o.progress * N, k = Math.floor(x); for (let i = 0; i < N; i++) { st[i] = i < k ? 2 : i === k && o.progress < 1 ? 1 : (o.progress >= 1 ? 2 : 0); fr[i] = i === k ? x - k : 0; da[i] = 0; } s.got = o.progress * TOTAL; s.phase = 'download'; s.poseP = o.poseP !== undefined ? o.poseP : 0.5; }   /* pre-render preview: fake download progress, glass lit by the scene's own style */
    if (o.state === 'done') { st.fill(2); fr.fill(1); da.fill(0); s.got = TOTAL; s.speed = 0; s.eta = 0; s.phase = o.phase || 'unpack'; s.unpack = o.phase === 'done' ? 1 : 0.5; }   /* pre-render: every segment finished, glass in its final state */
    if (o.poseP !== undefined) s.poseP = o.poseP;
    if (o.etchMix !== undefined) s.etchMix = o.etchMix;
    if (o.blank) { s.poseP = o.poseP !== undefined ? o.poseP : Math.max(0, Math.min(1, (t - T0) / (TEND - T0))); st.fill(0); fr.fill(0); s.got = 0; s.speed = 0; s.eta = 0; s.phase = 'download'; }   /* pre-render: every segment still pending, the glass is drawn unlit (the player lights it from the real progress) */
    if (o.fail === 'download') { for (let i = 0; i < N; i++) if (st[i] === 1 || st[i] === 3) st[i] = 4; s.speed = 0; s.eta = 0;
      s.err = { kind: 'download' }; }
    if (o.fail === 'install') s.err = { kind: 'install' };
    return s;
  }
  const THEME_ROUTE = { edge: ["skim", "under", "dive", "pull"], night: ["skim", "under", "dive", "pull"] }; const ROUTE = THEME_ROUTE[Scene.THEME]; let tl = null, fixed = null;
  function build() {
    tl = gsap.timeline({ paused: true });
    tl.add(Scene.intro(), 0);
    const L = window.__layout;   /* pre-render: the four moves are spaced out so that none overlaps the next one */
    if (L) tl.add(Scene.goTo('loc', ROUTE[0], 'welcome'), T0).add(Scene.goTo('field', ROUTE[1], 'loc'), L.under).add(Scene.goTo('unpack', ROUTE[2], 'field'), L.dive).add(Scene.goTo('done', ROUTE[3], 'unpack'), L.pull);
    else tl.add(Scene.goTo('loc', ROUTE[0], 'welcome'), T0).add(Scene.goTo('field', ROUTE[1], 'loc'), 4.9).add(Scene.goTo('unpack', ROUTE[2], 'field'), U0 - 0.3).add(Scene.goTo('done', ROUTE[3], 'unpack'), DONE);
    const BS = String.fromCharCode(92), typed = 'D:' + BS + 'Games' + BS + 'MeguLit'; const path = document.getElementById('path');
    tl.call(() => { path.value = 'D:' + BS + 'MeguLit'; }, null, 0);
    for (let i = 0; i < typed.length; i++) tl.call(() => { path.value = typed.slice(0, i + 1); }, null, 3.3 + i * 0.05);
    tl.call(() => { Scene.setFree(182 * 1073741824, 1.4 * 1073741824); }, null, 4.2);
    tl.fromTo('#install', { scale: 1 }, { scale: 0.96, duration: 0.12, yoyo: true, repeat: 1 }, 4.7);
    tl.to({}, { duration: DONE + 8.6 }, 0);
    return tl;
  }
  /* close-up of one glass plate: eye placed in front of it, a little off to the side (opts: close = plate index, yaw, fill = share of screen height) */
  function closePose(o) { const p = window.GL && GL.pose(o.close); if (!p) return null; const ry = o.yaw === undefined ? -24 : o.yaw, a = ry * Math.PI / 180, D = p.h * p.s * 820 / ((o.fill || 0.62) * 640) * 1; const bx = -Math.sin(a), bz = Math.cos(a);
    return { cx: p.x + bx * (D - 820), cy: p.y, cz: p.z + bz * (D - 820), rx: o.pitch || 0, ry, rz: 0 }; }
  const Demo = {
    N, TOTAL, T0, TEND, U0, DONE, at, DURATION: DONE + 8.6,
    build() { build(); window.__demoTl = tl; return tl; },
    seek(t, o) { fixed = o || null; tl.time(t, false); Scene.setOverride(o && o.close !== undefined ? closePose(o) : null); if (o && o.mix !== undefined) Scene.setThemeMix(o.mix); const G = 1073741824; if (o && o.low) { document.getElementById('path').value = 'C:\\MeguLit'; Scene.setFree(0.9 * G, 1.4 * G, 'ok'); } else if (o && o.readonly) { document.getElementById('path').value = 'C:\\Program Files\\MeguLit'; Scene.setFree(300 * G, 1.4 * G, 'readonly'); } else if (o && o.setup) { document.getElementById('path').value = 'D:\\MeguLit'; Scene.setFree(182 * G, 1.4 * G, 'ok'); } else { Scene.setFree(182 * G, 1.4 * G, 'ok'); } Scene.render(at(t, fixed)); if (window.GL) GL.draw(); const q = document.getElementById("ui-quit"); q.style.visibility = o && o.quit ? "visible" : "hidden"; q.style.opacity = o && o.quit ? 1 : 0; },
    play() { tl.eventCallback('onUpdate', () => Scene.render(at(tl.time()))); tl.play(); }
  };
  window.Demo = Demo;
  Scene.init({ count: N }); Scene.setDrives([{ path: 'D:\\MeguLit', free: 182 * 1073741824 }, { path: 'E:\\Games\\MeguLit', free: 460 * 1073741824 }]); Demo.build();
  if (new URLSearchParams(location.search).get('paused') !== '1') Demo.play(); else Scene.render(at(0));
})();
