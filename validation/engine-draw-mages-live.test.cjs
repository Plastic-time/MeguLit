// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* engine-draw MAGES, the live chain (docs/engine-draw-native.md): the records the DLL logs (validation/fixtures/engine-sigs/
   mages-draw-log.txt is the output of native/megulithook/selftest/magesgate.cpp, real MinHook detours on a stand-in engine) ->
   HookBridge EngineInfo (hookEngineDraw; its --self-test checks the C# side) -> HookNative's message dispatch -> magesDraw ->
   core/mages-draw.cjs MagesLive -> charRects -> hookCharRects / hookDrawUi -> OverlayPlacement.
   Acceptance for CHAOS;CHILD's split lines: a sentence the engine commits into one page in several pieces is ONE line (one line
   number, its text growing), and it leaves once, at the clear. Canvas placement from the game's own presentation (static). */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const D=require('../core/mages-draw.cjs'),TP=require('../core/text-paths.cjs'),Profiles=require('../core/profiles/index.cjs');
const {HookNative}=require('../core/hook-native.cjs');
const cs=require('../services/original-engines/mages.cjs')._internal.charset('sghd');
const code=ch=>{const i=[...cs].indexOf(ch);if(i<0)throw Error('not in sghd: '+ch);return i.toString(16).padStart(4,'0');};
const codes=s=>[...s].map(c=>c==='\u0001'?'8001':c==='\u0002'?'8002':code(c)).join('');
const box=(page,seq,at,n,x0)=>'ToMe_DRAWBOX engine=mages page='+page+' seq='+seq+' at='+at+' rects='+Array.from({length:n},(_,k)=>(x0+30*k)+',900,30,45').join(';')+' color='+Array(n).fill('ffffff').join(',')+' flag='+Array(n).fill(0).join(',');
const table=JSON.parse(fs.readFileSync(path.join(__dirname,'..','The Seed','mages','chaos-child','versions','51aeae59786ed60a519411e035b324bbc10f1bd49490a607fab69a3741133bd4.json'),'utf8')).settings.draw.engineTable;
function native(){
 const events=[],h=Object.create(HookNative.prototype);
 Object.assign(h,{emit:e=>events.push(e),now:()=>1,state:{gameProcessId:0},profile:Profiles.profileFor({}),gamePid:()=>4242});
 h.profile={...h.profile,draw:{...h.profile.draw,roles:true,engineTable:{...table,charset:'sghd'}}};
 return {h,events};
}

test('the bridge message reaches magesDraw (HookNative dispatch, HookBridge EngineInfo)',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','core','hook-native.cjs'),'utf8');
 assert.ok(src.includes("if(m.type==='hookEngineDraw'&&m.engine==='mages'){this.magesDraw(String(m.line||''));return;}"));
 const cs2=fs.readFileSync(path.join(__dirname,'..','native','HookBridge.cs'),'utf8');
 assert.ok(cs2.includes('StartsWith("ToMe_DRAWRUN engine=mages ",StringComparison.Ordinal)||(s??"").StartsWith("ToMe_DRAWBOX engine=mages ",StringComparison.Ordinal))return s.Length<=1000?new{type="hookEngineDraw",engine="mages",line=s}'));
});

test('CHAOS;CHILD: one sentence committed in three pieces is one line, growing, gone once at the clear',()=>{
 const {h,events}=native();
 const log=[
  'ToMe_DRAWRUN engine=mages ev=view bb=1920,1080 client=1280,720',
  'ToMe_DRAWRUN engine=mages ev=add page=0 seq=4 role=line from=0 n=5 scale=1.5 codes='+codes('\u0001岡部\u0002まゆり'),
  box(0,4,0,5,100),
  'ToMe_DRAWRUN engine=mages ev=show page=0 seq=4 opacity=255',
  'ToMe_DRAWRUN engine=mages ev=add page=0 seq=4 role=line from=5 n=3 scale=1.5 codes='+codes('はいい'),
  box(0,4,5,3,250),
  'ToMe_DRAWRUN engine=mages ev=add page=0 seq=4 role=line from=8 n=1 scale=1.5 codes='+codes('え'),
  box(0,4,8,1,340),
  'ToMe_DRAWRUN engine=mages ev=clear page=0 seq=4',
  'ToMe_DRAWRUN engine=mages ev=add page=0 seq=5 role=line from=0 n=2 scale=1.5 codes='+codes('ハハ'),
  box(0,5,0,2,100)];
 for(const l of log)h.magesDraw(l);
 const lines=events.filter(e=>e.type==='hookCharRects'),ui=events.filter(e=>e.type==='hookDrawUi');
 assert.deepEqual(lines.map(e=>[e.line,e.text]),[[1,'まゆり'],[1,'まゆりはいい'],[1,'まゆりはいいえ'],[1,''],[2,'ハハ']],'one line number for the three pieces, empty once at the clear, the next sentence is line 2');
 assert.deepEqual(ui.map(e=>[e.role,e.id,e.text]),[['name','N:0','岡部'],['name','N:','']],'the speaker from the engine\'s markers, cleared with the page');
 assert.equal(lines[2].rects.length,7);assert.deepEqual(lines[2].rects[6],[340,900,30,45]);
 assert.deepEqual(lines[0].viewport,[0,0,1280,720],'canvas 1920x1080 over a 1280x720 client');
 /* the placement sees one growing line (each visible text extends the last), never two sentences */
 const {OverlayPlacement}=require('../core/overlay-placement.cjs');const sent=[],p=new OverlayPlacement({send:m=>sent.push(m)});
 p.configure({textRenderer:'compositor'},{bound:true,layout:{clientWidth:1280,clientHeight:720}});
 for(const e of lines.slice(0,3))p.hook(e);
 const vis=sent.filter(m=>m.type==='textPlace'&&m.visible).map(m=>m.text);
 assert.ok(vis.length>=1&&vis.every((t,i)=>i===0||t.startsWith(vis[i-1])),'visible texts grow: '+JSON.stringify(vis));
 assert.equal(vis.at(-1),'まゆりはいいえ');
});

