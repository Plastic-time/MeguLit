// SPDX-License-Identifier: GPL-3.0-or-later
// Entrance in three beats, on black:
//   1. cape: the logo's own cape unfurls left to right in thin strips that ripple like cloth and settle, while the hat
//      and letters land big -> small, soft -> sharp, and a red lowercase line types underneath (the promo video's
//      end-card move, redrawn on a canvas);
//   2. glitch: the finished logo is cut into horizontal bands that jump sideways with red / cyan channel fringes;
//   3. the black tears away in strips sliding left and right.
// Photosensitive-safe by construction: nothing flashes and overall brightness never changes; the glitch is spatial
// (displacement and colour fringing only), updated about 9 times a second.
// Once per browser session; any click or key skips it; never shown when motion is reduced (the head script decides).

const BANDS = 9, STRIPS = 10, TICK = 110;
const CAPE_MS = 1700, GLITCH_MS = 1100;
const CAPE_N = 48;                     // cloth strips
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = v => Math.max(0, Math.min(1, v));
const eo = (t, a, b, p = 4) => 1 - Math.pow(1 - clamp((t - a) / (b - a)), p);   // fast -> slow

const load = src => new Promise(res => { const i = new Image(); i.onload = i.onerror = () => res(i); i.src = src; });

export function playIntro() {
  const root = document.documentElement;
  const el = document.querySelector('.intro');
  if (!el || !root.classList.contains('intro-on')) return Promise.resolve();
  try { sessionStorage.setItem('megulit-intro', '1'); } catch {}
  document.body.style.overflow = 'hidden';

  const logo = el.querySelector('.gl-logo');
  const src = logo.dataset.src;
  // beat 2: bands of the whole logo (base + two channel copies each), hidden until the cape has settled
  const bands = [];
  for (let i = 0; i < BANDS; i++) {
    const b = document.createElement('div');
    b.className = 'gl-band';
    const top = (i / BANDS) * 100, bottom = 100 - ((i + 1) / BANDS) * 100;
    b.style.clipPath = `inset(${top}% -20% ${bottom}% -20%)`;
    b.innerHTML = `<img class="ch-c" src="${src}" alt=""><img class="ch-r" src="${src}" alt=""><img class="ch-b" src="${src}" alt="">`;
    logo.append(b);
    bands.push(b);
  }
  logo.classList.add('gl-hold');
  // beat 1: cape canvas (with room around the logo for the ripple) and the hat + letters on top
  const cape = document.createElement('canvas');
  cape.className = 'gl-cape';
  const rest = document.createElement('img');
  rest.className = 'gl-rest';
  rest.alt = '';
  rest.src = logo.dataset.rest;
  logo.append(cape, rest);

  const strips = [];
  const tear = el.querySelector('.gl-tear');
  for (let i = 0; i < STRIPS; i++) { const s = document.createElement('i'); s.style.top = `${(i / STRIPS) * 100}%`; s.style.height = `${100 / STRIPS + .2}%`; tear.append(s); strips.push(s); }

  const line = el.querySelector('.gl-text'), full = line.dataset.type || '';

  return new Promise(resolve => {
    let done = false, timer = 0, raf = 0;
    const finish = () => {
      if (done) return;
      done = true;
      clearInterval(timer);
      cancelAnimationFrame(raf);
      root.classList.remove('intro-on');
      document.body.style.overflow = '';
      el.remove();
      removeEventListener('keydown', skip);
      resolve();
    };
    const skip = () => { clearInterval(timer); cancelAnimationFrame(raf); el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260 }).finished.then(finish); };
    el.addEventListener('click', skip);
    addEventListener('keydown', skip);

    let k = 0;
    const type = () => { if (done) return; line.textContent = full.slice(0, ++k); if (k < full.length) setTimeout(type, 34); };

    // beat 1 -----------------------------------------------------------------------------------------------------------
    const runCape = img => {
      const g = cape.getContext('2d');
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const box = logo.getBoundingClientRect();
      const w = box.width, h = box.height, padX = w * .1, padY = h * .6;
      cape.width = Math.round((w + padX * 2) * dpr); cape.height = Math.round((h + padY * 2) * dpr);
      const sw = w / CAPE_N, kx = img.naturalWidth / w, ky = img.naturalHeight / h;
      const scale = w / 900;                                                         // the video's logo was 900 px wide
      let t0 = 0;
      setTimeout(type, 600);
      const frame = now => {
        if (done) return;
        if (!t0) t0 = now;
        const t = now - t0, f = t / 33.33;                                           // video frames at 30 fps
        const unfurl = eo(t, 0, 950, 3), amp = 30 * scale * (1 - eo(t, 250, 1600, 2));
        const front = unfurl * (CAPE_N + 6) - 3;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, w + padX * 2, h + padY * 2);
        for (let i = 0; i < CAPE_N; i++) {
          const vis = clamp(front - i);
          if (vis <= 0) break;
          const u = i / CAPE_N, near = clamp(1 - (front - i) / 6);
          const y = amp * (.35 + u) * Math.sin(u * 7.5 - f * .32) - near * amp * 1.2;
          const rot = near * -8 * Math.PI / 180;
          g.save();
          g.globalAlpha = vis;
          g.translate(padX + i * sw, padY + h * .7 + y);
          g.rotate(rot);
          g.drawImage(img, i * sw * kx, 0, (sw + 1) * kx, img.naturalHeight, -.5, -h * .7, sw + 1, h);
          g.restore();
        }
        const rp = eo(t, 200, 1150, 4);
        rest.style.opacity = clamp(rp * 1.6);
        rest.style.transform = `scale(${1.32 - .32 * rp})`;
        rest.style.filter = rp < .98 ? `blur(${((1 - rp) * 8).toFixed(1)}px)` : 'none';
        if (t < CAPE_MS) raf = requestAnimationFrame(frame);
        else glitch();
      };
      raf = requestAnimationFrame(frame);
    };

    // beat 2 -----------------------------------------------------------------------------------------------------------
    const glitch = () => {
      logo.classList.remove('gl-hold');
      cape.remove(); rest.remove();
      const t0 = performance.now();
      timer = setInterval(() => {
        const calm = Math.random() < .35;
        for (const b of bands) {
          const hit = !calm && Math.random() < .3;
          b.style.transform = `translateX(${(hit ? rnd(-28, 28) : 0).toFixed(1)}px)`;
          b.style.setProperty('--fx', `${hit ? rnd(3, 9).toFixed(1) : 0}px`); b.style.setProperty('--fa', hit ? 1 : 0);
        }
        if (performance.now() - t0 > GLITCH_MS) { clearInterval(timer); exit(); }
      }, TICK);
    };

    // beat 3 -----------------------------------------------------------------------------------------------------------
    const exit = () => {
      if (done) return;
      bands.forEach(b => { b.style.transform = ''; b.style.setProperty('--fa', 0); });
      const stage = el.querySelector('.gl-stage');
      stage.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-1.5rem)' }], { duration: 380, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
      const anims = strips.map((s, i) => s.animate(
        [{ transform: 'translateX(0)' }, { transform: `translateX(${i % 2 ? '' : '-'}105%)` }],
        { duration: 620, delay: 180 + i * 38, easing: 'cubic-bezier(.7,0,.25,1)', fill: 'forwards' }));
      Promise.all(anims.map(a => a.finished)).then(finish);
    };

    // start once the cape and the letters are decoded (never wait long: fall back to the glitch alone)
    const capeImg = load(logo.dataset.cape);
    Promise.race([Promise.all([capeImg, load(rest.src)]), new Promise(r => setTimeout(r, 900, null))]).then(r => {
      if (done) return;
      if (r && r[0].naturalWidth && r[1].naturalWidth) runCape(r[0]);
      else { cape.remove(); rest.remove(); setTimeout(type, 250); glitch(); }
    });
  });
}
