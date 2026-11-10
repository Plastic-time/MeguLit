// SPDX-License-Identifier: GPL-3.0-or-later
// Hero canvas effects, no libraries:
//  - ring(): a waveform ring inside the magic circle. Radial bars swell into a four-point star, a dotted spiral
//    orbits, a crimson-to-gold arc runs round it. With the video's sound on it follows the music's spectrum.
//  - kana(): kana drifting up through the hero, scattering away from the pointer.
// Both draw only while the hero is on screen, and render one still frame when motion is reduced.

const GOLD = [234, 187, 95], CRIMSON = [255, 92, 108], DEEP = [200, 40, 60];
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

export function ring(canvas, { still = false, spectrum = () => null } = {}) {
  const ctx = canvas.getContext('2d');
  const BARS = 160;
  const smooth = new Float32Array(BARS);
  loop(canvas, t => {
    const { w, h } = fit(canvas);
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * .3;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    const spec = spectrum();

    // radial bars: a four-point star that breathes; the music adds to it
    for (let i = 0; i < BARS; i++) {
      const a = i / BARS * Math.PI * 2 - Math.PI / 2;
      const star = Math.pow(Math.abs(Math.cos(a * 2)), 6);
      let v = .18 + star * .8 * (.75 + .25 * Math.sin(t * 1.6 + i * .05)) + .06 * Math.sin(t * 3 + i * .7);
      if (spec) {
        const k = Math.floor((i < BARS / 2 ? i : BARS - i) / (BARS / 2) * spec.length * .7);
        v = .12 + star * .5 + (spec[k] / 255) * 1.1;
      }
      smooth[i] += (v - smooth[i]) * (spec ? .35 : .12);
      const len = R * .62 * smooth[i];
      const r0 = R * .2;
      const c = mix(DEEP, CRIMSON, Math.min(1, smooth[i]));
      ctx.strokeStyle = rgba(c, .5 + .4 * Math.min(1, smooth[i]));
      ctx.lineWidth = Math.max(1, w / 520);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len));
      ctx.stroke();
    }

    // arc: crimson running into gold, sweeping round
    const sweep = t * .5;
    for (let s = 0; s < 64; s++) {
      const a0 = sweep + s / 64 * Math.PI * 1.6, a1 = a0 + Math.PI * 1.6 / 64 + .01;
      ctx.strokeStyle = rgba(mix(CRIMSON, GOLD, s / 64), .25 + .65 * (s / 64));
      ctx.lineWidth = w / 220;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy, R * .98, a0, a1);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';

    // dotted spiral orbiting the core
    for (let d = 0; d < 46; d++) {
      const p = d / 46;
      const a = -t * .9 + p * Math.PI * 1.25;
      const rr = R * (.28 + p * .72);
      ctx.fillStyle = rgba(mix(GOLD, CRIMSON, p), .9 - p * .55);
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, (w / 300) * (1.4 - p * .6), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }, still);
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
    hue: Math.random(), life: 0,
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

// Spectrum of the video's sound, available once the visitor turns sound on (a user gesture, as browsers require).
export function audioSpectrum(video) {
  let analyser = null, data = null;
  return {
    start() {
      if (analyser) return;
      try {
        const ac = new (window.AudioContext || window.webkitAudioContext)();
        const src = ac.createMediaElementSource(video);
        analyser = ac.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = .7;
        src.connect(analyser);
        analyser.connect(ac.destination);
        data = new Uint8Array(analyser.frequencyBinCount);
        ac.resume?.();
      } catch { analyser = null; }
    },
    read() {
      if (!analyser || video.muted || video.paused) return null;
      analyser.getByteFrequencyData(data);
      return data;
    },
  };
}