test('a page that starts over without a clear ends its old line first; choices are one snapshot, emptied at the clear',()=>{
 const {h,events}=native();
 for(const l of ['ToMe_DRAWRUN engine=mages ev=add page=0 seq=1 role=line from=0 n=2 scale=1.5 codes='+codes('ハハ'),box(0,1,0,2,100),
  'ToMe_DRAWRUN engine=mages ev=add page=0 seq=2 role=line from=0 n=1 scale=1.5 codes='+codes('い'),box(0,2,0,1,100),
  'ToMe_DRAWRUN engine=mages ev=add page=7 seq=1 role=choice from=0 n=2 scale=1.5 codes='+codes('はい'),
  'ToMe_DRAWBOX engine=mages page=7 seq=1 at=0 rects=800,400,30,45;830,400,30,45 color=ffffff,ffffff flag=0,0',
  'ToMe_DRAWRUN engine=mages ev=add page=7 seq=1 role=choice from=2 n=2 scale=1.5 codes='+codes('いえ'),
  'ToMe_DRAWBOX engine=mages page=7 seq=1 at=2 rects=800,500,30,45;830,500,30,45 color=ffffff,ffffff flag=1,1',
  'ToMe_DRAWRUN engine=mages ev=clear page=7 seq=1'])h.magesDraw(l);
 const lines=events.filter(e=>e.type==='hookCharRects').map(e=>[e.line,e.text]);
 assert.deepEqual(lines,[[1,'ハハ'],[1,''],[2,'い']]);
 const ui=events.filter(e=>e.type==='hookDrawUi').map(e=>[e.line,e.role,e.id,e.text,e.box&&e.box.join(',')]);
 assert.deepEqual(ui,[[3,'choice','C:0','はい','800,400,60,45'],[3,'choice','C:1','いえ','800,500,60,45'],[3,'choice','C:','','0,0,0,0']],'one snapshot (line 3) per choice page, each choice once, emptied at the clear');
});

test('canvas placement follows the game\'s presentation: width-fit, centred vertically, stretched to the client',()=>{
 assert.deepEqual(D.viewport({bb:[1920,1080],client:[1920,1080]}),[0,0,1920,1080]);
 assert.deepEqual(D.viewport({bb:[1280,720],client:[1280,720]}),[0,0,1280,720]);
 assert.deepEqual(D.viewport({bb:[1920,1200],client:[1920,1200]}),[0,60,1920,1080],'16:10 fullscreen: bars above and below');
 assert.deepEqual(D.viewport({bb:[2560,1080],client:[2560,1080]}),[0,-180,2560,1440],'ultrawide: the scene is cut at top and bottom');
 assert.deepEqual(D.viewport({bb:[1366,768],client:[1366,768]}),[0,1.5,1366,765],'(w >> 4) * 9 is the game\'s integer height');
 assert.deepEqual(D.viewport({bb:[1920,1080],client:[1280,800]}),[0,0,1280,800],'a 1920x1080 back buffer stretched over a 16:10 window');
 assert.deepEqual(D.viewport({bb:[0,0],client:[1600,900]}),[0,0,1600,900],'no back buffer size: the client');
 assert.deepEqual(D.viewport({bb:[1920,1080],client:[0,0]}),[0,0,0,0],'no client: the kernel fits the canvas');
 /* the record carries it, and the kernel maps canvas boxes with it */
 const rec=TP.parseChars('ToMe_CHARS engine=mages line=1 hidden=0 sw=1920 sh=1080 vx=0 vy=60 vw=1920 vh=1080 n=1 rects=960,540,30,45 text=あ');
 assert.ok(rec);assert.deepEqual(rec.viewport,[0,60,1920,1080]);
});

test('menu call sites: drawGlyph runs inside the version table\'s menu text function are role menu, others system',()=>{
 const L=new D.MagesLive({table,charset:''});
 assert.deepEqual(table.menuText,['0x73010','0x737b0']);
 assert.equal(L.glyphRole(0x73020),'menu');assert.equal(L.glyphRole(0x737b0),'system');assert.equal(L.glyphRole(0x47300),'system');
 assert.deepEqual(D.parse('ToMe_DRAWRUN engine=mages ev=glyph site=73414 n=4 box=500,200,120,30 size=30 color=80ff80').site,0x73414);
});

test('the runtime\'s own log (real detours) through the live chain: lines, name, choices, valid records',()=>{
 const {h,events}=native();
 for(const l of fs.readFileSync(path.join(__dirname,'fixtures','engine-sigs','mages-draw-log.txt'),'utf8').split(/\r?\n/).filter(Boolean))h.magesDraw(l);
 const lines=events.filter(e=>e.type==='hookCharRects');
 assert.deepEqual(lines.map(e=>[e.line,e.text]),[[1,'フゥー'],[1,'フゥーハハ！'],[1,''],[2,'まゆり']]);
 assert.deepEqual(lines[0].viewport,[0,0,0,0],'the stand-in has no window: the kernel fits the canvas');
 assert.deepEqual(events.filter(e=>e.type==='hookDrawUi').map(e=>[e.role,e.id,e.text]),[['name','N:0','岡部'],['name','N:',''],['choice','C:0','はい'],['choice','C:1','いえ']]);
});
