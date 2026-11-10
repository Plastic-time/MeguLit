// SPDX-License-Identifier: GPL-3.0-or-later
// megulit.com page script: language and theme, the release data behind the download buttons, engine list, changelog.
import { I18N } from './i18n.js';
import { MIRROR, downloadSources, formatSize, formatDate, pickLang, renderMarkdown } from './core.mjs';
import { kana } from './spell.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

// ---- language ----------------------------------------------------------------------------------------------------------
// Chinese is the page's own text; read it once so switching back needs no second copy.
const zh = new Map();
for (const el of $$('[data-i]')) zh.set('t:' + el.dataset.i, el.textContent);
for (const el of $$('[data-i-html]')) zh.set('h:' + el.dataset.iHtml, el.innerHTML);
for (const el of $$('[data-i-attr]')) for (const pair of el.dataset.iAttr.split(';')) {
  const [attr, key] = pair.split(':');
  zh.set('a:' + key, el.getAttribute(attr));
}
let lang = pickLang(new URLSearchParams(location.search).get('lang') || store.get('megulit-lang'), navigator.languages || [navigator.language]);
const d = k => I18N.dyn[lang][k];

function applyLang(next) {
  lang = next;
  const dict = I18N[lang] || {};
  const pick = (kind, key) => (lang === 'zh' ? zh.get(kind + ':' + key) : dict[key]) ?? zh.get(kind + ':' + key);
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
  for (const el of $$('[data-i]')) el.textContent = pick('t', el.dataset.i);
  for (const el of $$('[data-i-html]')) el.innerHTML = pick('h', el.dataset.iHtml);
  for (const el of $$('[data-i-attr]')) for (const pair of el.dataset.iAttr.split(';')) {
    const [attr, key] = pair.split(':');
    el.setAttribute(attr, pick('a', key));
  }
  for (const b of $$('[data-lang]')) b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
  splitKinetic();
  setSoundLabel();
  dispatchEvent(new Event('megulit:lang'));
  document.title = document.body.dataset.page === 'changelog' ? `${pick('t', 'cl.title')} · MeguLit` : d('title');
  if (release) fillRelease();
  if (engines) fillEngines(); else fillTicker();
  if (releases) fillReleases();
  setNotes(lang === 'zh' ? 'zh' : 'en');
}
for (const b of $$('[data-lang]')) b.addEventListener('click', () => {
  store.set('megulit-lang', b.dataset.lang);
  const url = new URL(location.href);
  url.searchParams.delete('lang');
  history.replaceState(null, '', url);
  applyLang(b.dataset.lang);
});

// ---- theme -------------------------------------------------------------------------------------------------------------
$('#theme')?.addEventListener('click', () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : !matchMedia('(prefers-color-scheme: light)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  store.set('megulit-theme', root.dataset.theme);
});

// ---- specimen glosses ----------------------------------------------------------------------------------------------------
const gloss = $('.gloss');
for (const w of $$('.jp .w')) {
  const i = Number(w.dataset.gloss);
  const on = v => {
    gloss?.classList.toggle('focus', v);
    w.classList.toggle('on', v);
    $$('dt', gloss)[i]?.classList.toggle('on', v);
    $$('dd', gloss)[i]?.classList.toggle('on', v);
  };
  for (const [ev, v] of [['mouseenter', true], ['mouseleave', false], ['focus', true], ['blur', false]]) w.addEventListener(ev, () => on(v));
}

// ---- embed before / after ------------------------------------------------------------------------------------------------
for (const b of $$('[data-embed]')) b.addEventListener('click', () => {
  $('.textbox').dataset.state = b.dataset.embed;
  for (const o of $$('[data-embed]')) o.setAttribute('aria-pressed', String(o === b));
});

// ---- tabs (arrow keys move between tabs, as the ARIA tabs pattern expects) ------------------------------------------------
const tabs = $$('.tabs [role="tab"]');
function selectTab(tab, focus) {
  for (const t of tabs) {
    const sel = t === tab;
    t.setAttribute('aria-selected', String(sel));
    t.tabIndex = sel ? 0 : -1;
    document.getElementById(t.getAttribute('aria-controls')).hidden = !sel;
  }
  if (focus) tab.focus();
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => selectTab(t));
  t.addEventListener('keydown', e => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (step) { e.preventDefault(); selectTab(tabs[(i + step + tabs.length) % tabs.length], true); }
  });
});

// ---- release data ----------------------------------------------------------------------------------------------------------
let release = null, mirrorOk = false, notesLang = 'zh', engines = null, releases = null;

