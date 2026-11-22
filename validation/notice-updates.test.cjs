'use strict';
/* (user 2026-11-13) the start notice's update list appeared only after a while and opening it stuttered:
   a cached list is drawn in the first frame, before the service answers, and only the first rows are built at once.
   Also every web/*.css must have balanced braces: a stray declaration line (its selector deleted) swallowed the
   next rule (.dev-notice-rule's grid-area) and put the game-name hint over the notice title. */
const test = require('node:test'), assert = require('node:assert'), fs = require('node:fs'), path = require('node:path'), { pathToFileURL } = require('node:url');
const web = path.join(__dirname, '..', 'web');

class El {
  constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.hidden = false; this.textContent = ''; this.isConnected = true; }
  append(...xs) { for (const x of xs) x instanceof Frag ? this.children.push(...x.children) : this.children.push(x); }
  replaceChildren(...xs) { this.children = []; this.append(...xs); }
}
class Frag extends El {}

function fakeDom() {
  const list = new El('ul'), note = new El('p');
  list.hidden = note.hidden = true;
  const dialog = { isConnected: true, querySelector: s => s === '.dev-notice-updates' ? list : s === '.dev-notice-updates-note' ? note : null };
  globalThis.document = { createElement: t => new El(t), createDocumentFragment: () => new Frag('#frag') };
  return { dialog, list, note };
}
const rows = n => Array.from({ length: n }, (_, i) => ({ date: '2026-11-' + String(1 + (i % 28)).padStart(2, '0'), text: 'update ' + i }));

test('a cached update list is drawn before the service answers', async () => {
  const store = new Map();
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
  globalThis.requestIdleCallback = fn => setTimeout(fn, 0);
  const ui = await import(pathToFileURL(path.join(web, 'feedback-ui.js')).href);
  store.set('megulit.siteUpdates', JSON.stringify(rows(5)));
  assert.strictEqual(ui.cachedUpdates().length, 5);

  const { dialog, list } = fakeDom();
  let answer; const pending = new Promise(r => { answer = r; });
  const api = () => pending; /* the service never answers in time */
  const shown = ui.drawUpdates(dialog, 'zh', ui.cachedUpdates());
  assert.strictEqual(shown, 5); assert.strictEqual(list.hidden, false); assert.strictEqual(list.children.length, 5);
  answer(rows(5)); await api();
  /* the fill path itself must draw the cache before awaiting the service */
  const src = fs.readFileSync(path.join(web, 'feedback-ui.js'), 'utf8'), fill = src.slice(src.indexOf('async function fillUpdates'));
  assert.ok(fill.indexOf('drawUpdates(dialog, locale, cached)') < fill.indexOf("await api('site_updates'"));
});

test('a long update list builds only the first rows at once, the rest when idle', async () => {
  const ui = await import(pathToFileURL(path.join(web, 'feedback-ui.js')).href);
  globalThis.requestIdleCallback = fn => setTimeout(fn, 0);
  const { dialog, list } = fakeDom();
  ui.drawUpdates(dialog, 'zh', rows(200));
  assert.ok(list.children.length <= 12, 'first frame rows ' + list.children.length);
  for (let i = 0; i < 20 && list.children.length < 200; i++) await new Promise(r => setTimeout(r, 5));
  assert.strictEqual(list.children.length, 200);
  assert.strictEqual(list.children[0].children[0].textContent, '11.01');
});

