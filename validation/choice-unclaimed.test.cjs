'use strict';
/* 2026-11-21 (owner, ファタモルガーナの館 r30: the choice screen showed its frames, no option text). The game drew its options hidden one right
   after the other; only the last stayed current long enough to be drawn from its placement. Every unclaimed hidden line now waits on its own
   and is drawn. The choice finder no longer takes a text effect's interleaved frame or a piece of the dialogue line for an option. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { HookNative } = require('../core/hook-native.cjs');
test('choice finder: r30 candidates (dialogue pieces and an effect frame) are not options; real options are', () => {
  /* since the layered profiles these checks are ファタ's game diff (choice.dropEffectFrames); the kernel keeps every candidate (ATRI's glued options) */
  const P = require('../core/profiles/index.cjs'), fata = P.profileFor({ exe: 'C:/g/fata_jp.exe' });
  const h = { lastSource: 'でも……お声が聞けて、良かったです。', recentSources: [], trace() {}, profile: fata };
  assert.equal(P.get(fata, 'choice.dropEffectFrames', false), true);
  assert.deepEqual(HookNative.prototype.choiceFilter.call({ ...h, profile: P.profileFor({}) }, ['お声が聞けて', 'かったです']), ['お声が聞けて', 'かったです'], 'kernel: unchanged');
  assert.equal(HookNative.prototype.choiceFilter.call(h, ['お声が聞けて', 'かったです', 'か良ったか良でっすたか良。良でっすたかでっ。すたかでっ。すたで。す。']), null);
  assert.deepEqual(HookNative.prototype.choiceFilter.call(h, ['扉を開ける', '引き返す']), ['扉を開ける', '引き返す']);
  assert.equal(HookNative.interleaved('り困ますり困わま、すり困わますり、困わますり、わます、わ'), true);
  assert.equal(HookNative.interleaved('まだ頭がはっきりされてないのかしら。'), false);
});
let chromium; try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch {}
test('options drawn hidden one after the other are all drawn from their placement', { skip: !chromium && 'no playwright-core' }, async () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'web', 'reader', 'modules', 'text-place.js'), 'utf8');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.setContent('<!doctype html><meta charset="utf-8"><style>.sentence-window{position:fixed;left:100px;bottom:20px;width:700px}.sentence-text{font-size:22px}</style><main><div class="sentence-window tomoyo-hook-reader"><div class="sentence-text"></div><div class="tomoyo-cn-row"></div></div></main><script>window.__tomoyoChinese={};</script>');
    await page.addScriptTag({ content: code });
    await page.evaluate(() => { const b = window.__tomoyoChinese; b.galLayoutInfo = () => ({ clientX: 200, clientY: 100, clientWidth: 804, clientHeight: 604, workBottom: 1000 }); b.textPlaceAnchor(true); b.textPlaceMode({ on: true, game: '1' });
      for (const [t, y] of [['扉を開ける', 250], ['引き返す', 300], ['声をかける', 350]]) b.textPlace({ text: t, client: [804, 604], rects: [...t].map((c, i) => [300 + i * 22, y, 20, 22]) }); });
    await page.waitForTimeout(800);
    const drawn = await page.evaluate(() => [...document.querySelectorAll('#megulit-place-extras .megulit-place-line')].map(g => g.textContent).sort());
    assert.deepEqual(drawn, ['声をかける', '引き返す', '扉を開ける']);
  } finally { await browser.close(); }
});
