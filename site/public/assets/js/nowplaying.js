// SPDX-License-Identifier: GPL-3.0-or-later
// Now playing: while the background music plays, a small label beside the sound control shows the song's title and
// artist, and the current lyric line, which arrives character by character (soft -> sharp) and leaves upward.
// Song details and the CC BY-NC credit live in assets/audio/megulit-bgm.json; timed lyrics, when there are any, in
// assets/audio/megulit-bgm.lrc (standard [mm:ss.xx] lines). The full credit (author, album, licence, edited) shows in the
// label and in every element marked .js-bgm-credit (the footer), in the page language.

const pageLang = () => (document.documentElement.lang || 'zh').slice(0, 2);
const a = (href, text) => { const el = document.createElement('a'); el.href = href; el.textContent = text; el.rel = 'noopener'; el.target = '_blank'; return el; };
// author · album (label) · licence · edited, as nodes with links
function creditNodes(m) {
  const t = m.text?.[pageLang()] || m.text?.zh || {};
  const out = [];
  const sep = () => out.push(document.createTextNode(' · '));
  out.push(document.createTextNode(`${t.by || 'by'} `), m.artistUrl ? a(m.artistUrl, m.artist) : document.createTextNode(m.artist));
  if (m.album) { sep(); out.push(document.createTextNode(`${t.from || 'from'} `), m.albumUrl ? a(m.albumUrl, `${m.album}${m.label ? ` (${m.label})` : ''}`) : document.createTextNode(m.album)); }
  if (m.license) { sep(); out.push(m.licenseUrl ? a(m.licenseUrl, m.license) : document.createTextNode(m.license)); }
  if (m.edited && t.edited) { sep(); out.push(document.createTextNode(t.edited)); }
  return out;
}
let metaPromise = null;
const getMeta = base => metaPromise || (metaPromise = fetch(new URL('megulit-bgm.json', base)).then(r => r.json()).catch(() => null));
// the footer credit: filled at once, refilled when the language changes
export function bgmCredit() {
  const base = new URL('../audio/', import.meta.url);
  const fill = async () => {
    const m = await getMeta(base);
    if (!m) return;
    for (const el of document.querySelectorAll('.js-bgm-credit')) {
      const t = m.text?.[pageLang()] || m.text?.zh || {};
      const title = document.createElement('i');
      title.textContent = m.title;
      el.replaceChildren(document.createTextNode(`${t.music || 'Music'}: `), title, document.createTextNode(' — '), ...creditNodes(m));
    }
  };
  fill();
  addEventListener('megulit:lang', fill);
}

const parseLrc = text => {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const tags = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    const words = line.replace(/\[[^\]]*\]/g, '').trim();
    for (const t of tags) out.push({ at: Number(t[1]) * 60 + Number(t[2]), text: words });
  }
  return out.sort((a, b) => a.at - b.at);
};

export function nowPlaying(audio, host, { reduce = false } = {}) {
  const base = new URL('../audio/', import.meta.url);
  const box = document.createElement('div');
  box.className = 'np';
  box.hidden = true;
  box.setAttribute('aria-live', 'off');
  box.innerHTML = '<span class="np-eq" aria-hidden="true"><i></i><i></i><i></i></span><span class="np-meta"><b class="np-title"></b><span class="np-artist"></span></span><p class="np-lyric" lang="ja" aria-hidden="true"></p><p class="np-credit"></p>';
  host.append(box);
  const title = box.querySelector('.np-title'), artist = box.querySelector('.np-artist'), lyric = box.querySelector('.np-lyric'), credit = box.querySelector('.np-credit');
  let meta = null;
  const paintCredit = () => { if (meta) credit.replaceChildren(...creditNodes(meta)); };
  addEventListener('megulit:lang', paintCredit);

  let lines = [], cur = -1, loaded = false;
  const load = async () => {
    if (loaded) return;
    loaded = true;
    meta = await getMeta(base);
    if (meta) {
      title.textContent = meta.title || '';
      artist.textContent = meta.artist || '';
      artist.hidden = !meta.artist;
      paintCredit();
    }
    try {
      const r = await fetch(new URL('megulit-bgm.lrc', base));
      if (r.ok) lines = parseLrc(await r.text());
    } catch {}
  };

  const show = text => {
    const old = lyric.querySelector('.np-line');
    if (old && !reduce) { old.classList.add('out'); setTimeout(() => old.remove(), 450); } else old?.remove();
    if (!text) return;
    const line = document.createElement('span');
    line.className = 'np-line';
    [...text].forEach((ch, i) => {
      const c = document.createElement('span');
      c.textContent = ch;
      c.style.setProperty('--i', i);
      line.append(c);
    });
    lyric.append(line);
  };

  let raf = 0;
  const tick = () => {
    raf = 0;
    if (audio.paused) return;
    if (lines.length) {
      const t = audio.currentTime;
      let i = cur;
      if (i < 0 || t < lines[i].at || (lines[i + 1] && t >= lines[i + 1].at)) {
        i = -1;
        for (let k = 0; k < lines.length && lines[k].at <= t; k++) i = k;
      }
      if (i !== cur) { cur = i; show(i >= 0 ? lines[i].text : ''); }
    }
    raf = requestAnimationFrame(tick);
  };
  audio.addEventListener('play', async () => { await load(); box.hidden = false; box.classList.toggle('has-lyrics', lines.length > 0); cur = -1; if (!raf) raf = requestAnimationFrame(tick); });
  audio.addEventListener('pause', () => { box.hidden = true; show(''); cur = -1; });
  audio.addEventListener('seeked', () => { cur = -1; });
}