test('startup notice opens immediately on a cold cache and updates its log in the background', async () => {
  const { mountDevNotice } = await import(pathToFileURL(path.join(web, 'feedback-ui.js')).href);
  const { dialog, list, note } = fakeDom();
  const game = new El('input'), form = new El('form'), button = new El('button'), close = new El('button'), seed = { querySelector: () => null };
  const empty = new El('p');
  const elements = new Map([['form', form], ['.dev-notice-game', game], ['.feedback-status', new El('p')],
    ['.dev-notice-updates', list], ['.dev-notice-updates-note', note], ['[data-notice-close]', close], ['.startup-updates-empty', empty]]);
  const openedWithRows = [];
  Object.assign(dialog, {
    isConnected: false,
    querySelector: selector => selector === '[data-guide-level]' ? null : elements.get(selector) || button,
    querySelectorAll: selector => selector === '.dev-notice-page' ? [{}, seed, {}] : [button],
    addEventListener() {},
    setAttribute() {},
    showModal() { this.open = true; openedWithRows.push(list.children.length); },
    close() { this.remove(); },
    remove() { this.open = this.isConnected = false; },
  });
  document.createElement = tag => {
    if (tag !== 'dialog') return new El(tag);
    list.replaceChildren();
    list.hidden = note.hidden = empty.hidden = true;
    return dialog;
  };
  document.querySelector = () => dialog.isConnected ? dialog : null;
  document.body = { append: node => { node.isConnected = true; } };

  const store = new Map();
  globalThis.localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  let canShow = true, answer, requests = 0;
  const options = { locale: 'en', esc: String, canShow: () => canShow, api: action => {
    if (action !== 'site_updates') return Promise.resolve(null);
    requests++;
    return new Promise(resolve => { answer = resolve; });
  } };

  canShow = false;
  mountDevNotice(options);
  assert.strictEqual(dialog.isConnected, false, 'skip off home or when another modal is open');
  assert.strictEqual(requests, 0);

  canShow = true;
  mountDevNotice(options);
  assert.deepStrictEqual(openedWithRows, [0], 'the populated card opens while the update log is pending');
  assert.match(dialog.innerHTML, /<button [^>]*data-notice-close autofocus[^>]*>/);
  assert.match(dialog.innerHTML, /class="dev-notice-updates" tabindex="0"/);
  assert.strictEqual(empty.hidden, false);
  mountDevNotice(options);
  assert.strictEqual(requests, 1, 'only one notice per launch');
  answer(rows(5));
  await new Promise(resolve => setImmediate(resolve));
  assert.strictEqual(list.children.length, 5);
  assert.strictEqual(empty.hidden, true);
  close.onclick();
  assert.strictEqual(dialog.open, false);
  mountDevNotice(options);
  assert.strictEqual(requests, 1);

  mountDevNotice({ ...options, force: true });
  assert.strictEqual(list.children.length, 5, 'a warm cache is drawn immediately');
  close.onclick();
  answer(rows(6));
  await new Promise(resolve => setImmediate(resolve));
  assert.strictEqual(dialog.open, false, 'a delayed response cannot reopen the notice');

  store.clear();
  mountDevNotice({ ...options, force: true, api: async () => { throw Error('offline'); } });
  assert.strictEqual(dialog.open, true, 'offline notice opens with its basic content');
  await new Promise(resolve => setImmediate(resolve));
  assert.match(empty.textContent, /Could not load the updates/);
});

test('site_updates refreshes the current call and keeps the newest usable cache', async t => {
  const { dispatch } = require('../services/bridge.cjs');
  const stale = [{ date: '2026-11-20', text: '1.4.19：old' }];
  const fresh = [{ date: '2026-11-21', text: '1.4.22：new' }, ...stale];
  let cached = JSON.stringify(stale), nextCache, writes = 0, calls = 0, github;
  t.mock.method(fs, 'readFileSync', () => cached);
  t.mock.method(fs, 'mkdirSync', () => {});
  t.mock.method(fs, 'writeFileSync', (_file, data) => { nextCache = data; });
  t.mock.method(fs, 'renameSync', () => { cached = nextCache; writes++; });
  t.mock.method(globalThis, 'fetch', url => {
    calls++;
    if (url.startsWith('https://raw.githubusercontent.com/') && !github) return new Promise(resolve => { github = resolve; });
    return Promise.resolve({ ok: true, json: async () => stale });
  });
  const pending = dispatch({ action: 'site_updates' });
  const concurrent = dispatch({ action: 'site_updates' });
  assert.strictEqual(calls, 3, 'concurrent readers share one refresh');
  github({ ok: true, json: async () => fresh });
  assert.deepStrictEqual(await pending, fresh, 'the slower GitHub result beats both stale mirrors on this call');
  assert.deepStrictEqual(await concurrent, fresh);
  assert.deepStrictEqual(await dispatch({ action: 'site_updates' }), fresh, 'stale responses cannot replace the disk cache');
  assert.strictEqual(writes, 1);
  assert.deepStrictEqual(await dispatch({ action: 'site_updates', cachedHead: { date: '2026-11-22', text: '1.4.23：newer' } }), []);
});

test('every web stylesheet has balanced braces', () => {
  for (const f of fs.readdirSync(web).filter(x => x.endsWith('.css'))) {
    const s = fs.readFileSync(path.join(web, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    let depth = 0, line = 1;
    for (const ch of s) { if (ch === '\n') line++; if (ch === '{') depth++; if (ch === '}' && --depth < 0) assert.fail(`${f}:${line} stray }`); }
    assert.strictEqual(depth, 0, f + ' unclosed {');
  }
});
