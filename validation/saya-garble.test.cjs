// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-15 (user: 沙耶の唄 Steam, 「这问题也太大了啊」). The recording and logs (E:\MeguLit 1.4.9-beta.39) showed:
   - the game itself draws its monsters' speech as noise (『二十Aﾅ像ナッテ初y(VQｳッテノハ…』); MeguLit wrote nothing back
     (embed=False replacement=False), but the art path translated those lines (「对了对了，这次暑假…」, 「小时候棒捶汢丆怕…」) and drew them;
   - after such a line was dropped the reader kept the previous line's ruby and translation over a page without it;
   - with the original still on screen the reader put its own Japanese a few px off it (ghost).
   Generic rules checked here, all offline: unreadable lines (noise, mojibake) are never drawn, hidden, translated or
   written back; the reader steps aside for them; a line the game still draws itself gets the translation only; anything
   written into a game must survive the game's code page. Real lines from the user's hook log are the fixtures. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { garbledSource, noiseLine } = require('../core/text-sanity.cjs');
const { HookNative } = require('../core/hook-native.cjs');
const { OverlayPlacement } = require('../core/overlay-placement.cjs');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/* the game's own noise lines, exactly as the NitroPlus hook delivered them (hook-diagnostics 2026-11-14T20:17–20:19Z) */
const NOISE = [
  '『ネェネェ、今度ノすﾀfｾｾf劔。ｩI撥D錐年ハ、ドッカ渙ｨtーとモ遊ベﾋ坥ｿ牴xLナイ？』',
  '　『すﾎｻyﾈ祭ォ？　ワザワｴｬWCQｴﾋ]?ｱ角マデ行ッ閂ﾄ:泚麸と？』',
  '『ハハ、勘(煕ﾋ&ヤッテクレヨ津久葉。コイツ今WCQｴﾋ]?ｱ角咨まッテンダ。ナンｶｵf&ノ前、コ6GBbｭlナッテ始メテすけーﾑVﾜﾕｱ性ﾀ縷ンダカラサ』',
  '『ナニﾖｸC。凬5ﾕーとシタコトナﾁw蚪/1ノガソンwPﾑ麓ﾅ(思議？』',
  '『二十Aﾅ像ナッテ初y(VQｳッテノハ、今日日ソウソウイ梗WfA繙ャナイカナ？』',
  '『子供Aﾉ嫡ハ何トナク怖ｾ1駐タノヨ。アPﾑ麓、ナン￠c觝物ミタイデサ』'
];
/* readable lines that must stay readable: the same scene, ASCII in Japanese, a half-width katakana word, full-width Latin */
const READABLE = [
  '　ぶよぶよと蠢く肉塊が、暗く粘ついた声でそう言った。',
  '　　似たような肉塊があと三つ、目の前に並んでいる。テーブルを囲んで、カップに注がれた汚水をさも美味そうに啜り上げながら、',
  '全品50％OFFだって！PCのUSBメモリ', 'ｱﾊﾊ、そうだね。今日はAとBの日', '「PS2版とPC版の違い？」', '「ＣＧモードはＯＮ」と言った',
  'ﾄﾞｷﾄﾞｷする。今日は晴れ', '「Ｗｅｂで見た」と彼女は言った。', '僕はiPhone15とiPad2台を持っている。', '「えっ、ABCDってなに？」'
];

test('the game\'s noise lines are unreadable, real lines are not', () => {
  for (const t of NOISE) { assert.equal(garbledSource(t, { controls: false }), true, t); assert.equal(noiseLine(t), true, t); }
  for (const t of READABLE) assert.equal(garbledSource(t, { controls: false }), false, t);
});

