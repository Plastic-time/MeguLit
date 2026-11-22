// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Explicit, short browser QA. No app, game, server, native host or screenshot capture.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), os = require('node:os');
if (process.env.MEGULIT_ANCHOR_DOM !== '1') throw new Error('Set MEGULIT_ANCHOR_DOM=1 only when browser QA is scheduled');
const { chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core');
const root = process.env.MEGULIT_ANCHOR_TARGET || path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, 'web/reader', name), 'utf8');
const gal = read('modules/gal.js'), start = gal.indexOf('  const style = document.createElement(');
const cssStart = gal.indexOf('style.textContent = `', start) + 'style.textContent = `'.length;
const galCss = gal.slice(cssStart, gal.indexOf('`;', cssStart));
assert.ok(galCss.includes('body.tomoyo-gal-bound .sentence-window'));
assert.ok(!galCss.includes('${'), 'actual gal CSS must not require template substitutions');
const JP = ['今日はいい天気ですね', '明日も一緒に歩きましょう'];
(async () => {
  const server = await chromium.launchServer({ channel: 'msedge', headless: true });
  const child = server.process();
  let browser, deadline;
  const processReceipt = { pid: child.pid };
  const results = [];
  try {
    os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
    processReceipt.priority = os.getPriority(child.pid);
    deadline = setTimeout(() => { server.kill().catch(() => {}); }, 30000);
    browser = await chromium.connect(server.wsEndpoint());
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('http://megulit.test/**', r => r.fulfill({ contentType: 'text/html', body: '' }));
    await page.goto('http://megulit.test/');
    for (const fonts of [[26,18],[34,30]]) for (const anchored of [false, true]) {
      await page.goto('http://megulit.test/');
      await page.setContent('<!doctype html><meta charset="utf-8"><style>' + read('reader.css') + galCss + '</style><body class="tomoyo-gal-bound tomoyo-game-style"><div class="sentence-window tomoyo-hook-reader"><div class="sentence-text"></div></div></body>');
      await page.evaluate(fonts => {
        document.documentElement.style.setProperty('--tomoyo-gal-jp-size',fonts[0]+'px');
        document.documentElement.style.setProperty('--tomoyo-gal-cn-size',fonts[1]+'px');
        for (const [k, v] of Object.entries({ x: '100px', y: '545px', width: '850px' })) document.documentElement.style.setProperty('--tomoyo-reader-' + k, v);
        window.__tomoyoTranslateRequest = () => {};
      }, fonts);
      await page.addScriptTag({ content: read('modules/inject.js') });
      await page.evaluate(() => {
        const b = window.__tomoyoChinese;
        b.galLayoutInfo = () => ({ clientX: 0, clientY: 0, clientWidth: 1280, clientHeight: 720, workBottom: 720 });
        b.galPreferences = () => ({ anchorDX: 0, anchorDY: 0 });
      });
      await page.addScriptTag({ content: read('modules/text-place.js') });
      await page.addScriptTag({ content: read('modules/game-fit.js') });
      const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      for (const calibrated of [false, true]) for (const jp of JP) {
        await page.evaluate(({ jp, anchored, calibrated }) => {
          const b = window.__tomoyoChinese, s = document.querySelector('.sentence-text');
          s.replaceChildren(...[...jp].map(c => { const t = document.createElement('span'); t.className = 'char-token'; t.textContent = c; return t; }));
          document.documentElement.style.setProperty('--tomoyo-reader-y', calibrated ? '565px' : '545px');
          b.galPreferences = () => ({ anchorDX: 0, anchorDY: calibrated ? 2 : 0 });
          b.gameFit && b.galStatus({ hookSource: jp });
          if (anchored) { b.textPlaceMode({ on: true }); b.textPlaceAnchor(true); b.textPlace({ text: jp, client: [1280, 720], rects: [...jp].map((c, i) => [130 + i * 30, 545, 30, 30]) }); }
          b.refresh();
        }, { jp, anchored, calibrated });
        await page.waitForFunction(jp=>window.__tomoyoChinese.current===jp && document.querySelector('.tomoyo-cn-output')?.dataset.state==='pending',jp,{timeout:1200}); await frame();
        const coords = () => page.evaluate(() => [...document.querySelectorAll('.sentence-text .char-token')].map(n => { const r = n.getBoundingClientRect(); return [r.top, r.bottom]; }));
        const before = await coords();
        const deliveries=[];
        const geometry=()=>page.evaluate(() => { const s=document.querySelector('.sentence-text'),c=document.querySelector('.tomoyo-cn-output'),row=c.parentElement,r=c.getBoundingClientRect(),q=row.getBoundingClientRect();return {sourceMatches:window.__tomoyoChinese.current===s.textContent,state:c.dataset.state,jpFont:getComputedStyle(s).fontSize,cnFont:getComputedStyle(c).fontSize,cnTop:r.top,cnBottom:r.bottom,rowTop:q.top,rowBottom:q.bottom,scrollHeight:c.scrollHeight,clientHeight:c.clientHeight,rowScrollHeight:row.scrollHeight,rowClientHeight:row.clientHeight,rowScroll:getComputedStyle(row).overflowY,viewportOverflow:Math.max(0,q.bottom-innerHeight),fit:window.__tomoyoChinese.gameFit.state()}; });
        const pending=await geometry();
        for (const cn of ['这是一段迟到的译文，'.repeat(35), '这是一段持续变长的译文，'.repeat(50)]) {
          await page.evaluate(cn => window.__tomoyoChinese.deliver(window.__tomoyoChinese.serial, cn, ''), cn);
          await frame();
          const after = await coords();
          assert.equal(after.length, before.length);
          const measured=await geometry();
          assert.equal(measured.jpFont,fonts[0]+'px');
          assert.equal(measured.state,'ready');
          assert.ok(measured.sourceMatches);
          assert.ok(measured.viewportOverflow < 1,JSON.stringify({anchored,calibrated,fonts,geometry:measured}));
          deliveries.push({...measured,maxJpDisplacement:Math.max(...after.flatMap((r,i)=>r.map((v,j)=>Math.abs(v-before[i][j]))))});
          after.forEach((r, i) => r.forEach((v, j) => assert.ok(Math.abs(v - before[i][j]) < .6, JSON.stringify({ anchored, calibrated, token: i, before: before[i], after: r }))));
        }
        results.push({ anchored, calibrated, fonts, jpChars: [...jp].length, first: before[0], stable: true, pending, deliveries });
      }
    }
    assert.deepEqual(errors, []);
    processReceipt.pageErrors = errors;
  } finally {
    clearTimeout(deadline);
    await browser?.close();
    await server.close();
    processReceipt.exitCode = child.exitCode;
    processReceipt.signalCode = child.signalCode;
    assert.ok(child.exitCode !== null || child.signalCode !== null, 'owned browser exited');
    console.log(JSON.stringify({ source: root, viewport: [1280, 720], cases: results, browser: processReceipt }));
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
