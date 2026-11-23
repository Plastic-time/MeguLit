// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'web/seed-receipt.js'),'utf8');
const modulePromise=import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const key='a'.repeat(64),hash='b'.repeat(64),esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dto=()=>({state:'received',key,receipt:{version:1,status:'installed',verified:true,key,hash,serverTime:'2026-11-21T09:15:30Z',credit:{torchNo:0,name:'魚魚棟'},revision:2,cardinalRev:'8'}});
test('installed receipt requires exact local identity, verified install and finite positive revision',async()=>{const {installedReceipt}=await modulePromise;assert.equal(installedReceipt(dto()).hash,hash);
 for(const patch of [{verified:'true'},{verified:false},{status:'available'},{key:'c'.repeat(64)},{hash:'bad'},{revision:0},{revision:1.1},{revision:Infinity},{version:2}])assert.equal(installedReceipt({...dto(),receipt:{...dto().receipt,...patch}}),null,JSON.stringify(patch));
 assert.equal(installedReceipt({state:'received',key,credit:{torchNo:1,name:'Wrong winner'}}),null);
});
test('date contract rejects empty, invalid, normalized nonexistent dates and numeric epochs without inventing now',async()=>{const {receiptTime}=await modulePromise;
 for(const at of [null,undefined,'','0',0,Date.now(),'not a date','2026-02-29T10:00:00Z','2026-11-21T25:00:00Z','2026-11-21T10:00:00+09:00'])assert.equal(receiptTime(at),null,String(at));
 for(const at of ['2024-02-29T10:00:00Z','2026-11-21T09:15:30.12Z'])assert.ok(receiptTime(at));
});
test('zero is an actual public identity, absent credit is unknown and unsafe names are not emitted',async()=>{const {installedReceipt,receiptView}=await modulePromise;
 assert.equal(installedReceipt(dto()).credit.torchNo,0);assert.match(receiptView(dto(),{locale:'zh',esc}).html,/魚魚棟/);
 const absent={...dto(),receipt:{...dto().receipt,credit:null,serverTime:null}};const html=receiptView(absent,{locale:'zh',esc}).html;assert.match(html,/来源未提供/);assert.match(html,/时间未提供/);assert.doesNotMatch(html,/魚魚棟|传火人零|1970|Invalid Date/);
 assert.equal(installedReceipt({...dto(),receipt:{...dto().receipt,credit:{torchNo:'0',name:'foo'}}}).credit,null);
 assert.equal(installedReceipt({...dto(),receipt:{...dto().receipt,credit:{torchNo:2,name:'a\u202eb'}}}).credit.name,null);
});
test('all three locales escape public credit and unconfirmed or installing states do not claim installed or show legacy credit',async()=>{const {receiptView}=await modulePromise;
 for(const locale of ['zh','ja','en']){const v=dto();v.receipt.credit.name='<img src=x onerror=alert(1)>';const out=receiptView(v,{locale,esc});assert.ok(!out.html.includes('<img'));assert.ok(out.html.includes('&lt;img'));
 for(const state of ['installing','install-failed','received']){const h=receiptView({state,key,credit:{name:'Legacy Person',torchNo:1}},{locale,esc}).html;assert.ok(!h.includes('Legacy Person'));assert.ok(!h.includes('first-player-receipt-source'));assert.ok(!h.includes('<time'));}}
});
test('anonymous founder attribution renders the same official Japanese alias in every locale',async()=>{
 const {receiptView}=await modulePromise,v=dto();
 v.receipt.credit={torchNo:0,name:null,alias:'ユージオ'};
 for(const locale of ['zh','ja','en']){
  const {html}=receiptView(v,{locale,esc});
  assert.match(html,/ユージオ/);
  assert.doesNotMatch(html,/#0|传火人零|Torch bearer/);
 }
});
test('receipt signature changes with winner/hash/revision but stays equal for nonsemantic fetch metadata',async()=>{const {receiptView}=await modulePromise;const base=dto(),a=receiptView(base,{esc}).signature;
 assert.equal(receiptView({...base,fetchedAt:Date.now()},{esc}).signature,a);
 for(const patch of [{hash:'c'.repeat(64)},{revision:3},{credit:{torchNo:3,name:null}},{serverTime:'2026-11-22T00:00:00Z'}])assert.notEqual(receiptView({...base,receipt:{...base.receipt,...patch}},{esc}).signature,a);
});
test('answered miss, unavailability, signature failure and revocation show distinct status without a receipt',async()=>{
 const {receiptView}=await modulePromise;
 for(const locale of ['zh','ja','en']){
  const missing=receiptView({state:'not-published',key},{locale,esc});
  const unavailable=receiptView({state:'install-failed',key,code:'TORCH_RELAY_UNAVAILABLE'},{locale,esc});
  const rejected=receiptView({state:'install-failed',key,code:'TORCH_SIGNATURE'},{locale,esc});
  const revoked=receiptView({state:'install-failed',key,code:'TORCH_REVOKED'},{locale,esc});
  const states=[missing,unavailable,rejected,revoked].map(view=>view.html);
  assert.equal(new Set(states).size,states.length);
  for(const html of states)assert.doesNotMatch(html,/first-player-receipt-source|<time/);
 }
});
test('bundled Seed, first public contribution and isolated submission are distinct from receipt provenance',async()=>{
 const {receiptView}=await modulePromise,bundled={source:'official',revision:1};
 const view=value=>receiptView({key,bundled,...value},{locale:'zh',esc}).html;
 const pending=view({state:'bundled'});
 assert.match(pending,/内置 The Seed 适配 · rev 1/);
 assert.match(pending,/尚未确认/);
 assert.doesNotMatch(pending,/首个公开传火贡献|内容校验值/);
 const isolated=view({state:'not-published',eligible:true,submission:'isolated'});
 assert.match(isolated,/暂无可接收的已发布适配/);
 assert.match(isolated,/首个公开传火贡献/);
 assert.match(isolated,/隔离测试模式已禁用提交/);
 assert.doesNotMatch(isolated,/button|内容校验值/);
 for(const [origin,label] of [['torch-release','已验签的 Seed'],['ordinary-seed','已验签的 Seed'],['legacy-feed','已验证的旧版共享适配']]){
  const receipt={...dto().receipt,origin};
  const html=view({state:'received',receipt});
  assert.ok(html.includes(label));
  assert.match(html,/内置 The Seed 适配/);
  assert.doesNotMatch(html,/首个公开传火贡献/);
 }
});

test('Chinese summary has a label for every profile domain and every string enum value',async()=>{
 const {DOMAINS}=require('../core/profiles/domains.cjs');
 const summary=fs.readFileSync(path.join(root,'web/profile-summary.js'),'utf8');
 const {chineseProfileSetting:format}=await import('data:text/javascript;base64,'+Buffer.from(summary).toString('base64'));
 for(const [key,domain] of Object.entries(DOMAINS)){
  assert.match(format(key),/\p{Script=Han}/u,key);
  for(const value of domain.enum||[]){
   if(typeof value==='string')assert.match(format(key,value).split('：').at(-1),/\p{Script=Han}/u,key+' = '+value);
  }
 }
 assert.equal(format('lang.zh-Hans.pairing','patch'),'简体中文译文配对方式：补丁文本配对');
 assert.equal(format('lang.ja.dictionary','jmdict'),'日语词典：jmdict');
 assert.equal(format('lang.ja.fontFallback',['Noto Sans JP']),'日语备用字体：1 项（「Noto Sans JP」）');
 assert.equal(format('calibrate.textBox.client',[800,600]),'游戏窗口客户区尺寸（像素）：800 × 600');
 assert.equal(format('draw.engineTable.stride',0),'引擎绘制参数（stride）：0');
 assert.equal(format('library.partLabels..','序章'),'游戏根目录分部名称：序章');
});

test('detail card localizes both Chinese settings lists while preserving English and Japanese output',async t=>{
 let chromium;try{({chromium}=require(process.env.MEGULIT_PLAYWRIGHT||'H:/MeguLit-Work/pw/node_modules/playwright-core'));}catch{return t.skip('no playwright-core');}
 const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage();
 await page.route('http://megulit.test/**',route=>{
  const name=new URL(route.request().url()).pathname.slice(1);
  return ['first-player.js','seed-receipt.js','profile-summary.js'].includes(name)?route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,'web',name),'utf8')}):route.fulfill({contentType:'text/html',body:'<main class="main"><div class="detail-tabs"></div><div class="detail-main"><div id="host"></div></div></main>'});
 });
 const applied={'draw.embed':true,'draw.embedTranslation':false,'placement.lineOffsetY':0,'lang.ja.annotation':'ruby','choice.filters':['^<br>$','^0$'],'choice.pageFrames':[]};
 const retained={'page.presentation':'adv','calibrate.hideMethod':'read','page.flowPage':null};
 const payload={state:'applied',application:{layers:[{layer:'seed-skeleton',revision:4,keys:Object.keys(applied)}],personal:Object.keys(retained),values:{...applied,...retained}}};
 for(const locale of ['zh','en','ja']){
  await page.goto('http://megulit.test/');
  await page.evaluate(async({locale,payload,escSource})=>{const {mountFirstPlayer}=await import('/first-player.js');
   const escapeHTML=new Function('return '+escSource)();
   mountFirstPlayer({host:document.querySelector('#host'),id:'7',locale,esc:escapeHTML,api:async action=>{
    if(action!=='first_player')throw Error('Unexpected settings write');
    return payload;
   }});
  },{locale,payload,escSource:esc.toString()});
  const card=page.locator('.detail-main .first-player');await card.waitFor({state:'visible'});
  const rows=await card.locator('p').allInnerTexts();
  if(locale==='zh'){
   assert.deepEqual(rows,[
    '本次应用 · 内置 Seed 基础适配 · 修订版 4 · 游戏内嵌原文与注音：开启；游戏内嵌译文：关闭；原文行垂直偏移（像素）：0；日语注音方式：假名注音；选项过滤规则：2 项（「^<br>$」、「^0$」）；选项页面边框图匹配规则：0 项',
    '保留的本机设置 · 正文排版：对话框式（ADV）；校准隐藏方式：保留原文的阅读模式；流式页面排版：默认',
   ]);
   assert.equal(await card.locator('br').count(),0);
   if(process.env.MEGULIT_PROFILE_SUMMARY_SCREENSHOT)await card.screenshot({path:process.env.MEGULIT_PROFILE_SUMMARY_SCREENSHOT});
  }else{
   const [current,local]=locale==='en'?['Applied this session','Retained local settings']:['今回適用','保持したローカル設定'];
   assert.deepEqual(rows,[
    current+' · seed-skeleton rev 4 · draw.embed = true, draw.embedTranslation = false, placement.lineOffsetY = 0, lang.ja.annotation = ruby, choice.filters, choice.pageFrames',
    local+' · page.presentation = adv, calibrate.hideMethod = read, page.flowPage',
   ]);
  }
 }
});