test('a readable Japanese stream keeps its noise lines (the game\'s script text); an unreadable line elsewhere makes the reader step aside', t => {
  /* user 2026-11-15: 「这乱码是原文文本啊」 — on the dialogue stream the noise lines are delivered like any line */
  const ev2 = []; let now2 = 100000;
  const hook2 = new HookNative({ native: __dirname, hook: __dirname, logs: 'Z:/no-fixture-log' }, e => ev2.push(e), () => {}, () => now2);
  hook2.trace = () => {}; hook2.enabled = true; t.after(() => hook2.stop());
  for (const text of [READABLE[0], READABLE[1], NOISE[4], NOISE[5]]) { hook2.source({ text, sourceName: 'NitroPlus', origin: 'live' }, ''); now2 += 5000; }
  assert.deepEqual(ev2.filter(e => typeof e.hookSource === 'string').map(e => e.hookSource.trim()).slice(2), [NOISE[4].trim(), NOISE[5].trim()]);
  assert.equal(ev2.some(e => e.hookLineUnreadable === true), false);
  const ev = [], traces = []; let now = 100000;
  const hook = new HookNative({ native: __dirname, hook: __dirname, logs: 'Z:/no-fixture-log' }, e => ev.push(e), () => {}, () => now);
  hook.trace = m => traces.push(m); hook.enabled = true; t.after(() => hook.stop());
  const line = text => { hook.source({ text, sourceName: 'NitroPlus', origin: 'live' }, ''); now += 5000; };
  /* a stream that has not shown readable Japanese yet: replacement characters and noise are not delivered */
  line(READABLE[0]); line('���あ�'); line('��いう��'); line(READABLE[1]);
  const flags = ev.filter(e => typeof e.hookLineUnreadable === 'boolean').map(e => e.hookLineUnreadable);
  assert.deepEqual(flags, [true, false], 'one step aside for unreadable lines, back at the next readable line');
  const shown = ev.filter(e => typeof e.hookSource === 'string').map(e => e.hookSource.trim());
  assert.deepEqual(shown, [READABLE[0].trim(), READABLE[1].trim()], 'unreadable lines are never delivered');
  const back = ev.findIndex(e => e.hookLineUnreadable === false);
  assert.equal(ev[back].hookSource.trim(), READABLE[1].trim(), 'the reader comes back with the readable line itself');
});

test('a noise line never goes to the art path (no translation drawn over the game\'s own line)', async t => {
  const hook = new HookNative({ native: __dirname, hook: __dirname, logs: 'Z:/no-fixture-log' }, () => {}, () => {}, () => 1000);
  const located = [], traces = []; hook.trace = m => traces.push(m); hook.artLocate = x => located.push(x); t.after(() => hook.stop());
  for (const n of NOISE) hook.artCandidate(n);
  assert.deepEqual(located, []);
  hook.artCandidate('館がある'); assert.deepEqual(located, ['館がある'], 'a readable card still goes');
  assert.ok(traces.some(m => /^art text unreadable/.test(m)));
  const { Reader } = require('../services/reader.cjs'), reader = Object.create(Reader.prototype);
  const events = [], translated = [];
  Object.assign(reader, {
    gal: { hooks: { trace() {} } }, prefs: () => ({ provider: 'google', learnerLanguage: 'zh' }),
    runtime: { emit: (event, message) => events.push({ event, message }) },
    embedCached: (text, value) => value,
    chainTranslate: async text => { translated.push(text); return { text: '这里有一座馆' }; }
  });
  for (const [id, text] of NOISE.entries()) await reader.artText({ id, text, visible: true });
  assert.deepEqual(translated, [], 'the actual reader never asks a translator for noise');
  assert.equal(reader.artTurns, undefined, 'noise does not enter the art render lifecycle');
  assert.deepEqual(events.map(e => [e.event, e.message.translation, e.message.visible]), NOISE.map(() => ['reader-event', '', false]));
  await reader.artText({ id: 'readable', text: '館がある', visible: true });
  assert.deepEqual(translated, ['館がある'], 'a readable card still translates through the actual reader');
  assert.equal(events.at(-1).message.translation, '这里有一座馆');
  assert.equal(events.at(-1).message.visible, true);
});

test('a line the game still draws itself: the placement host says so, a placed line clears it', () => {
  const sent = [], p = new OverlayPlacement({ send: m => sent.push(m) }); p.wanted = () => true;
  p.configure({}, { bound: true, clientWidth: 1280, clientHeight: 960 }); sent.length = 0;
  const rec = { type: 'hookCharRects', engine: 'gpu', line: 2, hidden: false, sw: 1280, sh: 960, viewport: [0, 0, 1280, 960], rects: [[10, 20, 30, 40], [40, 20, 30, 40]], text: 'ぶよ' };
  p.hook(rec); assert.deepEqual(sent.shift(), { type: 'textPlace', visible: true, text: 'ぶよ' });
  p.hook(rec); assert.equal(sent.length, 0, 'said once per line');
  p.hook({ ...rec, hidden: true }); const m = sent.shift(); assert.equal(m.text, 'ぶよ'); assert.equal(m.rects.length, 2);
  p.hook(rec); assert.deepEqual(sent, [{ type: 'textPlace', clear: true }, { type: 'textPlace', visible: true, text: 'ぶよ' }], 'drawn by the game again');
});

