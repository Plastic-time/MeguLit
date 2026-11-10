// SPDX-License-Identifier: GPL-3.0-or-later
// Hero canvas effect, no libraries: kana drifting up through the hero, scattering away from the pointer.
// Draws only while the hero is on screen, and renders one still frame when motion is reduced.

const GOLD = [236, 236, 232], CRIMSON = [200, 50, 60];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

function fit(canvas) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const r = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return { w, h, dpr };
}

// Runs draw(t) every frame while the element is visible and the tab is shown.
function loop(el, draw, still) {
  let raf = 0, on = false;
  const tick = t => { draw(t / 1000); raf = requestAnimationFrame(tick); };
  const set = v => { if (v === on) return; on = v; if (v) raf = requestAnimationFrame(tick); else cancelAnimationFrame(raf); };
  if (still) { requestAnimationFrame(() => draw(2.2)); addEventListener('resize', () => draw(2.2)); return; }
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; set(visible && !document.hidden); }).observe(el);
  document.addEventListener('visibilitychange', () => set(visible && !document.hidden));
  set(true);
}

const KANA = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん読物語言葉魔導書続空気';

export function kana(canvas, host, { still = false } = {}) {
  const ctx = canvas.getContext('2d');
  const pointer = { x: -1e4, y: -1e4 };
  host.addEventListener('pointermove', e => { const r = canvas.getBoundingClientRect(); pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; });
  host.addEventListener('pointerleave', () => { pointer.x = pointer.y = -1e4; });
  let parts = [], last = 0;
  const make = (w, h, anywhere) => ({
    ch: KANA[Math.floor(Math.random() * KANA.length)],
    x: Math.random() * w, y: anywhere ? Math.random() * h : h + 20,
    vx: 0, vy: -(8 + Math.random() * 18),
    size: 12 + Math.random() * 22, rot: (Math.random() - .5) * .6, vr: (Math.random() - .5) * .3,
    hue: Math.random() < .12 ? 1 : 0, life: 0,
  });
  loop(canvas, t => {
    const { w, h, dpr } = fit(canvas);
    const cw = w / dpr, ch = h / dpr;
    const want = Math.round(Math.min(70, cw * ch / 16000));
    if (parts.length < want) parts.push(...Array.from({ length: want - parts.length }, () => make(cw, ch, true)));
    const dt = Math.min(.05, last ? t - last : .016);
    last = t;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of parts) {
      const dx = p.x - pointer.x, dy = p.y - pointer.y, d2 = dx * dx + dy * dy;
      if (d2 < 140 * 140) { const f = (1 - Math.sqrt(d2) / 140) * 900; const d = Math.sqrt(d2) || 1; p.vx += dx / d * f * dt; p.vy += dy / d * f * dt; }
      p.vx *= .94; p.vy += (-(10 + p.size * .4) - p.vy) * .03;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.life += dt;
      if (p.y < -40 || p.x < -60 || p.x > cw + 60) Object.assign(p, make(cw, ch, false));
      const fade = Math.min(1, p.life / 1.5) * Math.min(1, (p.y + 40) / (ch * .35));
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.font = `600 ${p.size}px "Noto Serif JP","Yu Mincho","MeguLit Serif",serif`;
      ctx.fillStyle = rgba(mix(GOLD, CRIMSON, p.hue), .1 + .16 * fade);
      ctx.fillText(p.ch, 0, 0);
      ctx.restore();
    }
  }, still);
}
