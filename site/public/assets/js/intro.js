// SPDX-License-Identifier: GPL-3.0-or-later
// Entrance: one parchment page covers the screen and turns from right to left like paper, not a board. The page is
// cut into thin vertical strips chained edge to edge (each hinged on the previous one). The right edge lifts first and
// the bend travels left, so the sheet curls as it turns; each strip is shaded by how far it has turned.
// Once per browser session; any click or key skips it; never shown when motion is reduced (the head script decides).

const N = 44;            // strips across the page
const HOLD = 650;        // ms the page rests before turning
const TURN = 1700;       // ms for the turn
const smooth = t => t * t * (3 - 2 * t);
const clamp = v => Math.min(1, Math.max(0, v));

function pageArt(W, H) {
  // the page's ink as one SVG, sliced by background-position across the strips
  const cx = W / 2, cy = H * .46, r = Math.min(W, H) * .3;
  const tri = (s) => [0, 1, 2].map(k => { const a = (k * 120 + s) * Math.PI / 180; return `${cx + r * .9 * Math.sin(a)},${cy - r * .9 * Math.cos(a)}`; }).join(' ');
  const lines = Array.from({ length: 6 }, (_, k) => `<line x1="${W * .12}" x2="${W * (k % 2 ? .3 : .34)}" y1="${H * .16 + k * H * .045}" y2="${H * .16 + k * H * .045}"/>`).join('');
  const linesR = Array.from({ length: 6 }, (_, k) => `<line x1="${W * (k % 2 ? .7 : .66)}" x2="${W * .88}" y1="${H * .66 + k * H * .045}" y2="${H * .66 + k * H * .045}"/>`).join('');
  const fs = Math.max(26, Math.min(W, H) * .062);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<g fill="none" stroke="#9e1b2d" stroke-opacity=".32" stroke-width="1.4"><circle cx="${cx}" cy="${cy}" r="${r}"/><circle cx="${cx}" cy="${cy}" r="${r * .93}" stroke-dasharray="2 6" stroke-width="5"/>
<circle cx="${cx}" cy="${cy}" r="${r * .62}"/><polygon points="${tri(0)}"/><polygon points="${tri(60)}"/><circle cx="${cx}" cy="${cy}" r="${r * .2}"/></g>
<g stroke="#5a2a20" stroke-opacity=".18" stroke-width="2.4" stroke-linecap="round">${lines}${linesR}</g>
<text x="${cx}" y="${cy + r * .08}" text-anchor="middle" font-family="Yu Mincho, YuMincho, Noto Serif JP, Hiragino Mincho ProN, serif" font-weight="600" font-size="${fs}" fill="#3a1418" letter-spacing="${fs * .12}">続きを読もう</text>
<text x="${cx + fs * 1.12}" y="${cy + r * .08 - fs * 1.02}" text-anchor="middle" font-family="Yu Mincho, YuMincho, Noto Serif JP, serif" font-size="${fs * .36}" fill="#9e1b2d">よ</text>
</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function playIntro() {
  const root = document.documentElement;
  const el = document.querySelector('.intro');
  if (!el || !root.classList.contains('intro-on')) return Promise.resolve();
  try { sessionStorage.setItem('megulit-intro', '1'); } catch {}
  document.body.style.overflow = 'hidden';

  const W = innerWidth, H = innerHeight, w = Math.ceil(W / N);
  const art = pageArt(W, H);
  const paper = 'radial-gradient(130% 110% at 0% 50%, rgba(90, 45, 22, .28), transparent 38%), radial-gradient(90% 75% at 68% 32%, #fbf2e1, #efdfc2 62%, #d9c19a)';
  const curl = el.querySelector('.curl');
  const strips = [];
  let parent = curl;
  for (let i = 0; i < N; i++) {
    const s = document.createElement('div');
    s.className = 'strip';
    s.style.width = `${w + 1}px`;
    s.style.left = i === 0 ? '0' : `${w}px`;
    const pos = `${-i * w}px 0`;
    s.innerHTML = `<div class="sf front"></div><div class="sf back"></div>`;
    const front = s.firstChild, back = s.lastChild;
    front.style.backgroundImage = `${art}, ${paper}`;
    front.style.backgroundSize = `${W}px ${H}px, ${W}px ${H}px`;
    front.style.backgroundPosition = `${pos}, ${pos}`;
    back.style.backgroundImage = paper;
    back.style.backgroundSize = `${W}px ${H}px`;
    back.style.backgroundPosition = `${-(N - 1 - i) * w}px 0`;
    parent.append(s);
    strips.push(s);
    parent = s;
  }

  return new Promise(resolve => {
    let done = false, raf = 0, t0 = 0;
    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      root.classList.remove('intro-on');
      document.body.style.overflow = '';
      el.remove();
      removeEventListener('keydown', skip);
      resolve();
    };
    const shade = el.querySelector('.under-shade');
    const frame = now => {
      if (!t0) t0 = now;
      const t = clamp((now - t0 - HOLD) / TURN);
      // absolute angle of strip i: right strips lead, the bend sweeps leftward; all reach -180 at the end
      let prev = 0;
      const angle = i => { const lead = (N - 1 - i) / (N - 1); return -180 * smooth(clamp((t - lead * .62) / .38)); };
      const dark = a => (Math.abs(Math.sin(a * Math.PI / 180)) * .5).toFixed(3);
      for (let i = 0; i < N; i++) {
        const abs = angle(i), next = i + 1 < N ? angle(i + 1) : abs;  // shade blends into the neighbour: no banding
        const rel = abs - prev; prev = abs;
        strips[i].style.transform = `rotateY(${rel.toFixed(2)}deg)`;
        strips[i].style.setProperty('--d0', dark(abs));
        strips[i].style.setProperty('--d1', dark(next));
      }
      shade.style.opacity = String(.6 * (1 - smooth(clamp((t - .35) / .65))));
      if (t >= 1) { el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220 }).finished.then(finish); return; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const skip = () => { cancelAnimationFrame(raf); el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260 }).finished.then(finish); };
    el.addEventListener('click', skip);
    addEventListener('keydown', skip);
  });
}
