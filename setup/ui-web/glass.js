/* MeguLit installer: the real-3D layer (three.js). Buildings, magic etchings, light bands and the eight glass plates are objects in one
   WebGL scene; the DOM keeps only the HUD, the glass control panel and the window frame.
   Glass = MeshPhysicalMaterial with transmission (refracts the buildings behind it), real thickness and bevel, clearcoat, green-white
   edge tint. The logo is NOT painted on it: it is a frosted volume inside the glass (three thin translucent layers at different depths
   inside the plate, with a bump map, so parallax shows it sits inside), unlit parts stay perfectly clear. Light is the only "colour":
   a cold white light enters from the plate's edge and fills the etching along the group's real progress.
   If WebGL is not available this file does nothing and scene.js keeps its DOM fallback.  */
(function () {
  const THREE = window.THREE; if (!THREE) return;
  const Q = new URLSearchParams(location.search), NIGHT = window.__themeDark !== undefined ? !!window.__themeDark : Q.get('theme') === 'night', REDUCE = Q.get('reduce') === '1' || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const MODE = Q.get('mode') === 'B' ? 'B' : Q.get('mode') === 'A' ? 'A' : 'M';   /* M = merged: radial-cracked plates in B's clear relief glass */
  const view = document.getElementById('view'); if (!view) return;
  /* A fresh WebView2 profile can hand out a broken first context ("OES_packed_depth_stencil support is required"); a context made after such a failure can draw nothing.
     So: one attempt per page load. On failure the skin (skin.js) reloads the page after a short pause, up to its time limit, and only then gives the skin up. */
  let renderer; try { renderer = new THREE.WebGLRenderer({ antialias: Q.get('aa') === '1', preserveDrawingBuffer: true, powerPreference: 'high-performance' }); } catch (e) { if (window.__skin) window.__skin.fail('create: ' + (e && e.message || e)); return; }
  if (!renderer || !renderer.getContext()) { if (window.__skin) window.__skin.fail('no context'); return; }
  window.__glT = { created: Math.round(performance.now()) };
  if (!renderer.getContext()) return;
  const P = 820, FY = 1200, D2R = Math.PI / 180;
  const el = renderer.domElement; el.id = 'gl'; el.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'; view.insertBefore(el, view.firstChild);
  const wd = document.getElementById('world'); if (wd) wd.style.display = 'none';
  renderer.setPixelRatio(Math.min(Math.max(window.devicePixelRatio || 1, Q.get('aa') === '1' ? 1 : 1.5), REDUCE ? 1 : 2));   /* no MSAA (its depth/stencil buffers are what a cold GPU process refuses): smooth by rendering at least 1.5x instead */ renderer.outputColorSpace = THREE.SRGBColorSpace;
  const col = (a, b, m) => new THREE.Color(a).lerp(new THREE.Color(b), m), themed = [];
  let night = NIGHT ? 1 : 0; const isDark = () => night > 0.5;
  const SHADOW = Q.get('shadow') !== '0', TRANS = Q.get('trans') === '0' ? 0 : 1, ENVMAP = Q.get('env') !== '0';   /* feature switches for the cold-start experiments */
  renderer.shadowMap.enabled = SHADOW; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xc4cfe0); scene.fog = new THREE.Fog(0xc4cfe0, 2600, 11000);
  themed.push((m) => { const c0 = col(0xd5e0ef, 0x0a0c10, m); scene.background.copy(c0); scene.fog.color.copy(c0); });
  const camera = new THREE.PerspectiveCamera(40, 1.5, 30, 40000); camera.rotation.order = 'YXZ';
  function resize() { const w = view.clientWidth || 1000, h = view.clientHeight || 640; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = 2 * Math.atan((h / 2) / P) / D2R; camera.updateProjectionMatrix(); }
  resize(); if (window.ResizeObserver) new ResizeObserver(resize).observe(view);

  /* ---- light + a small studio for reflections (softboxes make the glass edges and clearcoat read) ---- */
  const hemi = new THREE.HemisphereLight(0xffffff, 0x6f86ad, 1.2); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-2500, 4000, 3000); sun.castShadow = SHADOW; sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = -9000; sc.right = 9000; sc.top = 9000; sc.bottom = -9000; sc.near = 500; sc.far = 18000; sun.shadow.bias = -0.0004; sun.shadow.radius = 5; scene.add(sun);
  themed.push((m) => { hemi.color.copy(col(0xffffff, 0x8fa0c4, m)); hemi.groundColor.copy(col(0x4a6598, 0x14171f, m)); hemi.intensity = 0.8 + (0.55 - 0.8) * m; sun.color.copy(col(0xffffff, 0xcfe0ff, m)); sun.intensity = 2.1 + (1.1 - 2.1) * m; });
  const makeEnv = (N) => { const es = new THREE.Scene(); es.background = new THREE.Color(N ? 0x05060a : 0x7d92b4);
    const box = (w, h, x, y, z, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m); };
    box(60, 14, -95, 40, 30, N ? 9 : 5); box(10, 60, 80, 10, -30, N ? 3.5 : 3); box(30, 30, 0, 60, -50, N ? 8 : 3); for (let i = 0; i < 7; i++) if (i !== 2 && i !== 3) box(5 + (i % 3) * 3, 90, -70 + i * 24, 20 - (i % 4) * 14, (i % 2 ? 40 : -40), N ? 8 : 4); for (let i = 0; i < 4; i++) box(100, 5, 0, -30 + i * 30, -45 + i * 20, N ? 7 : 3.5);
    const pm = new THREE.PMREMGenerator(renderer); const t = pm.fromScene(es, 0.02).texture; pm.dispose(); return t; };
  const envDay = ENVMAP ? makeEnv(false) : null, envNight = ENVMAP ? makeEnv(true) : null; scene.environment = NIGHT ? envNight : envDay;

  /* ---- canvas textures ---- */
  const tex = (cv) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  const cnv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const LINE = '255,255,255';
  const mat = (map, extra) => new THREE.MeshBasicMaterial(Object.assign({ map, transparent: true, depthWrite: false }, extra || {}));
  const lineMats = []; const lineMat = (map, extra) => { const m = mat(map, extra); lineMats.push(m); return m; };

  /* ---- the city: a white-model block of an Akihabara-like main street (prototype, no real names, logos or characters). A very wide avenue,
     rows of mid-rise shop buildings facing it with upright signboards, blank ad panels, light boxes, AC units, roof tanks and ad frames,
     an elevated railway crossing the street (truss + piers, the one crimson railing), poles and wires. Bodies and signs are instanced. ---- */
  const place = (m, x, y, z) => { m.position.set(x, y, z); scene.add(m); return m; };
  const X0 = 3300, FLOORY = -FY;
  const bMat = new THREE.MeshStandardMaterial({ color: 0xf0f4fa, roughness: 0.92, metalness: 0 });
  const sMat = new THREE.MeshStandardMaterial({ color: 0xdfe6f0, roughness: 0.8, metalness: 0, emissive: 0x000000 });
  const eMat = new THREE.LineBasicMaterial({ color: 0xaab3c2, transparent: true, opacity: 0.9 });
  const wMat = new THREE.LineBasicMaterial({ color: 0x2a3140, transparent: true, opacity: 0.85 });
  const redMat = new THREE.MeshBasicMaterial({ color: 0xd6203f });
  const ledMats = [0, 1, 2].map(() => new THREE.MeshStandardMaterial({ color: 0xe9eef6, roughness: 0.6, emissive: 0x000000 })), ledBands = [[], [], []], glows = [], ledMat = ledMats[0], led = [], trees = [], arrows = [];
  const wndMat = new THREE.MeshStandardMaterial({ color: 0xaab8cf, roughness: 0.4, metalness: 0.1, emissive: 0x000000 });
  const roadMat = new THREE.MeshStandardMaterial({ color: 0xaeb9ca, roughness: 1 }), markMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  themed.push((m) => { ledMats.forEach((lm, k) => { lm.color.copy(col(0xe4eaf4, 0x1b2029, m)); lm.emissive.copy(col(0x000000, 0x8ea2c8, m)); lm.emissiveIntensity = [0.16, 0.3, 0.2][k] * m; }); wndMat.color.copy(col(0xa9b8d0, 0x222a38, m)); wndMat.emissive.copy(col(0x000000, 0x7d92bb, m)); wndMat.emissiveIntensity = 0.12 * m; bMat.color.copy(col(0xeef3fa, 0x13171e, m)); sMat.color.copy(col(0xc3cddd, 0x1a1f28, m)); sMat.emissive.copy(col(0x000000, 0x93a4c0, m)); sMat.emissiveIntensity = 0.22 * m; eMat.color.copy(col(0x6f7e96, 0x4a5568, m)); wMat.color.copy(col(0x2a3140, 0x8fa2c6, m)); roadMat.color.copy(col(0xaab6c8, 0x101319, m)); mhMat.color.copy(col(0x7f8ca2, 0x2a303b, m)); markMat.opacity = 0.85 - 0.45 * m; });
  let sd2 = 77; const r2 = () => (sd2 = (sd2 * 16807) % 2147483647) / 2147483647;
  const bodies = [], signs = [], panels = [], boxesS = [], tanks = [], edgePts = [];
  const pushBox = (arr, x, y, z, w, h, d, ry) => arr.push([x, y, z, w, h, d, ry]);
  const pbe = (arr, x, y, z, w, h, d) => { pushBox(arr, x, y, z, w, h, d); edgeOf(x, y, z, w, h, d); };
  const edgeOf = (x, y, z, w, h, d) => { const hx = w / 2, hy = h / 2, hz = d / 2, v = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]].map((q) => [x + q[0] * hx, y + q[1] * hy, z + q[2] * hz]); [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(([a, b]) => edgePts.push(...v[a], ...v[b])); };
  /* Eight building types with a real massing: a body, setbacks, a roof plant layer, floor bands and a window grid cut as fine lines, awnings over the
     shop floor, upright signboards in aligned columns of three fixed sizes, flat blank ad panels, AC units in tidy columns, roof ad frames, outside stairs.
     Along the street they alternate with a rhythm (tall, wide, low, corner), near ones carry the detail, far ones are plain masses that the haze eats. */
  const FL = 130, fins = [], bands = [], cyls = [], awn = [], wins = [], shopf = [];
  /* window panes: rows and columns on a fixed module, a shop front on the ground floor */
  function windows(face, side, z0, z1, y0, h, dense) { const w = z1 - z0, cols = Math.max(2, Math.floor((w - 50) / 86)), cw = (w - 40) / cols; for (let y = y0 + FL * 1.7; y < y0 + h - 110; y += FL) for (let k = 0; k < cols; k++) pushBox(wins, face - side * 2, y + 26, z0 + 20 + (k + 0.5) * cw, 6, 70, cw * 0.62); pushBox(shopf, face - side * 3, y0 + 90, (z0 + z1) / 2, 7, 150, w * 0.9); }
  const SIGN = [[54, 300], [66, 480], [80, 720]];
  function facade(face, side, z0, z1, y0, h, detail) {
    const w = z1 - z0, zc = (z0 + z1) / 2; if (!detail) return;
    for (let y = y0 + FL * 2; y < y0 + h - 80; y += FL * 2) pushBox(bands, face - side * 7, y, zc, 14, 9, w);
    const fx = face - side * 1.5; for (let zz = z0 + 34; zz < z1 - 20; zz += 92) edgePts.push(fx, y0 + FL + 20, zz, fx, y0 + h - 50, zz); for (let y = y0 + FL + 20; y < y0 + h - 50; y += FL) edgePts.push(fx, y, z0 + 16, fx, y, z1 - 16);
    pushBox(awn, face - side * 48, y0 + 132, zc, 96, 12, w * 0.96);                                        /* the shop floor awning */
  }
  function signColumn(face, side, zc, y0, h, spec, count) { const [sw, sh] = SIGN[spec]; let y = y0 + 250; for (let i = 0; i < count && y + sh < y0 + h - 160; i++) { pushBox(signs, face - side * 46, y + sh / 2, zc, 70, sh, sw); y += sh + 22; } }
  function acColumn(face, side, zc, y0, h) { for (let y = y0 + FL * 2 + 30; y < y0 + h - 120; y += FL * 2) pushBox(boxesS, face - side * 40, y, zc, 70, 56, 84); }
  function roofFrame(cx, side, y, zc, w) { pushBox(signs, cx, y + 150, zc - w * 0.4, 18, 300, 18); pushBox(signs, cx, y + 150, zc + w * 0.4, 18, 300, 18); pushBox(panels, cx, y + 300, zc, 22, 30, w * 0.9); pushBox(panels, cx, y + 190, zc, 14, 200, w * 0.8); }
  function stairs(face, side, zc, y0, h) { const fx = face - side * 4; let y = y0 + 40; let k = 0; while (y < y0 + h - 80) { const za = zc - 90 + (k % 2) * 180, zb = zc + 90 - (k % 2) * 180; edgePts.push(fx, y, za, fx, y + FL, zb); pushBox(bodies, face - side * 30, y + FL, zb, 60, 10, 70); y += FL; k++; } }
  const TYPES = ['pencil', 'mall', 'terrace', 'screen', 'old', 'fins', 'bands', 'corner', 'tower', 'tower', 'tower'];
  const crossAt = [[-2900, -2400], [1000, 1500], [-800, -200]];
  /* the street: a narrow canyon in front of the glass, opening out behind it so the walls frame the logo and never stand behind it */
  const innerAt = (zz) => zz > -1800 ? 1650 : zz > -2800 ? 1650 + (-1800 - zz) / 1000 * (900 - 1650) : Math.max(900, 0.55 * (-2800 - zz + 820));
  for (const side of [-1, 1]) {
    let z = 2300, idx = 0;
    while (z > -9500) {
      const near = z > -4600; let type = TYPES[Math.floor(r2() * TYPES.length)]; const tall = idx % 3 === 0; if (z > -3300 && (idx % 2 === 0 || r2() < 0.3)) type = 'tower';
      let w, dep, h; switch (type) { case 'pencil': w = 250 + r2() * 90; dep = 560; h = 2500 + r2() * 1100; break; case 'mall': w = 640 + r2() * 160; dep = 820; h = 1250 + r2() * 500; break; case 'terrace': w = 440 + r2() * 120; dep = 760; h = 1900 + r2() * 900; break; case 'screen': w = 460 + r2() * 100; dep = 700; h = 1700 + r2() * 700; break; case 'tower': w = 430 + r2() * 110; dep = 760; h = 2000 + r2() * 900; break; case 'old': w = 300 + r2() * 100; dep = 620; h = 720 + r2() * 300; break; case 'fins': w = 380 + r2() * 120; dep = 700; h = 1500 + r2() * 800; break; case 'bands': w = 420 + r2() * 160; dep = 740; h = 1400 + r2() * 700; break; default: w = 460; dep = 820; h = 1600 + r2() * 600; }
      if (tall && type !== 'old') h *= 1.18;
      z -= w; let cornerLeft = false; for (const [lo, hi] of crossAt) { if (z + w > lo && z < hi) { z = lo; cornerLeft = true; break; } } if (cornerLeft) continue;
      const z1 = z + w, zc = z + w / 2, y0 = FLOORY, INNER = innerAt(zc), face = X0 + side * INNER, cx = face + side * dep / 2;
      /* main body (+ setbacks for the stepped type) */
      if (type === 'terrace') { const h1 = h * 0.52; pushBox(bodies, cx, y0 + h1 / 2, zc, dep, h1, w); edgeOf(cx, y0 + h1 / 2, zc, dep, h1, w); const h2 = h * 0.26, d2 = dep * 0.82, c2 = face + side * (60 + d2 / 2); pushBox(bodies, c2, y0 + h1 + h2 / 2, zc, d2, h2, w * 0.86); edgeOf(c2, y0 + h1 + h2 / 2, zc, d2, h2, w * 0.86); const h3 = h * 0.22, d3 = dep * 0.6, c3 = face + side * (140 + d3 / 2); pushBox(bodies, c3, y0 + h1 + h2 + h3 / 2, zc, d3, h3, w * 0.66); edgeOf(c3, y0 + h1 + h2 + h3 / 2, zc, d3, h3, w * 0.66); }
      else { pushBox(bodies, cx, y0 + h / 2, zc, dep, h, w); edgeOf(cx, y0 + h / 2, zc, dep, h, w); }
      if (z1 > -4600 && type !== 'tower') windows(face, side, z, z1, y0, h);
      if (z1 > -4600 && type === 'tower') windows(face, side, z, z1, y0, h * 0.97, true);
      if (type === 'mall') { pushBox(bodies, face + side * (dep / 2 - 30), y0 + FL * 1.1, zc, dep + 60, FL * 2.2, w + 20); }                 /* wider podium */
      if (type === 'corner') { const r = 190; cyls.push([face + side * r, y0 + h / 2, z1 - r + 6, r, h]); cyls.push([face + side * r, y0 + h / 2, z + r - 6, r, h]); }          /* rounded street corners */
      const top = y0 + h; pushBox(bodies, cx + side * dep * 0.1, top + 60, zc, dep * 0.55, 120, w * 0.6);                                        /* roof plant */
      if (r2() < 0.7) tanks.push([cx + side * dep * 0.25, top + 190, zc + w * 0.2, 70, 200]);
      if (near) {
        facade(face, side, z, z1, y0, h, true);
        if (type === 'pencil') { signColumn(face, side, z + 40, y0, h, 1, 7); signColumn(face, side, z1 - 40, y0, h, 0, 8); acColumn(face, side, zc, y0, h); }
        else if (type === 'mall') { pushBox(panels, face - side * 14, y0 + h * 0.62, zc, 22, h * 0.34, w * 0.76); roofFrame(cx, side, top + 120, zc, w); signColumn(face, side, z + 40, y0, h * 0.6, 2, 2); }
        else if (type === 'screen') { pushBox(panels, face - side * 14, y0 + h * 0.52, zc, 22, h * 0.58, w * 0.82); signColumn(face, side, z + 36, y0, h, 0, 8); signColumn(face, side, z1 - 36, y0, h, 0, 8); }
        else if (type === 'tower') {
          /* the sign tower: the facade is a wall of billboards in a few fixed sizes, three layers of upright signs, a crown on the roof, hanging banners, one LED screen */
          const cols = 3, cw = (w - 40) / cols; let row = 0; for (let yy = y0 + 250; yy < top - 300; yy += 200, row++) for (let cc = 0; cc < cols; cc++) { if ((row * 3 + cc) % 5 === 0) continue; const zz = z + 20 + cc * cw + cw / 2; pbe(panels, face - side * 24, yy + 84, zz, 22, 168, cw * 0.92); }
          for (const [zz, layer] of [[z + 24, 0], [z1 - 24, 1], [zc, 2]]) { const [sw, sh] = SIGN[2]; let yy = y0 + 240; while (yy + sh < top - 140) { pbe(signs, face - side * (62 + layer * 34), yy + sh / 2, zz, 74, sh, sw); yy += sh + 26; } }
          for (let k = 0; k < 3; k++) pushBox(ledBands[k], face - side * 58, y0 + h * 0.42 - 140 + k * 140, zc, 18, 134, w * 0.62); glows.push([face - side * 520, FLOORY + 5, zc, w * 1.4]); roofFrame(cx, side, top + 120, zc, w * 1.04); pbe(panels, cx, top + 470, zc, 22, 340, w * 1.1); pbe(signs, cx, top + 640, zc, 40, 120, w * 0.5);
          for (const zz of [z + w * 0.3, z + w * 0.72]) pbe(panels, face - side * 70, top - 520, zz, 20, 1000, 100);
        }
        else if (type === 'old') { stairs(face, side, zc, y0, h); signColumn(face, side, z + 40, y0, h, 0, 2); roofFrame(cx, side, top + 120, zc, w * 0.9); }
        else if (type === 'fins') { for (let zz = z + 30; zz < z1 - 20; zz += 64) pushBox(fins, face - side * 20, y0 + h * 0.5, zz, 38, h * 0.92, 14); signColumn(face, side, zc, y0, h, 2, 3); }
        else if (type === 'bands') { for (let y = y0 + FL * 3; y < top - 120; y += FL * 3) pushBox(bands, face - side * 28, y, zc, 56, 16, w); acColumn(face, side, z + 60, y0, h); acColumn(face, side, z1 - 60, y0, h); signColumn(face, side, zc, y0, h, 1, 4); }
        else if (type === 'terrace') { signColumn(face, side, z + 40, y0, h * 0.52, 1, 3); acColumn(face, side, zc, y0, h * 0.5); }
        else { signColumn(face, side, z + 36, y0, h, 1, 6); pushBox(panels, face - side * 14, y0 + h * 0.5, zc, 22, h * 0.4, w * 0.6); }
      }
      if (near) { const sx = face - side * 130; for (let k = 0; k < 7; k++) pushBox(boxesS, sx + side * 0, y0 + 56, z + 20 + k * (w - 40) / 7, 52, 112, 60); pushBox(boxesS, face - side * 190, y0 + 46, zc, 14, 92, 60); }
      if (near && type !== 'tower') { signColumn(face, side, z + 30, y0, h, 1, 6); signColumn(face, side, z1 - 30, y0, h, 0, 8); pushBox(panels, face - side * 14, y0 + h * 0.5, zc, 22, h * 0.26, w * 0.66); }
      z -= 8 + r2() * 14; idx++;
    } }
  const inst = (list, mat0, geo, shadow) => { const m = new THREE.InstancedMesh(geo, mat0, list.length), o = new THREE.Object3D(); list.forEach((b, i) => { o.position.set(b[0], b[1], b[2]); o.rotation.set(0, b[6] || 0, 0); o.scale.set(b[3], b[4], b[5]); o.updateMatrix(); m.setMatrixAt(i, o.matrix); }); m.castShadow = shadow; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); return m; };
  const unit = new THREE.BoxGeometry(1, 1, 1); inst(bodies, bMat, unit, true); inst(signs, sMat, unit, true); { const tones = [0, 1, 2].map(() => new THREE.MeshStandardMaterial({ color: 0xc3cddd, roughness: 0.8, emissive: 0x000000 })); themed.push((m) => { [[0xc9d3e2, 0xd7deea, 0xb9c5d8], [0x1b2029, 0x232a35, 0x2c3441]].forEach(() => 0); tones.forEach((t, k) => { t.color.copy(col([0xc9d3e2, 0xd9e0ec, 0xb7c3d6][k], [0x1b2029, 0x242b37, 0x2e3644][k], m)); t.emissive.copy(col(0x000000, 0x8ea2c8, m)); t.emissiveIntensity = [0.1, 0.2, 0.3][k] * m; }); }); [0, 1, 2].forEach((k) => inst(panels.filter((_, i) => i % 3 === k), tones[k], unit, false)); } inst(boxesS, sMat, unit, false); inst(bands, bMat, unit, true); inst(fins, bMat, unit, false); inst(awn, sMat, unit, true); ledBands.forEach((l, k) => inst(l, ledMats[k], unit, false)); inst(wins, wndMat, unit, false); inst(shopf, wndMat, unit, false);
  { const gc = document.createElement('canvas'); gc.width = gc.height = 128; const g = gc.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(190,210,255,.55)'); gr.addColorStop(1, 'rgba(190,210,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const gt = new THREE.CanvasTexture(gc), gmat = new THREE.MeshBasicMaterial({ map: gt, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }); themed.push((m) => { gmat.opacity = 0.5 * m; }); glows.forEach((q) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(q[3] * 1.4, q[3] * 3.2), gmat); p.rotation.x = -Math.PI / 2; p.position.set(q[0], q[1], q[2]); scene.add(p); }); }
  { const ig = new THREE.IcosahedronGeometry(0.5, 1), m = new THREE.InstancedMesh(ig, sMat, trees.length), o = new THREE.Object3D(); trees.forEach((t, i) => { o.position.set(t[0], t[1], t[2]); o.scale.set(t[3], t[3] * 0.9, t[3]); o.updateMatrix(); m.setMatrixAt(i, o.matrix); }); m.castShadow = true; m.frustumCulled = false; scene.add(m); }
  { const cg = new THREE.CylinderGeometry(0.5, 0.5, 1, 28), m = new THREE.InstancedMesh(cg, bMat, cyls.length), o = new THREE.Object3D(); cyls.forEach((q, i) => { o.position.set(q[0], q[1], q[2]); o.scale.set(q[3] * 2, q[4], q[3] * 2); o.updateMatrix(); m.setMatrixAt(i, o.matrix); }); m.castShadow = true; m.frustumCulled = false; scene.add(m); }
  { const cg = new THREE.CylinderGeometry(0.5, 0.5, 1, 14), m = new THREE.InstancedMesh(cg, bMat, tanks.length), o = new THREE.Object3D(); tanks.forEach((t, i) => { o.position.set(t[0], t[1], t[2]); o.scale.set(t[3] * 2, t[4], t[3] * 2); o.updateMatrix(); m.setMatrixAt(i, o.matrix); }); m.castShadow = true; m.frustumCulled = false; scene.add(m); }
  { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(edgePts, 3)); const l = new THREE.LineSegments(g, eMat); l.frustumCulled = false; scene.add(l); }
  /* road, markings, the crimson path line that leads the eye (and the camera) down the street */
  const mhMat = new THREE.MeshStandardMaterial({ color: 0x7f8ca2, roughness: 0.9 });
  { const cu = [], mh = [], jt = []; for (const side of [-1, 1]) for (let z = 2300; z > -9500; z -= 360) cu.push([X0 + side * (innerAt(z - 180) - 120), FLOORY + 9, z - 180, 36, 18, 362]);
    for (let i = 0; i < 26; i++) { const z = 2000 - i * 430, lane = [-1500, -900, -300, 300, 900, 1500][i % 6]; if (Math.abs(lane) < innerAt(z) - 300) mh.push([X0 + lane + 150, FLOORY + 2, z, 80, 3, 80]); }
    for (let z = 2300; z > -9500; z -= 420) { const e = innerAt(z) - 130; jt.push(X0 - e, FLOORY + 1.5, z, X0 + e, FLOORY + 1.5, z); }
    const unit0 = new THREE.BoxGeometry(1, 1, 1); { const m = new THREE.InstancedMesh(unit0, bMat, cu.length), o = new THREE.Object3D(); cu.forEach((b, i) => { o.position.set(b[0], b[1], b[2]); o.scale.set(b[3], b[4], b[5]); o.updateMatrix(); m.setMatrixAt(i, o.matrix); }); m.frustumCulled = false; m.receiveShadow = true; scene.add(m); }
    { const m = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 20), mhMat, mh.length), o = new THREE.Object3D(); mh.forEach((b, i) => { o.position.set(b[0], b[1], b[2]); o.scale.set(b[3], b[4], b[5]); o.updateMatrix(); m.setMatrixAt(i, o.matrix); }); m.frustumCulled = false; scene.add(m); }
    { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(jt, 3)); const l = new THREE.LineSegments(g, eMat); l.frustumCulled = false; scene.add(l); } }
  const road = new THREE.Mesh(new THREE.PlaneGeometry(4900, 12000), roadMat); road.rotation.x = -Math.PI / 2; road.position.set(X0, FLOORY - 1, -3500); road.receiveShadow = true; scene.add(road);
  /* ground beyond the street (under the viaduct arches, to the horizon): the road's own colour, fogged into the sky, so no camera ever sees where the model ends */
  { const gMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 }); const flat = new THREE.Mesh(new THREE.PlaneGeometry(120000, 120000), gMat); flat.rotation.x = -Math.PI / 2; flat.position.set(X0, FLOORY - 4, -3500); flat.receiveShadow = true; scene.add(flat); gMat.color.copy(roadMat.color); themed.push(() => gMat.color.copy(roadMat.color)); }
  { const mk = []; for (let z = 2000; z > -9500; z -= 260) pushBox(mk, X0 + 600, FLOORY + 2, z, 14, 2, 120), pushBox(mk, X0 - 600, FLOORY + 2, z, 14, 2, 120); for (const zc of [1300, -2600, -3100]) for (let x = -2100; x <= 2100; x += 200) pushBox(mk, X0 + x, FLOORY + 2, zc, 110, 2, 480);
    for (const zc of [700, -1900]) for (const lx of [-1500, -900, -300, 300, 900, 1500]) { pushBox(mk, X0 + lx, FLOORY + 2, zc, 26, 2, 260); pushBox(mk, X0 + lx - 34, FLOORY + 2, zc - 150, 24, 2, 100, 0.7); pushBox(mk, X0 + lx + 34, FLOORY + 2, zc - 150, 24, 2, 100, -0.7); }
    inst(mk, markMat, unit, false); }
  const guide = new THREE.Mesh(new THREE.PlaneGeometry(26, 11000), new THREE.MeshBasicMaterial({ color: 0xd6203f })); guide.rotation.x = -Math.PI / 2; guide.position.set(X0, FLOORY + 3, -3500); scene.add(guide);
  /* elevated railway across the street: deep plate girders with rivet rows, brick-arch masonry below (shop fronts in the arches), the one crimson railing, a train */
  let trainG = null;
  { const zc = -500, deckY = FLOORY + 520, L = 11200; const wallH = 440, bay = 700;
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(L, 0); sh.lineTo(L, wallH); sh.lineTo(0, wallH); sh.closePath();
    for (let x = 70; x + bay - 140 < L; x += bay) { const hole = new THREE.Path(), x0 = x, x1 = x + bay - 140, rr0 = (x1 - x0) / 2; hole.moveTo(x0, 0); hole.lineTo(x1, 0); hole.lineTo(x1, 250); hole.absarc(x0 + rr0, 250, rr0, 0, Math.PI, false); hole.lineTo(x0, 0); sh.holes.push(hole); }
    const wg = new THREE.ExtrudeGeometry(sh, { depth: 460, bevelEnabled: false, curveSegments: 10 }); wg.translate(X0 - L / 2, FLOORY, zc - 230);
    const wall = new THREE.Mesh(wg, bMat); wall.castShadow = true; wall.receiveShadow = true; scene.add(wall);
    const shops = []; for (let x = 70; x + bay - 140 < L; x += bay) if (r2() < 0.6 && window.__shops === true) { pushBox(shops, X0 - L / 2 + x + (bay - 140) / 2, FLOORY + 120, zc + 210, bay - 200, 240, 30); pushBox(shops, X0 - L / 2 + x + (bay - 140) / 2, FLOORY + 262, zc + 250, bay - 180, 14, 90); } inst(shops, sMat, unit, false);
    const deck = new THREE.Mesh(unit, bMat); deck.scale.set(L, 70, 520); deck.position.set(X0, deckY - 35, zc); deck.castShadow = true; deck.receiveShadow = true; scene.add(deck);
    for (const zz of [zc - 262, zc + 262]) { const g = new THREE.Mesh(unit, bMat); g.scale.set(L, 190, 26); g.position.set(X0, deckY + 95, zz); g.castShadow = true; scene.add(g); }   /* the plate girders */
    const rp = []; for (const zz of [zc - 276, zc + 276]) { for (let x = -L / 2; x < L / 2; x += 130) rp.push(X0 + x, deckY + 5, zz, X0 + x, deckY + 190, zz); rp.push(X0 - L / 2, deckY + 40, zz, X0 + L / 2, deckY + 40, zz, X0 - L / 2, deckY + 160, zz, X0 + L / 2, deckY + 160, zz); for (let x = -L / 2; x < L / 2; x += 45) rp.push(X0 + x, deckY + 28, zz, X0 + x, deckY + 33, zz, X0 + x, deckY + 168, zz, X0 + x, deckY + 173, zz); }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); const rl0 = new THREE.LineSegments(rg, eMat); rl0.frustumCulled = false; scene.add(rl0);
    const rl = new THREE.Mesh(unit, redMat); rl.scale.set(L, 16, 16); rl.position.set(X0, deckY + 210, zc - 262); scene.add(rl); const rl2 = rl.clone(); rl2.position.z = zc + 262; scene.add(rl2);
    const pie = []; for (let x = -5400; x <= 5400; x += bay) { pushBox(pie, X0 + x, FLOORY + wallH / 2, zc - 200, 90, wallH, 80); pushBox(pie, X0 + x, FLOORY + wallH / 2, zc + 200, 90, wallH, 80); } inst(pie, bMat, unit, true);
    const trMat = new THREE.MeshStandardMaterial({ color: 0x7f8fb5, roughness: 0.7, metalness: 0.05 }); themed.push((m) => trMat.color.copy(col(0x7f8fb5, 0x8190b4, m)));   /* a mid-tone body so the train reads against the pale sky and the white viaduct */
    trainG = new THREE.Group(); for (let k = 0; k < 4; k++) { const car = new THREE.Mesh(unit, trMat); car.scale.set(980, 300, 160); car.position.set(k * 1020, 0, 0); car.castShadow = true; trainG.add(car); const win = new THREE.Mesh(unit, wMat); win.scale.set(900, 34, 154); win.position.set(k * 1020, 30, 0); trainG.add(win); }
    trainG.position.set(X0, deckY + 255, zc);   /* high enough to show above the plate girders from the street */ scene.add(trainG); }
  /* poles and wires along the street, a few across it */
  { const wp = [], poles = []; for (const side of [-1, 1]) for (let z = 1900; z > -9000; z -= 700) { pushBox(poles, X0 + side * (innerAt(z) - 90), FLOORY + 450, z, 24, 900, 24); }
    const cat = (a, b, sag) => { let prev = a; for (let i = 1; i <= 10; i++) { const t = i / 10, p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]; wp.push(...prev, ...p); prev = p; } };
    for (const side of [-1, 1]) for (let z = 1900; z - 700 > -9000; z -= 700) for (const hh of [830, 760, 690]) cat([X0 + side * (innerAt(z) - 90), FLOORY + hh, z], [X0 + side * (innerAt(z - 700) - 90), FLOORY + hh, z - 700], 40);
    for (let z = 1900; z > -9000; z -= 1400) for (const hh of [800, 700]) cat([X0 - (innerAt(z) - 90), FLOORY + hh, z], [X0 + (innerAt(z) - 90), FLOORY + hh, z], 220);
    inst(poles, bMat, unit, false); const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); const wl = new THREE.LineSegments(wg, wMat); wl.frustumCulled = false; scene.add(wl); }
  /* far skyline so the street does not end in nothing */
  const _noop = 0;
  { const far = []; for (let i = 0; i < 26; i++) pushBox(far, X0 + (r2() - 0.5) * 12000, FLOORY + 500 + r2() * 700, -9800 - r2() * 1500, 300 + r2() * 600, 1000 + r2() * 1500, 380); inst(far, bMat, unit, false); }
  /* welcome + location plates, text and logo drawn onto planes */
  const logoImg = new Image(); const plates = [];
  function plate(x, y, z, title, sub, withLogo) { const cv = cnv(1520, 720), t = tex(cv); const m = place(new THREE.Mesh(new THREE.PlaneGeometry(760, 360), mat(t, { depthWrite: true })), x, y, z); plates.push({ cv, t, title, sub, withLogo }); redrawPlate(plates[plates.length - 1]); return m; }
  function redrawPlate(p) { const NIGHT = isDark(), g = p.cv.getContext('2d'); g.fillStyle = NIGHT ? '#1b1f28' : '#ffffff'; g.fillRect(0, 0, 1520, 720); g.fillStyle = NIGHT ? '#3b4456' : '#aab3c2'; g.fillRect(0, 0, 14, 720);
    if (p.withLogo && logoImg.complete && logoImg.naturalWidth) g.drawImage(logoImg, 100, 90, 1000, 424); else if (p.title) { g.fillStyle = NIGHT ? '#f3f5f9' : '#14161a'; g.font = '800 190px "Segoe UI",sans-serif'; g.fillText(p.title, 100, 300); }
    g.fillStyle = NIGHT ? '#8d95a3' : '#6d7480'; g.font = '500 52px "Segoe UI","Microsoft YaHei UI",sans-serif'; g.fillText(p.sub || '', 104, 640); p.t.needsUpdate = true; }
  logoImg.onload = () => plates.forEach(redrawPlate); logoImg.src = 'logos/logo-C-' + (NIGHT ? 'white' : 'black') + '.svg'; let plateDark = NIGHT;
  const copy = window.SceneCopy || { welcomeSub: '先把东西备齐', locSub: '你想装在哪儿' };
  

  /* ---- the glass plates ---- */
  const etchImg = new Image(), etchTexs = []; let shards = [], LWg = 840, LHg = 356, built = false, cells = null;
  const TH = 15;
  function makeEtchTextures() {
    const W = 2048, H = Math.round(2048 * LHg / LWg), a = cnv(W, H), ag = a.getContext('2d'); ag.drawImage(etchImg, 0, 0, W, H);
    const b = cnv(W / 2, H / 2), bgc = b.getContext('2d'); bgc.fillStyle = '#000'; bgc.fillRect(0, 0, W / 2, H / 2); bgc.filter = 'blur(5px)'; bgc.drawImage(a, 0, 0, W / 2, H / 2);
    const alpha = new THREE.CanvasTexture(a), bump = new THREE.CanvasTexture(b); alpha.colorSpace = THREE.SRGBColorSpace; return { alpha, bump };
  }
  const glowFrag = `uniform sampler2D map; uniform vec4 box; uniform float prog; uniform float lit; uniform float time; uniform float uGain; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main(){ float a = texture2D(map, vUv).g; float lx = (vUv.x - box.x) / max(0.0001, box.z - box.x);
      float front = smoothstep(prog + 0.07, prog - 0.03, lx) * step(0.0005, prog);
      float edge = exp(-abs(lx - prog) * 16.0) * step(0.0005, prog) * (1.0 - lit);
      float grain = 1.0;
      float g = (front * 0.34 + edge * 0.9 + lit * (0.32 + 0.05 * sin(time * 2.0))) * a * grain * uGain;
      gl_FragColor = vec4(vec3(0.80, 0.90, 1.0) * g, g); }`;
  function buildShards() {
    const E = window.SceneCells; if (!E || !etchImg.complete || !etchImg.naturalWidth) return; cells = E.cells; LWg = E.LW; LHg = E.LH;
    const { alpha, bump } = makeEtchTextures();
    cells.forEach((q, i) => {
      const pts = q.p.map((v) => new THREE.Vector2(v[0] - q.cx, -(v[1] - q.cy))); const shape = new THREE.Shape(pts);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: TH, bevelEnabled: true, bevelThickness: 2.6, bevelSize: 2.6, bevelOffset: -2.6, bevelSegments: 2, steps: 1, curveSegments: 1 }); geo.translate(0, 0, -TH / 2);
      const glass = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.04, transmission: TRANS, thickness: 22, ior: 1.52, attenuationColor: new THREE.Color(0xb9ecdd), attenuationDistance: 420, depthWrite: false, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: NIGHT ? 1.6 : 1.1, specularIntensity: 1 }));
      const g = new THREE.Group(); g.add(glass);
      /* frost: three translucent layers at different depths inside the plate, bumped, so the etching has volume */
      const mk = () => { const sg = new THREE.ShapeGeometry(shape); const pos = sg.attributes.position, uv = sg.attributes.uv; for (let k = 0; k < pos.count; k++) { uv.setXY(k, (pos.getX(k) + q.cx) / LWg, 1 - (q.cy - pos.getY(k)) / LHg); } uv.needsUpdate = true; return sg; };
      (MODE === 'B' ? [] : [[-4.2, 0.16], [0, 0.26], [4.2, 0.18]]).forEach(([z, op]) => { const m = new THREE.Mesh(mk(), new THREE.MeshStandardMaterial({ color: NIGHT ? 0xe6eefb : 0xc4cfde, alphaMap: alpha, transparent: true, opacity: op, roughness: 1, metalness: 0, bumpMap: bump, bumpScale: 14, depthWrite: false, envMapIntensity: 0.4 })); m.position.z = z; m.renderOrder = 2; g.add(m); });
      const glowMat = new THREE.ShaderMaterial({ uniforms: { map: { value: alpha }, box: { value: new THREE.Vector4(q.x0 / LWg, 0, (q.x0 + q.w) / LWg, 1) }, prog: { value: 0 }, lit: { value: 0 }, time: { value: 0 }, uGain: { value: NIGHT ? 1 : 0.5 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: glowFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const glow = new THREE.Mesh(mk(), glowMat); glow.visible = MODE !== 'B';
      if (MODE === 'B') { const gp = geo.attributes.position, gu = geo.attributes.uv; for (let k = 0; k < gp.count; k++) gu.setXY(k, (gp.getX(k) + q.cx) / LWg, 1 - (q.cy - gp.getY(k)) / LHg); gu.needsUpdate = true; glass.material.bumpMap = bump; glass.material.bumpScale = 30; glass.material.needsUpdate = true; } glow.position.z = 0.4; glow.renderOrder = 3; g.add(glow);
      const ring = [...pts, pts[0]].map((p) => new THREE.Vector3(p.x, p.y, TH / 2 + 0.3)); const edgeMat = new THREE.LineBasicMaterial({ color: 0xdceaff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ring), edgeMat); line.renderOrder = 3; g.add(line);
      scene.add(g); shards.push({ g, glow: glowMat, line: edgeMat, glass });
    }); built = true;
  }
  etchImg.onload = () => { if (MODE === 'B') { buildShards(); GL.draw(); } }; etchImg.src = MODE === 'B' ? 'logos/logo-sil.svg' : 'logos/logo-etch.svg';

  const silImg = new Image(); let frags = [], fragBuilt = false, byArea = [], FU = 1, FMW = 1024, FMH = 434;
  /* contour of a pixel set: boundary pixel edges linked into loops, RDP-simplified and softened once (so the cut has no stair-steps) */
  function rdp(pts, tol) { if (pts.length < 4) return pts; const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
    while (st.length) { const [a, b] = st.pop(); let md = 0, mi = -1; const ax = pts[a][0], ay = pts[a][1], bx = pts[b][0], by = pts[b][1], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
      for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L; if (d > md) { md = d; mi = i; } } if (md > tol && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
    return pts.filter((_, i) => keep[i]); }
  const chaikin = (p) => { const o = []; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } return o; };
  const area2 = (p) => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
  const inPoly = (pt, p) => { let r = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if (((p[i][1] > pt[1]) !== (p[j][1] > pt[1])) && (pt[0] < (p[j][0] - p[i][0]) * (pt[1] - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0])) r = !r; return r; };
  function loopsOf(pix, W, lab, id) {
    const edges = new Map(), add = (x0, y0, x1, y1) => { const k = x0 + ',' + y0; (edges.get(k) || edges.set(k, []).get(k)).push([x1, y1, false]); };
    for (const p of pix) { const x = p % W, y = (p / W) | 0, same = (xx, yy) => lab[yy * W + xx] === id;
      if (y === 0 || !same(x, y - 1)) add(x, y, x + 1, y); if (x === W - 1 || !same(x + 1, y)) add(x + 1, y, x + 1, y + 1); if (!same(x, y + 1)) add(x + 1, y + 1, x, y + 1); if (x === 0 || !same(x - 1, y)) add(x, y + 1, x, y); }
    const loops = []; for (const [k, arr] of edges) for (const e of arr) { if (e[2]) continue; const [sx, sy] = k.split(',').map(Number); const pts = []; let cx = sx, cy = sy, cur = e, dx = e[0] - sx, dy = e[1] - sy; e[2] = true; pts.push([cx, cy]); cx = e[0]; cy = e[1];
      for (let guard = 0; guard < 100000; guard++) { if (cx === sx && cy === sy) break; pts.push([cx, cy]); const outs = (edges.get(cx + ',' + cy) || []).filter((q) => !q[2]); if (!outs.length) break; const pref = [[-dy, dx], [dx, dy], [dy, -dx]]; let pick = null;
        for (const [px, py] of pref) { pick = outs.find((q) => q[0] - cx === px && q[1] - cy === py); if (pick) break; } pick = pick || outs[0]; pick[2] = true; dx = pick[0] - cx; dy = pick[1] - cy; cx = pick[0]; cy = pick[1]; }
      if (pts.length > 3) loops.push(pts); }
    return loops; }
  function buildFragments() {
    if (!silImg.complete || !silImg.naturalWidth) return; const MW = FMW, MH = FMH, cv = cnv(MW, MH), g = cv.getContext('2d'); g.drawImage(silImg, 0, 0, MW, MH); const d = g.getImageData(0, 0, MW, MH).data;
    const mask = new Uint8Array(MW * MH); for (let i = 0; i < MW * MH; i++) { const x = i % MW, y = (i / MW) | 0, lum = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2], hat = x < MW * 0.5 && y < MH * 0.38; mask[i] = d[i * 4 + 3] > 110 && (lum >= 66 || hat) ? 1 : 0; }   /* keep the lettering, the flare, the ring and the hat; drop the dark shadow mass under the letters */
    let sd = 31; const rr = () => (sd = (sd * 16807) % 2147483647) / 2147483647, seeds = [], radii = [], cls = [];
    for (let i = 0; i < 128; i++) { const u = rr(); cls.push(u < 0.1 ? 62 + rr() * 30 : u < 0.42 ? 30 + rr() * 16 : 11 + rr() * 9); } cls.sort((a, b) => b - a);
    for (const r0 of cls) { let r = r0, ok = false; for (let k = 0; k < 600 && !ok; k++) { if (k % 80 === 79) r *= 0.88; const x = rr() * MW, y = rr() * MH; if (!mask[(y | 0) * MW + (x | 0)]) continue; if (seeds.every((q, j) => Math.hypot(x - q[0], y - q[1]) >= (r + radii[j]) * 0.5)) { seeds.push([x, y]); radii.push(r); ok = true; } } }
    const lab = new Int32Array(MW * MH).fill(-1), cell = new Int16Array(MW * MH).fill(-1);
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) { if (!mask[y * MW + x]) continue; let b = 0, bd = 1e9; for (let k = 0; k < seeds.length; k++) { const dx = x - seeds[k][0], dy = y - seeds[k][1]; const dd = dx * dx + dy * dy * 1.0 + 6 * Math.sin(x * 0.07 + y * 0.05 + k); if (dd < bd) { bd = dd; b = k; } } cell[y * MW + x] = b; }
    let nextId = 0; const comps = []; const stack = [];
    for (let s0 = 0; s0 < MW * MH; s0++) { if (cell[s0] < 0 || lab[s0] >= 0) continue; const id = nextId++, pix = [], cl = cell[s0]; stack.push(s0); lab[s0] = id;
      while (stack.length) { const p = stack.pop(); pix.push(p); const x = p % MW, y = (p / MW) | 0; for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) { if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue; const q = ny * MW + nx; if (cell[q] === cl && lab[q] < 0) { lab[q] = id; stack.push(q); } } }
      if (pix.length >= 26) comps.push({ id, pix }); }
    for (const cp of comps) {
      const loops = loopsOf(cp.pix, MW, lab, cp.id).map((l) => { let p = rdp(l, 1.0); p = chaikin(p); p = rdp(p, 0.5); return p; }).filter((l) => l.length > 2 && Math.abs(area2(l)) > 6);
      if (!loops.length) continue; loops.sort((a, b) => Math.abs(area2(b)) - Math.abs(area2(a))); const sign = Math.sign(area2(loops[0])), outers = loops.filter((l) => Math.sign(area2(l)) === sign), holes = loops.filter((l) => Math.sign(area2(l)) !== sign);
      const xs = loops[0].map((p) => p[0]), ys = loops[0].map((p) => p[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2, T = (p) => new THREE.Vector2(p[0] - cx, -(p[1] - cy));
      outers.forEach((o) => { const shape = new THREE.Shape(o.map(T)); holes.forEach((h) => { if (inPoly(h[0], o)) shape.holes.push(new THREE.Path(h.map(T))); }); frags.push({ shape, cx, cy, area: Math.abs(area2(o)), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }); });
    }
    frags.sort((a, b) => a.cx - b.cx); const K = frags.length; FU = (window.SceneCells ? window.SceneCells.LW : 860) / MW; const LW = MW * FU, LH = MH * FU;
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.02, transmission: TRANS, thickness: 20, ior: 1.52, dispersion: 0.6, attenuationColor: new THREE.Color(0xcdeee5), attenuationDistance: 1500, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: NIGHT ? 1.8 : 1.25, specularIntensity: 1, depthWrite: false });
    const ghostMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: NIGHT ? 0.05 : 0.14, depthWrite: false });
    frags.forEach((f, i) => {
      const geo = new THREE.ExtrudeGeometry(f.shape, { depth: 18, bevelEnabled: true, bevelThickness: 2.6, bevelSize: 2.2, bevelOffset: -2.2, bevelSegments: 2, curveSegments: 1 }); geo.translate(0, 0, -9);
      const g3 = new THREE.Group(), glass = new THREE.Mesh(geo, glassMat), ghost = new THREE.Mesh(new THREE.ShapeGeometry(f.shape, 1), ghostMat);
      const edgeMat = new THREE.LineBasicMaterial({ color: NIGHT ? 0xe6f1ff : 0x222b3a, transparent: true, opacity: 0.1, blending: NIGHT ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false });
      const ring = (pts) => new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, p.y, 9.6))), edgeMat);
      const line = ring(f.shape.getPoints()); const lines = [line]; f.shape.holes.forEach((h) => lines.push(ring(h.getPoints())));
      const glowMat = new THREE.MeshBasicMaterial({ color: 0xdbe9ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), glow = new THREE.Mesh(new THREE.ShapeGeometry(f.shape, 1), glowMat); glow.position.z = 0.5;
      glass.renderOrder = 1; ghost.renderOrder = 0; glow.renderOrder = 3; lines.forEach((l) => { l.renderOrder = 3; g3.add(l); }); g3.add(glass, ghost, glow); scene.add(g3);
      const dpt = 420 + Math.pow(rr(), 1.15) * 6200, k = (dpt + P) / P;
      Object.assign(f, { g3, glass, ghost, edgeMat, glowMat, d: dpt, k, X: FINAL.cx + ((f.cx - MW / 2) * FU) * k, Y: FINAL.cy + ((f.cy - MH / 2) * FU + LCYg) * k, Z: FINAL.cz - dpt,
        rx: (rr() < 0.5 ? -1 : 1) * (30 + rr() * 55), ry: (rr() < 0.5 ? -1 : 1) * (30 + rr() * 55), rz: (rr() - 0.5) * 120, ph: rr() * 6.28, amp: 24 + rr() * 80, spin: 0.1 + rr() * 0.25 });
    });
    byArea = frags.map((_, i) => i).sort((a, b) => frags[b].area - frags[a].area); fragBuilt = true;
  }
  const FINAL = { cx: 3300, cy: -260, cz: -2800 }, LCYg = -30;
  /* ---------- merged mode: one cracked pane (radial + ring cracks), every plate is thick clear glass with the logo as a clear relief inside ---------- */
  const clipHalf = (poly, a, b, c0) => { const out = []; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length], fp = a * p[0] + b * p[1] - c0, fq = a * q[0] + b * q[1] - c0; if (fp <= 0) out.push(p); if ((fp <= 0) !== (fq <= 0)) { const t = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); } } return out; };
  const edgeMats = []; let gplates = [], merged = false, reliefTex = null, maskTex = null; const MX = 36, MY = 32;
  function buildMerged() {
    if (!silImg.complete || !silImg.naturalWidth) return; const MW = FMW, MH = FMH, RW = MW + 2 * MX, RH = MH + 2 * MY, S2 = 3;
    const DARK = [[48, 25, 25], [68, 41, 42], [122, 31, 43]], keepPx = (r, g, b, a, x, y) => { if (a <= 110) return false; if (x < MW * 0.52 && y < MH * 0.42) return true; let bd = 1e9, di = false; for (let k = 0; k < 3; k++) { const d = (r - DARK[k][0]) ** 2 + (g - DARK[k][1]) ** 2 + (b - DARK[k][2]) ** 2; if (d < bd) { bd = d; di = true; } } const others = [[215, 144, 86], [237, 181, 110], [241, 224, 210], [244, 203, 142], [178, 39, 48], [208, 91, 52]]; for (const o of others) { const d = (r - o[0]) ** 2 + (g - o[1]) ** 2 + (b - o[2]) ** 2; if (d < bd) { bd = d; di = false; } } return !di; };
    const oc = cnv(MW, MH), og = oc.getContext('2d'); og.drawImage(silImg, 0, 0, MW, MH); const od = og.getImageData(0, 0, MW, MH).data;
    const mk = cnv(RW * S2, RH * S2), mg = mk.getContext('2d'); mg.fillStyle = '#000'; mg.fillRect(0, 0, mk.width, mk.height);
    const lc = cnv(MW, MH), lg = lc.getContext('2d'), li = lg.createImageData(MW, MH);
    for (let i = 0; i < MW * MH; i++) { const x = i % MW, y = (i / MW) | 0, on = keepPx(od[i * 4], od[i * 4 + 1], od[i * 4 + 2], od[i * 4 + 3], x, y); li.data[i * 4] = li.data[i * 4 + 1] = li.data[i * 4 + 2] = 255; li.data[i * 4 + 3] = on ? 255 : 0; }
    lg.putImageData(li, 0, 0); mg.drawImage(lc, MX * S2, MY * S2, MW * S2, MH * S2);
    /* relief: signed distance to the stroke edge (float, two chamfer passes), a smooth bevel profile, normals from its gradient */
    { const W = mk.width, H = mk.height, md = mk.getContext('2d').getImageData(0, 0, W, H).data, N0 = W * H, inside = new Float32Array(N0), outside = new Float32Array(N0), BIG = 1e6;
      for (let i = 0; i < N0; i++) { const on = md[i * 4] > 128; inside[i] = on ? BIG : 0; outside[i] = on ? 0 : BIG; }
      const chamfer = (d) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; let v = d[i]; if (x > 0) v = Math.min(v, d[i - 1] + 1); if (y > 0) { v = Math.min(v, d[i - W] + 1); if (x > 0) v = Math.min(v, d[i - W - 1] + 1.414); if (x < W - 1) v = Math.min(v, d[i - W + 1] + 1.414); } d[i] = v; }
        for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; let v = d[i]; if (x < W - 1) v = Math.min(v, d[i + 1] + 1); if (y < H - 1) { v = Math.min(v, d[i + W] + 1); if (x < W - 1) v = Math.min(v, d[i + W + 1] + 1.414); if (x > 0) v = Math.min(v, d[i + W - 1] + 1.414); } d[i] = v; } };
      chamfer(inside); chamfer(outside);
      const hgt = new Float32Array(N0), ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
      for (let i = 0; i < N0; i++) { const sd = inside[i] > 0 ? inside[i] : -outside[i]; hgt[i] = ss(-9, 24, sd); }
      const nc = cnv(W, H), ng = nc.getContext('2d'), ni = ng.createImageData(W, H), at = (x, y) => hgt[Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x))];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const dx = at(x + 1, y) - at(x - 1, y), dy = at(x, y + 1) - at(x, y - 1); const nx = -dx * 16, ny = dy * 16, nz = 1, L = Math.hypot(nx, ny, nz), o = (y * W + x) * 4; ni.data[o] = (nx / L * 0.5 + 0.5) * 255; ni.data[o + 1] = (ny / L * 0.5 + 0.5) * 255; ni.data[o + 2] = (nz / L * 0.5 + 0.5) * 255; ni.data[o + 3] = 255; }
      ng.putImageData(ni, 0, 0); reliefTex = new THREE.CanvasTexture(nc); reliefTex.anisotropy = 16; maskTex = new THREE.CanvasTexture(mk); maskTex.colorSpace = THREE.SRGBColorSpace; }
        /* crack pattern: rays and rings around an impact point, boundaries wobbled so no crack is a straight ruler line */
    let sd = 47; const rr = () => (sd = (sd * 16807) % 2147483647) / 2147483647, C0 = [MW * 0.47, MH * 0.5], rad = [0, 50, 120, 215, 330, 460, 600], cnt = [5, 8, 10, 11, 9, 8];
    const wob = (k, th) => 1 + 0.11 * Math.sin(3 * th + k * 1.7) + 0.06 * Math.sin(7 * th + k * 2.9) + 0.04 * Math.sin(13 * th + k);
    const clipRect = (poly) => { let p = poly; p = clipHalf(p, -1, 0, MX); p = clipHalf(p, 1, 0, MW + MX); p = clipHalf(p, 0, -1, MY); p = clipHalf(p, 0, 1, MH + MY); return p; };
    const cellsP = []; for (let k = 0; k < 6; k++) { const n = cnt[k], off = rr() * 6.28; const ang = Array.from({ length: n }, (_, i) => off + (i + (rr() - 0.5) * 0.7) * 6.2832 / n).sort((a, b) => a - b);
      for (let i = 0; i < n; i++) { const a0 = ang[i], a1 = i + 1 < n ? ang[i + 1] : ang[0] + 6.2832, pts = [], st = Math.max(2, Math.ceil((a1 - a0) / 0.12));
        for (let s = 0; s <= st; s++) { const th = a0 + (a1 - a0) * s / st, r = rad[k + 1] * wob(k + 1, th); pts.push([C0[0] + r * Math.cos(th), C0[1] + r * Math.sin(th)]); }
        if (k === 0) pts.push([C0[0], C0[1]]); else for (let s = st; s >= 0; s--) { const th = a0 + (a1 - a0) * s / st, r = rad[k] * wob(k, th); pts.push([C0[0] + r * Math.cos(th), C0[1] + r * Math.sin(th)]); }
        const q = clipRect(pts); if (q.length >= 3 && Math.abs(area2(q)) > 220) cellsP.push(q); } }
    /* some of the big ones split again along a random line, a few splinters and dust around the pane */
    const out = []; const cut = (q) => { const g = q.reduce((a, p) => [a[0] + p[0] / q.length, a[1] + p[1] / q.length], [0, 0]), th = rr() * 3.14, nx = Math.cos(th), ny = Math.sin(th), c0 = nx * g[0] + ny * g[1]; return [clipHalf(q, nx, ny, c0), clipHalf(q, -nx, -ny, -c0)]; };
    cellsP.forEach((q) => { if (Math.abs(area2(q)) > 38000 && rr() < 0.6) { const [a, b] = cut(q); [a, b].forEach((z) => { if (z.length >= 3 && Math.abs(area2(z)) > 220) out.push(z); }); } else out.push(q); });
    const maskAt = (x, y) => { const xi = Math.round(x), yi = Math.round(y); if (xi < 0 || yi < 0 || xi >= MW || yi >= MH) return false; const k = (yi * MW + xi) * 4; return keepPx(od[k], od[k + 1], od[k + 2], od[k + 3], xi, yi); };
    const carries = (q) => { const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]); let hit = 0; for (let y = Math.min(...ys); y <= Math.max(...ys); y += 7) for (let x = Math.min(...xs); x <= Math.max(...xs); x += 7) if (inPoly([x, y], q) && maskAt(x, y)) hit++; return hit; };
    const kept = out.filter((q) => carries(q) >= 3).map((q) => { const g = q.reduce((a, p) => [a[0] + p[0] / q.length, a[1] + p[1] / q.length], [0, 0]); return q.map((p) => [g[0] + (p[0] - g[0]) * 0.88, g[1] + (p[1] - g[1]) * 0.88]); }); out.length = 0; out.push(...kept);
    const nCore = out.length; for (let i = 0; i < 16; i++) { const g = [rr() * (MW + 80) - 40, rr() * (MH + 60) - 30], s = 14 + rr() * 34, a = rr() * 6.28; out.push([[g[0], g[1]], [g[0] + s * Math.cos(a), g[1] + s * Math.sin(a)], [g[0] + s * 0.4 * Math.cos(a + 2.2), g[1] + s * 0.4 * Math.sin(a + 2.2)]]); }
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.012, transmission: TRANS, thickness: 26, ior: 1.52, dispersion: 0.7, attenuationColor: new THREE.Color(0xa9e6d8), attenuationDistance: 900, clearcoat: 1, clearcoatRoughness: 0.015, envMapIntensity: NIGHT ? 1.5 : 1.7, specularIntensity: 1, depthWrite: false, normalMap: reliefTex });
    FU = (window.SceneCells ? window.SceneCells.LW : 860) / MW;
    out.forEach((q, idx) => {
      const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, T = (p) => new THREE.Vector2(p[0] - cx, -(p[1] - cy));
      const shape = new THREE.Shape(q.map(T)); const geo = new THREE.ExtrudeGeometry(shape, { depth: 26, bevelEnabled: true, bevelThickness: 3.2, bevelSize: 2.8, bevelOffset: -2.8, bevelSegments: 2, curveSegments: 1 }); geo.translate(0, 0, -13);
      const gp = geo.attributes.position, gu = geo.attributes.uv; for (let k = 0; k < gp.count; k++) gu.setXY(k, (gp.getX(k) + cx + MX) / RW, 1 - (cy - gp.getY(k) + MY) / RH); gu.needsUpdate = true;
      const mat = Q.get('flat') === '1' ? new THREE.MeshBasicMaterial({ color: 0xffffff, alphaMap: maskTex, transparent: true }) : glassMat.clone(); if (mat.normalScale) mat.normalScale = new THREE.Vector2(0.2, 0.2); const glass = new THREE.Mesh(geo, mat); glass.renderOrder = 1; glass.castShadow = true;
      const sg = new THREE.ShapeGeometry(shape, 1), sp = sg.attributes.position, su = sg.attributes.uv; for (let k = 0; k < sp.count; k++) su.setXY(k, (sp.getX(k) + cx + MX) / RW, 1 - (cy - sp.getY(k) + MY) / RH); su.needsUpdate = true;
      const glowMat = new THREE.ShaderMaterial({ uniforms: { map: { value: maskTex }, box: { value: new THREE.Vector4((x0 + MX) / RW, 0, (x1 + MX) / RW, 1) }, prog: { value: 0 }, lit: { value: 0 }, time: { value: 0 }, uGain: { value: 1 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: glowFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const glow = new THREE.Mesh(sg, glowMat); glow.position.z = 0.6; glow.renderOrder = 3;
      const edgeMat = new THREE.LineBasicMaterial({ color: 0xe9f2ff, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false }); edgeMats.push(edgeMat); const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(shape.getPoints().map((p) => new THREE.Vector3(p.x, p.y, 13.4))), edgeMat); line.renderOrder = 3;
      const ghost = new THREE.Mesh(new THREE.ShapeGeometry(shape, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: NIGHT ? 0.035 : 0.1, depthWrite: false })); ghost.renderOrder = 0;
      line.visible = false; const g3 = new THREE.Group(); g3.add(glass, ghost, glow, line); scene.add(g3);
      const core = idx < nCore, dpt = core ? 900 + Math.pow(rr(), 1.1) * 2700 : 700 + rr() * 2900, k = (dpt + P) / P;
      gplates.push({ g3, glass, ghost, glowMat, edgeMat, mat, core, area: Math.abs(area2(q)), w: x1 - x0, h: y1 - y0, cx, cy, d: dpt, k, thr: rr(), X: FINAL.cx + ((cx - MW / 2) * FU) * k, Y: FINAL.cy + ((cy - MH / 2) * FU + LCYg) * k, Z: FINAL.cz - dpt,
        rx: (rr() < 0.5 ? -1 : 1) * (28 + rr() * 58), ry: (rr() < 0.5 ? -1 : 1) * (28 + rr() * 58), rz: (rr() - 0.5) * 130, ph: rr() * 6.28, amp: 24 + rr() * 90, spin: 0.1 + rr() * 0.25 });
    });
    gplates.filter((p) => p.core).sort((a, b) => a.cx - b.cx).forEach((p, i) => { p.order = i; }); byArea = gplates.map((_, i) => i).sort((a, b) => gplates[b].area - gplates[a].area); merged = true;
  }
  silImg.onload = () => { if (MODE === 'M') { buildMerged(); GL.draw(); } if (MODE === 'A') { buildFragments(); GL.draw(); } }; silImg.src = 'logos/logo-orig.svg';

  /* ---- API used by scene.js ---- */
  /* motion phase of the floating glass: normally the clock; in a pre-rendered loop one full cycle (window.__loopPhi, 0..2pi) starting from the clock value the transition before it ended on (window.__loopBase) */
  const GLASS_SLOW = window.__glassSlow === undefined ? 1 : window.__glassSlow;   /* pre-render: floating and spinning glass at ~0.4x for a slow, weightless feel */
  const FTc = (c, ft) => window.__loopPhi !== undefined ? c * GLASS_SLOW * window.__loopBase + window.__loopPhi * (c > 0.55 ? 2 : 1) : ft * c * GLASS_SLOW;
  const GL = {
    ok: true, THREE, scene, camera, renderer,
    setCamera(c, bx, by) {
      camera.position.set(c.cx + (bx || 0), -(c.cy + (by || 0)), c.cz); camera.rotation.set(-c.rx * D2R, -c.ry * D2R, c.rz * D2R, 'YXZ'); camera.translateZ(P); camera.updateMatrixWorld(true);
    },
    update(frames, m) {
      if (trainG) trainG.position.x = window.__trainOff !== undefined ? X0 + window.__trainOff : X0 - 6400 + ((m.t || 0) * 520) % 12800;
      if (MODE === 'M') { if (!merged) buildMerged(); if (!merged) return; const s = m.s, N = s.st.length, cores = gplates.filter((p) => p.core), K = cores.length, br = REDUCE ? 0 : 1, ft = m.t * br, damp = 1 - m.reveal, kk = 1 - m.reveal, prog = m.prog || 0;
        gplates.forEach((p) => { let f = 0, lit = 0, fl = 0;
          if (p.core) { const a = Math.floor(p.order * N / K), b = Math.max(a + 1, Math.floor((p.order + 1) * N / K)); let sum = 0, dn = 0, mx = 0; for (let i = a; i < b; i++) { const st = s.st[i]; if (st === 2) { sum += 1; dn++; mx = Math.max(mx, s.doneAt[i] || 0); } else if (st === 1 || st === 3) sum += s.fr[i]; } f = sum / (b - a); lit = dn === b - a ? 1 : 0; fl = lit ? Math.max(0, 1 - (m.t - mx) / 0.9) : 0; }
          else { lit = prog > p.thr ? 1 : 0; f = lit; }
          const ox = Math.sin(FTc(0.5, ft) + p.ph) * p.amp * damp * br, oy = Math.cos(FTc(0.4, ft) + p.ph) * p.amp * damp * br, oz = Math.sin(FTc(0.6, ft) + p.ph * 2) * p.amp * 2 * damp * br;
          p.g3.position.set(p.X + ox, -(p.Y + oy), p.Z + oz); p.g3.rotation.set(-(p.rx + Math.sin(FTc(p.spin, ft) + p.ph) * 8 * br) * kk * D2R, (p.ry + Math.cos(FTc(p.spin, ft) + p.ph) * 8 * br) * kk * D2R, -p.rz * kk * D2R, 'ZYX'); p.g3.scale.setScalar(p.k * FU);
          const inten = lit ? 1 : f > 0 ? 0.3 + 0.7 * f : 0.16; if (p.mat.normalScale) p.mat.normalScale.set(1.5 * inten, 1.5 * inten); p.ghost.visible = !lit && f <= 0;
          p.glowMat.uniforms.prog.value = f; p.glowMat.uniforms.lit.value = p.core ? lit : 0; p.glowMat.uniforms.time.value = m.t; p.glowMat.uniforms.uGain.value = p.core ? (m.reveal > 0.5 ? 0.55 : 1) : 0;
          p.edgeMat.opacity = lit ? (m.reveal > 0.5 ? 0.22 : 0.5) : f > 0 ? 0.18 + 0.4 * f : 0.05; });
         return; }
      if (MODE === 'A') { if (!fragBuilt) buildFragments(); if (!fragBuilt) return; const s = m.s, N = s.st.length, K = frags.length, br = REDUCE ? 0 : 1, ft = m.t * br, damp = 1 - m.reveal, kk = 1 - m.reveal;
        frags.forEach((f, i) => { const seg = Math.min(N - 1, Math.floor(i * N / K)), st = s.st[seg], fr = st === 2 ? 1 : (st === 1 || st === 3 ? s.fr[seg] : 0), lit = st === 2 ? 1 : 0;
          const ox = Math.sin(ft * 0.5 + f.ph) * f.amp * damp * br, oy = Math.cos(ft * 0.4 + f.ph) * f.amp * damp * br, oz = Math.sin(ft * 0.6 + f.ph * 2) * f.amp * 2 * damp * br;
          f.g3.position.set(f.X + ox, -(f.Y + oy), f.Z + oz); f.g3.rotation.set(-(f.rx + Math.sin(ft * f.spin + f.ph) * 8 * br) * kk * D2R, (f.ry + Math.cos(ft * f.spin + f.ph) * 8 * br) * kk * D2R, -f.rz * kk * D2R, 'ZYX'); f.g3.scale.setScalar(f.k * FU);
          const on = fr > 0 || lit; f.glass.visible = on; f.ghost.visible = !on;
          const fl = lit ? Math.max(0, 1 - (m.t - (s.doneAt[seg] || 0)) / 0.9) : 0;
          f.edgeMat.opacity = lit ? (m.reveal > 0.5 ? 0.42 : 0.95) : fr > 0 ? 0.3 + 0.6 * fr : 0.08; f.glowMat.opacity = lit ? 0.06 + 0.5 * fl : fr * 0.05; });
         return; }
      if (!built) buildShards(); if (!built) return;
      frames.forEach((f, i) => { const s = shards[i]; if (!s || !f) return; s.g.position.set(f.x, -f.y, f.z); s.g.rotation.set(-f.rx * D2R, f.ry * D2R, -f.rz * D2R, 'ZYX'); s.g.scale.setScalar(f.s);
        s.glow.uniforms.prog.value = f.f; s.glow.uniforms.lit.value = f.lit; s.glow.uniforms.time.value = m.t; s.line.opacity = Math.min(1, f.f * 0.5 + f.lit * 0.5) * (m.reveal > 0.5 ? 0.35 : 1);
        s.glass.material.thickness = 22; });
      bandTex.offset.y = REDUCE ? 0 : -((m.t || 0) * 1.3);
    },
    pose(i) { if (MODE === 'M') { const p = gplates[byArea[i]]; return p ? { x: p.g3.position.x, y: -p.g3.position.y, z: p.g3.position.z, s: p.k * FU, w: p.w, h: p.h } : null; } if (MODE === 'A') { const f = frags[byArea[i]]; return f ? { x: f.g3.position.x, y: -f.g3.position.y, z: f.g3.position.z, s: f.k * FU, w: f.w, h: f.h } : null; } const s = shards[i]; return s ? { x: s.g.position.x, y: -s.g.position.y, z: s.g.position.z, s: s.g.scale.x, w: cells[i].w, h: cells[i].h } : null; },
    draw() { try { renderer.render(scene, camera); } catch (e) { /* context lost: the DOM fallback is hidden, nothing else to do */ } },
    onResize: resize
  };
  function applyTheme(m) { night = m; const d = m > 0.5;
    themed.forEach((f) => f(m)); scene.environment = d ? envNight : envDay;
    lineMats.forEach((x) => x.color.copy(col(0x1c212b, 0xeaf2ff, m)));
    edgeMats.forEach((x) => { x.blending = d ? THREE.AdditiveBlending : THREE.NormalBlending; x.color.copy(col(0x24324f, 0xe9f2ff, m)); x.needsUpdate = true; });
    gplates.forEach((p) => { p.mat.envMapIntensity = 1.7 + (1.5 - 1.7) * m; p.ghost.material.opacity = 0.12 + (0.035 - 0.12) * m; });
    if (plateDark !== d) { plateDark = d; logoImg.src = 'logos/logo-C-' + (d ? 'white' : 'black') + '.svg'; plates.forEach(redrawPlate); } }
  GL.setMix = (m) => { applyTheme(m); GL.draw(); }; applyTheme(night);
  GL.dbg = { get plates() { return gplates; } };
  GL.setScale = (k) => { renderer.setPixelRatio(Math.max(0.5, Math.min(Math.max(window.devicePixelRatio || 1, Q.get('aa') === '1' ? 1 : 1.5), REDUCE ? 1 : 2) * k)); resize(); };   /* low frame rate: lower the render resolution */
  /* pre-render export: which plate is lit by what, and each plate's screen outline (convex hull, <= 14 points, CSS px of the current camera) */
  GL.plateInfo = () => ({ cores: gplates.filter((p) => p.core).length, plates: gplates.map((p) => p.core ? { core: true, order: p.order } : { core: false, thr: +(+p.thr).toFixed(3) }) });
  GL.outlines = (W, H) => { const v = new THREE.Vector3(); return gplates.map((p) => { try {
    if (!p.g3.visible || !p.glass.visible) return null; p.g3.updateWorldMatrix(true, true); const pos = p.glass.geometry.attributes.position, pts = []; const step = Math.max(1, Math.floor(pos.count / 400));
    for (let i = 0; i < pos.count; i += step) { v.fromBufferAttribute(pos, i).applyMatrix4(p.glass.matrixWorld).project(camera); if (v.z > 1 || v.z < -1) continue; pts.push([(v.x * 0.5 + 0.5) * W, (1 - (v.y * 0.5 + 0.5)) * H]); }
    if (pts.length < 3) return null; pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]); const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
    for (const q of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); } for (let i = pts.length - 1; i >= 0; i--) { const q = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    let hull = lo.slice(0, -1).concat(up.slice(0, -1)); if (hull.length > 14) { const o = []; for (let i = 0; i < 14; i++) o.push(hull[Math.floor(i * hull.length / 14)]); hull = o; } const flat = []; hull.forEach((q) => flat.push(q[0], q[1])); return flat; } catch (e) { return null; } }); };
  window.GL = GL;
})();
