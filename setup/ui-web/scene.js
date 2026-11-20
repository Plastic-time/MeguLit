/* MeguLit installer: one continuous 3D scene.
   The window is a camera looking into one space. Welcome, location, download field, unpack and finish are places in
   that space; every stage change is a camera move (whip, orbit, dive, roll, pull-back), never a page swap.
   Progress = the real download segments: one tile per segment, lit in the order the engine finishes them.
   This file only draws. Data comes in through Scene.render(snap) (see SEGMENT-FEED in the notes), actions go out
   through Scene.onAction. Transform + opacity only (plus one cheap filter-free streak layer). Reduced motion: no
   camera travel, only a short fade. GSAP drives every move so a recorder can seek frame by frame. */
(function () {
  const Q = new URLSearchParams(location.search);
  /* Look: white by default (not the system setting); the choice made with the sun/moon switch is remembered. ?theme= wins (captures). */
  const STORE = 'megulit.setup.theme'; let saved = null; try { saved = localStorage.getItem(STORE); } catch (e) { /* private window: just no memory */ }
  const startDark = Q.get('theme') ? Q.get('theme') === 'night' : saved === 'dark'; window.__themeDark = startDark;
  let THEME = startDark ? 'night' : 'edge';
  const REDUCE = Q.get('reduce') === '1' || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  document.documentElement.dataset.theme = THEME;
  const $ = (s) => document.querySelector(s);
  /* All installer copy lives here (zh primary, natural English as the second language; ?lang=en). Decorative big caps stay English on purpose. */
  const LANG = Q.get('lang') === 'en' ? 'en' : 'zh';
  const I18N = {
    zh: {
      title: 'MeguLit 安装', step_welcome: '开始', step_loc: '位置', step_field: '下载', step_unpack: '安装', step_done: '完成',
      welcomeSub: '欢迎使用MeguLit|现在开始安装', locSub: '给它找个窝', locT: '给它找个窝', locEn: 'Install location', change: '换个地方',
      swDesk: '放一个桌面快捷方式', swMenu: '加到开始菜单', install: '就这儿，开搬',
      protectedMsg: '这是你正在用的正式安装位置，试用版不会动它。换一个位置吧。', lblPath: '装到这个文件夹', defaultHint: '默认位置，不用改也能直接装。', lblSugg: '或者放到', chip: (p, f) => p + '  ·  剩 ' + f, readonly: (p) => '这个位置写不进去，像 Program Files 这样的文件夹要管理员权限。换个位置吧，比如 ' + p + '。', spaceHint: (p, f) => '这块盘装不下。' + p + ' 还有 ' + f + '，装那儿？',
      locNoteWait: '点「就这儿，开搬」才开始下载。都是各项目官方的原版文件，下完会逐个校验，被改过的不会装。',
      locNote: '东西已经在后台下了，你慢慢挑位置。都是各项目官方的原版文件，下完会逐个校验，被改过的不会装。',
      free: (f, n) => '这块盘还剩 ' + f + '，装完大约占 ' + n, freeBad: (f, n) => '这块盘只剩 ' + f + '，装不下（要 ' + n + '），换一个盘吧',
      probeT: '挑条近道', probeP: 'GitHub 和国内镜像一起测速，挑最快的几条同时下。',
      downT: (p) => '「' + p + '」进货中', downP: (src) => '现在走的是 ' + src + '。底下那条细线，每一格都是一段真实在下的数据。',
      retryNote: '有一条线卡住了，已经自动换线重试。',
      verifyT: '验货', verifyP: (p) => '在核对「' + p + '」是不是原版，几秒钟的事。',
      unpackT: '拆箱上架', unpackP: (p, d) => '把「' + p + '」解压到 ' + d + '。',
      doneT: '安装完成', doneEn: 'INSTALLED', launch: '开读',
      probing: '测速中', eta: (s) => s < 60 ? '还要 ' + Math.ceil(s) + ' 秒左右' : '还要 ' + Math.floor(s / 60) + ' 分 ' + Math.round(s % 60) + ' 秒左右', srcMore: (h, n) => h + ' 等 ' + n + ' 条线',
      packs: { app: '程序本体', base: '基础组件', reading: '注音词典', voice: '语音引擎' },
      errDownT: '这趟没送到', errDownM: '试了好几条线，都连不上。多半是网络断了，或者被代理拦住了。', errDownTip: '先点「重试」，已经下好的部分不会重下。还不行就点「复制日志」发给我们，或者去官网手动下整包。',
      errInstT: '差一步，有东西占着', errInstM: '有些文件被别的程序占着，覆盖不了。', errInstTip: '先把开着的 MeguLit 关掉，杀毒软件的扫描也停一下，再点「重试」。东西已经下好了，不会重下。',
      retry: '重试', copylog: '复制日志', copied: '已复制', manual: '手动下载',
      quitT: '货还在路上', quitM: '现在关也行，已经下好的会留着，下次打开接着下。', stay: '等它到', leave: '回头再来',
      minimize: '最小化', close: '关闭', toDark: '切换到深色', toLight: '切换到浅色'
    },
    en: {
      title: 'MeguLit setup', step_welcome: 'Start', step_loc: 'Location', step_field: 'Download', step_unpack: 'Install', step_done: 'Done',
      welcomeSub: 'Welcome to MeguLit|Let us get it installed', locSub: 'Where should it live?', locT: 'Where to?', locEn: '', change: 'Change',
      swDesk: 'Desktop shortcut', swMenu: 'Start menu entry', install: 'Install',
      protectedMsg: 'This is your real MeguLit install. The trial leaves it alone, pick another folder.', lblPath: 'Install into this folder', defaultHint: 'Default spot, fine to leave as is.', lblSugg: 'Or put it in', chip: (p, f) => p + '  ·  ' + f + ' free', readonly: (p) => "Can't write to this folder. Places like Program Files need admin rights. Try " + p + ' instead.', spaceHint: (p, f) => "This drive can't fit it. " + p + ' has ' + f + ' free, put it there?',
      locNoteWait: 'Nothing is downloaded until you press the install button. Every file is the original from its project and gets checked before anything is installed.',
      locNote: 'The download already started in the background, so take your time. Every file is the original from its project and gets checked before anything is installed.',
      free: (f, n) => f + ' free on this drive, needs about ' + n, freeBad: (f, n) => 'Only ' + f + ' free here and it needs ' + n + '. Pick another drive.',
      probeT: 'Finding the fastest route', probeP: 'Testing GitHub and the mirrors at the same time, then using the quickest few.',
      downT: (p) => 'Downloading ' + p, downP: (src) => 'Pulling from ' + src + '. Each tick in the thin line below is one real piece of the download.',
      retryNote: 'One route stalled, so it switched and is trying again.',
      verifyT: 'Checking the files', verifyP: (p) => 'Making sure ' + p + ' is the original. Takes a few seconds.',
      unpackT: 'Installing', unpackP: (p, d) => 'Unpacking ' + p + ' into ' + d + '.',
      doneT: 'Installed', doneEn: 'Ready when you are', launch: 'Open MeguLit',
      probing: 'testing', eta: (s) => s < 60 ? 'about ' + Math.ceil(s) + ' s left' : 'about ' + Math.floor(s / 60) + ' min ' + Math.round(s % 60) + ' s left', srcMore: (h, n) => h + ' and ' + (n - 1) + ' more',
      packs: { app: 'the app', base: 'core files', reading: 'furigana dictionary', voice: 'voice engine' },
      errDownT: 'The download stopped', errDownM: 'Every route failed to answer. Usually that is the network or a proxy.', errDownTip: 'Hit Retry first, what is already downloaded is kept. If it still fails, copy the log and send it to us, or grab the full package from the site.',
      errInstT: 'Could not finish installing', errInstM: 'Another program has some of the files open.', errInstTip: 'Close any running MeguLit and pause your antivirus scan, then hit Retry. Nothing gets downloaded twice.',
      retry: 'Retry', copylog: 'Copy log', copied: 'Copied', manual: 'Download manually',
      quitT: 'Still downloading', quitM: 'You can close it now. What is downloaded is kept and picks up next time.', stay: 'Keep going', leave: 'Close for now',
      minimize: 'Minimize', close: 'Close', toDark: 'Switch to dark', toLight: 'Switch to light'
    }
  };
  window.SceneCopy = {};
  const tr = (k, ...a) => { const v = I18N[LANG][k]; return typeof v === 'function' ? v(...a) : v; };
  window.SceneCopy = { welcomeSub: I18N[LANG].welcomeSub, locSub: I18N[LANG].locSub };
  const GBS = (n) => n >= 1073741824 ? (n / 1073741824).toFixed(n >= 107374182400 ? 0 : 1) + ' GB' : Math.round(n / 1048576) + ' MB';
  const world = $('#world');
  const T = 56, GAP = 4, ROWS = 8;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const MB = (n) => (n >= 1073741824 ? (n / 1073741824).toFixed(1) + ' GB' : Math.round(n / 1048576) + ' MB');

  /* ---------- geometry helpers ---------- */
  function box(x, y, z, w, h, d, cls) {
    const g = document.createElement('div'); g.className = 'o3 box ' + (cls || ''); g.style.transform = `translate3d(${x}px,${y}px,${z}px)`;
    const face = (c, fw, fh, tf) => { const f = document.createElement('i'); f.className = c; f.style.cssText = `width:${fw}px;height:${fh}px;margin:${-fh / 2}px 0 0 ${-fw / 2}px;transform:${tf}`; g.appendChild(f); };
    face('f', w, h, `translateZ(${d / 2}px)`); face('b', w, h, `rotateY(180deg) translateZ(${d / 2}px)`);
    face('l', d, h, `rotateY(-90deg) translateZ(${w / 2}px)`); face('r', d, h, `rotateY(90deg) translateZ(${w / 2}px)`);
    face('t', w, d, `rotateX(90deg) translateZ(${h / 2}px)`);
    world.appendChild(g); return g;
  }
  function plane(x, y, z, w, h, rx, cls) {
    const p = document.createElement('div'); p.className = 'plane ' + cls; p.style.cssText = `width:${w}px;height:${h}px;margin:${-h / 2}px 0 0 ${-w / 2}px;transform:translate3d(${x}px,${y}px,${z}px) rotateX(${rx}deg)`;
    world.appendChild(p); return p;
  }
  function plate(x, y, z, w, h, html) {
    const p = document.createElement('div'); p.className = 'plate'; p.style.cssText = `width:${w}px;height:${h}px;margin:${-h / 2}px 0 0 ${-w / 2}px;transform:translate3d(${x}px,${y}px,${z}px)`;
    p.innerHTML = '<div class="bar"></div>' + html; world.appendChild(p); return p;
  }
  function ghost(x, y, z, size, text) {
    const g = document.createElement('div'); g.className = 'ghost'; g.textContent = text; g.style.cssText = `font-size:${size}px;transform:translate3d(${x}px,${y}px,${z}px)`; world.appendChild(g);
  }
  const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();

  /* ---------- layout of the world ---------- */
  const P = 820, FY = 1200;
  const A = { x: 3300, y: -260, z: -5200 }, RF = 2400;                 /* the shard cloud's centre and the one correct camera distance */
  let N = 0, COLS = 0, tiles = [], cache = null, revealAt = 1e9; const nudge = { x: 0, y: 0 };   /* after the reveal the camera sways a little: parallax shows how far apart the plates hang */

  /* Magic circle line art (ink lines + one crimson arc). It is a plane in the world, parallel to the facade it is cut into, so it
     foreshortens with the camera like any wall detail. 'prog' is the arc that follows the real download. */
  const circleSvg = (prog) => { let t = ''; for (let i = 0; i < 48; i++) { const a = i * Math.PI / 24, r0 = i % 4 ? 90 : 84; t += `<line x1="${(r0 * Math.cos(a)).toFixed(1)}" y1="${(r0 * Math.sin(a)).toFixed(1)}" x2="${(96 * Math.cos(a)).toFixed(1)}" y2="${(96 * Math.sin(a)).toFixed(1)}"/>`; }
    const tri = (rot) => { const p = []; for (let i = 0; i < 3; i++) { const a = rot + i * 2 * Math.PI / 3; p.push((60 * Math.cos(a)).toFixed(1) + ',' + (60 * Math.sin(a)).toFixed(1)); } return `<polygon points="${p.join(' ')}"/>`; };
    let runes = ''; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 + 0.26, x = 73 * Math.cos(a), y = 73 * Math.sin(a); runes += `<path d="M${(x - 4).toFixed(1)} ${(y - 5).toFixed(1)}l8 5l-8 5M${(x + 4).toFixed(1)} ${(y - 5).toFixed(1)}v10" transform="rotate(${(a * 180 / Math.PI + 90).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`; }
    return `<svg viewBox="-100 -100 200 200" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="var(--ink)" stroke-width="1.4" opacity=".62"><circle r="97" stroke-width="2.2"/><circle r="82" stroke-dasharray="2 5"/><circle r="66"/>${tri(-Math.PI / 2)}${tri(Math.PI / 2)}<circle r="12"/><path d="M-12 0h24M0 -12v24" stroke-width="1"/>${t}${runes}</g>${prog ? '<circle class="prog" r="75" fill="none" stroke="var(--red)" stroke-width="5" stroke-linecap="butt" transform="rotate(-90)" stroke-dasharray="471" stroke-dashoffset="471"/>' : '<path d="M0 -75A75 75 0 0 1 64.9 -37.5" fill="none" stroke="var(--red)" stroke-width="5"/>'}</svg>`; };
  function etch(x, y, z, w, h, html, cls) { const e = document.createElement('div'); e.className = 'etch ' + (cls || ''); e.style.cssText = `width:${w}px;height:${h}px;margin:${-h / 2}px 0 0 ${-w / 2}px;transform:translate3d(${x}px,${y}px,${z}px)`; e.innerHTML = html; world.appendChild(e); return e; }
  const FINAL = { cx: A.x, cy: A.y, cz: A.z + RF, rx: 0, ry: 0, rz: 0 };
  const smooth = (x) => x * x * (3 - 2 * x);
  let progCircle = null, bandEl = null;
  function buildStatic() {
    plane(1700, FY, -1000, 12000, 9000, 90, 'floor');
    plane(1700, 300, -1000, 3400, 14, 90, 'guide');                       /* the crimson guide beam: where to look next */
    /* skyline behind the shards (depth 5600+), mid-distance slabs left and right, nothing in the middle where the logo forms */
    const T3 = [[-800, -6200, 520, 2600, 420], [700, -7000, 420, 3200, 380], [1900, -6000, 600, 2300, 500], [3300, -7400, 700, 3400, 520], [4700, -6100, 560, 2500, 460], [5900, -6900, 420, 3000, 400], [7100, -6000, 520, 2400, 440], [8300, -7200, 460, 3100, 420], [-1900, -7000, 500, 2800, 420],
      [900, -2300, 360, 1700, 320], [300, -1200, 300, 1500, 280], [5800, -1700, 360, 1800, 320], [7200, -900, 320, 1500, 300], [-1200, -2600, 400, 2000, 360], [8200, -2400, 420, 2100, 380]];
    T3.forEach(([x, z, w, hh, d], i) => box(x, FY - hh / 2, z, w, hh, d, i === 3 ? 'red' : ''));
    plate(0, -20, -1000, 760, 360, '<img src="' + (typeof INK !== 'undefined' ? INK : 'logos/logo-A-black.svg') + '" alt=""><h2>' + tr('welcomeSub').split('|').join(' ') + '</h2>');
  }

  /* Eight big irregular glass plates (cells of 8 hand-placed seeds over the logo), each carrying only its own part of the logo,
     hanging far apart at different depths and tilts. From FINAL (the one right camera) every part lands where it belongs and
     the logo reads; from anywhere else it is just a few plates with a line or a patch of colour on them.
     The real download is folded into the 8 plates: segments are grouped by byte range, one group per plate; a plate is filled
     with red along its own strokes as its group's real progress rises, and is fully lit when the whole group is done. */
  const K = 8, LK = ['A', 'B', 'C'].includes(Q.get('logo')) ? Q.get('logo') : 'C', LG = (window.LOGOS || {})[LK] || { w: 3424, h: 1452, seeds: [[430, 330], [800, 1050], [1300, 740], [1760, 1130], [2220, 800], [2680, 1040], [3180, 1060], [3000, 250]] };
  const SC = 860 / LG.w, LW = LG.w * SC, LH = LG.h * SC, LCY = -30;
  const ETCH = 'logos/logo-etch.svg', INK = 'logos/logo-' + LK + '-' + (THEME === 'night' ? 'white' : 'black') + '.svg', REDF = 'logos/logo-' + LK + '-red.svg';
  const clipHalf = (poly, a, b, c0) => { const out = []; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length], fp = a * p[0] + b * p[1] - c0, fq = a * q[0] + b * q[1] - c0; if (fp <= 0) out.push(p); if ((fp <= 0) !== (fq <= 0)) { const t = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); } } return out; };
  const SVGNS = 'http://www.w3.org/2000/svg';
  let groupOf = null, lastFrames = [], lastReveal = 0;
  function buildField(n) {
    N = n; let sd = 11; const rr = () => (sd = (sd * 16807) % 2147483647) / 2147483647, r = () => rr() * 2 - 1;
    const seeds = LG.seeds.slice(0, K).map((s) => [s[0] * SC, s[1] * SC]);
    const SPIKE = [1.9, 1.25, 2.4, 1.5, 2.1, 1.35, 2.6, 1.7]; let info = seeds.map((s, i, arr, idx = i) => {
      let poly = [[0, 0], [LW, 0], [LW, LH], [0, LH]]; seeds.forEach((q, j) => { if (j !== i) poly = clipHalf(poly, q[0] - s[0], q[1] - s[1], (q[0] * q[0] + q[1] * q[1] - s[0] * s[0] - s[1] * s[1]) / 2); });
      const gx = poly.reduce((a, p) => a + p[0], 0) / poly.length, gy = poly.reduce((a, p) => a + p[1], 0) / poly.length;
      poly = poly.map((p) => [gx + (p[0] - gx) * 0.985, gy + (p[1] - gy) * 0.985]);
      /* blade it: push the farthest corner out into a long tip, and nudge the others so no two shards share an edge */
      const spike = SPIKE[idx % SPIKE.length]; let fi2 = 0, fd2 = 0; poly.forEach((p, j) => { const dd2 = Math.hypot(p[0] - gx, p[1] - gy); if (dd2 > fd2) { fd2 = dd2; fi2 = j; } });
      poly = poly.map((p, j) => j === fi2 ? [gx + (p[0] - gx) * spike, gy + (p[1] - gy) * spike] : [p[0] + Math.sin(j * 7 + idx) * 10, p[1] + Math.cos(j * 5 + idx) * 10]);
      const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      return { p: poly, x0, y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
    });
    info.sort((a, b) => a.cx - b.cx); tiles = []; window.SceneCells = { cells: info, LW, LH };
    const defs = document.createElementNS(SVGNS, 'svg'); defs.setAttribute('width', 0); defs.setAttribute('height', 0); defs.style.position = 'absolute';
    defs.innerHTML = '<defs><linearGradient id="gBody" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--glass)" stop-opacity=".46"/><stop offset=".5" style="stop-color:var(--glass)" stop-opacity=".08"/><stop offset="1" style="stop-color:var(--glass)" stop-opacity=".34"/></linearGradient><linearGradient id="gEdge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--edge)" stop-opacity=".9"/><stop offset=".5" style="stop-color:var(--edge)" stop-opacity=".12"/><stop offset="1" style="stop-color:var(--edge)" stop-opacity=".6"/></linearGradient><linearGradient id="gSpec" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><filter id="etchGrain" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 2.2 -0.85" result="g"/><feComposite in="g" in2="SourceAlpha" operator="in"/></filter><filter id="etchBevel" x="-4%" y="-4%" width="108%" height="108%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation="1.7" result="b"/><feSpecularLighting in="b" surfaceScale="5" specularConstant="1.4" specularExponent="20" lighting-color="#ffffff" result="sp"><feDistantLight azimuth="225" elevation="38"/></feSpecularLighting><feComposite in="sp" in2="SourceAlpha" operator="in" result="spi"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="spi"/></feMerge></filter><filter id="etchHalo" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="6"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .75 0"/></filter><filter id="etchShade" x="-6%" y="-6%" width="112%" height="112%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="1.6"/><feColorMatrix type="matrix" values="0 0 0 0 .04  0 0 0 0 .08  0 0 0 0 .16  0 0 0 .55 0"/></filter></defs>';world.appendChild(defs);
    const depths = [420, 950, 1700, 2500, 3400, 4400, 5400, 6400]; for (let i = depths.length - 1; i > 0; i--) { const j = Math.floor(rr() * (i + 1)); [depths[i], depths[j]] = [depths[j], depths[i]]; }
    info.forEach((q, i) => {
      const d = depths[i], k = (d + P) / P, pts = q.p.map((v) => [(v[0] - q.x0).toFixed(1), (v[1] - q.y0).toFixed(1)]), ps = pts.map((v) => v.join(',')).join(' ');
      const gcx = (pts.reduce((a, v) => a + +v[0], 0) / pts.length).toFixed(1), gcy = (pts.reduce((a, v) => a + +v[1], 0) / pts.length).toFixed(1), gw = q.w, gh = q.h, spec = [[gw * 0.05, gh * 0.18], [gw * 0.52, gh * 0.0], [gw * 0.66, gh * 0.0], [gw * 0.1, gh * 0.34]].map((v) => v.map((n) => n.toFixed(1)).join(',')).join(' ');
      const el = document.createElementNS(SVGNS, 'svg'); el.setAttribute('class', 'shard'); el.setAttribute('width', q.w.toFixed(1)); el.setAttribute('height', q.h.toFixed(1));
      el.style.cssText = `left:${-q.w / 2}px;top:${-q.h / 2}px;width:${q.w}px;height:${q.h}px`;
      el.innerHTML = `<defs><clipPath id="c${i}"><polygon points="${ps}"/></clipPath><clipPath id="w${i}"><rect class="wipe" x="0" y="0" width="0" height="${q.h.toFixed(1)}"/></clipPath></defs>
        <polygon class="back" points="${ps}" transform="translate(8 8)"/>
        <polygon class="body" points="${ps}" fill="url(#gBody)"/>
        <g clip-path="url(#c${i})"><image href="${ETCH}" x="${-q.x0}" y="${-q.y0}" width="${LW}" height="${LH}" filter="url(#etchHalo)" opacity=".5"/></g>
        <g clip-path="url(#c${i})"><image href="${ETCH}" x="${-q.x0}" y="${-q.y0}" width="${LW}" height="${LH}" transform="translate(3 4.5)" filter="url(#etchShade)"/></g>
        <g clip-path="url(#c${i})"><image class="art" href="${ETCH}" x="${-q.x0}" y="${-q.y0}" width="${LW}" height="${LH}" filter="url(#etchBevel)" opacity=".5"/></g>
        <g clip-path="url(#c${i})"><image href="${ETCH}" x="${-q.x0}" y="${-q.y0}" width="${LW}" height="${LH}" filter="url(#etchGrain)" opacity=".6"/></g>
        <g clip-path="url(#c${i})"><image class="red" href="${REDF}" x="${-q.x0}" y="${-q.y0}" width="${LW}" height="${LH}" clip-path="url(#w${i})" opacity="0"/></g>
        <polygon points="${ps}" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="1" vector-effect="non-scaling-stroke" transform="translate(${gcx} ${gcy}) scale(.94) translate(${-gcx} ${-gcy})"/>
        <polygon class="spec" points="${spec}" fill="url(#gSpec)" clip-path="url(#c${i})"/>
        <polygon class="edge" points="${ps}" fill="none" stroke="url(#gEdge)" stroke-width="2.6" stroke-linejoin="miter"/>`;
      world.appendChild(el);
      tiles.push({ el, red: el.querySelector('.red'), wipe: el.querySelector('.wipe'), edge: el.querySelector('.edge'), body: el.querySelector('.body'), bk: el.querySelector('.back'), w: q.w, d, s: k, u: q.cx / LW,
        X: FINAL.cx + (q.cx - LW / 2) * k, Y: FINAL.cy + (q.cy - LH / 2 + LCY) * k, Z: FINAL.cz - d,
        rx: (r() < 0 ? -1 : 1) * (38 + rr() * 40), ry: (r() < 0 ? -1 : 1) * (38 + rr() * 40), rz: r() * 55, ph: rr() * 6.28, amp: 30 + rr() * 60, spin: 0.12 + rr() * 0.2 });
    });
    groupOf = (i) => Math.min(K - 1, Math.floor(i * K / N));
    cache = { f: new Float32Array(K).fill(-1), lit: new Int8Array(K).fill(-1), blur: new Int16Array(K).fill(-1), mini: new Int8Array(N).fill(-1) };
    const mini = $('#mini'); mini.innerHTML = ''; for (let i = 0; i < N; i++) mini.appendChild(document.createElement('i'));
  }

  /* ---------- camera ---------- */
  const cam = { cx: -420, cy: -150, cz: 800, rx: 6, ry: -12, rz: 0 };
  let section = 'welcome', moving = false, last = { t: 0, phase: 'probe' };
  const orbit = (az, el, R) => { const a = az * Math.PI / 180, e = el * Math.PI / 180; return { cx: A.x + R * Math.sin(a) * Math.cos(e), cy: A.y - R * Math.sin(e), cz: A.z + R * Math.cos(a) * Math.cos(e), rx: el, ry: -az, rz: 0 }; };
  const toSph = (p) => { const dx = p.cx - A.x, dy = A.y - p.cy, dz = p.cz - A.z, R = Math.hypot(dx, dy, dz); return { az: Math.atan2(dx, dz) * 180 / Math.PI, el: Math.asin(dy / R) * 180 / Math.PI, R }; };
  const key = (ks, p) => { for (let i = 1; i < ks.length; i++) if (p <= ks[i][0]) { const [p0, v0] = ks[i - 1], [p1, v1] = ks[i]; return lerp(v0, v1, smooth(clamp((p - p0) / (p1 - p0)))); } return ks[ks.length - 1][1]; };
  /* while downloading the camera wanders around the cloud; near 62 % it passes a viewpoint that is almost, not quite, the right one */
  const AZ = [[0, -62], [0.3, -34], [0.75, 8], [0.88, 26], [1, 46]], EL = [[0, 18], [0.35, 11], [0.75, 9], [0.9, 14], [1, 19]], RR = [[0, 2900], [0.75, 2350], [1, 3000]];
  const POSE = {
    welcome: () => ({ cx: 3300, cy: 700, cz: 2300, rx: 4, ry: 0, rz: 0 }),
    loc: () => ({ cx: 3900, cy: 560, cz: 1500, rx: 3, ry: -14, rz: 0 }),
    field: (s) => { const p = s && s.total ? clamp(s.got / s.total) : 0; return orbit(key(AZ, p), key(EL, p), key(RR, p)); },
    unpack: () => orbit(30, 52, 3000),
    done: () => ({ ...FINAL })
  };
  const MOVES = {
    whip:  { d: 0.95, ease: 'expo.inOut', fx: (s) => ({ ry: 16 * s, rz: -5 * s, streak: s, flash: 0.2 * s }) },
    orbit: { d: 2.1, ease: 'sine.inOut', fx: (s) => ({ cx: -420 * s, cz: 620 * s, ry: -22 * s, rz: 2 * s }) },
    dive:  { d: 2.2, ease: 'power3.inOut', sph: true, fx: (s) => ({ streak: s * 0.4 }) },
    roll:  { d: 1.9, ease: 'power3.inOut', fx: (s, a, p) => ({ rz: 360 * p, cz: 180 * s }) },
    push:  { d: 1.6, ease: 'power3.inOut', fx: (s) => ({ cz: 220 * s }) },
    skim:  { d: 2.6, ease: 'power3.inOut', fx: (s) => ({ cx: 380 * s, ry: -8 * s, cy: 60 * s }) },
    under: { d: 3.4, ease: 'sine.inOut', fx: (s) => ({ cy: 1250 * s }) },
    pull:  { d: 4.4, ease: 'power2.inOut', sph: true, fx: () => ({}) }
  };
  let GLraf = false, override = null;
  function apply(extra) {
    const c = cam, e = extra || {};
    const t = last.t || 0, br = REDUCE || moving || (last.phase === "done") ? 0 : 1;      /* a little handheld breath while resting */
    const cx = c.cx + Math.sin(t * 0.7) * 5 * br, cy = c.cy + Math.cos(t * 0.5) * 4 * br;
    world.style.transform = `rotateZ(${c.rz}deg) rotateX(${-c.rx}deg) rotateY(${c.ry}deg) translate3d(${-cx}px,${-cy}px,${-c.cz}px)`;
    if (window.GL) { GL.setCamera(c, cx - c.cx, cy - c.cy); if (!GLraf) { GLraf = true; requestAnimationFrame(() => { GLraf = false; GL.draw(); }); } }
    const sk = $('#streaks'); sk.style.opacity = e.streak || 0; $('#flash').style.opacity = e.flash || 0;
  }
  const UI = { welcome: ['#ui-welcome'], loc: ['#ui-loc'], field: ['#hud'], unpack: ['#hud'], done: ['#ui-done'] };
  const ORDER = ['welcome', 'loc', 'field', 'unpack', 'done'];
  const STEPN = new Proxy({}, { get: (_, k) => tr('step_' + k) });
  function setSteps() { const k = ORDER.indexOf(section); document.querySelectorAll('#steps i').forEach((el, i) => el.classList.toggle('on', i < Math.min(4, k + 1) || section === 'done')); $('#stepname').textContent = STEPN[section]; }

  function goTo(name, move, fromName) {
    const tl = gsap.timeline(), m = MOVES[move] || MOVES.push, o = { p: 0 }; let A0 = null;
    const from = fromName || section; const outs = UI[from] || [], ins = UI[name] || [];
    tl.call(() => { A0 = { ...cam }; section = name; moving = true; setSteps(); if (name !== 'done') revealAt = 1e9; });
    if (outs.length && !outs.every((s) => ins.includes(s))) tl.to(outs.filter((s) => !ins.includes(s)), { opacity: 0, duration: 0.22, ease: 'power1.in', onComplete() { outs.forEach((s) => { if (!ins.includes(s)) $(s).style.visibility = 'hidden'; }); } }, 0);
    if (REDUCE) {
      tl.call(() => { Object.assign(cam, POSE[name](last)); moving = false; if (name === 'done') revealAt = (tl.parent && tl.parent !== gsap.globalTimeline) ? tl.startTime() + 0.02 + m.d : (last.t || 0); apply(); }, null, 0.05);
    } else {
      tl.to(o, { p: 1, duration: m.d, ease: m.ease, onUpdate() {
        const B = POSE[name](last), p = o.p, s = Math.sin(Math.PI * Math.min(1, p)), x = m.fx(s, A0, p);
        if (m.sph) {
          const a = toSph(A0), b = toSph(B); let da = b.az - a.az; if (da > 180) da -= 360; if (da < -180) da += 360;
          Object.assign(cam, orbit(a.az + da * p, lerp(a.el, b.el, p), lerp(a.R, b.R, p)));
        } else {
          cam.cx = lerp(A0.cx, B.cx, p) + (x.cx || 0); cam.cy = lerp(A0.cy, B.cy, p) + (x.cy || 0); cam.cz = lerp(A0.cz, B.cz, p) + (x.cz || 0);
          cam.rx = lerp(A0.rx, B.rx, p); cam.ry = lerp(A0.ry, B.ry, p) + (x.ry || 0); cam.rz = lerp(A0.rz, B.rz, p) + (x.rz || 0);
        }
        apply(x);
      } }, 0.02);
      tl.call(() => { moving = false; cam.rz = POSE[name](last).rz; if (name === 'done') revealAt = (tl.parent && tl.parent !== gsap.globalTimeline) ? tl.startTime() + 0.02 + m.d : (last.t || 0); apply(); });
    }
    ins.forEach((s) => { const el = $(s); tl.set(el, { visibility: 'visible' }, REDUCE ? 0.05 : m.d * (name === 'done' ? 0.9 : 0.72)).fromTo(el, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: REDUCE ? 0.25 : 0.55, ease: 'power2.out' }, '<'); });
    return tl;
  }

  /* ---------- render from a snapshot (pure: same snapshot, same picture) ---------- */
  function render(s) {
    last = s; if (!N && s.st) buildField(s.st.length);
    const t = s.t || 0;
    nudge.x = 0; nudge.y = 0;
    if (override) { Object.assign(cam, override); apply(); } else if (!moving && POSE[section]) { Object.assign(cam, POSE[section](s)); if (s.phase === 'done' && section === 'done' && !REDUCE) { const w = Math.max(0, t - revealAt - 0.6), u = clamp(w / 1.2); nudge.x = 440 * u * Math.sin(w * 1.3); nudge.y = 120 * u * Math.sin(w * 0.9 + 1); cam.cx += nudge.x; cam.cy += nudge.y; } apply(); }
    if (N && s.st) {
      const br = REDUCE ? 0 : 1;
      const dd = Math.hypot(cam.cx - nudge.x - FINAL.cx, cam.cy - nudge.y - FINAL.cy, cam.cz - FINAL.cz), reveal = s.phase === 'done' ? smooth(clamp(1 - dd / (RF * 0.55))) : 0;
      const post = 0;     /* after the reveal they drift so you see they hang far apart */
      const damp = (1 - reveal) + post, pos = new Array(K), ft = t * br;
      lastReveal = reveal; const gs = new Float32Array(K), gc = new Int16Array(K), gd = new Float32Array(K), gdone = new Int16Array(K);
      for (let i = 0; i < N; i++) { const g = groupOf(i); gc[g]++; gs[g] += s.st[i] === 2 ? 1 : (s.st[i] === 1 || s.st[i] === 3 ? s.fr[i] : 0); if (s.st[i] === 2) { gdone[g]++; gd[g] = Math.max(gd[g], s.doneAt[i] || 0); } const m = s.st[i] === 2 ? 2 : s.st[i] === 1 ? 1 : s.st[i] === 3 || s.st[i] === 4 ? 3 : 0; if (cache.mini[i] !== m) { cache.mini[i] = m; $('#mini').children[i].className = ['', 'a', 'd', 'r'][m]; } }
      for (let g = 0; g < K; g++) {
        const tl = tiles[g], f = gc[g] ? gs[g] / gc[g] : 0, lit = gc[g] && gdone[g] === gc[g] ? 1 : 0;
        const ox = Math.sin(ft * 0.5 + tl.ph) * tl.amp * damp * br, oy = Math.cos(ft * 0.4 + tl.ph) * tl.amp * damp * br, oz = Math.sin(ft * 0.6 + tl.ph * 2) * tl.amp * 2 * damp * br;
        const k = 1 - reveal, rx = (tl.rx + Math.sin(ft * tl.spin + tl.ph) * 8 * br) * k + post * 7 * Math.sin(t + tl.ph), ry = (tl.ry + Math.cos(ft * tl.spin + tl.ph) * 8 * br) * k + post * 7 * Math.cos(t + tl.ph), rz = tl.rz * k;
        tl.el.style.transform = `translate3d(${(tl.X + ox).toFixed(1)}px,${(tl.Y + oy).toFixed(1)}px,${(tl.Z + oz).toFixed(1)}px) rotateX(${rx.toFixed(1)}deg) rotateY(${ry.toFixed(1)}deg) rotateZ(${rz.toFixed(1)}deg) scale(${tl.s.toFixed(3)})`;
        pos[g] = [tl.X + ox, tl.Y + oy, tl.Z + oz]; lastFrames[g] = { x: tl.X + ox, y: tl.Y + oy, z: tl.Z + oz, rx, ry, rz, s: tl.s, f, lit };
        if (cache.f[g] !== f) { cache.f[g] = f; tl.wipe.setAttribute('width', (f * tl.w * 1.02).toFixed(1)); }
        /* red = the group's real progress poured into the plate; once the group is done it settles back into the logo's own colours */
        const wave = s.phase === 'unpack' ? clamp(1 - Math.abs(tl.u - s.unpack * 1.25 + 0.12) * 5) : 0;
        const settle = lit ? clamp(1 - (t - gd[g] - 0.5) / 1.6) : 1, ro = s.phase === 'unpack' ? wave : (f > 0 ? (lit ? settle : 1) : 0);
        tl.red.setAttribute('opacity', ro.toFixed(2)); if (lit && cache.lit[g] !== 1) cache.lit[g] = 1;
        tl.edge.style.opacity = (1 - 0.45 * reveal).toFixed(2); tl.body.style.opacity = (1 - 0.55 * reveal).toFixed(2); tl.bk.style.opacity = (1 - 0.7 * reveal).toFixed(2);
        if (lit && f >= 1) tl.wipe.setAttribute('width', (tl.w * 1.02).toFixed(1));
      }
      /* depth of field: focus = the plate being filled now; blur only changes when a plate crosses a depth bucket (the compositor keeps
         the blurred texture while the camera moves); the amount is divided by the plate's own scale because the filter runs before it */
      let fi = K - 1; for (let g = 0; g < K; g++) if (!(gc[g] && gdone[g] === gc[g])) { fi = g; break; }
      const useDof = !REDUCE && s.phase !== 'unpack' && reveal < 0.7;
      const D = (p) => Math.hypot(p[0] - cam.cx, p[1] - cam.cy, p[2] - cam.cz), fd = D(pos[fi]);
      for (let g = 0; g < K; g++) {
        let lv = 0; if (useDof) { const rel = Math.abs(D(pos[g]) - fd) / Math.max(400, fd * 0.25); lv = rel < 0.5 ? 0 : rel < 1 ? 1 : rel < 1.7 ? 2 : rel < 2.6 ? 3 : 4; lv = Math.floor(lv * (1 - reveal)); }
        const glow = cache.f[g] > 0 && cache.f[g] < 1 ? 1 : 0, key = lv * 2 + glow;
        if (cache.blur[g] !== key) { cache.blur[g] = key; const sc = tiles[g].s; tiles[g].el.style.filter = (lv ? `blur(${([0, 1.2, 2.6, 4.4, 6.5][lv] / sc).toFixed(2)}px) ` : '') + (glow ? `drop-shadow(0 0 ${(10 / sc).toFixed(1)}px rgba(214,32,63,.7))` : ''); }
      }
    }
    { const pp = s.phase === 'unpack' || s.phase === 'done' ? 1 : (s.total ? clamp(s.got / s.total) : 0), pr = progCircle && progCircle.querySelector('.prog'); if (pr && cache && cache.pp !== Math.round(pp * 200)) { cache.pp = Math.round(pp * 200); pr.setAttribute('stroke-dashoffset', (471 * (1 - pp)).toFixed(1)); }
      if (bandEl) bandEl.style.backgroundPosition = '0 ' + ((REDUCE ? 0 : (s.t || 0) * 160) % 120).toFixed(0) + 'px'; }
    if (window.GL && GL.ok) { GL.update(lastFrames, { s, t, reveal: lastReveal, prog: s.phase === 'unpack' || s.phase === 'done' ? 1 : (s.total ? clamp(s.got / s.total) : 0) }); GL.draw(); }
    const pct = s.total ? Math.floor(100 * s.got / s.total) : 0;
    $('#pct').textContent = pct; $('#got').textContent = MB(s.got || 0); $('#total').textContent = MB(s.total || 0);
    $('#speed').textContent = s.phase === 'download' || s.phase === 'probe' ? (s.speed > 0 ? (s.speed / 1048576).toFixed(1) + ' MB/s' : tr('probing')) : '';
    $('#eta').textContent = s.eta > 0 ? tr("eta", s.eta) : '';
    const pk = (I18N[LANG].packs[s.pack] || s.pack || ''), srcTxt = s.srcN > 1 ? tr('srcMore', s.src, s.srcN) : (s.src || ''), anyRetry = s.st && Array.prototype.indexOf.call(s.st, 3) >= 0;
    const W = { probe: [tr('probeT'), tr('probeP')], download: [tr('downT', pk), tr('downP', '<span class="src">' + srcTxt + '</span>') + (anyRetry ? ' ' + tr('retryNote') : '')], verify: [tr('verifyT'), tr('verifyP', pk)], unpack: [tr('unpackT'), tr('unpackP', pk, s.dir || '')], done: [tr('doneT'), ''] }[s.phase] || ['', ''];
    $('#whatT').textContent = W[0]; $('#whatP').innerHTML = W[1];
    if (s.err && !showErr) showError(s.err); else if (!s.err && showErr) hideError();
  }
  let showErr = false;
  function showError(e) {
    showErr = true; const k = e.kind === 'install' ? 'Inst' : 'Down'; $('#errT').textContent = tr('err' + k + 'T'); $('#errEn').textContent = ''; $('#errM').textContent = tr('err' + k + 'M'); $('#errTip').textContent = tr('err' + k + 'Tip');
    gsap.set('#ui-err', { visibility: 'visible' }); gsap.fromTo('#ui-err', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: REDUCE ? 0.2 : 0.45, ease: 'power2.out', overwrite: true });
  }
  function hideError() { showErr = false; gsap.to('#ui-err', { opacity: 0, duration: 0.25, overwrite: true, onComplete() { $('#ui-err').style.visibility = 'hidden'; } }); }

  /* ---------- actions out ---------- */
  const Scene = { cam, onAction: null, goTo, render, THEME, REDUCE, get section() { return section; }, init(opts) { if (opts && opts.count) buildField(opts.count); apply(); setSteps(); } };
  function act(type, extra) { const m = Object.assign({ type }, extra || {}); if (window.chrome && chrome.webview) chrome.webview.postMessage(m); if (Scene.onAction) Scene.onAction(m); }
  $('#install').addEventListener('click', () => act('install', { path: $('#path').value, desktop: $('#swDesk').getAttribute('aria-checked') === 'true', menu: $('#swMenu').getAttribute('aria-checked') === 'true' }));
  $('#browse').addEventListener('click', () => act('browse')); $('#retry').addEventListener('click', () => act('retry'));
  $('#copylog').addEventListener('click', () => { act('copylog'); $('#copylog').textContent = tr('copied'); }); $('#manual').addEventListener('click', () => act('manual')); $('#launch').addEventListener('click', () => act('launch'));
  document.querySelectorAll('.sw').forEach((b) => b.addEventListener('click', () => b.setAttribute('aria-checked', b.getAttribute('aria-checked') !== 'true')));
  /* streak lines for whips */
  const sk = $('#streaks'); for (let i = 0; i < 16; i++) { const b = document.createElement('b'); b.style.top = (6 + i * 5.8) + '%'; b.style.opacity = 0.25 + (i % 4) * 0.2; b.style.transform = `scaleX(${0.4 + (i % 5) * 0.15})`; sk.appendChild(b); }
  if (Q.get('desk') === '1') document.documentElement.classList.add('deskmode');
  let quitOpen = false;
  Scene.showQuit = (on) => { quitOpen = on; const el = $('#ui-quit'); if (on) { gsap.set(el, { visibility: 'visible' }); gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.2, overwrite: true }); $('#stay').focus(); } else gsap.to(el, { opacity: 0, duration: 0.18, overwrite: true, onComplete() { el.style.visibility = 'hidden'; } }); };
  $('#btnClose').addEventListener('click', () => { if (last.phase === 'download' || last.phase === 'probe' || last.phase === 'unpack') Scene.showQuit(true); else act('close'); });
  $('#stay').addEventListener('click', () => Scene.showQuit(false)); $('#leave').addEventListener('click', () => act('close')); $('#btnMin').addEventListener('click', () => act('minimize'));
  $('#drag').addEventListener('mousedown', (e) => { if (e.button === 0) act('dragstart'); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (quitOpen) Scene.showQuit(false); else $('#btnClose').click(); } });
  { const t = document.getElementById('topLogo'); if (t) t.src = INK; }
  { const map = { '#ui-loc .card h2': 'locT', '#browse': 'change', '#install': 'install', '#ui-loc .note': 'locNote', '#retry': 'retry', '#copylog': 'copylog', '#manual': 'manual', '#doneT': 'doneT', '#launch': 'launch', '.card.quit h2': 'quitT', '.card.quit p': 'quitM', '#stay': 'stay', '#leave': 'leave' };
    for (const [sel, k] of Object.entries(map)) { const el = $(sel); if (el) el.textContent = tr(k === 'locNote' && window.__waitConfirm ? 'locNoteWait' : k); }
    $('#ui-loc .card .en').textContent = tr('locEn'); $('#lblPath').textContent = tr('lblPath'); $('#lblSugg').textContent = tr('lblSugg'); $('.card.quit .en').textContent = ''; $('#doneEn').textContent = tr('doneEn'); const ws = $('#welcomeSub'); if (ws) { ws.textContent = ''; tr('welcomeSub').split('|').forEach((t, i) => { const sp = document.createElement('span'); sp.className = 'wl' + (i + 1); sp.textContent = t; ws.appendChild(sp); }); }   /* two staggered lines */
    $('#swDesk').lastChild.textContent = tr('swDesk'); $('#swMenu').lastChild.textContent = tr('swMenu');
    $('#btnMin').setAttribute('aria-label', tr('minimize')); $('#btnClose').setAttribute('aria-label', tr('close')); document.title = tr('title'); document.documentElement.lang = LANG === 'en' ? 'en' : 'zh-CN'; }
  let drives = [], need = 1.4 * 1073741824, freeNow = 182 * 1073741824, pathState = 'ok';
  const pathEl = $('#path');
  function paintLoc() {
    const bad = pathState !== 'ok' || freeNow < need * 1.1; $('#install').disabled = pathState === 'protected'; $('#pathfull').textContent = pathEl.value; $('#pathfull').classList.toggle('long', pathEl.value.length > 30);
    $('.meter').classList.toggle('bad', bad); $('#meterUsed').style.transform = 'scaleX(' + Math.min(1, need / Math.max(1, freeNow)).toFixed(3) + ')';
    const fr = $('#free'); fr.classList.toggle('bad', bad);
    const alt = drives.filter((d) => d.free >= need * 1.1 && d.path.toLowerCase() !== pathEl.value.toLowerCase())[0];
    fr.textContent = pathState === 'protected' ? tr('protectedMsg') : pathState === 'readonly' && alt ? tr('readonly', alt.path) : pathState === 'readonly' ? tr('readonly', '') : freeNow < need * 1.1 ? (alt ? tr('spaceHint', alt.path, GBS(alt.free)) : tr('freeBad', GBS(freeNow), GBS(need))) : tr('free', GBS(freeNow), GBS(need)) + '  ·  ' + tr('defaultHint');
    const sg = $('#sugg'); sg.innerHTML = ''; drives.forEach((d) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = tr('chip', d.path, GBS(d.free)); if (d.path.toLowerCase() === pathEl.value.toLowerCase()) b.className = 'pick'; b.addEventListener('click', () => { pathEl.value = d.path; freeNow = d.free; pathState = 'ok'; paintLoc(); act('checkpath', { path: d.path }); }); sg.appendChild(b); });
    
  }
  pathEl.addEventListener('input', () => { $('#pathfull').textContent = pathEl.value; act('checkpath', { path: pathEl.value }); });
  Scene.setFree = (free, needB, state) => { freeNow = free; need = needB; if (state) pathState = state; paintLoc(); };
  Scene.setDrives = (list) => { drives = list; paintLoc(); };
  Scene.setFree(182 * 1073741824, 1.4 * 1073741824);
  Scene.t = tr; Scene.setOverride = (p) => { override = p; };
  /* day / night: one number (0..1) drives the WebGL colours; the DOM flips at the half way point and eases its colours with a short CSS transition */
  let themeMix = startDark ? 1 : 0, themeTween = null; const htmlEl = document.documentElement;
  function paintTheme(m) { themeMix = m; const dark = m > 0.5, th = dark ? 'night' : 'edge'; if (THEME !== th) { THEME = th; htmlEl.dataset.theme = th; const t = $('#topLogo'); if (t) t.src = 'logos/logo-' + LK + '-' + (dark ? 'white' : 'black') + '.svg'; const wl = $('#welcomeLogo'); if (wl) wl.src = 'logos/logo-' + LK + '-' + (dark ? 'white' : 'black') + '.svg'; syncThemeBtn(); }
    if (window.GL && GL.setMix) GL.setMix(m); }
  function syncThemeBtn() { const b = $('#btnTheme'); if (!b) return; const dark = THEME === 'night'; b.setAttribute('aria-pressed', dark); const lab = dark ? tr('toLight') : tr('toDark'); b.setAttribute('aria-label', lab); b.title = lab; b.innerHTML = dark ? '<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="2.8" fill="currentColor"/><g stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M7 1v1.6M7 11.4V13M1 7h1.6M11.4 7H13M2.8 2.8l1.1 1.1M10.1 10.1l1.1 1.1M2.8 11.2l1.1-1.1M10.1 3.9l1.1-1.1"/></g></svg>' : '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M11.6 8.6A5.2 5.2 0 0 1 5.4 2.4a5.2 5.2 0 1 0 6.2 6.2z" fill="currentColor"/></svg>'; }
  Scene.setTheme = (dark, instant) => { try { localStorage.setItem(STORE, dark ? 'dark' : 'light'); } catch (e) { /* no memory */ } act('theme', { dark }); const to = dark ? 1 : 0;
    if (themeTween) themeTween.kill(); if (instant || REDUCE) { paintTheme(to); return; }
    htmlEl.classList.add('tchange'); const o = { m: themeMix }; themeTween = gsap.to(o, { m: to, duration: 0.85, ease: 'power2.inOut', onUpdate() { paintTheme(o.m); }, onComplete() { setTimeout(() => htmlEl.classList.remove('tchange'), 500); } }); };
  Scene.tr = tr; Scene.setThemeMix = paintTheme; Scene.isDark = () => THEME === 'night';
  { const b = $('#btnTheme'); if (b) b.addEventListener('click', () => Scene.setTheme(THEME !== 'night')); }
  htmlEl.dataset.theme = THEME; syncThemeBtn(); paintTheme(themeMix);
  window.Scene = Scene;
  buildStatic();
  Object.assign(cam, REDUCE ? POSE.welcome() : { cx: 3300, cy: 800, cz: 4300, rx: 6, ry: 0, rz: 0 }); apply(); setSteps();
  /* welcome plate is visible at once; the opening push-in settles on it (demo/host starts it) */
  Scene.intro = () => { const o = { p: 0 }, A = { ...cam }; return gsap.to(o, { p: 1, duration: 2.4, ease: 'power3.out', onUpdate() { const B = POSE.welcome(); for (const k in B) cam[k] = lerp(A[k], B[k], o.p); apply(); } }); };
})();
