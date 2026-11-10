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

function sprite(ch, size, blur, color) {
  const pad = Math.ceil(blur * 2.5 + 2), w = Math.ceil(size * 1.25) + pad * 2;
  const c = document.createElement('canvas');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  c.width = c.height = Math.ceil(w * dpr);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  g.filter = blur > .3 ? `blur(${blur.toFixed(1)}px)` : 'none';
  g.fillStyle = color;
  g.font = `600 ${size}px ${FONT}`;
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
    words.forEach(w => { w.spr = sprite(w.ch, w.size, 0, palette().ink); });
  };
  new MutationObserver(reink).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', reink);

  // lyric lines: one glyph per character, laid out in a row in the lower part of the screen; each is pulled back to its
  // place by a spring, so the pointer can scatter a line and watch it come back; a line fades in, stays, then drifts up
  let words = [];
  const say = text => {
    const now = performance.now();
    words.forEach(w => { if (w.out > now) w.out = now; });
    text = String(text || '').trim();
    if (!text) return;
    const chars = [...text].slice(0, 40);
    const size = Math.max(22, Math.min(56, (W * .86) / Math.max(chars.length, 8)));
    const step = size * 1.02, x0 = W / 2 - (chars.length - 1) * step / 2, y = H * .7;
    chars.forEach((ch, k) => {
      if (/\s/.test(ch)) return;
      words.push({ ch, size, spr: sprite(ch, size, 0, palette().ink), hx: x0 + k * step, hy: y, x: x0 + k * step, y: y + 18, vx: 0, vy: 0,
        rot: 0, vr: 0, born: now + k * 45, out: now + 9000 });
    });
  };
  const drawWords = (now, dt, dy, layerVis) => {
    words = words.filter(w => now < w.out + 1400);
    for (const w of words) {
      const dx = w.x - pointer.x, dyp = w.y - pointer.y, d2 = dx * dx + dyp * dyp;
      if (!still && d2 < 160 * 160) { const d = Math.sqrt(d2) || 1, f = (1 - d / 160) * 1600; w.vx += dx / d * f * dt; w.vy += dyp / d * f * dt; w.vr += (dx > 0 ? 1 : -1) * f * .002 * dt; }
      if (!still) {
        const leaving = now > w.out;
        w.vx += (w.hx - w.x) * (leaving ? 0 : 6) * dt; w.vy += ((leaving ? w.hy - 140 : w.hy) - w.y) * (leaving ? 1.5 : 6) * dt;
        w.vr += -w.rot * 5 * dt;
        w.vx *= .9; w.vy *= .9; w.vr *= .9;
        w.x += w.vx * dt; w.y += w.vy * dt - dy * .2; w.hy -= dy * .2; w.rot += w.vr * dt;
      }
      const fadeIn = clamp((now - w.born) / 600), fadeOut = 1 - clamp((now - w.out) / 1400);
      const a = .42 * fadeIn * fadeOut * layerVis;
      if (a < .005) continue;
      const m = w.spr.w;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(w.x, w.y); ctx.rotate(w.rot); ctx.drawImage(w.spr.c, -m / 2, -m / 2, m, m); ctx.restore();
    }
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
      const m = p.spr.w;
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
  return { say, clear: () => say('') };
}
