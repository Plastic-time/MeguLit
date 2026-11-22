/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
/* Replays locally retained real-game records; the committed fixture contains hashes, not game scripts/assets. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const manifest=require('./fixtures/engine-draw/tyrano-sweetdolls-v5.json'),TP=require('../core/text-paths.cjs'),ED=require('../core/engine-draw.cjs');
const {HookNative}=require('../core/hook-native.cjs'),{OverlayPlacement}=require('../core/overlay-placement.cjs');
const root=process.env.MEGULIT_TYRANO_EVIDENCE||'H:/MeguLit-Work/night-1423/tyrano-sweetdolls-hidden-20261122',available=fs.existsSync(path.join(root,'records.json'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
test('Tyrano V5 ten-line capture manifest keeps sample, build, unsupported coverage and negative case explicit',()=>{
 assert.equal(manifest.engineVersion,500);assert.equal(manifest.captureKind,'real-game-hidden-desktop');assert.equal(manifest.completeLines.length,10);assert.equal(new Set(manifest.completeLines.map(x=>x.textSha256)).size,10);assert.equal(manifest.physicalReaderAccepted,false);assert.equal(manifest.choiceSample,false);assert.match(manifest.knownNegative,/Menu open/);
});
test('real Tyrano V5 capture: 10 complete hidden lines, source intact, names separate, and exact clears reach placement',{skip:!available&&'local capture unavailable'},()=>{
 for(const [file,expected]of Object.entries(manifest.artifacts))assert.equal(hash(fs.readFileSync(path.join(root,file))),expected,file+' capture identity');
 const records=JSON.parse(fs.readFileSync(path.join(root,'records.json'),'utf8')),events=fs.readFileSync(path.join(root,'logs/advance.jsonl'),'utf8').trim().split('\n').map(JSON.parse).filter(x=>x.kind==='complete-line');
 assert.equal(records.length,manifest.recordCount);assert.equal(JSON.parse(fs.readFileSync(path.join(root,'source-after.json'))).unchanged,true);
 const messages=[],ui=[];const placement=new OverlayPlacement({send:m=>messages.push(m)});placement.on=true;placement.client=[960,640];const tracker=new ED.UiTracker({defer:f=>f()});
 const hook=Object.create(HookNative.prototype);Object.assign(hook,{textPathActive:true,state:{},profile:require('../core/profiles/index.cjs').profileFor({engine:'tyrano'}),drawLog(){},engineDrawLine(){},now:()=>1,emit:m=>{if(m.type==='hookDrawUi')ui.push(...tracker.feed(m,rows=>ui.push(...rows)));else placement.hook(m);}});
 for(const r of records){const wire=TP.formatChars(r);assert.ok(TP.parseChars(wire),'every actual record still parses');HookNative.prototype.charRects.call(hook,wire);}
 for(const e of events){const text=e.state.body.replace(/\s/g,'');assert.ok(records.some(r=>!r.role&&r.hidden&&r.text.replace(/\s/g,'')===text&&r.rects.length===Array.from(text).length),'complete hidden game line '+e.n);assert.ok(messages.some(m=>m.type==='textPlace'&&m.id&&m.text===text),'placement receives line '+e.n);}
 assert.ok(messages.filter(m=>m.gone).length>=10,'old pages retire in the real core chain');assert.ok(ui.some(m=>m.visible&&m.role==='name'),'actual configured name reported');assert.equal(records.some(r=>r.role==='choice'),false,'no options in this game, no claimed choice proof');
});

const menuRoot=process.env.MEGULIT_TYRANO_MENU_EVIDENCE||root+'-menu';
test('real Tyrano V5 menu after fix clears body/name and reclaims the current page on return',{skip:!fs.existsSync(path.join(menuRoot,'records.json'))&&'local menu capture unavailable'},()=>{
 for(const [file,expected]of Object.entries(manifest.menuFix.artifacts))assert.equal(hash(fs.readFileSync(path.join(menuRoot,file))),expected,file+' fixed-menu capture identity');
 const opened=JSON.parse(fs.readFileSync(path.join(menuRoot,'menu-after-fix.json'))),closed=JSON.parse(fs.readFileSync(path.join(menuRoot,'menu-closed-fixed.json'))),records=JSON.parse(fs.readFileSync(path.join(menuRoot,'records.json')));
 assert.equal(opened.result.value.menu.display,'block');assert.equal(opened.result.value.bodyHidden,false);assert.equal(closed.result.value.menu.display,'none');assert.equal(closed.result.value.bodyHidden,true);assert.equal(JSON.parse(fs.readFileSync(path.join(menuRoot,'source-after.json'))).unchanged,true);
 const wire=fs.readFileSync(path.join(menuRoot,'logs/chars.jsonl'),'utf8').trim().split('\n').map(JSON.parse).filter(x=>x.at<=opened.at).map(x=>TP.parseChars(x.wire));
 assert.equal(wire.filter(x=>!x.role).at(-1).text,'');assert.equal(wire.filter(x=>x.role==='name').at(-1).text,'');assert.ok(records.filter(x=>x.role==='name'&&x.text).length>=2,'name returns after closing menu');
 assert.equal(manifest.menuFix.fullReaderLaunched,false,'hidden DOM/core checks do not imply physical Reader acceptance');
});
