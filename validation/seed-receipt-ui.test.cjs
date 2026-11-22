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
 for(const [origin,label] of [['torch-release','已验证的公开传火发布'],['legacy-feed','已验证的旧版共享适配']]){
  const receipt={...dto().receipt,origin};
  const html=view({state:'received',receipt});
  assert.ok(html.includes(label));
  assert.match(html,/内置 The Seed 适配/);
  assert.doesNotMatch(html,/首个公开传火贡献/);
 }
});
