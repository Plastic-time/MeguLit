// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: ファタモルガーナの館's text effect keeps the hidden line from pairing; 千恋＊万花 pairs most lines). Replay on
   text-place.js: a game whose lines mostly come only as orphans (the reader redraws them at the game's place) sends galTextEffects once
   (read mode); a game whose lines pair, with an orphan now and then, never does. Each counted line is a layoutDiagnostic textEffects. */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { console.log('SKIP text effects switch (no playwright-core)'); process.exit(0); }
const code = fs.readFileSync(process.env.MEGULIT_TEXT_PLACE || path.join(__dirname, '..', 'web', 'reader', 'modules', 'text-place.js'), 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>.sentence-window{position:fixed;left:100px;bottom:20px;width:700px}
.sentence-text{font-size:22px}.tomoyo-cn-row{display:block;font-size:20px}</style></head><body><main><div class="sentence-window tomoyo-hook-reader">
<div class="sentence-text"></div><div class="tomoyo-cn-row"></div></div></main>
<script>window.__sent=[];window.__tomoyoTranslateRequest=s=>window.__sent.push(JSON.parse(s));window.__tomoyoChinese={};</script></body></html>`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const lines = ['その瞬間、私は死体を見下ろしていた。', '館の扉が静かに開いた。', '彼女はそう言って笑った。', '誰もいない廊下に足音が響く。', '窓の外は冬の海だった。',
  '私は何も覚えていない。', '扉の向こうで誰かが呼んだ。', 'それは遠い昔の話だ。', '鐘の音が三度鳴った。', '夜はまだ明けない。'];
async function run(page, game, orphanAt) {
  await page.evaluate(game => { window.__sent = []; const b = window.__tomoyoChinese; b.textPlaceMode({ on: false }); b.textPlaceMode({ on: true, game }); }, game);
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i], orphan = orphanAt(i);
    await page.evaluate(([t, orphan, i]) => { const s = document.querySelector('.sentence-text'); s.dataset.sequence = String(i + 1);
      s.replaceChildren(...(orphan ? [] : [...t].map(c => Object.assign(document.createElement('span'), { className: 'char-token', textContent: c }))));
      window.__tomoyoChinese.textPlace({ text: t, client: [804, 604], rects: [...t].map((c, k) => [220 + k * 22, 488, 20, 22]) }); }, [t, orphan, i]);
    await sleep(520);
    await page.evaluate(([t]) => window.__tomoyoChinese.textPlace({ text: t, client: [804, 604], rects: [...t].map((c, k) => [220 + k * 22, 488, 20, 22]) }), [t]);
    await sleep(120);
  }
  return page.evaluate(() => ({ sent: window.__sent.filter(m => m.type === 'galTextEffects').length, diag: window.__sent.filter(m => m.kind === 'textEffects').length, count: window.__tomoyoChinese.textEffectsCount() }));
}
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.setContent(html); await page.addScriptTag({ content: code });
    await page.evaluate(() => { const b = window.__tomoyoChinese; b.galLayoutInfo = () => ({ clientX: 200, clientY: 100, clientWidth: 804, clientHeight: 604, workBottom: 1000 }); b.textPlaceAnchor(true); });
    const fx = await run(page, 'fata', i => i % 3 !== 2);
    assert.strictEqual(fx.sent, 1, 'text-effect game: galTextEffects once ' + JSON.stringify(fx));
    assert.ok(fx.diag >= 6, 'each counted line logged');
    const senren = await run(page, 'senren', i => i === 4);
    assert.strictEqual(senren.sent, 0, 'pairing game: no switch ' + JSON.stringify(senren));
    assert.ok(senren.count.paired >= 6, 'pairing game lines counted as paired ' + JSON.stringify(senren));
    console.log('PASS text effects: orphan-heavy game switches once ' + JSON.stringify(fx.count) + ', pairing game stays ' + JSON.stringify(senren.count));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
