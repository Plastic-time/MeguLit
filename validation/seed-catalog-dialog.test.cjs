// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* The Seed catalog dialog in a real browser (headless Edge), with a stub service layer: what normal mode asks for, the NSFW
   question, search, the R18 filter, closing. Skipped without playwright-core, like dialog-hidden-button.test.cjs. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let chromium;
try{({chromium}=require(process.env.MEGULIT_PLAYWRIGHT||'H:/MeguLit-Work/pw/node_modules/playwright-core'));}catch{}
const WEB=path.join(__dirname,'..','web');
const games=[
 {slug:'a',engine:'kirikiri',status:'verified',vndb:'v1',title:'Alpha',alttitle:'アルファ',developers:[{id:'p1',name:'Studio A',original:'スタジオA'}],cover:'safe'},
 {slug:'b',engine:'siglus',status:'skeleton',vndb:'v2',title:'Beta',alttitle:'ベータ',developers:[{id:'p1',name:'Studio A',original:'スタジオA'}],cover:'nsfw'},
 {slug:'c',engine:'bgi',status:'read',vndb:'v3',title:'Gamma',alttitle:'',developers:[{id:'p2',name:'Studio B',original:''}],cover:'safe'}];
const PIXEL='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const PAGE=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">${['app.css','game-dialog.css','controls-b-tokens.css','seed-catalog.css'].map(f=>`<link rel="stylesheet" href="${f}">`).join('')}</head><body>
<script type="module">
import {openSeedCatalog} from './seed-catalog.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
window.calls=[];
window.open_=(answer)=>openSeedCatalog({locale:'zh',esc,api:async(a,p={})=>{calls.push([a,p]);if(a==='seed_catalog')return answer;if(a==='seed_cover')return ${JSON.stringify(PIXEL)};return null;}});
window.ready=true;
</script></body></html>`;

test('catalog dialog: normal mode, the NSFW question, search, R18 filter, closing',{skip:!chromium&&'no playwright-core'},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();
  await page.route('http://megulit.test/**',r=>{const f=new URL(r.request().url()).pathname.slice(1);
   if(f==='probe.html')return r.fulfill({contentType:'text/html',body:PAGE});
   const file=path.join(WEB,f);if(!file.startsWith(WEB)||!fs.existsSync(file))return r.fulfill({status:404,body:''});
   r.fulfill({contentType:f.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(file)});});
  await page.goto('http://megulit.test/probe.html');await page.waitForFunction(()=>window.ready);
  const state=()=>page.evaluate(()=>{const d=document.querySelector('dialog.seed-catalog');return d&&{open:d.open,mode:d.dataset.mode,sub:d.querySelector('[data-sub]').textContent,
   cards:d.querySelectorAll('.sc-card').length,imgs:d.querySelectorAll('.sc-cover img').length,hidden:d.querySelectorAll('.sc-cover[data-state=hidden]').length,ask:!d.querySelector('[data-ask]').hidden,
   nsfwDisabled:d.querySelector('[data-mode=nsfw]').disabled,covers:calls.filter(c=>c[0]==='seed_cover').map(c=>c[1].vndb+'|'+c[1].nsfw)};});
  const settle=()=>page.waitForTimeout(150);
  await page.evaluate(g=>{localStorage.clear();open_({games:g,offline:false,safeOnly:false});},games);await settle();
  let s=await state();
  assert.equal(s.open,true);assert.equal(s.sub,'3 部游戏 · 3 颗种子 · 2 个游戏社');assert.equal(s.cards,3);
  assert.equal(s.hidden,1);assert.equal(s.imgs,2);assert.deepEqual(s.covers.sort(),['v1|false','v3|false'],'normal mode never asks for the NSFW cover');
  await page.click('[data-mode=nsfw]');s=await state();assert.equal(s.ask,true);assert.equal(s.mode,'normal');
  await page.click('[data-no]');s=await state();assert.equal(s.ask,false);assert.equal(s.mode,'normal');
  await page.click('[data-mode=nsfw]');await page.click('[data-yes]');await settle();s=await state();
  assert.equal(s.mode,'nsfw');assert.equal(s.hidden,0);assert.equal(s.imgs,3);assert.ok(s.covers.includes('v2|true'));
  await page.fill('[data-search]','gamma');await settle();s=await state();assert.equal(s.cards,1);
  await page.click('[data-close]');await settle();s=await state();assert.equal(s,null,'Close removes the dialog');
  await page.evaluate(g=>{open_({games:g,offline:true,safeOnly:false});},games);await settle();s=await state();
  assert.equal(s.mode,'nsfw','the confirmed mode is remembered');
  assert.equal(await page.evaluate(()=>!document.querySelector('[data-offline]').hidden),true);
  await page.evaluate(g=>{calls.length=0;open_({games:g,offline:false,safeOnly:true});},games);await settle();s=await state();
  assert.equal(await page.evaluate(()=>document.querySelectorAll('dialog.seed-catalog').length),1,'opening again replaces the open one');
  assert.equal(s.mode,'normal');assert.equal(s.nsfwDisabled,true);assert.ok(!s.covers.some(c=>c.endsWith('|true')),'the R18 filter: no NSFW cover is asked for');
  await page.mouse.click(5,5);await settle();s=await state();assert.equal(s,null,'a click on the backdrop closes it');
 }finally{await browser.close();}
});