async function getJson(url, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal, cache: 'no-cache' });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } finally { clearTimeout(timer); }
}

function fillRelease() {
  const r = release;
  const sources = downloadSources(r).filter(s => mirrorOk || s.id !== 'mirror');
  if (!sources.length) return;
  for (const a of $$('.js-download')) a.href = sources[0].url;
  for (const el of $$('.js-version')) el.textContent = 'v' + r.label;
  for (const el of $$('.js-title')) el.textContent = 'MeguLit v' + r.label;
  for (const el of $$('.js-size')) el.textContent = formatSize(r.size, lang);
  for (const el of $$('.js-date')) el.textContent = formatDate(r.published, lang);
  for (const el of $$('.js-filename')) el.textContent = r.name;
  for (const el of $$('.js-sha')) el.textContent = r.sha256;
  const note = $('.js-source-note');
  if (note && !mirrorOk) note.textContent = d('fallbackNote');
  const alt = $('.js-alt');
  if (alt) alt.replaceChildren(...sources.slice(1).map(s => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = s.url;
    a.rel = 'noopener';
    const name = document.createElement('span');
    name.textContent = d(s.id);
    const host = document.createElement('span');
    host.textContent = s.host || new URL(s.url).host;
    a.append(name, host);
    li.append(a);
    return li;
  }));
  setNotes(notesLang);
}

function setNotes(which) {
  notesLang = which;
  for (const b of $$('[data-notes]')) b.setAttribute('aria-pressed', String(b.dataset.notes === which));
  const box = $('.js-notes');
  if (box && release?.notes) box.innerHTML = renderMarkdown(release.notes[which] || release.notes.zh);
}
for (const b of $$('[data-notes]')) b.addEventListener('click', () => setNotes(b.dataset.notes));

$('.js-copy')?.addEventListener('click', async e => {
  const btn = e.currentTarget;
  try {
    await navigator.clipboard.writeText($('.js-sha').textContent.trim());
    btn.textContent = d('copied');
    setTimeout(() => { btn.textContent = lang === 'zh' ? zh.get('t:d.copy') : I18N[lang]['d.copy']; }, 1600);
  } catch {
    getSelection().selectAllChildren($('.js-sha'));
  }
});

async function loadRelease() {
  try {
    release = await getJson(`${MIRROR}/latest.json`, 3000);
    mirrorOk = Boolean(release?.key);
  } catch { release = null; }
  if (!release) release = await getJson('/data/latest.json', 8000).catch(() => null);
  if (release) fillRelease();
}

// ---- engines ---------------------------------------------------------------------------------------------------------------
function fillEngines() {
  const e = engines;
  const li = (b, span) => {
    const el = document.createElement('li');
    const bb = document.createElement('b');
    bb.textContent = b;
    el.append(bb);
    if (span) { const s = document.createElement('span'); s.textContent = span; el.append(s); }
    return el;
  };
  $('.js-engine-count') && ($('.js-engine-count').textContent = e.detected.length);
  for (const [sel, n] of [['.js-count-engines', e.detected.length], ['.js-count-adapters', e.adapters.length]]) {
    const el = $(sel);
    if (el) { el.dataset.to = n; if (!el.dataset.counted) el.textContent = n; }
  }
  $('.js-adapters')?.replaceChildren(...e.adapters.map(a => li(a.name, a.games.join(' · '))));
  $('.js-games')?.replaceChildren(...e.games.map(g => {
    const el = li(lang === 'en' && g.en ? g.en : g.title, g.engine);
    el.firstChild.lang = 'ja';
    return el;
  }));
  fillTicker();
  $('.js-detected')?.replaceChildren(...e.detected.map(n => { const el = document.createElement('li'); el.textContent = n; return el; }));
}
async function loadEngines() {
  if (!$('.js-adapters')) return;
  engines = await getJson('/data/engines.json', 8000).catch(() => null);
  if (engines) fillEngines();
}

