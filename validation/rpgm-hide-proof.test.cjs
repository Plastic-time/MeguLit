// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {RPGM_SCRIPT}=require('../core/text-paths-rpgm.cjs'),{WebTextPath}=require('../core/text-paths-web.cjs');
const standin=fs.readFileSync(path.join(__dirname,'engine-draw-rpgm.test.cjs'),'utf8').match(/const STANDIN=String.raw`([\s\S]*?)`;/)[1];
function rig(engine='MV',buffered=false,plugin=false){
 const c=vm.createContext({});vm.runInContext(standin,c);c.window=c;c.__megulitReport=s=>c.reports.push(JSON.parse(s));
 vm.runInContext(`
 var ink=[],nonText=[],restoringFails=false;
 function context(){return {fillText:function(t,x,y){if(restoringFails)throw Error('fixture paint failure');ink.push(['fill',String(t),x,y,this.font,this.fillStyle]);},strokeText:function(t,x,y){ink.push(['stroke',String(t),x,y,this.font,this.strokeStyle]);}};}
 Bitmap.prototype.drawText=function(t,x,y,mw,lh,al){var cx=this._context||(this._context=context());cx.font=this.fontSize+' '+(this.fontFace||'fixture');cx.fillStyle=this.textColor;cx.strokeStyle=this.outlineColor;cx.strokeText(t,x,y);cx.fillText(t,x,y);return 73;};
 Bitmap.prototype.clear=function(){ink.length=0;};
 Bitmap.prototype.clearRect=function(){nonText.push('clearRect');};
 Bitmap.prototype.blt=function(){nonText.push('face/icon');};
 var originalNewPage=Window_Message.prototype.newPage;
 Window_Message.prototype.newPage=function(ts){this.contents.clear();return originalNewPage.call(this,ts);};
 msg.contents._context=context();
 `,c);
 if(plugin)vm.runInContext("Bitmap.prototype.drawText=function(t){ink.push(['plugin-visible',String(t)]);return 73;};",c);
 c.Utils.RPGMAKER_NAME=engine;
 if(buffered)vm.runInContext(`Window_Message.prototype.updateMessage=function(){if(!this._textState)return false;this.contents.drawText(this._textState.text,0,0,600,36);this.startPause();this._textState=null;return true;};`,c);
 vm.runInContext(RPGM_SCRIPT,c);c.SceneManager._scene={children:[c.layer]};c.__megulitRpgm.config({roles:true,embed:false});
 return {c,api:c.__megulitRpgm,run:s=>vm.runInContext(s,c),say:t=>{c.$gameMessage._t=t;c.msg.startMessage();return c.msg.updateMessage();},body:()=>c.reports.filter(r=>r.rects?.length&&!r.role).at(-1)};
}
const plain=x=>JSON.parse(JSON.stringify(x));
for(const engine of ['MV','MZ'])test(engine+': actual glyph suppression, source proof, original complete-page restoration without face/menu changes',()=>{
 const baseline=rig(engine,engine==='MZ');baseline.say('今日晴れ');const expected=plain(baseline.c.ink);
 const r=rig(engine,engine==='MZ');r.api.hide(true);r.say('今日晴れ');
 assert.deepEqual(plain(r.c.ink),[]);assert.equal(r.body().hidden,true);assert.equal(r.body().text,'今日晴れ');assert.equal(r.body().rects.length,4);
 r.c.msg.contents.blt();const other=new r.c.Bitmap(10,10);assert.equal(other.drawText('menu',0,0,10,10),73);
 assert.equal(r.c.ink.length,2,'another bitmap is never hidden');r.c.ink.length=0;
 assert.deepEqual(plain(r.c.nonText),['face/icon']);r.c.msg.contents.fontSize=42;
 r.api.hide(false);assert.deepEqual(plain(r.c.ink),expected);assert.equal(r.c.msg.contents.fontSize,42);assert.equal(r.body().hidden,false);
 r.api.hide(false);assert.deepEqual(plain(r.c.ink),expected,'idempotent off does not duplicate glyphs');
 r.api.hide(true);assert.equal(r.body().hidden,false,'visible retained page cannot be retroactively hidden');
 r.say('次の頁');assert.equal(r.c.ink.length,0);assert.equal(r.body().hidden,true);
 r.api.config({roles:false,embed:false});assert.ok(r.c.ink.length>0,'permission revoke restores current page');
});
test('mid-page enable defers until a fresh message; new-page restoration never resurrects previous text',()=>{
 const r=rig();r.say('既存');r.api.hide(true);assert.equal(r.body().hidden,false);
 r.say('新規');assert.equal(r.body().hidden,true);r.say('別頁');r.api.hide(false);
 assert.equal(r.c.ink.filter(v=>v[0]==='fill').map(v=>v[1]).join(''),'別頁');
});
test('partial clear first restores glyphs, then executes original clear without claiming hidden',()=>{
 const r=rig();r.api.hide(true);r.say('本文');r.c.msg.contents.clearRect(0,0,10,10);r.c.timers.at(-1)();
 assert.equal(r.c.ink.filter(v=>v[0]==='fill').map(v=>v[1]).join(''),'本文');assert.equal(r.body().hidden,false);assert.deepEqual(plain(r.c.nonText),['clearRect']);
});
test('missing glyph interception and an over-budget buffered run remain visible and report a reason',()=>{
 const r=rig('MZ',true);r.api.hide(true);r.say('字'.repeat(4001));assert.equal(r.body().hidden,false);assert.equal(r.c.ink.length,2);assert.ok(r.c.reports.some(v=>v.status==='RPGM_HIDE_UNSUPPORTED'));
 const no=rig('MV',false,true);no.api.hide(true);no.say('本文');assert.equal(no.body().hidden,false);
 assert.equal(no.c.ink.filter(v=>v[0]==='plugin-visible').length,2);assert.ok(no.c.reports.some(v=>v.status==='RPGM_HIDE_NO_GLYPH_PROOF'));
});
test('embed permission keeps original renderer active, without silently granting or switching embed',()=>{
 const r=rig();r.api.hide(true);r.api.config({roles:true,embed:true});r.say('本文');r.c.now=2000;r.c.msg.updateMessage();
 assert.equal(r.body().hidden,false);assert.ok(r.c.ink.length>0);assert.equal(r.api.state().cfg.embed,true);
});
function connection(r){let closed=false;return {send:async(method,p)=>{if(method!=='Runtime.evaluate')return {};try{return {result:{value:r.run(p.expression)}};}catch(e){return {exceptionDetails:{text:e.message}};}},close(){closed=true;},get closed(){return closed;}};}
test('actual web sync delivers hide and stop restores the page before exact terminal clear',async()=>{
 const r=rig(),events=[],p=new WebTextPath({port:1,onSource:v=>events.push(v)}),c=connection(r);p.pages.set('game',c);
 await p.drawConfig({roles:true,embed:false});await p.hide(true);r.say('本文');assert.equal(r.body().hidden,true);
 await p.stop();assert.equal(r.c.ink.filter(v=>v[0]==='fill').map(v=>v[1]).join(''),'本文');assert.equal(c.closed,true);assert.equal(events.at(-1).terminal,true);
});
test('restore failure propagates through real Runtime.evaluate and stop cannot claim success',async()=>{
 const r=rig(),status=[],p=new WebTextPath({port:1,onStatus:v=>status.push(v)}),c=connection(r);p.pages.set('game',c);
 await p.drawConfig({roles:true});await p.hide(true);r.say('本文');r.c.restoringFails=true;
 await assert.rejects(p.hide(false),/CDP_SCRIPT_REJECTED/);assert.ok(status.some(v=>v.includes('web control failed')));
 await assert.rejects(p.stop(),/READER_STOP_INCOMPLETE/);assert.equal(c.closed,true);
});
