// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* The Seed catalog dialog in a real browser (headless Edge), with a stub service layer: what normal mode asks for, the veil card and its click,
   the global NSFW setting, search, the R18 filter, closing. Skipped without playwright-core, like dialog-hidden-button.test.cjs. */
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
import {initNsfw} from './nsfw.js';
window.setNsfw=(on)=>{window.__on=on;};
window.__on=false;
window.startNsfw=()=>initNsfw({locale:'zh',api:async a=>a==='nsfw_state'?{on:window.__on,flagged:[]}:null});
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
window.calls=[];
window.open_=(answer,engine={})=>openSeedCatalog({locale:'zh',esc,api:async(a,p={})=>{calls.push([a,p]);if(a==='seed_catalog')return answer;if(a==='seed_catalog_engines')return {engines:engine.engines||[]};if(a==='seed_catalog_engine')return engine.pages?.[p.engine+'|'+p.page];if(a==='seed_cover')return ${JSON.stringify(PIXEL)};return null;}});
window.ready=true;
</script></body></html>`;

async function pageFor(browser){
  const page=await browser.newPage();
  await page.route('http://megulit.test/**',r=>{const f=new URL(r.request().url()).pathname.slice(1);
   if(f==='probe.html')return r.fulfill({contentType:'text/html',body:PAGE});
   const file=path.join(WEB,f);if(!file.startsWith(WEB)||!fs.existsSync(file))return r.fulfill({status:404,body:''});
   r.fulfill({contentType:f.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(file)});});
  await page.goto('http://megulit.test/probe.html');await page.waitForFunction(()=>window.ready);
  return page;
}

test('catalog dialog: normal mode, the NSFW question, search, R18 filter, closing',{skip:!chromium&&'no playwright-core'},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await pageFor(browser);
  const state=()=>page.evaluate(()=>{const d=document.querySelector('dialog.seed-catalog');return d&&{open:d.open,mode:d.dataset.mode,sub:d.querySelector('[data-sub]').textContent,
   cards:d.querySelectorAll('.sc-card').length,imgs:d.querySelectorAll('.sc-cover img').length,hidden:d.querySelectorAll('.sc-cover[data-state=hidden]').length,veils:d.querySelectorAll('.sc-veil').length,
   covers:calls.filter(c=>c[0]==='seed_cover').map(c=>c[1].vndb+'|'+c[1].nsfw)};});
  const settle=()=>page.waitForTimeout(150);
  await page.evaluate(g=>{localStorage.clear();open_({games:g,offline:false,safeOnly:false});},games);await settle();
  let s=await state();
  assert.equal(s.open,true);assert.equal(s.sub,'3 部游戏 · 3 颗种子 · 2 个游戏社');assert.equal(s.cards,3);
  assert.equal(s.hidden,1);assert.equal(s.veils,1);assert.equal(s.imgs,2);assert.deepEqual(s.covers.sort(),['v1|false','v3|false'],'normal mode never asks for the NSFW cover');
  assert.match(await page.textContent('.sc-veil'),/成人内容/);
  await page.click('.sc-veil');await settle();s=await state();assert.equal(s.imgs,3,'a click shows that one cover');assert.equal(s.veils,0);assert.ok(s.covers.includes('v2|true'));assert.equal(s.mode,'normal','the setting stays off');
  await page.click('[data-close]');await settle();
  await page.evaluate(()=>{setNsfw(true);return startNsfw();});await settle();
  await page.evaluate(g=>{calls.length=0;open_({games:g,offline:false,safeOnly:false});},games);await settle();s=await state();
  assert.equal(s.mode,'nsfw','the global setting is on');assert.equal(s.veils,0);assert.equal(s.imgs,3);assert.ok(s.covers.includes('v2|true'));
  await page.fill('[data-search]','gamma');await settle();s=await state();assert.equal(s.cards,1);
  await page.click('[data-close]');await settle();s=await state();assert.equal(s,null,'Close removes the dialog');
  await page.evaluate(g=>{open_({games:g,offline:true,safeOnly:false});},games);await settle();
  assert.equal(await page.evaluate(()=>!document.querySelector('[data-offline]').hidden),true);
  await page.evaluate(g=>{calls.length=0;open_({games:g,offline:false,safeOnly:true});},games);await settle();s=await state();
  assert.equal(await page.evaluate(()=>document.querySelectorAll('dialog.seed-catalog').length),1,'opening again replaces the open one');
  assert.equal(s.mode,'normal');assert.equal(s.veils,1);assert.ok(!s.covers.some(c=>c.endsWith('|true')),'the R18 filter: no NSFW cover is asked for');
  await page.mouse.click(5,5);await settle();s=await state();assert.equal(s,null,'a click on the backdrop closes it');
 }finally{await browser.close();}
});

test('the catalog opens one engine page at a time and follows the existing cover modes',{skip:!chromium&&'no playwright-core'},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await pageFor(browser);
  const choice=[
   {id:'kirikiri',name:'KiriKiri',count:101},
   {id:'rugp',name:'rUGP',count:2},
  ];
  const engine=(vndb,title,cover)=>({vndb,title,cover,engine:'KiriKiri'});
  const sets={
   'kirikiri|1':{page:1,count:101,more:true,games:[engine('v101','First engine game','safe'),engine('v102','Mature engine game','nsfw')]},
   'kirikiri|2':{page:2,count:101,more:false,games:[engine('v103','Second page','safe')]},
   'rugp|1':{page:1,count:2,more:false,games:[engine('v104','Small engine','safe')]},
  };
  const open=(safeOnly=false)=>page.evaluate(({games,choice,sets,safeOnly})=>{
   calls.length=0;open_({games,offline:false,safeOnly},{engines:choice,pages:sets});
  },{games,choice,sets,safeOnly});
  const panel=page.locator('[data-engine="kirikiri"]');
  const requests=()=>page.evaluate(()=>calls.filter(c=>c[0]==='seed_catalog_engine').map(c=>c[1]));
  await open();
  await page.getByRole('heading',{name:'已实测',exact:true}).waitFor({timeout:4000});
  await page.getByRole('heading',{name:'引擎已适配（未逐部实测）',exact:true}).waitFor();
  await panel.getByText('101 部').waitFor();
  assert.deepEqual(await requests(),[]);
  await panel.locator('summary').click();
  await panel.getByText('First engine game').waitFor();
  await panel.locator('.sc-cover img').first().waitFor();
  assert.deepEqual(await requests(),[{engine:'kirikiri',page:1}]);
  assert.equal(await panel.locator('.sc-veil').count(),1);
  assert.equal(await panel.locator('.sc-st').count(),0);
  assert.ok(!(await page.evaluate(()=>calls.some(c=>c[0]==='seed_cover'&&c[1].vndb==='v102'))));
  await panel.getByRole('button',{name:'下一页'}).click();
  await panel.getByText('Second page').waitFor();
  assert.deepEqual(await requests(),[{engine:'kirikiri',page:1},{engine:'kirikiri',page:2}]);
  assert.ok(await panel.getByRole('button',{name:'下一页'}).isDisabled());
  await panel.getByRole('button',{name:'上一页'}).click();
  await panel.getByText('First engine game').waitFor();
  await page.locator('[data-engine="rugp"] summary').click();
  await page.getByText('Small engine').waitFor();
  assert.deepEqual((await requests()).at(-1),{engine:'rugp',page:1});
  await page.locator('[data-close]').click();
  await page.evaluate(()=>{setNsfw(true);return startNsfw();});
  await open();
  await panel.locator('summary').click();
  await panel.getByText('Mature engine game').waitFor();
  await page.waitForFunction(()=>calls.some(c=>c[0]==='seed_cover'&&c[1].vndb==='v102'&&c[1].nsfw));
  assert.equal(await panel.locator('.sc-veil').count(),0);
  await page.locator('[data-close]').click();
  await open(true);
  await panel.locator('summary').click();
  await panel.locator('.sc-veil').waitFor();
  assert.equal(await page.locator('dialog.seed-catalog').getAttribute('data-mode'),'normal');
  await panel.locator('.sc-veil').click();
  assert.ok(!(await page.evaluate(()=>calls.some(c=>c[0]==='seed_cover'&&c[1].nsfw))));
 }finally{await browser.close();}
});
