// SPDX-License-Identifier: GPL-3.0-or-later
// Motion built on anime.js 4 (self-hosted, MIT) plus small vanilla ports of effects popularised by React Bits
// (light rays, click sparks, magnet) and Aceternity UI (hero parallax). Nothing here loads from a CDN.
import { animate, createTimeline, stagger, scrambleText, createDrawable } from '../vendor/animejs-4.5.0/anime.esm.min.js';
import { playIntro } from './intro.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const KATAKANA = 'ァ-ヶ';

export async function run({ reduce, finePointer }) {
  document.documentElement.classList.add('fx');
  import('./fx2.js').then(m => m.run({ reduce, finePointer })).catch(() => {});
  if (reduce) { reveal(); parallax(true); return; }
  await playIntro();
  intro();
  headings();
  counters();
  parallax(false);
  if (finePointer) { magnets(); sparks(); }
}

function reveal() { for (const el of $$('.fx-in')) el.style.opacity = 1; }

// Page-load sequence in the megu-edit grammar: the video pulls focus, a lowercase line types itself behind a red
// block caret (no flash: kept safe for photosensitive viewers), then the headline settles and the rest fades in.
function intro() {
  const hero = $('.hero');
  if (!hero) return;
  requestAnimationFrame(() => hero.classList.add('focused'));
  animate('.hero-type', { opacity: [0, 1], filter: ['blur(14px)', 'blur(0px)'], scale: [1.06, 1], duration: 1600, ease: 'out(5)', delay: 250 });
  const el = $('.typed-text'), full = el?.dataset.type || '';
  if (el) {
    el.textContent = '';
    let i = 0;
    const step = () => {
      el.textContent = full.slice(0, ++i);
      if (i < full.length) setTimeout(step, full[i - 1] === ',' ? 160 : 38);
    };
    setTimeout(step, 500);
  }
  createTimeline({ defaults: { ease: 'out(4)' } })
    .add('.hero .lede, .foot-rule', { opacity: [0, 1], y: ['.8rem', 0], duration: 900, delay: stagger(90) }, 1700)
    .add('.dl-box, .hud-dl, .hud-tl, .hero-vert, .sound-ctl', { opacity: [0, 1], y: ['.6rem', 0], duration: 800, delay: stagger(70) }, 1900);
}

// Numbers count up from zero when they scroll into view.
function counters() {
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const el = e.target, to = Number(el.dataset.to) || 0, o = { v: to ? 0 : 9 };
      el.dataset.counted = '1';
      animate(o, { v: to, duration: 1700, ease: 'out(4)', onUpdate: () => { el.textContent = String(Math.round(o.v)); } });
    }
  }, { rootMargin: '0px 0px -10% 0px' });
  for (const el of $$('.count')) io.observe(el);
}

// Section titles decode from katakana when they scroll into view.
function headings() {
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const el = e.target;
      animate(el, { textContent: scrambleText({ text: el.textContent, chars: KATAKANA }), duration: 1100, ease: 'out(2)' });
      animate(el, { opacity: [0, 1], y: ['1rem', 0], duration: 700, ease: 'out(3)' });
    }
  }, { rootMargin: '0px 0px -12% 0px' });
  for (const h of $$('.sec .h2, .hp .h2')) io.observe(h);
}

// Aceternity-style hero parallax: three rows of real screenshots, tilted in 3D, straighten and slide as you scroll.
function parallax(still) {
  const sec = $('.hp'), stage = $('.hp-rows');
  if (!sec || !stage) return;
  const rows = $$('.hp-row', sec);
  if (still) { stage.style.transform = 'none'; return; }
  let raf = 0;
  const update = () => {
    raf = 0;
    const r = sec.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, -r.top / r.height + .18));
    const q = Math.min(1, p / .22);
    const ease = 1 - Math.pow(1 - q, 3);
    const wide = innerWidth > 720;
    stage.style.transform = `translateY(${(1 - ease) * (wide ? 6 : 3)}rem) rotateX(${(1 - ease) * 12}deg) rotateZ(${(1 - ease) * 8}deg)`;
    stage.style.opacity = String(.25 + ease * .75);
    const shift = p * (wide ? 60 : 40);
    rows.forEach((row, i) => { row.style.transform = `translateX(${(i % 2 ? -1 : 1) * shift - (i % 2 ? 0 : 20)}rem)`; });
  };
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
  addEventListener('resize', update);
  update();
}

// Buttons lean toward the pointer and spring back.
function magnets() {
  for (const el of $$('.btn-primary, .btn-quiet, .chip, .sound-fab, .dl-box')) {
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left - r.width / 2) * .22, y = (e.clientY - r.top - r.height / 2) * .32;
      animate(el, { x, y, duration: 350, ease: 'out(3)' });
    });
    el.addEventListener('pointerleave', () => animate(el, { x: 0, y: 0, duration: 900, ease: 'outElastic(1, .45)' }));
  }
}

