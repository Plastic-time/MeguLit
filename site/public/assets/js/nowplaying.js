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

const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
const SWITCH = { zh: { lyrics: '歌词', bg: '背景歌词' }, ja: { lyrics: '歌詞', bg: '背景に歌詞' }, en: { lyrics: 'Lyrics', bg: 'Lyrics in background' } };

// background: an object with say(text) (the bottom kana layer); it gets every lyric line while "背景歌词" is on
export function nowPlaying(audio, host, { reduce = false, background = null } = {}) {
  const base = new URL('../audio/', import.meta.url);
  const box = document.createElement('div');
  box.className = 'np';
  box.hidden = true;
  box.setAttribute('aria-live', 'off');
  box.innerHTML = '<span class="np-eq" aria-hidden="true"><i></i><i></i><i></i></span><span class="np-meta"><b class="np-title"></b><span class="np-artist"></span></span><p class="np-lyric" lang="ja" aria-hidden="true"></p><p class="np-switches"><button type="button" class="np-sw" data-sw="lyrics"></button><button type="button" class="np-sw" data-sw="bg"></button></p><p class="np-credit"></p>';
  host.append(box);
  const title = box.querySelector('.np-title'), artist = box.querySelector('.np-artist'), lyric = box.querySelector('.np-lyric'), credit = box.querySelector('.np-credit');
  let meta = null;
  const paintCredit = () => { if (meta) credit.replaceChildren(...creditNodes(meta)); };
  addEventListener('megulit:lang', paintCredit);
  // two switches, remembered per browser: lyrics in this label, and lyrics on the page's bottom layer
  const on = { lyrics: store.get('megulit-lyrics') !== '0', bg: store.get('megulit-bg-lyrics') !== '0' && Boolean(background) && !reduce };
  const switches = box.querySelectorAll('.np-sw');
  const paintSwitches = () => switches.forEach(b => {
    const k = b.dataset.sw;
    b.textContent = (SWITCH[pageLang()] || SWITCH.zh)[k];
    b.setAttribute('aria-pressed', String(on[k]));
    b.hidden = k === 'bg' && (!background || reduce);
  });
  paintSwitches();
  addEventListener('megulit:lang', paintSwitches);
  switches.forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.sw;
    on[k] = !on[k];
    store.set(k === 'bg' ? 'megulit-bg-lyrics' : 'megulit-lyrics', on[k] ? '1' : '0');
    box.classList.toggle('lyrics-off', !on.lyrics);
    if (k === 'bg' && !on.bg) background?.clear();
    if (on[k] && cur >= 0 && lines[cur]) (k === 'bg' ? background?.say(lines[cur].text) : show(lines[cur].text));
    paintSwitches();
  }));
  box.classList.toggle('lyrics-off', !on.lyrics);

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

  // every line still on screen leaves (the old code only sent the first one away, so lines piled up on a replay);
  // lines already leaving are dropped at once, so at most one is ever fading out
  const show = text => {
    lyric.querySelectorAll('.np-line.out').forEach(n => n.remove());
    lyric.querySelectorAll('.np-line').forEach(old => {
      if (reduce) { old.remove(); return; }
      old.classList.add('out');
      setTimeout(() => old.remove(), 450);
    });
    if (!text || !on.lyrics) return;
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
      if (i !== cur) { cur = i; const text = i >= 0 ? lines[i].text : ''; show(text); if (on.bg) background?.say(text); }
    }
    raf = requestAnimationFrame(tick);
  };
  audio.addEventListener('play', async () => { await load(); box.hidden = false; box.classList.toggle('has-lyrics', lines.length > 0); cur = -1; if (!raf) raf = requestAnimationFrame(tick); });
  audio.addEventListener('pause', () => { box.hidden = true; show(''); background?.clear(); cur = -1; });
  audio.addEventListener('seeked', () => { cur = -1; });
}
