// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-19 (user, windowed 千恋＊万花 1456x819: 「不要再挤压我的汉字了 我窗口化呢 只要显示器上还有位置就不要这样」): the translation
   under an anchored line keeps the user's size and goes below the game window while the monitor's work area has room (the
   overlay spans the desktop); only a sentence that does not fit above the work-area bottom is made smaller, once and never
   under 60 %, and if it still does not fit the block moves up just enough; over the game's own bottom bar it gets a stronger
   outline, no plate. */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { console.log('SKIP text-place work area (no playwright-core)'); process.exit(0); }
const code = fs.readFileSync(path.join(__dirname, '..', 'web', 'reader', 'modules', 'text-place.js'), 'utf8');
const gal = fs.readFileSync(path.join(__dirname, '..', 'web', 'reader', 'modules', 'gal.js'), 'utf8');
const rubyStyles = gal.match(/style\.textContent = `([\s\S]*?)`;/)[1];
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
.sentence-window{position:fixed;left:100px;bottom:20px;width:800px;height:150px;background:rgba(0,0,0,.6);border:2px solid #fff}
.tomoyo-cn-row{display:block;font-size:30px;width:700px}</style></head><body>
<main><div class="sentence-window tomoyo-hook-reader"><div class="sentence-text"><span class="megulit-ruby-base" data-tomoyo-reading="きょう"><span class="char-token">今</span><span class="char-token">日</span></span><span class="char-token">は</span><span class="char-token">晴</span><span class="char-token">れ</span></div><div class="tomoyo-cn-row">今天是晴天</div></div></main>
<script>window.__tomoyoChinese={};</script></body></html>`;
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.setContent(html); await page.addStyleTag({ content: rubyStyles }); await page.addScriptTag({ content: code });
    const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const cn = () => page.evaluate(() => { const r = document.querySelector('.tomoyo-cn-row'); const b = r.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), size: parseFloat(getComputedStyle(r).fontSize), onUi: r.classList.contains('megulit-cn-on-ui') || getComputedStyle(r).textShadow.includes('0px 0px 5px') }; });
    const at = (y, text) => page.evaluate(([y, text]) => { document.querySelector('.tomoyo-cn-row').textContent = text; window.__tomoyoChinese.textPlace({ text: '今日は晴れ', client: [1456, 819], rects: [0, 1, 2, 3, 4].map(i => [300 + i * 40, y, 40, 40]) }); }, [y, text]);
    await page.evaluate(() => { const b = window.__tomoyoChinese; b.galLayoutInfo = () => ({ clientX: 200, clientY: 100, clientWidth: 1456, clientHeight: 819, workBottom: 1040 }); b.textPlaceMode({ on: true }); b.textPlaceAnchor(true); });
    /* the game's text near the bottom of its window (client bottom = 919 on the overlay): the translation goes below it at full size */
    await at(760, '你好，出租车师傅。'); await frame();
    const a = await cn(); assert.strictEqual(a.size, 30, 'full size while the monitor has room ' + JSON.stringify(a)); assert.ok(a.bottom > 919 - 52, 'it may sit over or below the game\'s bottom bar ' + JSON.stringify(a)); assert.ok(a.bottom <= 1040, 'inside the work area');
    assert.strictEqual(a.onUi, false, 'over the game bar too: no automatic shadow, only the user own outline (user: 为啥译文一直有投影，很重很烦还关不掉)');
    /* a long translation that does not fit above the work-area bottom: smaller once, never under 60 %, then moved up just enough */
    await at(700, '在百货商店购物，在餐厅用餐，在公园悠闲地度过……'.repeat(6)); await frame();
    const c = await cn(); assert.ok(c.size >= 18 && c.size < 30, 'smaller, not under 60 % ' + JSON.stringify(c)); assert.ok(c.bottom <= 1032 + 1, 'fully visible ' + JSON.stringify(c));
    /* the next short sentence is back to full size */
    await at(700, '谢谢。'); await frame(); assert.strictEqual((await cn()).size, 30);
    const readerRuby = () => page.evaluate(() => {
      const base = document.querySelector('.sentence-text .megulit-ruby-base');
      const token = base.firstElementChild;
      const style = getComputedStyle(base, '::before'), glyph = token.getBoundingClientRect(), box = base.getBoundingClientRect();
      return { reading: style.content, visibility: style.visibility, fill: style.webkitTextFillColor, glyphFill: getComputedStyle(token).webkitTextFillColor, top: box.top + parseFloat(style.top), bottom: glyph.top,
        center: box.left + parseFloat(style.left), left: glyph.left, right: box.right,
        clickable: document.elementFromPoint(glyph.left + glyph.width / 2, glyph.top + glyph.height / 2) === token };
    });
    await page.evaluate(() => window.__tomoyoChinese.textPlace({ visible: true, hiding: true, embedded: 2, text: '今日は晴れ' }));
    await frame();
    await page.evaluate(() => window.__tomoyoChinese.textPlace({ fallback: true, text: '今日は晴れ', client: [1456, 819],
      rects: [0, 1, 2, 3, 4].map(i => [300 + i * 40, 720, 40, 40]) }));
    await frame();
    for (const translation of ['已经显示译文。', '更长的译文'.repeat(28)]) {
      await page.locator('.tomoyo-cn-row').evaluate((row, value) => { row.textContent = value; }, translation);
      await frame();
      const ruby = await readerRuby();
      assert.equal(ruby.reading, '"きょう"');
      assert.equal(ruby.visibility, 'visible', 'ruby is visible on the clickable reader, including after native ownership ends');
      assert.ok(ruby.clickable && ruby.top <= ruby.bottom && ruby.center >= ruby.left && ruby.center <= ruby.right, JSON.stringify(ruby));
    }
    // The recorded order includes a native clear, the same words under a new line ID, and a colour-only redraw.
    const { OverlayPlacement } = require('../core/overlay-placement.cjs');
    const { parseChars } = require('../core/text-paths.cjs');
    const messages = [], placement = new OverlayPlacement({ send: m => messages.push(m), blanking: () => true });
    placement.profile = require('../core/profiles/index.cjs').profileFor({exe:'SenrenBanka.exe',engine:'kirikiri'});
    placement.configure({hookProfile:'embed'}, {bound:true, clientWidth:1527, clientHeight:858});
    const record = (id, fields = '', clear = false, hidden = false) => {
      const boxes = '468,885,39,39;507,885,39,39;546,885,39,39;585,885,39,39;624,885,39,39;663,885,39,39';
      placement.hook(parseChars('ToMe_CHARS engine=krkr line='+id+' hidden='+Number(hidden)+' sw=1920 sh=1080 vx=0 vy=0 vw=0 vh=0 n='+
        (clear ? '0 rects= text=' : '6 rects='+boxes+fields+' text=『お客さん』')));
    };
    const flush = async () => {
      await page.evaluate(batch => { for (const m of batch) window.__tomoyoChinese[m.type](m); }, messages.splice(0));
      await frame();
    };
    await page.evaluate(() => {
      const b=window.__tomoyoChinese;
      b.setTranslationVisible=()=>{};
      b.localTokenize=async text=>text.includes('お客さん')?[{surface:'お客さん',reading:'オキャクサン',source:'SudachiDict Full'}]:[];
      const s=document.querySelector('.sentence-text');
      s.innerHTML=[...'『お客さん』'].map(c=>'<span class="char-token">'+c+'</span>').join('');
    });
    for (const module of ['game-style','furigana','ruby-layout','island-source','gal','text-position']) {
      await page.addScriptTag({path:path.join(__dirname,'..','web','reader','modules',module+'.js')});
    }
    const source = sequence => page.evaluate(seq => window.__tomoyoChinese.galStatus({hookSource:'『お客さん』',hookSequence:seq}),sequence);
    await page.evaluate(async () => {
      const b=window.__tomoyoChinese;
      b.galStatus({bound:true});
      b.galLayoutInfo=()=>({clientX:200,clientY:100,clientWidth:1527,clientHeight:858,workBottom:1040});
      await b.prepareRuby(document.querySelector('.sentence-text'));
    });
    await source(1);
    record(100001); record(100001,' color=eedefe'); await flush();
    const ruby = await readerRuby(); assert.equal(ruby.reading,'"きゃく"'); assert.ok(ruby.clickable);
    assert.equal(ruby.fill,'rgb(238, 222, 254)'); assert.equal(ruby.glyphFill,ruby.fill);
    const clip = await page.locator('.megulit-ruby-base').evaluate(n => {
      const b=n.getBoundingClientRect(),s=getComputedStyle(n,'::before');
      return {x:Math.floor(b.left+b.width/2-28),y:Math.floor(b.top+parseFloat(s.top)-parseFloat(s.fontSize)-2),width:56,height:Math.ceil(parseFloat(s.fontSize))+2};
    });
    const ink=await page.screenshot({clip});
    const hideRuby=await page.addStyleTag({content:'.megulit-ruby-base::before{visibility:hidden!important}'});
    assert.notDeepEqual(await page.screenshot({clip}),ink,'ruby changes painted pixels above the clickable glyph');
    await hideRuby.evaluate(n=>n.remove());
    record(100001,' emb=2'); await flush(); assert.equal((await readerRuby()).visibility,'hidden');
    record(100001,'',true); await flush(); assert.equal((await readerRuby()).visibility,'hidden');
    record(100002); await flush(); assert.ok((await readerRuby()).clickable);
    record(100002,' emb=2'); record(100002,' color=eedefe'); await flush();
    assert.equal((await readerRuby()).visibility,'hidden','a late colour report cannot duplicate native ruby');
    record(100002,'',true); record(100003); await flush();
    // A second tint and explicit read flags are controlled inputs; the recording contains only eedefe.
    await source(3);
    record(100003,' color=ffffff read=0',false,true); await flush();
    const unread=await readerRuby(); assert.ok(unread.clickable); assert.equal(unread.fill,'rgb(255, 255, 255)'); assert.equal(unread.glyphFill,unread.fill);
    record(100003,'',true); record(100004); await flush();
    await page.locator('.sentence-text').evaluate(n=>{n.innerHTML='<span class="char-token">次</span>';});
    await frame();
    assert.equal(await page.locator('.char-token').isVisible(),true,'a mismatched fallback cannot hide the next source');
    assert.deepEqual(errors,[]);
    console.log('ok text-place work area');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
/* the bridge reports the work-area bottom of the game's monitor with the layout (overlay px) */
{ const cs = fs.readFileSync(path.join(__dirname, '..', 'native', 'GalWindowBridge.cs'), 'utf8');
  assert.match(cs, /workBottom=WorkBottom\(area\)-box\.Top/); assert.match(cs, /Screen\.FromRectangle\(.*\.WorkingArea\.Bottom/); }
