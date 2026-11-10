// SPDX-License-Identifier: GPL-3.0-or-later
// Second motion layer. Original code; the ideas follow patterns seen on React Bits (scroll velocity, card stack,
// scroll reveal) and Aceternity UI (sticky scroll reveal, tracing beam, lamp, glowing edges).
import { animate, utils } from '../vendor/animejs-4.5.0/anime.esm.min.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export function run({ reduce, finePointer }) {
  stickyChapters(reduce);
  deck(reduce);
  if (reduce) return;
  velocityTicker();
  revealWords();
  if (finePointer) glowEdges();
}

// ---- Sticky chapters: the copy scrolls, one pinned stage crossfades between the clips, a beam traces progress ----
function stickyChapters(reduce) {
  const flow = $('.chap-flow');
  if (!flow) return;
  const wide = matchMedia('(min-width: 60.01rem)');
  const chaps = $$('.chap-list .chap', flow), items = $$('.stage-item', flow), rail = $('.chap-rail', flow);
  let active = -1;
  const setActive = i => {
    if (i === active) return;
    active = i;
    chaps.forEach((c, k) => c.classList.toggle('is-on', k === i));
    items.forEach((it, k) => {
      const on = k === i;
      it.classList.toggle('on', on);
      for (const v of $$('video', it)) {
        if (on && wide.matches && !reduce) { if (!v.getAttribute('src')) v.src = v.dataset.src; v.play().catch(() => {}); }
        else v.pause();
      }
    });
  };
  const io = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) setActive(Number(e.target.dataset.i));
  }, { rootMargin: '-45% 0px -45% 0px' });
  chaps.forEach(c => io.observe(c));
  setActive(0);
  let raf = 0;
  const beam = () => {
    raf = 0;
    const r = flow.getBoundingClientRect();
    rail?.style.setProperty('--p', clamp((innerHeight * .5 - r.top) / r.height).toFixed(4));
  };
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(beam); }, { passive: true });
  beam();
}

// ---- Anki deck: drag the top card away to send it to the back, click to flip it to the scene ----------------------
function deck(reduce) {
  const root = $('.deck');
  if (!root) return;
  let order = $$('.dcard', root);
  const place = (instant) => {
    order.forEach((c, p) => {
      c.toggleAttribute('data-top', p === 0);
      c.style.zIndex = String(20 - p);
      const to = { x: p * 18, y: p * -10, rotate: p * 3.2, scale: 1 - p * .05, opacity: p > 3 ? 0 : 1 };
      if (instant || reduce) utils.set(c, to);
      else animate(c, { ...to, duration: 650, ease: 'outElastic(1, .75)' });
    });
  };
  place(true);
  const next = (dir = 1) => {
    const top = order[0];
    const out = { x: dir * Math.min(root.clientWidth * 1.3, 560), y: -40, rotate: dir * 24, opacity: 0 };
    const done = () => {
      top.querySelector('.dc-inner').classList.remove('flipped');
      order = [...order.slice(1), top];
      utils.set(top, { x: 60, y: -40, rotate: 10, scale: .8, opacity: 0 });
      place(false);
    };
    if (reduce) { done(); return; }
    animate(top, { ...out, duration: 380, ease: 'in(2)', onComplete: done });
  };
  const flip = () => order[0].querySelector('.dc-inner').classList.toggle('flipped');

  let drag = null;
  root.addEventListener('pointerdown', e => {
    const card = e.target.closest('.dcard');
    if (!card || card !== order[0]) return;
    drag = { card, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, moved: false, t: performance.now(), vx: 0, lx: e.clientX };
    card.setPointerCapture(e.pointerId);
  });
  root.addEventListener('pointermove', e => {
    if (!drag) return;
    drag.dx = e.clientX - drag.x0; drag.dy = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(drag.dx, drag.dy) > 6) drag.moved = true;
    if (!drag.moved) return;
    const now = performance.now();
    drag.vx = (e.clientX - drag.lx) / Math.max(1, now - drag.t) * 1000; drag.lx = e.clientX; drag.t = now;
    utils.set(drag.card, { x: drag.dx, y: drag.dy * .6, rotate: drag.dx * .06, scale: 1.03 });
  });
  const end = () => {
    if (!drag) return;
    const { card, dx, moved, vx } = drag;
    drag = null;
    if (!moved) { flip(); return; }
    if (Math.abs(dx) > 90 || Math.abs(vx) > 650) next(Math.sign(dx || vx) || 1);
    else animate(card, { x: 0, y: 0, rotate: 0, scale: 1, duration: 700, ease: 'outElastic(1, .6)' });
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
  root.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); next(1); }
  });
}

