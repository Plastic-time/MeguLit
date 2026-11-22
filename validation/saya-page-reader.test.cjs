// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const web = path.resolve(__dirname, '../web');
let chromium;
try { ({chromium} = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch {}

test('legacy Saya OCR keeps one translation inside the moved 800x600 game client', {skip:!chromium}, async () => {
 const browser = await chromium.launch({channel:'msedge', headless:true});
 try {
  const page = await browser.newPage({viewport:{width:1920,height:1080}});
  await page.route('http://reader.test/**', async route => {
   const pathname = new URL(route.request().url()).pathname;
   const file = path.join(web, pathname);
   if (fs.existsSync(file) && fs.statSync(file).isFile()) return route.fulfill({path:file});
   return route.fulfill({status:404, body:''});
  });
  await page.addInitScript(() => {
   window.requests = [];
   window.__TAURI_INTERNALS__ = {transformCallback:() => 1, invoke:async (cmd,args) => {
    const r = args?.request || {};
    if (r.action === 'home') return {preferences:{language:'zh'},games:[]};
    if (r.action === 'reader_bootstrap') return {engines:[],native:{}};
    if (r.action === 'reader_message') { window.requests.push(r.message); return {replies:[]}; }
    return {};
   }};
  });
  await page.goto('http://reader.test/reader/index.html');
  await page.waitForFunction(() => window.__tomoyoChinese?.hookReader);
  const source = 'もちろん、否定したいのは山々だが――僕はもう、とうに抵抗を諦めていた。';
  const translation = '我当然很想否认，可我早已放弃了抵抗。'.repeat(6);
  const measure = async (x,y) => {
   await page.evaluate(({x,y}) => {
    window.__tomoyoChinese.galLayout({clientX:x,clientY:y,clientWidth:800,clientHeight:600,
     readerX:x+120,readerY:y+43,readerWidth:739,readerHeight:360});
   }, {x,y});
   const reader = page.locator('.tomoyo-hook-reader');
   assert.equal(await reader.locator('.sentence-text').isVisible(), false);
   const output = reader.locator('.tomoyo-cn-output');
   await page.waitForFunction(t => document.querySelector('.tomoyo-hook-reader .tomoyo-cn-output')?.textContent === t, translation);
   const bounds = await output.evaluate(n => {
    const r = document.createRange(); r.selectNodeContents(n);
    return [...r.getClientRects()].filter(b => b.width > 0).map(b => [b.left,b.top,b.right,b.bottom]);
   });
   assert.ok(bounds.length > 1);
   for (const [l,t,r,b] of bounds) assert.ok(l>=x && r<=x+800 && t>=y && b<=y+600, JSON.stringify({x,y,l,t,r,b}));
  };
  await page.evaluate(source => {
   const b = window.__tomoyoChinese;
   b.galStatus({bound:true,coverEnabled:true,interfaceMode:'translation'});
   b.galStatus({hookSource:source,hookSequence:29,hookActive:true,hookSourceOrigin:'ocr',hookSourceEngine:'saya-page-ocr'});
  }, source);
  await page.waitForFunction(t => window.requests.some(m => m.text===t && m.id), source);
  await page.evaluate(({source,translation}) => {
   const req = window.requests.findLast(m => m.text===source && m.id);
   window.__tomoyoChinese.deliver(req.id,translation);
  }, {source,translation});
  await measure(261,328);
  await measure(490,109);
  await page.evaluate(source => window.__tomoyoChinese.galStatus({hookSource:source,hookSequence:30,hookSourceOrigin:'live',hookSourceEngine:''}), source);
  assert.equal(await page.locator('body.megulit-saya-page').count(),0);
 } finally { await browser.close(); }
});
