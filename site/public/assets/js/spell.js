// SPDX-License-Identifier: GPL-3.0-or-later
// Floating kana over the whole page, with depth of field. Every glyph has a depth z (0 far, 1 near): far ones are
// small and soft, the focal band is sharp, near ones are large and blurred. They drift all the time; scrolling moves
// them by depth (parallax). Past the hero most of them fade out and a handful of "followers" keep drifting down the
// page with the reader. Each glyph is pre-rendered once (with its blur) to a small sprite, so a frame is only
// drawImage calls. One still frame when motion is reduced.

const KANA = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん読物語言葉魔導書続空気';
const FONT = '"Noto Serif JP","Yu Mincho","MeguLit Serif",serif';
const FOCUS = .42;          // depth that is in focus
const FOLLOWERS = 8;        // glyphs that stay with the reader below the hero
const clamp = v => Math.min(1, Math.max(0, v));

function isDark() {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}

function sprite(ch, size, blur, color, { font = FONT, weight = 600, halo = '' } = {}) {
  const pad = Math.ceil(blur * 2.5 + (halo ? size * .25 : 2)), w = Math.ceil(size * 1.25) + pad * 2;
  const c = document.createElement('canvas');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  c.width = c.height = Math.ceil(w * dpr);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  g.filter = blur > .3 ? `blur(${blur.toFixed(1)}px)` : 'none';
  g.fillStyle = color;
  g.font = `${weight} ${size}px ${font}`;
  if (halo) { g.shadowColor = halo; g.shadowBlur = size * .18; }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(ch, w / 2, w / 2);
  return { c, w };
}

