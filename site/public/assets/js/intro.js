// SPDX-License-Identifier: GPL-3.0-or-later
// Entrance as a page turn: the whole screen is the grimoire's cover, and it turns from right to left like a page,
// hinged on the left edge, followed by one parchment page, uncovering the site underneath. Once per browser
// session; any click or key skips it; never shown when the visitor prefers reduced motion (the head script decides).
import { createTimeline } from '../vendor/animejs-4.5.0/anime.esm.min.js';

export function playIntro() {
  const root = document.documentElement;
  const el = document.querySelector('.intro');
  if (!el || !root.classList.contains('intro-on')) return Promise.resolve();
  try { sessionStorage.setItem('megulit-intro', '1'); } catch {}
  document.body.style.overflow = 'hidden';
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      root.classList.remove('intro-on');
      document.body.style.overflow = '';
      el.remove();
      removeEventListener('keydown', skip);
      resolve();
    };
    // --turn drives the shading: 0 flat, 1 standing on its edge, back to 0 when it lies on the left.
    const shade = (sel, p) => { const v = Math.sin(Math.min(1, Math.max(0, p)) * Math.PI); el.querySelector(sel).style.setProperty('--turn', v.toFixed(3)); };
    const tl = createTimeline({ onComplete: finish });
    tl.add('.intro .cover-art', { opacity: [0, 1], scale: [.94, 1], duration: 700, ease: 'out(3)' }, 0)
      .add('.intro .glint', { x: ['-120%', '220%'], duration: 900, ease: 'inOut(2)' }, 350)
      .add('.intro .s1', {
        rotateY: [0, -180], duration: 1400, ease: 'inOut(3)',
        onUpdate: a => shade('.s1', a.progress),
      }, 1050)
      .add('.intro .s2', {
        rotateY: [0, -180], duration: 1250, ease: 'inOut(3)',
        onUpdate: a => shade('.s2', a.progress),
      }, 1650)
      .add('.intro .under-shade', { opacity: [.55, 0], duration: 1000, ease: 'out(2)' }, 1900)
      .add('.intro .skip', { opacity: 0, duration: 250 }, 1050);
    const skip = () => { tl.pause(); el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 280 }).finished.then(finish); };
    el.addEventListener('click', skip);
    addEventListener('keydown', skip);
  });
}