test('HookBridge: nothing unreadable is hidden, every write goes through the code-page guard', () => {
  const b = read('native/HookBridge.cs'), p = read('native/EmbedTextPolicy.cs');
  assert.match(b, /static void GlyphLine\(string text\)\{FlushFit\(\);[^\n]*?if\(SkipHeld\)\{GlyphOff\(\);return;\}\/\*[^*]*\*\/[^\n]*?if\(EmbedTextPolicy\.Unreadable\(text\)&&SelectedReadableRun<2&&!EmbedTextPolicy\.EngineText\(selCode\)\)\{[^}]*GlyphOff\(\);return;\}GpuLine\(text\);/);
  assert.match(b, /string reply=hide\?\(p\.hidden\?\?""\):EmbedTextPolicy\.Writeback\(p\.text,trans\);reply=SafeReply\(p\.code,p\.text,reply,"embed-translate"\);/);
  assert.match(b, /replacement=SafeReply\(candidate\.code,text,replacement,candidate\.name\);\r?\n   Luna_EmbedCallback\(tp,text,replacement==text\?"":replacement\);/);
  assert.match(b, /if\(replacement\.Length>0&&EmbedTextPolicy\.Unreadable\(text\)&&SelectedReadableRun<2\)\{replacement="";/);
  assert.match(b, /if\(!EmbedTextPolicy\.GuardSelfTest\(\)\)\{Console\.Error\.WriteLine\("FAIL write guard"\);return 3;\}/, 'the guard is part of the bridge self-test (Build-HookBridge.ps1 runs it)');
  assert.match(p, /public static string GuardWrite\(string code, int fallbackCodepage, string original, string reply, out string reason\)/);
  assert.match(p, /if \(!RoundTrips\(reply, cp\)\) \{ reason = "not representable in code page " \+ cp; return ""; \}/);
  /* the C# rule is the JS rule: same character classes */
  for (const cls of ['\\uFF61-\\uFF9F', '\\x21-\\x7E', '\\u4E00-\\u9FFF']) assert.ok(p.includes(cls), cls);
});

test('stream choice: an unreadable line never selects a stream, two in a row on the selected one hand it to a readable stream', () => {
  /* second recording (05:21): auto-select took Nitroplus3 (HSXF4, UTF-8 read as Shift-JIS: 「縲弱ロ繧ｧ繝阪ぉ…」); every line was dropped and
     the Japanese NitroPlus stream stayed aux, so the reader never got a line and only art/OCR translations showed */
  const b = read('native/HookBridge.cs');
  assert.match(b, /else if\(\(Selected==""\|\|\(StaleMemory\(\)&&tp\.Key\(\)!=Selected\)\|\|\(tp\.Key\(\)!=Selected&&SelectedUnreadableRun>=2&&SelectedReadableRun<2\)\)&&c!=null[^{]*&&\(!EmbedTextPolicy\.Unreadable\(text\)\|\|EmbedTextPolicy\.EngineText\(c\.code\)\)\)\{bool leave=/);
  assert.match(b, /if\(Enabled&&tp\.Key\(\)==Selected\)\{if\(EmbedTextPolicy\.Unreadable\(text\)&&\(c==null\|\|!EmbedTextPolicy\.EngineText\(c\.code\)\)\)SelectedUnreadableRun\+\+;else\{SelectedUnreadableRun=0;SelectedReadableRun\+\+;\}\}/);
  assert.equal(garbledSource('縲弱ロ繧ｧ繝阪ぉ縲∽ｻ雁ｺｦ繝弱☆・f・ｾ・ｾf蜉斐ゑｽｩI謦･D骭仙ｹｴ繝上√ラ繝・き貂呻ｽｨt繝ｼ縺ｨ繝｢驕翫', { controls: false }), true);
});

test('the front end never sends a garbled translation to be written into a game', () => {
  const r = read('services/reader.cjs');
  assert.match(r, /if\(trans&&\(\/\[\\ufffd\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\]\/\.test\(trans\)\|\|require\('\.\.\/core\/text-sanity\.cjs'\)\.garbledSource\(trans\)\)\)\{[^\n]*trans='';\}\r?\n  let hide=false;/);
  assert.match(read('web/reader/bootstrap.js'), /hookLineUnreadable==='boolean'\|\|message\.type==='gameClosed'\)\{document\.body\.classList\.toggle\('megulit-line-unreadable',message\.hookLineUnreadable===true\)/);
  assert.match(read('web/reader/host-surface.css'), /body\.megulit-line-unreadable #reader-host,/);
});

test('reader DOM: a game-drawn line goes back to the reader window, bilingual, without a plate; a placed line shows everything', async t => {
  let chromium;
  try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { t.skip('no playwright-core'); return; }
  const code = read('web/reader/modules/text-place.js');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>.sentence-window{background:rgb(60,80,100);position:fixed;left:100px;top:280px;width:800px;height:150px}.tomoyo-cn-row{display:block}</style></head><body>
<main><div class="sentence-window tomoyo-hook-reader"><div class="sentence-text"><span class="megulit-ruby-base" data-tomoyo-reading="にく"><span class="char-token">肉</span></span><span class="char-token">塊</span><span class="char-token">が</span></div><div class="tomoyo-cn-row">肉块</div></div></main>
<script>window.__tomoyoChinese={};</script></body></html>`;
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
    await page.setContent(html); await page.addScriptTag({ content: code });
    const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const vis = () => page.evaluate(() => ['.char-token', '.megulit-ruby-base', '.tomoyo-cn-row'].map(s => getComputedStyle(document.querySelector(s)).visibility));
    const b = 'window.__tomoyoChinese';
    await page.evaluate(`${b}.textPlaceAnchor?.(false); ${b}.textPlaceMode({ on: true })`); await frame();
    assert.deepEqual(await vis(), ['visible', 'visible', 'visible'], 'nothing known yet: unchanged');
    await page.evaluate(`${b}.textPlace({ visible: true, text: '肉塊が、暗く' })`); await frame();
    /* 2026-11-15 (1.4.10 user group: 「只有翻译了，要替换的原文没了」) the Japanese is never dropped: not placed over the
       game's line, the reader goes back to its own window (no plate, 2026-11-16), Japanese on top and the translation under it */
    assert.deepEqual(await vis(), ['visible', 'visible', 'visible'], 'game draws it: reader window bilingual, Japanese clickable');
assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.sentence-window')).backgroundColor), 'rgba(0, 0, 0, 0)', 'never a plate');
    assert.deepEqual(await page.evaluate(() => [document.body.classList.contains('megulit-placed'), document.body.classList.contains('megulit-place-fallback')]), [false, false], 'not placed over it');
    /* a stale placement of the previous line does not bring the plateless Japanese back */
    await page.evaluate(`${b}.textPlace({ text: 'ぷよぷよ', client: [1280, 960], rects: [[10,10,30,30],[40,10,30,30],[70,10,30,30],[100,10,30,30]] })`); await frame();
    assert.equal(await page.evaluate(() => document.body.classList.contains('megulit-place-fallback')), true, 'another line placed: fallback for this one');
    await page.evaluate(`${b}.textPlace({ visible: true, text: '肉塊が' })`); await frame();
    assert.deepEqual(await page.evaluate(() => [document.body.classList.contains('megulit-place-fallback'), document.body.classList.contains('megulit-place-game-drawn')]), [false, true]);
    await page.evaluate(`${b}.textPlace({ text: '肉塊が', client: [1280, 960], rects: [[100,300,32,32],[132,300,32,32],[164,300,32,32]] })`); await frame();
    assert.deepEqual(await page.evaluate(() => [document.body.classList.contains('megulit-placed'), document.body.classList.contains('megulit-place-game-drawn')]), [true, false]);
    assert.deepEqual(await vis(), ['visible', 'visible', 'visible'], 'placed: the reader draws it all');
    await page.evaluate(`${b}.textPlaceMode({ on: false })`); await frame();
    assert.equal(await page.evaluate(() => document.body.className), '');
  } finally { await browser.close(); }
});