// near: the foreground layer above the page (only near, large, out-of-focus glyphs, a few of them, all the way down)
// deep: the bottom layer under the page content (far, small, soft glyphs, all the way down); it also shows the song's
// lyric lines, which the pointer can push around and which settle back into place
export function kana(canvas, { still = false, hero = null, until = null, near = false, deep = false } = {}) {
  const ctx = canvas.getContext('2d');
  const pointer = { x: -1e4, y: -1e4 };
  addEventListener('pointermove', e => { pointer.x = e.clientX; pointer.y = e.clientY; }, { passive: true });
  let dark = isDark(), parts = [], W = 0, H = 0, dpr = 1;
  const palette = () => dark ? { ink: '#eceae6', red: '#d23a48' } : { ink: '#3a1a1e', red: '#a51d2d' };

  const make = (i, anywhere) => {
    const z = near ? .66 + Math.random() * .34 : deep ? Math.random() * .42 : Math.pow(Math.random(), 1.3);   // more far glyphs than near ones
    const size = near ? 34 + z * 60 : 13 + z * 62;
    const blur = near ? 1.5 + (z - .66) * 10 : Math.abs(z - FOCUS) * (z > FOCUS ? 16 : 7);
    const red = Math.random() < .1;
    const ch = KANA[Math.floor(Math.random() * KANA.length)];
    const p = palette();
    return {
      i, z, ch, red, follower: near || deep || i < FOLLOWERS,
      spr: sprite(ch, size, blur, red ? p.red : p.ink),
      x: Math.random() * W, y: anywhere ? Math.random() * H : H + 60,
      vx: (Math.random() - .5) * 6, vy: -(4 + Math.random() * 10) * (.4 + z),
      rot: (Math.random() - .5) * .5, vr: (Math.random() - .5) * .12,
      sway: Math.random() * Math.PI * 2,
      alpha: near ? (.2 + Math.random() * .2) * (red ? 1.3 : 1) : deep ? .09 + Math.random() * .1 : (.1 + .3 * (1 - Math.abs(z - FOCUS) * 1.4)) * (red ? 1.25 : 1),
    };
  };
  const fit = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const want = near ? Math.max(5, Math.round(Math.min(16, W * H / 80000))) : deep ? Math.max(8, Math.round(Math.min(40, W * H / 32000))) : Math.round(Math.min(90, W * H / 15000));
    while (parts.length < want) parts.push(make(parts.length, true));
    parts.length = near || deep ? want : Math.max(want, FOLLOWERS);
  };
  fit();
  addEventListener('resize', fit);
  // a theme change re-inks the sprites, keeping each glyph where it is
  const reink = () => {
    const d = isDark();
    if (d === dark) return;
    dark = d;
    parts = parts.map(p => { const n = make(p.i, false); n.x = p.x; n.y = p.y; return n; });
    words.forEach(w => { w.spr = tokenSprite(w); });
  };
  new MutationObserver(reink).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', reink);

  // ---- lyric lines -----------------------------------------------------------------------------------------------------
  // A line is cut into tokens: one per Japanese character, one per English word (kept whole in Playfair Display italic,
  // so it kerns and reads as a word). A line has one colour (Megumin's red, gold or white) and an orderly shape (row,
  // gentle arc, column, steps); each token varies a little in size and tilt, has its own opacity, and now and then a
  // soft depth blur or a screen blend. Tokens drift in from just off their place. All lyric tokens sit under a quiet
  // "camera" that drifts and gives a small push, shake or twist on the drum hits. The pointer scatters tokens and
  // springs pull them back. Randomness comes from a seed so the two layers that show lyrics show the same shot.
  const JA_FONT = '"Noto Serif JP","Yu Mincho","Hiragino Mincho ProN","MeguLit Serif",serif';
  const HUD_FONT = '"MeguLit Mono",ui-monospace,Consolas,monospace';
  try { document.fonts?.load('300 12px "MeguLit Mono"'); } catch {}
  const INK = { red: ['#e0505c', '#a51d2d'], gold: ['#f0c36a', '#9a6a12'], white: ['#f4f1ea', '#3a1a1e'] };
  const GLOW = { red: 'rgba(224,80,92,.6)', gold: 'rgba(240,195,106,.55)', white: 'rgba(244,241,234,.5)' };
  const BLENDS_DARK = ['source-over', 'source-over', 'source-over', 'screen'];
  const BLENDS_LIGHT = ['source-over', 'source-over', 'source-over', 'multiply'];
  const BLURS = [0, 0, 0, 0, 0, 0, 1.2, 2.5];
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const pickOf = (r, list) => list[Math.floor(r() * list.length)];
  const measurer = document.createElement('canvas').getContext('2d');

  // one token rendered once (with its blur and glow) to an offscreen canvas
  function tokenSprite(t) {
    const font = t.hud || t.en ? `300 ${t.size}px ${HUD_FONT}` : `700 ${t.size}px ${JA_FONT}`;
    const track = t.en ? '.32em' : t.hud ? '.3em' : '0px';
    if (t.en) t.text = t.text.toLowerCase();
    measurer.font = font;
    try { measurer.letterSpacing = track; } catch {}
    const tw = Math.max(t.size * .5, measurer.measureText(t.text).width), pad = Math.ceil(t.blur * 2.5 + t.size * .3);
    const w = Math.ceil(tw + pad * 2), h = Math.ceil(t.size * 1.5 + pad * 2);
    const c = document.createElement('canvas'), dprS = Math.min(devicePixelRatio || 1, 2);
    c.width = Math.ceil(w * dprS); c.height = Math.ceil(h * dprS);
    const g = c.getContext('2d');
    g.scale(dprS, dprS);
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    try { g.letterSpacing = track; } catch {}
    if (t.hud) g.fillStyle = dark ? '#8a8a8a' : '#6b6b6b';
    else {
      g.fillStyle = INK[t.ink][dark ? 0 : 1];
      g.filter = t.blur > .3 ? `blur(${t.blur}px)` : 'none';
      g.shadowColor = dark ? GLOW[t.ink] : 'rgba(255,250,244,.85)'; g.shadowBlur = t.size * .22;
    }
    g.fillText(t.text, w / 2, h / 2);
    return { c, w, h, tw };
  }

  let words = [];
  const cam = { zoom: 1, rot: 0, x: 0, y: 0, vz: 0, vr: 0, vx: 0, vy: 0, drift: { x: 0, y: 0, z: 0, r: 0 }, t0: 0 };
  const tokenize = text => {
    const out = [];
    for (const m of text.matchAll(/[A-Za-z0-9'’]+(?:[-.][A-Za-z0-9'’]+)*|\s+|./gu)) {
      if (/^\s+$/.test(m[0])) { out.push({ space: true }); continue; }
      out.push({ text: m[0], en: /[A-Za-z0-9]/.test(m[0]) });
    }
    return out;
  };

  const say = (text, seed = Math.random() * 2 ** 32, hud = '') => {
    const now = performance.now();
    words.forEach(w => { if (w.out > now) { w.out = now; w.exit = true; } });
    text = String(text || '').trim();
    if (!text) return;
    const r = rng(seed >>> 0);
    let toks = tokenize(text).slice(0, 48);
    // the empty margins beside the page's content column: English words play there when they are wide enough
    const col = document.querySelector('.statement .wrap, .sec .wrap')?.getBoundingClientRect();
    const margin = col ? Math.max(0, Math.min(col.left, W - col.right) - 16) : 0;
    // most English words go to the margins; a share of them (20–40% per line) stays in the line with the Japanese
    const r0 = rng((seed >>> 0) ^ 0x5bd1e995), inlineShare = .2 + r0() * .2;
    toks.forEach(t => { if (t.en) t.inline = r0() < inlineShare; });
    const enSide = margin >= 130 ? toks.filter(t => t.en && !t.inline) : [];
    if (enSide.length) toks = toks.filter(t => !(t.en && !t.inline)).filter((t, i, a) => !(t.space && (i === 0 || a[i - 1].space)));
    const real = toks.filter(t => !t.space);
    // orderly paths: the line keeps a clear reading shape; the randomness lives in the details, not the layout
    const shapes = real.length <= 12 && H > 420 ? ['row', 'row', 'arc', 'column', 'stair'] : ['row', 'row', 'row', 'arc', 'stair'];
    const shape = pickOf(r, shapes);
    const base = 26 + r() * 22;                                   // a line's base size; tokens vary a little around it
    const blends = dark ? BLENDS_DARK : BLENDS_LIGHT;
    const lineInk = pickOf(r, ['red', 'gold', 'white']);       // one colour per line
    // tokens: size, colour, blur, blend, tilt are each random per token
    for (const t of real) {
      t.size = Math.round(base * (.86 + r() * .3) * (t.en ? .62 : 1));
      t.ink = lineInk;
      t.blur = pickOf(r, BLURS);
      t.alpha = .3 + r() * .5;                                     // random opacity per token: .3–.8
      t.blend = pickOf(r, blends);
      t.tilt = (r() - .5) * (shape === 'column' ? .08 : .16);
      t.spr = tokenSprite(t);
    }
    // the path, in reading order, in screen coordinates
    const advance = t => (t.space ? base * .45 : t.spr.tw * .92 + t.size * .12);
    const total = toks.reduce((s, t) => s + advance(t), 0);
    const fit = Math.min(1, (W * .86) / Math.max(1, total));      // a row never runs off the screen
    const cx = W * (.3 + r() * .4), cy = H * (.25 + r() * .5);
    let u = 0;
    const place = [];
    for (const t of toks) {
      const a = advance(t) * fit, mid = u + a / 2; u += a;
      if (t.space) continue;
      const f = mid / Math.max(1, total * fit);                   // 0 → 1 along the line
      let x, y, rot = t.tilt;
      if (shape === 'column') { const step = Math.min(base * 1.15, (H * .72) / Math.max(1, real.length)); x = cx; y = H * .14 + place.length * step; rot *= .5; }
      else if (shape === 'arc') { const R = W * (.9 + r() * .4), ang = (f - .5) * (total * fit) / R; x = W / 2 + Math.sin(ang) * R; y = cy + R - Math.cos(ang) * R - R * .02; rot = ang + t.tilt * .4; }
      else if (shape === 'stair') { x = W * .07 + mid * (W * .86) / Math.max(1, total * fit); y = cy - H * .12 + f * H * .24; }
      else if (shape === 'scatter') { x = W * .07 + mid * (W * .86) / Math.max(1, total * fit); y = cy + (r() - .5) * H * .34; rot = t.tilt * 1.6; }
      else if (shape === 'spiral') { const ang = f * Math.PI * 1.6 - Math.PI * .8, rad = H * (.08 + f * .3); x = W / 2 + Math.cos(ang) * rad * 1.5; y = H / 2 + Math.sin(ang) * rad; rot = ang + Math.PI / 2 + t.tilt * .3; }
      else { x = W * .07 + mid * (W * .86) / Math.max(1, total * fit); y = cy + (r() - .5) * base * .12; }
      place.push([t, x, y, rot]);
    }
    place.forEach(([t, x, y, rot], k) => {
      const from = r() * Math.PI * 2, dist = 30 + r() * 70;       // drifts in from slightly off its place
      words.push({ ...t, hx: x, hy: y, x: x + Math.cos(from) * dist, y: y + Math.sin(from) * dist, vx: 0, vy: 0, rot: rot + (r() - .5) * .3, hrot: rot, vr: 0,
        zoom: 1.25 + r() * .35, pop: 1, born: now + k * (40 + r() * 50), out: now + 9000, exitDir: r() * Math.PI * 2 });
    });
    // English words: stacked in one side margin, each one fitted to the margin's width, read top to bottom
    if (enSide.length) {
      const right = r() < .5, mx = right ? W - margin / 2 - 8 : margin / 2 + 8;
      let y = H * (.18 + r() * .3);
      enSide.forEach((t, k) => {
        t.size = Math.round(base * (.5 + r() * .25)); t.ink = lineInk; t.blur = pickOf(r, BLURS); t.alpha = .4 + r() * .45; t.blend = pickOf(r, blends); t.tilt = 0;
        t.spr = tokenSprite(t);
        if (t.spr.tw > margin * .86) { t.size = Math.max(9, Math.floor(t.size * margin * .86 / t.spr.tw)); t.spr = tokenSprite(t); }
        const from = right ? 0 : Math.PI;
        words.push({ ...t, hx: mx, hy: y, x: mx + Math.cos(from) * 60, y, vx: 0, vy: 0, rot: 0, hrot: 0, vr: 0, zoom: 1.15, pop: 1,
          born: now + 200 + k * 90, out: now + 9000, exitDir: from });
        y += t.size * 1.9;
      });
    }
    if (hud) {
      const [t0, x0, y0] = place[0] || [null, W * .1, H * .3];
      const h = { text: hud, hud: true, size: 11, blur: 0 }; h.spr = tokenSprite(h);
      words.push({ ...h, hx: x0 - (t0 ? t0.spr.tw / 2 : 0) + h.spr.tw / 2, hy: y0 - base * 1.05, x: x0, y: y0 - base, vx: 0, vy: 0, rot: 0, hrot: 0, vr: 0, zoom: 1, pop: 1, born: now, out: now + 9000, exitDir: -Math.PI / 2 });
    }
    // each line is a new shot: a slow dolly and roll for the camera to drift through
    cam.drift = { x: (r() - .5) * 30, y: (r() - .5) * 20, z: (r() - .5) * .05, r: (r() - .5) * .03 }; cam.t0 = now;
  };

  // drum hits on the lyric camera: kicks punch in and shake, snares twist
  const camHit = (kind, s) => {
    if (kind === 'kick') { cam.vz += .25 * s; cam.vx += (Math.random() - .5) * 160 * s; cam.vy += (Math.random() - .5) * 110 * s; }
    else cam.vr += (Math.random() < .5 ? -1 : 1) * .18 * s;
  };

  // a drum hit: each layer picks one of a few moves at random, sized by the hit's strength. Nothing flashes and the
  // brightness never changes; the hits are spatial only (pushes, spins, pops)
  const MOVES = ['burst', 'spin', 'pop', 'jump', 'sway'];
  const pulse = (kind, strength = 1) => {
    if (still) return;
    const s = Math.max(.2, Math.min(1, strength)) * (kind === 'kick' ? 1 : .6);
    const move = MOVES[Math.floor(Math.random() * MOVES.length)];
    const cx = W / 2, cy = H / 2;
    const k = deep ? .6 : near ? 1.2 : 1;
    for (const p of parts) {
      if (Math.random() > .55) continue;                 // a random share of the glyphs reacts to each hit
      if (move === 'burst') { const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy) || 1; p.vx += dx / d * 160 * s * k; p.vy += dy / d * 160 * s * k; }
      else if (move === 'spin') p.vr += (Math.random() < .5 ? -1 : 1) * 2.4 * s;
      else if (move === 'pop') p.pop = 1 + .45 * s;
      else if (move === 'jump') p.vy -= 140 * s * k;
      else p.vx += (Math.random() < .5 ? -1 : 1) * 120 * s * k;
    }
    for (const w of words) { w.pop = 1 + (w.hud ? .05 : .12) * s * (.5 + Math.random()); if (move === 'jump') w.vy -= 30 * s; else if (move !== 'pop') w.vx += (Math.random() - .5) * 60 * s; }
    camHit(kind, s);
  };
  const drawWords = (now, dt, dy, layerVis) => {
    words = words.filter(w => now < w.out + 1100);
    // camera: springs back to rest, plus the line's slow dolly/roll and a gentle breathing zoom
    if (!still) {
      const life = Math.min(1, (now - cam.t0) / 9000), d = cam.drift;
      cam.vz += ((1 + d.z * life + Math.sin(now / 1900) * .015) - cam.zoom) * 9 * dt; cam.vr += ((d.r * life) - cam.rot) * 7 * dt;
      cam.vx += ((d.x * life) - cam.x) * 10 * dt; cam.vy += ((d.y * life) - cam.y) * 10 * dt;
      const damp = Math.pow(.02, dt);
      cam.vz *= damp; cam.vr *= damp; cam.vx *= damp; cam.vy *= damp;
      cam.zoom += cam.vz * dt; cam.rot += cam.vr * dt; cam.x += cam.vx * dt; cam.y += cam.vy * dt;
    }
    ctx.save();
    ctx.translate(W / 2 + cam.x, H / 2 + cam.y); ctx.scale(cam.zoom, cam.zoom); ctx.rotate(cam.rot); ctx.translate(-W / 2, -H / 2);
    for (const w of words) {
      if (now < w.born) continue;
      const dx = w.x - pointer.x, dyp = w.y - pointer.y, d2 = dx * dx + dyp * dyp;
      if (!still && d2 < 170 * 170) { const d = Math.sqrt(d2) || 1, f = (1 - d / 170) * 1800; w.vx += dx / d * f * dt; w.vy += dyp / d * f * dt; w.vr += (dx > 0 ? 1 : -1) * f * .003 * dt; }
      const leaving = now > w.out;
      if (!still) {
        if (leaving) { w.vx += Math.cos(w.exitDir) * 120 * dt; w.vy += Math.sin(w.exitDir) * 120 * dt - 80 * dt; }
        else { w.vx += (w.hx - w.x) * 7 * dt; w.vy += (w.hy - w.y) * 7 * dt; w.vr += (w.hrot - w.rot) * 6 * dt; }
        const damp = Math.pow(.08, dt);
        w.vx *= damp; w.vy *= damp; w.vr *= damp;
        w.x += w.vx * dt; w.y += w.vy * dt - dy * .2; w.hy -= dy * .2; w.rot += w.vr * dt;
        w.zoom += (1 - w.zoom) * Math.min(1, dt * 6);              // flies in from depth
      } else { w.x = w.hx; w.y = w.hy; w.rot = w.hrot; w.zoom = 1; }
      const fadeIn = clamp((now - w.born) / 450), fadeOut = 1 - clamp((now - w.out) / 1100);
      const a = (w.hud ? .7 : (w.alpha ?? .55)) * .75 * fadeIn * fadeOut * layerVis;
      if (a < .005) continue;
      w.pop += (1 - w.pop) * Math.min(1, dt * 7);
      const s = w.zoom * w.pop * (leaving ? 1 + (1 - fadeOut) * .15 : 1), sw = w.spr.w * s, sh = w.spr.h * s;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.globalCompositeOperation = w.blend || 'source-over';
      ctx.translate(w.x, w.y); ctx.rotate(w.rot);
      ctx.drawImage(w.spr.c, -sw / 2, -sh / 2, sw, sh);
      ctx.restore();
    }
    ctx.restore();
  };

  let lastY = scrollY, last = 0, running = false;
  const heroH = () => (hero ? hero.offsetHeight : H);
  const frame = now => {
    const dt = Math.min(.05, last ? (now - last) / 1000 : .016); last = now;
    const dy = scrollY - lastY; lastY = scrollY;
    const heroVis = clamp(1 - scrollY / (heroH() * .85));
    // followers stay with the reader until the `until` section scrolls up to the top of the screen, then fade
    const stop = until ? until.getBoundingClientRect().top : H;
    const followVis = clamp(stop / (H * .6));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      const vis = deep ? 1 : near ? Math.max(heroVis, .85) : p.follower ? Math.max(heroVis, .75 * followVis) : heroVis;
      // the pointer pushes near glyphs more than far ones
      const dx = p.x - pointer.x, dyp = p.y - pointer.y, d2 = dx * dx + dyp * dyp;
      if (!still && d2 < 150 * 150) { const d = Math.sqrt(d2) || 1, f = (1 - d / 150) * 700 * (.3 + p.z); p.vx += dx / d * f * dt; p.vy += dyp / d * f * dt; }
      if (!still) {
        p.vx *= .95; p.vy += (-(4 + p.z * 14) - p.vy) * .02;
        p.sway += dt * (.4 + p.z * .5);
        p.x += (p.vx + Math.sin(p.sway) * 6) * dt;
        p.y += p.vy * dt - dy * (.25 + p.z * .9);              // parallax: near glyphs slide past faster
        p.rot += p.vr * dt;
        p.vr += dy * .0016 * (.3 + p.z) * (p.i % 2 ? 1 : -1);   // a quick scroll gives them a spin
        p.vr *= .985;
      }
      p.pop = p.pop ? p.pop + (1 - p.pop) * Math.min(1, dt * 6) : 1;
      const m = p.spr.w * p.pop;
      if (p.y < -m) { p.y = H + m * .5; p.x = Math.random() * W; }
      if (p.y > H + m) { p.y = -m * .5; p.x = Math.random() * W; }
      if (p.x < -m) p.x = W + m * .5; else if (p.x > W + m) p.x = -m * .5;
      const a = p.alpha * vis;
      if (a < .005) continue;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.drawImage(p.spr.c, -m / 2, -m / 2, m, m);
      ctx.restore();
    }
    // lyric lines: on the hero they show on the sky layer (the hero covers the bottom one), below it on the bottom layer
    if (words.length) drawWords(now, dt, dy, deep ? 1 - heroVis : near ? 0 : heroVis);
    if (!still && !document.hidden) requestAnimationFrame(frame);
    else running = false;
  };
  const start = () => { if (running) return; running = true; last = 0; requestAnimationFrame(frame); };
  if (still) { requestAnimationFrame(frame); addEventListener('scroll', () => requestAnimationFrame(frame), { passive: true }); }
  else { start(); document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); }); }
  return { say, pulse, clear: () => say('') };
}