// ---- Ticker that answers the scroll: faster when you scroll, reversed when you scroll up, leaning with speed -----
function velocityTicker() {
  const tracks = $$('.tk-track');
  if (!tracks.length) return;
  document.documentElement.classList.add('fx-vel');
  const state = tracks.map((el, i) => ({ el, x: 0, dir: i % 2 ? 1 : -1, w: 0, fling: 0 }));
  const measure = () => state.forEach(s => { s.w = s.el.scrollWidth / 2; });
  measure();
  addEventListener('resize', measure);
  new ResizeObserver(measure).observe(tracks[0]);
  let lastY = scrollY, lastT = performance.now(), smooth = 0, skew = 0, visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe($('.ticker'));
  // drag the bands with the pointer
  let drag = null;
  const ticker = $('.ticker');
  ticker.style.pointerEvents = 'auto';
  ticker.addEventListener('pointerdown', e => { drag = { x: e.clientX, v: 0, t: performance.now() }; ticker.setPointerCapture(e.pointerId); });
  ticker.addEventListener('pointermove', e => {
    if (!drag) return;
    const now = performance.now(), dx = e.clientX - drag.x;
    state.forEach(s => { s.x += dx; });
    drag.v = dx / Math.max(1, now - drag.t) * 1000; drag.x = e.clientX; drag.t = now;
  });
  const release = () => { if (!drag) return; state.forEach(s => { s.fling = clamp(drag.v, -4000, 4000); }); drag = null; };
  ticker.addEventListener('pointerup', release);
  ticker.addEventListener('pointercancel', release);

  const frame = now => {
    const dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
    const v = (scrollY - lastY) / Math.max(dt, .001); lastY = scrollY;
    smooth += (v - smooth) * (1 - Math.exp(-dt / .12));
    const factor = smooth / 1000 * 4;
    const sense = factor < 0 ? -1 : 1;
    skew += (clamp(smooth / 90, -11, 11) - skew) * (1 - Math.exp(-dt / .11));
    if (visible) for (const s of state) {
      if (!drag) s.x += s.dir * sense * 70 * dt * (1 + Math.abs(factor));
      s.x += s.fling * dt;
      s.fling *= Math.exp(-dt / .42);
      if (Math.abs(s.fling) < 4) s.fling = 0;
      if (s.w) s.x = ((s.x % s.w) - s.w) % s.w;
      s.el.style.transform = `translate3d(${s.x.toFixed(1)}px,0,0) skewX(${(skew * s.dir).toFixed(2)}deg)`;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// ---- Statement that sharpens piece by piece as it scrolls through the viewport ----------------------------------
function revealWords() {
  const els = $$('.reveal-words');
  if (!els.length) return;
  const split = el => {
    const text = el.textContent;
    el.setAttribute('aria-label', text);
    el.replaceChildren(...(text.match(/[A-Za-z0-9’'.,\-]+|\s+|./gu) || []).map(t => {
      if (/^\s+$/.test(t)) return document.createTextNode(t);
      const s = document.createElement('span');
      s.className = 'rw'; s.setAttribute('aria-hidden', 'true'); s.textContent = t;
      return s;
    }));
  };
  els.forEach(split);
  addEventListener('megulit:lang', () => { els.forEach(split); paint(); });
  let raf = 0;
  const paint = () => {
    raf = 0;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const p = clamp((innerHeight * .88 - r.top) / (r.height + innerHeight * .45));
      const pieces = el.children, n = pieces.length, k = 10;
      for (let i = 0; i < n; i++) {
        const t = clamp((p * (n + k) - i) / k);
        pieces[i].style.opacity = (.12 + .88 * t).toFixed(3);
        pieces[i].style.filter = t >= 1 ? '' : `blur(${((1 - t) * 6).toFixed(2)}px)`;
        pieces[i].classList.toggle('hot', t > .15 && t < .85);
      }
    }
  };
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(paint); }, { passive: true });
  paint();
}

// ---- Glowing edges: the border lights up on the side nearest the pointer ------------------------------------------
function glowEdges() {
  const els = $$('.card, .dl-main');
  for (const el of els) { const g = document.createElement('span'); g.className = 'glow-edge'; g.setAttribute('aria-hidden', 'true'); el.append(g); }
  let raf = 0, px = -1e4, py = -1e4;
  const paint = () => {
    raf = 0;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const near = px > r.left - 80 && px < r.right + 80 && py > r.top - 80 && py < r.bottom + 80;
      el.style.setProperty('--glow-o', near ? '1' : '0');
      if (near) el.style.setProperty('--glow-a', `${(Math.atan2(py - (r.top + r.height / 2), px - (r.left + r.width / 2)) * 180 / Math.PI + 90).toFixed(1)}deg`);
    }
  };
  addEventListener('pointermove', e => { px = e.clientX; py = e.clientY; if (!raf) raf = requestAnimationFrame(paint); }, { passive: true });
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(paint); }, { passive: true });
}
