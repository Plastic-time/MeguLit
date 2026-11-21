// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Owner's ファタモルガーナの館 test, 1.4.22 package v3 (recording 2026-11-21 11:57:19 local = 02:57:19Z; logs E:\MeguLit-Test-1421\logs):
   「每次点击推进后，刚才那句话的游戏原文会冒出来一下，然后到下一句；再下一句时有概率直接被原文替换掉、丧失功能」.
   Frame by frame: MeguLit's line (grey 0x9D like the game, ruby, translation) goes at the click, ~0.45 s later the same line is back
   in white without ruby on the game's own boxes for 0.7 s, then the next line. krkr status said draws=hidden the whole time (the
   game drew nothing visible): the white line is the reader's orphan path (web/reader/modules/text-place.js, ORPHAN_MS 450) drawing
   the placed line from its boxes. The game had cleared it at the click ([cm] -> MessageLayer.clear in scenario.ks), but its
   sentence had already been reported at the click wait, so nothing told the placement; it stayed the current line while the
   reader had moved on. The same path gives way to the game for 3 s when a line cannot be drawn, and its orphans fed the
   text-effects verdict that switched 02:45:51Z to read mode (orphan 3 / paired 5).
   Fix (KiriKiri engine diff, on for ファタ by its seed page.reportClear): the cleared line is reported once more, empty and not hidden
   (native/krkrtext/script.inc st.clearSent from the wrapped MessageLayer.clear), which takes it off the placement.
   This test: the script's own clearSent (TJS -> JS), the wiring, the real records through OverlayPlacement, and the real sequence
   (lines 24..29, their boxes and the click gaps) replayed on the reader page in headless Edge, before and after. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), script = fs.readFileSync(path.join(root, 'native', 'krkrtext', 'script.inc'), 'utf8').replace(/\r\n/g, '\n');
const { OverlayPlacement } = require('../core/overlay-placement.cjs'), tp = require('../core/text-paths.cjs');
function fn(start) { const a = script.indexOf(start); assert.ok(a >= 0, start); const b = script.indexOf('} incontextof st;', a); return script.slice(a, b + 1); }
/* engine-draw.log 02:57Z, the game's real records */
const REC = {
  24: 'ToMe_CHARS engine=krkr line=24 hidden=1 sw=800 sh=600 vx=0 vy=0 vw=0 vh=0 n=4 rects=361,485,22,22;383,485,22,22;405,485,17,22;422,485,17,22 text=……さま',
  25: 'ToMe_CHARS engine=krkr line=25 hidden=1 sw=800 sh=600 vx=0 vy=0 vw=0 vh=0 n=20 rects=70,485,22,22;92,485,22,22;114,485,18,22;132,485,22,22;154,485,16,22;170,485,22,22;192,485,22,22;214,485,18,22;232,485,22,22;254,485,21,22;275,485,15,22;290,485,22,22;312,485,22,22;334,485,21,22;355,485,22,22;377,485,22,22;399,485,21,22;420,485,22,22;442,485,18,22;460,485,15,22 text=呼吸をひとつする度に、指先に感覚が宿る。',
  26: 'ToMe_CHARS engine=krkr line=26 hidden=1 sw=800 sh=600 vx=0 vy=0 vw=0 vh=0 n=5 rects=352,485,21,22;373,485,21,22;394,485,20,22;414,485,17,22;431,485,17,22 text=だんなさま',
  27: 'ToMe_CHARS engine=krkr line=27 hidden=1 sw=800 sh=600 vx=0 vy=0 vw=0 vh=0 n=12 rects=70,485,19,22;89,485,17,22;106,485,21,22;127,485,21,22;148,485,22,22;170,485,21,22;191,485,22,22;213,485,18,22;231,485,22,22;253,485,21,22;274,485,20,22;294,485,15,22 text=どこかで雨の音を聞いた。',
  28: 'ToMe_CHARS engine=krkr line=28 hidden=1 sw=800 sh=600 vx=0 vy=0 vw=0 vh=0 n=3 rects=368,485,22,22;390,485,20,22;410,485,22,22 text=ねえ？',
  29: 'ToMe_CHARS engine=krkr line=29 hidden=1 sw=800 sh=600 vx=0 vy=0 vw=0 vh=0 n=10 rects=70,485,20,22;90,485,17,22;107,485,20,22;127,485,22,22;149,485,21,22;170,485,22,22;192,485,22,22;214,485,18,22;232,485,22,22;254,485,15,22 text=そして火の爆ぜる音。'
};
/* reader-host pointer downs and the next record (ms after the click): 23.316 -> 24.070, 25.451 -> 26.753, 31.669 -> 32.009, 33.823 -> 35.039, 36.667 -> 36.987 */
const GAP = { 25: 754, 26: 1302, 27: 340, 28: 1216, 29: 320 };
const textOf = n => REC[n].slice(REC[n].indexOf(' text=') + 6);

