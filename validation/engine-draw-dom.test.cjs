// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* engine-draw, DOM engines (TyranoScript class names; core/text-paths-web.cjs PAGE_SCRIPT): in a real browser (headless Edge
   through playwright-core; skipped when it is not installed) on a stand-in Tyrano page, no game. The line waits for its
   replacement, gets <ruby> around the game's own character spans and a Chinese block in the game's own message element, and
   is reported with emb=2 and its Japanese only; the name plate and the choice buttons are reported as UI items and keep
   their text and their clicks. */
const assert=require('node:assert'),path=require('node:path');
let chromium;
try{({chromium}=require(process.env.MEGULIT_PLAYWRIGHT||'H:/MeguLit-Work/pw/node_modules/playwright-core'));}catch{console.log('SKIP engine-draw dom (no playwright-core)');process.exit(0);}
const {PAGE_SCRIPT}=require(path.join(__dirname,'..','core','text-paths-web.cjs'));
const TP=require(path.join(__dirname,'..','core','text-paths.cjs')),W=require(path.join(__dirname,'..','core','text-paths-web.cjs'));
const chars=[...'今日は晴れ'].map(c=>`<span class="char" style="color:rgb(250,250,250)">${c}</span>`).join('');
const html=`<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#000}.tyrano_base{position:relative;width:1280px;height:720px}
.message_outer{position:absolute;left:100px;top:520px;width:1000px;height:170px;overflow:hidden}
.message_inner{font:32px/1.4 "MS Gothic",monospace;color:#fff}
.chara_name_area{position:absolute;left:100px;top:470px;font:26px sans-serif;color:#fff}
.glink_button{position:absolute;left:400px;width:480px;height:50px;font:28px sans-serif;color:#fff;background:#333}</style></head><body>
<div class="tyrano_base"><div class="chara_name_area">ハルカ</div>
<div class="glink_button" style="top:200px" onclick="window.__clicked='a'">はい</div><div class="glink_button" style="top:280px">いいえ</div>
<div class="message_outer"><div class="message_inner">${chars}</div></div></div>
<script>window.__reports=[];window.__megulitReport=function(s){window.__reports.push(JSON.parse(s));};</script></body></html>`;
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  await page.setContent(html);await page.addScriptTag({content:PAGE_SCRIPT});
  const reports=()=>page.evaluate(()=>window.__reports);
  const wait=ms=>page.waitForTimeout(ms);
  await page.evaluate(()=>window.__megulitText.config({roles:true,embed:true,zh:true}));
  await wait(700);
  let r=await reports();
  assert.deepEqual(r.filter(o=>o.ask).map(o=>[o.ask,o.engine]),[['今日は晴れ','web']],'asked once for the still line');
  const lines=r.filter(o=>Array.isArray(o.rects)&&!o.ui);assert.ok(lines.length>=1);assert.equal(lines.at(-1).hidden,false);assert.equal(lines.at(-1).emb,0);
  const ui=r.filter(o=>o.ui);
  assert.deepEqual(ui.map(o=>[o.role,o.id,o.text]),[['name','Dname:0','ハルカ'],['choice','Dchoice:0','はい'],['choice','Dchoice:1','いいえ']]);
  assert.deepEqual(ui[1].box.map(Math.round),[400,200,480,50]);
  await page.evaluate(()=>window.__megulitText.embed('今日は晴れ',{ruby:[[0,2,'きょう']],zh:'今天晴朗'}));
  await wait(400);
  const dom=await page.evaluate(()=>{const el=document.querySelector('.message_inner'),ru=el.querySelector('ruby.megulit-ruby');
   return {ruby:ru?[...ru.querySelectorAll('span.char')].map(s=>s.textContent).join(''):'',rt:ru?.querySelector('rt')?.textContent,zh:el.querySelector('.megulit-zh')?.textContent,spans:el.querySelectorAll('span.char').length,
    zhSize:getComputedStyle(el.querySelector('.megulit-zh')).fontSize};});
  assert.deepEqual(dom,{ruby:'今日',rt:'きょう',zh:'今天晴朗',spans:5,zhSize:'25.6px'},'ruby around the game\'s own spans, Chinese at 80 % in the game\'s element');
  r=await reports();const last=r.filter(o=>Array.isArray(o.rects)&&!o.ui).at(-1);
  assert.deepEqual([last.emb,last.text,last.rects.length],[2,'今日は晴れ',5],'the line is the Japanese only, emb=2');
  const rec=TP.parseChars(W.WebTextPath.prototype&&(()=>{let l='';const p=new W.WebTextPath({port:1,onChars:x=>{l=x;}});p.report(JSON.stringify(last));return l;})());
  assert.equal(rec.emb,2);
  await page.click('.glink_button >> nth=0');assert.equal(await page.evaluate(()=>window.__clicked),'a','the choice still takes the click');
  /* a box with no room: the Chinese is left out (emb=1) */
  await page.evaluate(()=>{const el=document.querySelector('.message_inner');el.innerHTML=[...'一行目の長い文\n二行目\n三行目\n四行目'].map(c=>c==='\n'?'<br>':'<span class="char">'+c+'</span>').join('');});
  await wait(500);await page.evaluate(()=>window.__megulitText.embed('一行目の長い文二行目三行目四行目',{ruby:[],zh:'很长的译文很长的译文很长的译文很长的译文很长的译文很长的译文很长的译文很长的译文很长的译文很长的译文很长的译文很长的译文'}));await wait(400);
  r=await reports();assert.equal(r.filter(o=>Array.isArray(o.rects)&&!o.ui).at(-1).emb,1);assert.equal(await page.evaluate(()=>!!document.querySelector('.megulit-zh')),false);
  console.log('ok engine-draw dom (Tyrano stand-in)');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