// Click sparks: a burst of crimson and gold lines wherever you click.
function sparks() {
  const c = document.createElement('canvas');
  c.className = 'sparks';
  c.setAttribute('aria-hidden', 'true');
  document.body.append(c);
  const ctx = c.getContext('2d');
  let bursts = [], raf = 0;
  const size = () => { const d = Math.min(devicePixelRatio || 1, 2); c.width = innerWidth * d; c.height = innerHeight * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
  // pixels only while a burst plays (a full-screen canvas costs memory even when empty)
  c.width = c.height = 0;
  addEventListener('resize', () => { if (raf) size(); });
  const draw = now => {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    bursts = bursts.filter(b => now - b.t < 520);
    for (const b of bursts) {
      const k = (now - b.t) / 520, e = 1 - Math.pow(1 - k, 3);
      for (let i = 0; i < 10; i++) {
        const a = b.a + i / 10 * Math.PI * 2;
        const r0 = e * 34, r1 = r0 + 14 * (1 - k);
        ctx.strokeStyle = i % 2 ? `rgba(234,187,95,${1 - k})` : `rgba(255,92,108,${1 - k})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(b.x + Math.cos(a) * r0, b.y + Math.sin(a) * r0);
        ctx.lineTo(b.x + Math.cos(a) * r1, b.y + Math.sin(a) * r1);
        ctx.stroke();
      }
    }
    raf = bursts.length ? requestAnimationFrame(draw) : 0;
    if (!raf) c.width = c.height = 0;
  };
  addEventListener('pointerdown', e => {
    bursts.push({ x: e.clientX, y: e.clientY, t: performance.now(), a: Math.random() });
    if (!raf) { size(); raf = requestAnimationFrame(draw); }
  }, { passive: true });
}

// Light rays (after React Bits' LightRays): a WebGL fragment shader casting crimson-gold rays from the upper right,
// leaning toward the pointer. Half resolution, only while the hero is visible.
function rays() {
  const canvas = $('.rays-fx');
  const gl = canvas?.getContext('webgl', { premultipliedAlpha: false, antialias: false });
  if (!gl) { canvas?.remove(); return; }
  const vs = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const fs = `precision mediump float;
uniform vec2 res;uniform float t;uniform vec2 m;
float ray(vec2 src,vec2 dir,vec2 uv,float a,float b,float s){
 vec2 d=uv-src;float c=dot(normalize(d),dir);
 float base=clamp((.45+.15*sin(c*a+t*s))+(.3+.2*cos(-c*b+t*s)),0.,1.);
 float fall=clamp((res.x*1.4-length(d))/(res.x*1.4),0.,1.);
 return base*fall*pow(max(c,0.),6.);
}
void main(){
 vec2 uv=vec2(gl_FragCoord.x,res.y-gl_FragCoord.y);
 vec2 src=vec2(res.x*.82,-res.y*.25);
 vec2 dir=normalize(mix(vec2(-.35,1.),normalize(m*res-src),.35));
 float r1=ray(src,dir,uv,36.2,21.1,1.1);
 float r2=ray(src,dir,uv,22.4,18.0,1.6);
 vec3 col=mix(vec3(.85,.16,.24),vec3(.95,.72,.36),uv.y/res.y*.6+.2)*(r1*.55+r2*.45);
 gl_FragColor=vec4(col*.9,1.);
}`;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.remove(); return; }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uRes = gl.getUniformLocation(prog, 'res'), uT = gl.getUniformLocation(prog, 't'), uM = gl.getUniformLocation(prog, 'm');
  const mouse = [.5, .5], target = [.5, .5];
  const hero = $('.hero');
  hero.addEventListener('pointermove', e => { const r = hero.getBoundingClientRect(); target[0] = (e.clientX - r.left) / r.width; target[1] = (e.clientY - r.top) / r.height; });
  let raf = 0, on = false;
  const frame = now => {
    const w = Math.round(canvas.clientWidth / 2), h = Math.round(canvas.clientHeight / 2);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
    mouse[0] += (target[0] - mouse[0]) * .05; mouse[1] += (target[1] - mouse[1]) * .05;
    gl.uniform2f(uRes, w, h); gl.uniform1f(uT, now / 1000); gl.uniform2f(uM, mouse[0], mouse[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    raf = requestAnimationFrame(frame);
  };
  const set = v => { if (v === on) return; on = v; if (v) raf = requestAnimationFrame(frame); else cancelAnimationFrame(raf); };
  let vis = true;
  new IntersectionObserver(([e]) => { vis = e.isIntersecting; set(vis && !document.hidden); }).observe(hero);
  document.addEventListener('visibilitychange', () => set(vis && !document.hidden));
  set(true);
}
