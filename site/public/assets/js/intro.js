// SPDX-License-Identifier: GPL-3.0-or-later
// Entrance: the grimoire opens. The crimson leather cover swings open in 3D, a few pages flutter past, light bursts
// out of the open book and the view dives into the page, revealing the site. Once per browser session; any click or
// key skips it; never shown when the visitor prefers reduced motion (the inline head script decides).
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
    const book = el.querySelector('.book');
    const tl = createTimeline({ defaults: { ease: 'inOut(3)' }, onComplete: finish });
    tl.add(book, { opacity: [0, 1], scale: [.82, 1], rotateX: [24, 12], y: ['6vh', 0], duration: 900, ease: 'out(4)' }, 0)
      .add('.intro .sigil', { opacity: [0, 1], duration: 600 }, 300)
      .add('.intro .cover', { rotateY: [0, -178], duration: 1300, ease: 'inOut(4)' }, 1000)
      .add(book, { x: ['0%', '50%'], rotateX: [12, 6], duration: 1300, ease: 'inOut(4)' }, 1000)
      .add('.intro .leaf', { rotateY: [0, -176], duration: 760, delay: (_, i) => i * 120, ease: 'inOut(3)' }, 1500)
      .add('.intro .burst', { opacity: [0, 1], scale: [.2, 2.6], duration: 900, ease: 'out(3)' }, 2350)
      .add(book, { scale: [1, 5.5], rotateX: [6, 0], opacity: [1, 0], duration: 900, ease: 'in(3)' }, 2650)
      .add('.intro-bg', { opacity: [1, 0], duration: 700, ease: 'out(2)' }, 2950)
      .add('.intro .skip', { opacity: 0, duration: 300 }, 2650);
    const skip = () => { tl.pause(); el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300 }).finished.then(finish); };
    el.addEventListener('click', skip);
    addEventListener('keydown', skip);
  });
}
