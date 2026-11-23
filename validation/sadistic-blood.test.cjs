// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {encodeSjis} = require('../services/original-engines/kit.cjs');
const {indexPages, load, nativeInk} = require('../core/sadistic-blood-layout.cjs');
const {OverlayPlacement} = require('../core/overlay-placement.cjs');

function script(commands) {
  const table = 8 + commands.length * 4;
  const words = [8, 0x66660001, 0x55550001, 0, commands.length, table, 0, 0];
  const strings = [];
  let next = table + commands.length;
  for (const [i, [op, text]] of commands.entries()) {
    words.push(4, 0x66660002, op, i);
    const bytes = Buffer.from(encodeSjis(text));
    const padded = Buffer.alloc(Math.ceil((bytes.length + 1) / 4) * 4);
    bytes.copy(padded);
    strings.push({ptr:next, bytes:padded});
    next += padded.length / 4;
  }
  words.push(...strings.map(s => s.ptr));
  const head = Buffer.alloc(words.length * 4);
  words.forEach((v, i) => head.writeUInt32LE(v, 4 * i));
  return Buffer.concat([head, ...strings.map(s => s.bytes)]);
}

test('literal page rows scale with the client, ambiguity and different builds yield no coordinates', () => {
  const first = 0x22220002, append = 0x22220003;
  const layout = indexPages(script([[first,'風'],[append,'空\r\n海'],[append,'風'],[first,'花']]));
  assert.equal(layout.grid('風',[1280,720]),null);
  assert.deepEqual(layout.grid('空海',[640,360]),[[112,122,13,13],[112,149,13,13]]);
  assert.equal(layout.grid('海',[800,600]),null);
  assert.equal(layout.row('花'),0);
  assert.equal(layout.isRedraw('風空海'),true);
  assert.equal(layout.isRedraw('選択'),false);
  assert.ok(layout.scanArea('海').scanY < 42);
  assert.equal(load('unknown.exe','another-build'),null);
});

function fixture() {
  const client = [640,360];
  const frame = {width:640,height:360,data:Buffer.alloc(640*360*4,32)};
  const boxes = [[112,95,13,13],[125,95,13,13]];
  for (let y=99; y<105; y++) frame.data.fill(255,4*(640*y+115),4*(640*y+119));
  return {frame, client, boxes};
}

test('two stable game-only samples repair missing cells, unbinding cancels pending work', async () => {
  const {frame,client,boxes} = fixture();
  const events = [], host = new OverlayPlacement({send:m=>events.push(m)});
  host.on = true;
  host.client = client;
  const wait = () => new Promise(resolve=>setTimeout(resolve,720));
  host.scriptRow('空海',{grid:()=>boxes},1,()=>frame);
  assert.deepEqual(events.at(-1).nativeCells,[true,true]);
  await wait();
  assert.deepEqual(events.at(-1).nativeCells,[true,false]);
  host.scriptRow('空海',{grid:()=>boxes},2,()=>frame);
  host.stop();
  const ended = events.length;
  await wait();
  assert.equal(events.length,ended);
  frame.data.fill(0);
  assert.equal(nativeInk(frame,client,boxes),null);
  frame.data.fill(255);
  assert.equal(nativeInk(frame,client,boxes),null);
});

test('append retains only repaired characters on this page and a new LPRINT clears them', async () => {
  const {frame, client, boxes} = fixture();
  const host = new OverlayPlacement();
  host.on = true;
  host.client = client;
  const grid = {grid:()=>boxes, row:t=>t==='海空'?1:0, page:t=>t==='朝日'?2:1};
  host.scriptRow('空海',grid,1,()=>frame);
  await new Promise(resolve=>setTimeout(resolve,720));
  host.scriptRow('海空',grid,2);
  assert.deepEqual(host.current.previousCells,[['海',boxes[1]]]);
  host.scriptRow('朝日',grid,3);
  assert.deepEqual(host.current.previousCells,[]);
  host.stop();
});

let chromium;
try { ({chromium}=require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch {}
test('reader places transparent lookup tokens on native ink and paints missing cells', {skip:!chromium}, async () => {
  const browser = await chromium.launch({channel:'msedge',headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1280,height:720}});
    await page.setContent('<main><div class="sentence-window tomoyo-hook-reader"><div class="sentence-text"><span class="char-token">空</span><span class="char-token">海</span></div><div class="tomoyo-cn-row">译文</div></div></main>');
    await page.evaluate(()=>{window.__tomoyoChinese={};});
    await page.addScriptTag({path:path.resolve(__dirname,'../web/reader/modules/text-place.js')});
    await page.evaluate(()=>{
      const b=window.__tomoyoChinese;
      b.textPlaceMode({on:true});
      b.textPlace({text:'空海',client:[1280,720],rects:[[224,244,26,26],[250,244,26,26]],nativeCells:[true,false],previousCells:[['風',[224,190,26,26]]]});
    });
    await page.waitForSelector('body.megulit-native-cells',{state:'attached'});
    const cells=await page.locator('.sentence-text:not(.megulit-old-line) .char-token').evaluateAll(tokens=>tokens.map(t=>{
      const r=t.getBoundingClientRect();
      return [r.x,r.y,getComputedStyle(t).opacity];
    }));
    assert.deepEqual(cells,[[224,244,'0'],[250,244,'1']]);
    assert.equal(await page.locator('.megulit-script-history').textContent(),'風');
    await page.evaluate(()=>window.__tomoyoChinese.textPlaceMode({on:false}));
    await page.waitForSelector('body:not(.megulit-native-cells)',{state:'attached'});
    assert.equal(await page.locator('.megulit-script-history').count(),0);
    assert.equal(await page.locator('.char-token').first().evaluate(t=>getComputedStyle(t).opacity),'1');
  } finally {await browser.close();}
});