/* the script's clearSent, as KiriKiri runs it: the line reported once, then never again, only with #clearline */
function clearRig(clear) {
  const out = [], st = { cfg: { roles: 0, embed: 0, zh: 1, ...(clear ? { clear: 1 } : {}) }, clears: 0, report: s => out.push(s) };
  const js = fn('st.clearSent=function(rec)').replace(/\bint\(/g, 'Math.trunc(');
  new Function('st', js + ';')(st);
  return { st, out };
}
const sentence = n => ({ line: n, sentLine: n, sw: 800, sh: 600 });

test('script: the cleared line is reported once, empty and not hidden, and only when the game\'s diff asks (#clearline)', () => {
  const { st, out } = clearRig(true), rec = sentence(25);
  st.clearSent(rec); st.clearSent(rec);
  assert.deepEqual(out, ['ToMe_CHARS engine=krkr line=25 hidden=0 sw=800 sh=600 vx=0 vy=0 vw=0 vh=0 n=0 rects= text='], 'once');
  assert.equal(st.clears, 1);
  const r = tp.parseChars(out[0]); assert.equal(r.type, 'hookCharRects'); assert.equal(r.hidden, false); assert.equal(r.text, ''); assert.deepEqual(r.rects, []);
  const off = clearRig(false); off.st.clearSent(sentence(25)); assert.deepEqual(off.out, [], 'without the switch: nothing (every other game, 千恋＊万花 included)');
  const stale = clearRig(true); stale.st.clearSent({ line: 26, sentLine: 25, sw: 800, sh: 600 }); assert.deepEqual(stale.out, [], 'a layer whose last report was another line says nothing');
  const never = clearRig(true); never.st.clearSent({ line: 3, sentLine: 0, sw: 800, sh: 600 }); assert.deepEqual(never.out, [], 'a line never reported is never cleared');
});

test('wiring: the clear follows the flush in the wrapped MessageLayer.clear; the seed switches it on for ファタ only', () => {
  assert.ok(script.includes('try {this.st.flush(this,true);this.st.clearSent(this);this.cleared=true;'));
  assert.ok(script.includes("if(rec.role!='name') rec.sentLine=rec.line;"));
  assert.ok(script.includes("else if(t=='#clearline') c.clear=1;"));
  const P = require('../core/profiles/index.cjs'), E = require('../core/engine-draw.cjs');
  const fata = P.profileFor({ exe: 'E:/GAL/海市蜃楼之馆/fata_jp.exe', engine: 'KiriKiri' }), senren = P.profileFor({ exe: 'D:/Games/SenrenBanka/SenrenBanka.exe', engine: 'KiriKiri' });
  assert.equal(E.settings(fata).clear, true); assert.equal(E.settings(senren).clear, false, 'kernel default off');
  assert.ok(E.krkrControlText(E.settings(fata), new Map()).split('\r\n').includes('#clearline'));
  assert.ok(!E.krkrControlText(E.settings(senren), new Map()).includes('#clearline'), '千恋＊万花: control file unchanged');
});

function placementRig() {
  const sent = [], p = new OverlayPlacement({ send: m => sent.push(m) }); p.wanted = () => true;
  p.configure({ hookProfile: 'embed', hookHide: true }, { bound: true, clientWidth: 804, clientHeight: 604 }); sent.length = 0;
  return { p, sent, feed: raw => { const before = sent.length; p.hook(tp.parseChars(raw)); return sent.slice(before); } };
}

test('placement: the real line 25, then the clear: the placement lets it go; the next line is placed as before', () => {
  const { feed } = placementRig();
  const placed = feed(REC[25]); assert.equal(placed.length, 1); assert.equal(placed[0].text, textOf(25)); assert.equal(placed[0].rects.length, 20);
  const { out } = clearRig(true), rig = clearRig(true); rig.st.clearSent(sentence(25));
  assert.deepEqual(feed(rig.out[0]), [{ type: 'textPlace', gone: true, text: textOf(25) }], 'the reader is told the game cleared it (the line stays the anchor)');
  assert.deepEqual(feed(rig.out[0]), [], 'said once');
  const other = clearRig(true); other.st.clearSent(sentence(24)); assert.deepEqual(feed(other.out[0]), [], 'a clear of another line than the placed one says nothing');
  const next = feed(REC[26]); assert.equal(next[0].text, 'だんなさま'); assert.equal(next[0].rects.length, 5);
  assert.equal(out.length, 0);
});

/* the real sequence on the reader page (headless Edge): MeguLit draws each line on the game's place; at each click the reader's
   line goes (as the recording shows) and the game clears its layer; nothing may come back before the next line */
test('replay 02:57Z: no line comes back after a click, the reader keeps drawing every line (before: it did come back)', async t => {
  let chromium; try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { t.skip('no playwright-core'); return; }
  const code = fs.readFileSync(path.join(root, 'web', 'reader', 'modules', 'text-place.js'), 'utf8');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>.sentence-window{position:fixed;left:100px;bottom:20px;width:700px;height:150px}
.sentence-text{font-size:22px}.tomoyo-cn-row{display:block;font-size:20px}</style></head><body><main><div class="sentence-window tomoyo-hook-reader">
<div class="sentence-text"></div><div class="tomoyo-cn-row"></div></div></main><script>window.__tomoyoChinese={};</script></body></html>`;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const run = async (withFix, clearFirst = false) => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.setContent(html); await page.addScriptTag({ content: code });
      await page.evaluate(() => { const b = window.__tomoyoChinese; b.galLayoutInfo = () => ({ clientX: 200, clientY: 100, clientWidth: 804, clientHeight: 604, workBottom: 1000 }); b.textPlaceAnchor(true); b.textPlaceMode({ on: true, game: '1' }); });
      const { feed } = placementRig(), forward = msgs => page.evaluate(ms => { for (const m of ms) window.__tomoyoChinese.textPlace(m); }, msgs);
      const reader = text => page.evaluate(t => { const s = document.querySelector('.sentence-text'); s.dataset.sequence = String(Math.random()); s.replaceChildren(...[...t].map(c => { const e = document.createElement('span'); e.className = 'char-token'; e.textContent = c; return e; })); }, text);
      const look = () => page.evaluate(() => ({ extras: [...document.querySelectorAll('#megulit-place-extras .megulit-place-line')].map(g => g.textContent), anchored: document.body.classList.contains('megulit-anchored'), reader: document.querySelector('.sentence-text').textContent }));
      const back = [], lines = [24, 25, 26, 27, 28, 29];
      for (let i = 0; i < lines.length; i++) {
        const n = lines[i];
        await reader(textOf(n)); await forward(feed(REC[n])); await sleep(250);
        const shown = await look(); assert.ok(shown.anchored, 'line ' + n + ' is drawn by the reader on the game\'s place'); assert.deepEqual(shown.extras, [], 'line ' + n + ': nothing drawn from the placement');
        const next = lines[i + 1]; if (!next) break;
        /* the click: the reader's line goes, the game clears its layer ([cm]) */
        const clear = async () => { const rig = clearRig(true); rig.st.clearSent(sentence(n)); await forward(feed(rig.out[0])); };
        if (withFix && clearFirst) { await clear(); await sleep(50); const l = await look(); assert.ok(l.anchored, 'line ' + n + ': still on the game\'s place right after the clear'); }
        await reader('');
        if (withFix && !clearFirst) await clear();
        for (let ms = 0; ms < GAP[next]; ms += 100) { await sleep(100); const l = await look(); for (const x of l.extras) back.push(n + ':' + x); }
      }
      const fx = await page.evaluate(() => window.__tomoyoChinese.textEffectsCount());
      await page.close();
      return { back: [...new Set(back)], fx };
    };
    const before = await run(false);
    assert.ok(before.back.some(x => x.startsWith('25:呼吸をひとつする度に')), 'without the clear the replay shows the owner\'s flash: ' + JSON.stringify(before.back));
    const after = await run(true);
    assert.deepEqual(after.back, [], 'with the clear no line comes back after a click');
    assert.deepEqual(after.fx, { paired: 6, orphan: 0, sent: false }, 'all six lines drawn by the reader, none an orphan: ' + JSON.stringify(after.fx));
    const race = await run(true, true);
    assert.deepEqual(race.back, [], 'the clear before the reader moves on: the same');
    assert.deepEqual(race.fx, { paired: 6, orphan: 0, sent: false });
  } finally { await browser.close(); }
});
