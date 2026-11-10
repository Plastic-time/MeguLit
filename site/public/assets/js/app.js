// SPDX-License-Identifier: GPL-3.0-or-later
// megulit.com page script: language and theme, the release data behind the download buttons, engine list, changelog.
import { I18N } from './i18n.js';
import { MIRROR, downloadSources, formatSize, formatDate, pickLang, renderMarkdown } from './core.mjs';

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
  document.title = document.body.dataset.page === 'changelog' ? `${pick('t', 'cl.title')} · MeguLit` : d('title');
  if (release) fillRelease();
  if (engines) fillEngines();
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
const tabs = $$('[role="tab"]');
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
  $('.js-adapters')?.replaceChildren(...e.adapters.map(a => li(a.name, a.games.join(' · '))));
  $('.js-games')?.replaceChildren(...e.games.map(g => {
    const el = li(lang === 'en' && g.en ? g.en : g.title, g.engine);
    el.firstChild.lang = 'ja';
    return el;
  }));
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

if (lang !== 'zh') applyLang(lang);
loadRelease();
loadEngines();
loadReleases();
