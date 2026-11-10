// SPDX-License-Identifier: GPL-3.0-or-later
// Entrance, on black: the logo's own cape unfurls left to right in thin strips that ripple like cloth and settle,
// while the hat and letters land big -> small, soft -> sharp, and a red lowercase line types underneath (the promo
// video's end-card move, redrawn on a canvas); then the black parts in strips sliding left and right.
// The overlay is black from the first paint (CSS), so the page never shows before the entrance.
// Nothing flashes and overall brightness never jumps. Every visit; any click or key skips it; never
// shown when motion is reduced (the head script decides).

const STRIPS = 10, CAPE_N = 48;
const CAPE_MS = 850, HOLD_MS = 220;
const clamp = v => Math.max(0, Math.min(1, v));
const eo = (t, a, b, p = 4) => 1 - Math.pow(1 - clamp((t - a) / (b - a)), p);   // fast -> slow

// loaded and decoded, so the first frame of the cape is ready to draw
const load = src => new Promise(res => { const i = new Image(); i.src = src; (i.decode ? i.decode() : new Promise((a, b) => { i.onload = a; i.onerror = b; })).then(() => res(i), () => res(i)); });

// wait until the page has finished its start-up work (two smooth frames in a row), at most 900 ms
const settle = () => new Promise(res => {
  const t0 = performance.now(); let last = 0, calm = 0;
  const step = now => { calm = last && now - last < 40 ? calm + 1 : 0; last = now; if (calm >= 2 || now - t0 > 900) res(); else requestAnimationFrame(step); };
  requestAnimationFrame(step);
});
let running = null, markShown;
// resolves once the logo is on screen (or at once when there is no entrance): heavy loading waits for it
export const introShown = new Promise(r => { markShown = r; });
// Called as early as possible by app.js and again by fx.js; both get the same run.
export function playIntro() { return running || (running = play()); }

function play() {
  const root = document.documentElement;
  const el = document.querySelector('.intro');
  if (!el || !root.classList.contains('intro-on')) { markShown(); return Promise.resolve(); }
  document.body.style.overflow = 'hidden';

  const logo = el.querySelector('.gl-logo');
  const cape = document.createElement('canvas');
  cape.className = 'gl-cape';
  const rest = document.createElement('img');
  rest.className = 'gl-rest';
  rest.alt = '';
  logo.append(cape, rest);

  const strips = [];
  const tear = el.querySelector('.gl-tear');
  for (let i = 0; i < STRIPS; i++) { const s = document.createElement('i'); s.style.top = `${(i / STRIPS) * 100}%`; s.style.height = `${100 / STRIPS + .2}%`; tear.append(s); strips.push(s); }

  const line = el.querySelector('.gl-text'), full = line.dataset.type || '';

  return new Promise(resolve => {
    let done = false, raf = 0;
    const finish = () => {
      if (done) return;
      done = true;
      markShown();
      cancelAnimationFrame(raf);
      root.classList.remove('intro-on');
      document.body.style.overflow = '';
      el.remove();
      removeEventListener('keydown', skip);
      resolve();
    };
    const skip = () => { cancelAnimationFrame(raf); el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160 }).finished.then(finish); };
    el.addEventListener('click', skip);
    addEventListener('keydown', skip);

    let k = 0;
    const type = () => { if (done) return; line.textContent = full.slice(0, ++k); if (k < full.length) setTimeout(type, 17); };

    const runCape = img => {
      const g = cape.getContext('2d');
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const box = logo.getBoundingClientRect();
      const w = box.width, h = box.height, padX = w * .1, padY = h * .6;
      cape.width = Math.round((w + padX * 2) * dpr); cape.height = Math.round((h + padY * 2) * dpr);
      const sw = w / CAPE_N, kx = img.naturalWidth / w;
      const scale = w / 900;                                                         // the video's logo was 900 px wide
      // time advances at most 34 ms per frame: when the page is busy loading, the cape slows down instead of skipping
      let t = 0, last = 0;
      setTimeout(type, 300);
      setTimeout(markShown, 400);
      const frame = now => {
        if (done) return;
        t += last ? Math.min(34, now - last) : 0; last = now;
        const f = t / 16.67;                                           // the video's 30 fps timing, played at double speed
        const unfurl = eo(t, 0, 475, 3), amp = 30 * scale * (1 - eo(t, 125, 800, 2));
        const front = unfurl * (CAPE_N + 6) - 3;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, w + padX * 2, h + padY * 2);
        for (let i = 0; i < CAPE_N; i++) {
          const vis = clamp(front - i);
          if (vis <= 0) break;
          const u = i / CAPE_N, near = clamp(1 - (front - i) / 6);
          const y = amp * (.35 + u) * Math.sin(u * 7.5 - f * .32) - near * amp * 1.2;
          g.save();
          g.globalAlpha = vis;
          g.translate(padX + i * sw, padY + h * .7 + y);
          g.rotate(near * -8 * Math.PI / 180);
          g.drawImage(img, i * sw * kx, 0, (sw + 1) * kx, img.naturalHeight, -.5, -h * .7, sw + 1, h);
          g.restore();
        }
        const rp = eo(t, 100, 575, 4);
        rest.style.opacity = clamp(rp * 1.6);
        rest.style.transform = `scale(${1.32 - .32 * rp})`;
        rest.style.filter = rp < .98 ? `blur(${((1 - rp) * 8).toFixed(1)}px)` : 'none';
        if (t < CAPE_MS) raf = requestAnimationFrame(frame);
        else setTimeout(exit, HOLD_MS);
      };
      raf = requestAnimationFrame(frame);
    };

    // the black parts: from here the strips cover the screen, so the overlay itself can go clear
    const exit = () => {
      if (done) return;
      el.classList.add('parting');
      const stage = el.querySelector('.gl-stage');
      stage.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-1rem)' }], { duration: 190, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
      const anims = strips.map((s, i) => s.animate(
        [{ transform: 'translateX(0)' }, { transform: `translateX(${i % 2 ? '' : '-'}105%)` }],
        { duration: 310, delay: 90 + i * 19, easing: 'cubic-bezier(.7,0,.25,1)', fill: 'forwards' }));
      Promise.all(anims.map(a => a.finished)).then(finish);
    };

    // start once the cape and the letters are decoded (the head preloads them); the screen stays black meanwhile
    Promise.race([Promise.all([load(logo.dataset.cape), load(logo.dataset.rest)]), new Promise(r => setTimeout(r, 5000, null))]).then(r => {
      if (done) return;
      if (r && r[0].naturalWidth && r[1].naturalWidth) { rest.src = r[1].src; settle().then(() => { if (!done) runCape(r[0]); }); }
      else { cape.remove(); rest.src = logo.dataset.src; rest.style.opacity = 1; markShown(); setTimeout(type, 120); setTimeout(exit, 700); }
    });
  });
}
