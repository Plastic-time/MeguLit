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

export function kana(canvas, { still = false, hero = null, until = null } = {}) {
  const ctx = canvas.getContext('2d');
  const pointer = { x: -1e4, y: -1e4 };
  addEventListener('pointermove', e => { pointer.x = e.clientX; pointer.y = e.clientY; }, { passive: true });
  let dark = isDark(), parts = [], W = 0, H = 0, dpr = 1;
  const palette = () => dark ? { ink: '#eceae6', red: '#d23a48' } : { ink: '#3a1a1e', red: '#a51d2d' };

  const make = (i, anywhere) => {
    const z = Math.pow(Math.random(), 1.3);                       // more far glyphs than near ones
    const size = 13 + z * 62;
    const blur = Math.abs(z - FOCUS) * (z > FOCUS ? 16 : 7);
    const red = Math.random() < .1;
    const ch = KANA[Math.floor(Math.random() * KANA.length)];
    const p = palette();
    return {
      i, z, ch, red, follower: i < FOLLOWERS,
      spr: sprite(ch, size, blur, red ? p.red : p.ink),
      x: Math.random() * W, y: anywhere ? Math.random() * H : H + 60,
      vx: (Math.random() - .5) * 6, vy: -(4 + Math.random() * 10) * (.4 + z),
      rot: (Math.random() - .5) * .5, vr: (Math.random() - .5) * .12,
      sway: Math.random() * Math.PI * 2,
      alpha: (.1 + .3 * (1 - Math.abs(z - FOCUS) * 1.4)) * (red ? 1.25 : 1),
    };
  };
  const fit = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const want = Math.round(Math.min(90, W * H / 15000));
    while (parts.length < want) parts.push(make(parts.length, true));
    parts.length = Math.max(want, FOLLOWERS);
  };
  fit();
  addEventListener('resize', fit);
  // a theme change re-inks the sprites, keeping each glyph where it is
  const reink = () => {
    const d = isDark();
    if (d === dark) return;
    dark = d;
    parts = parts.map(p => { const n = make(p.i, false); n.x = p.x; n.y = p.y; return n; });
  };
  new MutationObserver(reink).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', reink);

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
      const vis = p.follower ? Math.max(heroVis, .75 * followVis) : heroVis;
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
    if (!still && !document.hidden) requestAnimationFrame(frame);
    else running = false;
  };
  const start = () => { if (running) return; running = true; last = 0; requestAnimationFrame(frame); };
  if (still) { requestAnimationFrame(frame); addEventListener('scroll', () => requestAnimationFrame(frame), { passive: true }); }
  else { start(); document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); }); }
}
