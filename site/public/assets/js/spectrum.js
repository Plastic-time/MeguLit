// SPDX-License-Identifier: GPL-3.0-or-later
// The song's spectrum, for the equalisers and the spectrum scrollbar. The songs stream from SoundCloud or NetEase, whose
// audio a page may not analyse, so each song's spectrum was measured once from a local copy (site/tools/spectrum.py:
// 16 bands, 24 frames a second) and is read here at the song's position. While the song is paused the levels fall to
// rest and stay there.

const base = new URL('../audio/', import.meta.url);

export function spectrum(audio, { reduce = false } = {}) {
  let data = null, bands = 16, fps = 24, frames = 0, loading = '';
  const levels = new Float32Array(16);
  const subs = new Set();
  const load = async id => {
    if (!id || id === loading) return;
    loading = id; data = null;
    try {
      const r = await fetch(new URL(`${id}.spec`, base));
      if (!r.ok) return;
      const b = new Uint8Array(await r.arrayBuffer());
      if (loading !== id || b[0] !== 77 || b[3] !== 49) return;   // 'M' ... '1'
      bands = b[4]; fps = b[5]; data = b.subarray(6); frames = Math.floor(data.length / bands);
    } catch {}
  };
  addEventListener('megulit:track', e => load(e.detail?.id));
  // SoundCloud reports the position a few times a second: between reports it is carried on by the clock
  let lastT = 0, lastWall = 0;
  const onTime = () => { lastT = audio.currentTime; lastWall = performance.now(); };
  audio.addEventListener('timeupdate', onTime); audio.addEventListener('seeked', onTime); audio.addEventListener('play', onTime);
  const now = () => (audio.paused ? audio.currentTime : lastT + Math.min(1, (performance.now() - lastWall) / 1000));

  let moving = false, frame = false;
  const tick = () => {
    if (!data && audio.dataset?.track) load(audio.dataset.track);
    const playing = !audio.paused && data && !reduce;
    let any = false;
    if (playing) {
      const f = now() * fps, i = Math.min(frames - 2, Math.max(0, Math.floor(f))), k = Math.min(1, Math.max(0, f - i));
      for (let b = 0; b < 16; b++) {
        const bi = Math.min(bands - 1, b), v = (data[i * bands + bi] * (1 - k) + data[(i + 1) * bands + bi] * k) / 255;
        levels[b] += (v - levels[b]) * (v > levels[b] ? .6 : .25);
      }
      any = true;
    } else {
      for (let b = 0; b < 16; b++) { if (levels[b] > .002) { levels[b] *= .85; any = true; } else levels[b] = 0; }
    }
    // listeners hear at most 30 times a second: the bars look the same, and the page restyles half as often (memory)
    if ((any || moving) && (frame = !frame)) subs.forEach(fn => fn(levels, playing));
    moving = any;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return { levels, on: fn => { subs.add(fn); fn(levels, false); } };
}

// small equaliser icons: each bar shows the mean of a share of the bands (bass on the left)
export function eqBars(spec, el, rest = .18) {
  const bars = [...el.querySelectorAll('i')];
  if (!bars.length) return;
  el.classList.add('live');
  const shown = bars.map(() => -1);
  spec.on(levels => {
    bars.forEach((bar, j) => {
      const a = Math.floor(j * 16 / bars.length), z = Math.floor((j + 1) * 16 / bars.length);
      let m = 0; for (let b = a; b < z; b++) m += levels[b];
      // a bar is restyled only when its height really changes
      const v = Math.round((rest + (1 - rest) * Math.min(1, m / (z - a) * 1.15)) * 40) / 40;
      if (v !== shown[j]) { shown[j] = v; bar.style.setProperty('--l', String(v)); }
    });
  });
}

// the page's scrollbar as a spectrum: a strip at the right edge, one row per few pixels from bass (bottom) to treble
// (top), each row as long as its band is loud; the part of the strip that stands for the screen is the thumb. Drag the
// thumb or click the strip to scroll, as with a scrollbar.
export function spectrumScrollbar(spec) {
  if (!matchMedia('(pointer: fine)').matches) return;
  const c = document.createElement('canvas');
  c.className = 'spec-scroll'; c.setAttribute('aria-hidden', 'true');
  document.body.append(c);
  document.documentElement.classList.add('spec-on');
  const g = c.getContext('2d');
  let W = 0, H = 0, dpr = 1, ink = '244,244,242', hover = false, drag = null, last = null, dirty = true;
  const size = () => { dpr = Math.min(devicePixelRatio || 1, 2); W = c.clientWidth; H = c.clientHeight; c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); dirty = true; };
  const theme = () => { const m = getComputedStyle(document.body).color.match(/\d+/g); if (m) ink = m.slice(0, 3).join(','); dirty = true; };
  size(); theme();
  addEventListener('resize', size);
  new MutationObserver(theme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', theme);
  const thumb = () => {
    const doc = document.documentElement.scrollHeight, vh = innerHeight;
    const h = Math.max(28, H * vh / doc), top = (H - h) * (scrollY / Math.max(1, doc - vh));
    return { top, h, doc, vh };
  };
  addEventListener('scroll', () => { dirty = true; }, { passive: true });
  const draw = levels => {
    const { top, h, doc, vh } = thumb();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    if (doc <= vh + 1) return;
    // the thumb's ground
    g.fillStyle = `rgba(240,195,106,${hover || drag ? .16 : .08})`; g.fillRect(0, top, W, h);
    const step = 4, rows = Math.floor(H / step);
    for (let r = 0; r < rows; r++) {
      const y = H - (r + 1) * step, f = (r / Math.max(1, rows - 1)) * 15, b = Math.floor(f), k = f - b;
      const v = levels[b] * (1 - k) + levels[Math.min(15, b + 1)] * k;
      const inThumb = y + step > top && y < top + h;
      const w = 1.5 + v * (W - 2.5);
      // Megumin's colours: crimson along the strip, warming to her bright red when loud; the thumb in her gold
      g.fillStyle = inThumb ? `rgba(240,195,106,${.5 + v * .5})` : (v > .55 ? `rgba(224,80,92,${.45 + v * .55})` : `rgba(165,29,45,${.35 + v * .7})`);
      g.fillRect(W - w, y + 1, w, step - 1.5);
    }
    // the thumb's edge
    g.fillStyle = 'rgba(255,217,143,.95)'; g.fillRect(W - 2, top, 2, h);
  };
  spec.on((levels, playing) => { last = levels; draw(levels); dirty = false; });
  const idle = () => { if (dirty && last) { draw(last); dirty = false; } requestAnimationFrame(idle); };
  requestAnimationFrame(idle);
  // scrolling with it
  const toScroll = y => { const { h, doc, vh } = thumb(); scrollTo({ top: (y / Math.max(1, H - h)) * (doc - vh), behavior: 'instant' }); };
  c.addEventListener('pointerdown', e => {
    e.preventDefault();
    const { top, h } = thumb();
    const y = e.offsetY;
    drag = { off: y >= top && y <= top + h ? y - top : h / 2 };
    toScroll(y - drag.off);
    c.setPointerCapture(e.pointerId); dirty = true;
  });
  c.addEventListener('pointermove', e => { if (drag) toScroll(e.offsetY - drag.off); });
  const end = () => { drag = null; dirty = true; };
  c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
  c.addEventListener('pointerenter', () => { hover = true; dirty = true; });
  c.addEventListener('pointerleave', () => { hover = false; dirty = true; });
}