// ---- changelog page --------------------------------------------------------------------------------------------------------
function fillReleases() {
  const list = $('.js-releases');
  if (!list) return;
  list.replaceChildren(...releases.map((r, i) => {
    const li = document.createElement('li');
    li.className = 'rel';
    li.id = r.tag;
    const notesLangFor = lang === 'zh' ? 'zh' : 'en';
    li.innerHTML = `<div class="rel-meta"><h2></h2><p class="js-d"></p><p class="js-s"></p><p><a class="link" rel="noopener"></a></p></div><div class="rel-body"></div>`;
    $('h2', li).textContent = 'v' + r.label;
    if (i === 0) { const b = document.createElement('span'); b.className = 'rel-latest'; b.textContent = d('latest'); $('h2', li).append(b); }
    $('.js-d', li).textContent = formatDate(r.published, lang);
    $('.js-s', li).textContent = `${d('size')} ${formatSize(r.size, lang)}`;
    const a = $('a', li); a.href = r.page; a.textContent = d('github_page');
    $('.rel-body', li).innerHTML = renderMarkdown(r.notes[notesLangFor] || r.notes.zh);
    return li;
  }));
}
async function loadReleases() {
  if (!$('.js-releases')) return;
  releases = await getJson(`${MIRROR}/releases.json`, 4000).catch(() => null);
  if (!Array.isArray(releases) || !releases.length) releases = await getJson('/data/releases.json', 8000).catch(() => null);
  if (Array.isArray(releases)) fillReleases();
  else $('.js-releases').innerHTML = `<li class="rel"><p>${d('loadFail')}</p></li>`;
}


// ---- motion ------------------------------------------------------------------------------------------------------------
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(pointer: fine)').matches;

// Headline letters flip in one by one. The heading keeps its words for screen readers.
function splitKinetic() {
  for (const h of $$('.kinetic')) {
    h.setAttribute('aria-label', h.textContent.replace(/\s+/g, ' ').trim());
    let i = 0;
    const walk = node => {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === 3) {
          // Letters are grouped per word (or per CJK phrase) so a line never breaks inside one; spaces stay breakable.
          const frag = document.createDocumentFragment();
          for (const token of child.textContent.split(/(\s+)/)) {
            if (!token) continue;
            if (/^\s+$/.test(token)) { frag.append(token); continue; }
            const word = document.createElement('span');
            word.className = 'wd';
            for (const ch of token) {
              const span = document.createElement('span');
              span.className = 'ch';
              span.setAttribute('aria-hidden', 'true');
              span.style.setProperty('--i', i++);
              span.textContent = ch;
              word.append(span);
            }
            frag.append(word);
          }
          child.replaceWith(frag);
        } else if (child.nodeType === 1 && child.tagName === 'RUBY') {
          const span = document.createElement('span');
          span.className = 'ch';
          span.style.setProperty('--i', i++);
          child.replaceWith(span);
          span.append(child);
        } else if (child.nodeType === 1 && !child.classList.contains('ch') && !child.classList.contains('wd') && child.tagName !== 'WBR') walk(child);
      }
    };
    walk(h);
    h.style.setProperty('--n', i);
    h.classList.remove('split');
    void h.offsetWidth;
    h.classList.add('split');
  }
}

// Background video: the smallest file that looks sharp on this screen; none when motion is reduced or data is saved.
const video = $('.hero-video');
let heroSeen = true;
// while the sound is on and the hero is off screen, the sound control floats in the corner so it can be turned off
const soundCtl = $('.sound-ctl'), soundHome = soundCtl && document.createComment('sound-ctl');
soundCtl?.before(soundHome);
// it moves to <body> while floating: inside the hero it would sit under every later section
const floatSound = () => {
  if (!soundCtl) return;
  const float = Boolean(video && !video.muted && !heroSeen);
  if (float === soundCtl.classList.contains('floating')) return;
  if (float) document.body.append(soundCtl); else soundHome.after(soundCtl);
  soundCtl.classList.toggle('floating', float);
};
function videoSrc() {
  const w = Math.max(innerWidth, innerHeight) * Math.min(devicePixelRatio || 1, 2);
  return w <= 900 ? video.dataset.sm : w <= 1700 ? video.dataset.md : video.dataset.lg;
}
function startVideo() {
  if (!video || video.getAttribute('src')) return;
  video.src = videoSrc();
  video.play().catch(() => {});
}
if (video && !reduce && !navigator.connection?.saveData) {
  startVideo();
  // off screen the picture pauses to save power, unless the sound is on: then the music keeps playing down the page
  new IntersectionObserver(([e]) => {
    heroSeen = e.isIntersecting;
    if (heroSeen || !video.muted) video.play().catch(() => {}); else video.pause();
    floatSound();
  }).observe(video);
}
if ($('.kana-sky')) kana($('.kana-sky'), { still: reduce, hero: $('.hero'), until: $('.hp') });
const soundBtn = $('.js-sound');
function setSoundLabel() {
  if (!soundBtn) return;
  const on = Boolean(video && !video.muted);
  soundBtn.setAttribute('aria-pressed', String(on));
  $('.js-sound-label').textContent = on ? d('soundOff') : d('soundOn');
  const vol = $('.vol');
  if (vol) vol.hidden = !on;
}
// Volume: sound starts quiet (5%) when turned on; the slider sets it from there.
const volInput = $('#hero-volume'), volOut = $('.vol-v');
const volume = () => (volInput ? Number(volInput.value) : 5) / 100;
volInput?.addEventListener('input', () => {
  if (video) video.volume = volume();
  if (volOut) volOut.textContent = `${volInput.value}%`;
  volInput.style.setProperty('--fill', `${volInput.value}%`);
});
soundBtn?.addEventListener('click', () => {
  if (!video) return;
  startVideo();
  video.muted = !video.muted;
  if (!video.muted) { video.volume = volume(); video.play().catch(() => {}); }
  else if (!heroSeen) video.pause();
  setSoundLabel();
  floatSound();
});

// The top bar turns transparent over the hero.
const topBar = $('.top'), hero = $('.hero');
if (topBar && hero) {
  const over = () => topBar.classList.toggle('over', hero.getBoundingClientRect().bottom > topBar.offsetHeight + 8);
  over();
  addEventListener('scroll', over, { passive: true });
}

// 3D parallax: copy, specimen and the magic circle lean toward the pointer.
if (hero && finePointer && !reduce) {
  const copy = $('.hero-type'), spec = $('.hero-vert'), circle = $('.hero-media');
  let raf = 0;
  hero.addEventListener('pointermove', e => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const r = hero.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width * 2 - 1, y = (e.clientY - r.top) / r.height * 2 - 1;
      copy?.style.setProperty('--ry', `${x * 4}deg`); copy?.style.setProperty('--rx', `${-y * 3}deg`);
      spec?.style.setProperty('--ry', `${x * -10}deg`); spec?.style.setProperty('--rx', `${y * 7}deg`);
      circle?.style.setProperty('--px', `${x * -24}px`); circle?.style.setProperty('--py', `${y * -18}px`);
    });
  });
  hero.addEventListener('pointerleave', () => {
    for (const el of [copy, spec]) { el?.style.setProperty('--rx', '0deg'); el?.style.setProperty('--ry', '0deg'); }
    circle?.style.setProperty('--px', '0px'); circle?.style.setProperty('--py', '0px');
  });
}
if (finePointer && !reduce) {
  for (const box of $$('.tilt-card')) {
    box.addEventListener('pointermove', e => {
      const r = box.getBoundingClientRect();
      box.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - .5) * 8}deg`);
      box.style.setProperty('--rx', `${((e.clientY - r.top) / r.height - .5) * -6}deg`);
    });
    box.addEventListener('pointerleave', () => { box.style.setProperty('--rx', '0deg'); box.style.setProperty('--ry', '0deg'); });
  }
  for (const el of $$('.spot')) el.addEventListener('pointermove', e => {
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  });
}

// Feature clips from the promo video: loaded and played only while on screen; posters only when motion is reduced.
if (!reduce) {
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      const v = e.target;
      if (e.isIntersecting) { if (!v.getAttribute('src')) v.src = v.dataset.src; v.play().catch(() => {}); }
      else v.pause();
    }
  }, { rootMargin: '120px 0px' });
  for (const v of $$('video.clip')) if (!v.closest('.feat-item')) io.observe(v);
}

// GMV ticker: engine names on the crimson band, game titles on the outlined band. Two copies make the loop seamless.
// The ticker speaks Japanese in every UI language: what MeguLit does, and lines from the games in the video.
const TICK_FEATURES = ['埋め込み', 'ふりがな', 'クリックで辞書', 'Anki カード', '復習', '五十音', '学習統計', '会話ログ', 'AI 解説'];
const TICK_LINES = ['雪に埋もれた', '何かを掴んでいた', '顔を覆う', '空気を読む', '続きを読もう', '最後まで', '物語', '言葉'];
function fillTicker() {
  const fill = (el, words) => {
    if (!el) return;
    const once = words.flatMap(w => { const s = document.createElement('span'); s.textContent = w; const i = document.createElement('i'); i.textContent = '✦'; return [s, i]; });
    el.replaceChildren(...once, ...once.map(n => n.cloneNode(true)));
  };
  fill($('.js-tk-a'), TICK_FEATURES);
  fill($('.js-tk-b'), TICK_LINES);
}

if (lang !== 'zh') applyLang(lang);
else { splitKinetic(); fillTicker(); setSoundLabel(); }

// Motion layer (anime.js). If it cannot load, a CSS fallback shows everything after a moment.
import('./fx.js').then(m => m.run({ reduce, finePointer })).catch(() => {});
loadRelease();
loadEngines();
loadReleases();
