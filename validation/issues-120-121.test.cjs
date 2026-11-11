'use strict';
// Issues 120/121: Pal (Steam LeyLine.exe) gives no engine coordinates; the OCR page fallback missed every line because
// MeguLit had already replaced the original. The fallback now reads the screen only while the original is drawn.
const test=require('node:test'),assert=require('node:assert/strict');
const {HookNative}=require('../core/hook-native.cjs');
function fixture(t){const located=[],traces=[];
 const hook=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},()=>{},()=>{},()=>100000);hook.trace=m=>traces.push(m);hook.locate=text=>located.push(text);t.after(()=>hook.stop());
 return {hook,located,traces,line(text){hook.source({text,sourceName:'Pal',origin:'live'},'');}};}

test('a replaced original is not looked for on screen, and the reason is logged once',t=>{
 const f=fixture(t);f.hook.enabled=true;f.hook.preferences={hookHide:true};f.hook.state={...f.hook.state,replacementState:'clear-requested'};
 f.line('とはいえ、それが俺にとって都合が良かった。');f.line('（受験も面接も何もなしって、怪しすぎるだろ……）');
 assert.deepEqual(f.located,[]);
 assert.equal(f.traces.filter(m=>/^ocr page skipped/.test(m)).length,1);
});

test('the original on screen is still located: read-only, unhidden, baseline or no replacement',t=>{
 for(const setup of [h=>{h.enabled=false;},h=>{h.enabled=true;h.preferences={hookHide:false};h.state={...h.state,replacementState:'clear-requested'};},h=>{h.enabled=true;h.preferences={};h.state={...h.state,replacementState:'disabled'};}]){
  const f=fixture(t);setup(f.hook);f.line('生徒手帳もその返信に入っていたものだ。');
  assert.deepEqual(f.located,['生徒手帳もその返信に入っていたものだ。']);
 }
});

test('locating resumes once the original shows again',t=>{
 const f=fixture(t);f.hook.enabled=true;f.hook.preferences={};f.hook.state={...f.hook.state,replacementState:'callback-acknowledged'};
 f.line('一行目の台詞です。');f.hook.enabled=false;f.line('二行目の台詞です。');
 assert.deepEqual(f.located,['二行目の台詞です。']);
});

test('issue 121: the old follow-the-original switch is gone everywhere and nothing turns following off',()=>{
 const fs=require('node:fs'),path=require('node:path'),read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
 const {fields}=require('../services/settings-schema.cjs');
 assert.equal((fields||[]).some(f=>f.key==='livePosition'),false,'no settings page toggle');
 assert.doesNotMatch(read('web/settings-help.js'),/livePosition/);
 assert.doesNotMatch(read('web/reader/modules/gal.js'),/galLivePosition|additional\.livePosition/);
 assert.doesNotMatch(read('web/reader/modules/game-style-sync-ui.js'),/livePosition:false/);
 assert.doesNotMatch(read('web/reader/modules/text-position.js'),/livePosition/,'following depends only on engine coordinates and a calibration map');
});

// Pal engine coordinates (MeguLitHook32: native/megulithook/Pal.cpp overlays the upstream file).
const palFixture=t=>{const out=[];let now=1000;const hook=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},m=>out.push(m),()=>{},()=>now);hook.trace=()=>{};hook.locate=()=>{};t.after(()=>hook.stop());
 const pos=(token,count=10)=>({type:'hookTextPos',engine:'pal_sprite_v1',line:1,x0:40,y0:560,x1:900,y1:600,size:28,count,token,at:now});
 return {hook,out,pos,line(text){hook.source({text,sourceName:'Pal',origin:'live'},'');},positions:()=>out.filter(m=>m.type==='hookTextPos'),tick(ms){now+=ms;}};};
const fnv=(t,ws)=>{let h=2166136261;const s=ws?t.replace(/\s+/g,''):t;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return h>>>0;};

test('a Pal draw of the current line goes on with the token position calibration pairs by',t=>{
 const f=palFixture(t),line='とはいえ、それが俺にとって都合が良かったのも確かなんだが。';f.line(line);
 f.hook.palPosition(f.pos(fnv(line,true)));
 assert.equal(f.positions().length,1);assert.equal(f.positions()[0].token,fnv(line,false));assert.equal(f.positions()[0].engine,'pal_sprite_v1');
});

test('a speaker plate or another sprite pairs with nothing',t=>{
 const f=palFixture(t);f.line('（受験も面接も何もなしって、怪しすぎるだろ……）');f.hook.palPosition(f.pos(fnv('満琉',true),2));
 assert.equal(f.positions().length,0);
});

test('a draw that arrives before its hook line waits for it (up to 3 s)',t=>{
 const f=palFixture(t),line='生徒手帳もその返信に入っていたものだ。';f.hook.palPosition(f.pos(fnv(line,true)));
 assert.equal(f.positions().length,0);f.tick(400);f.line(line);assert.equal(f.positions().length,1);
 const g=palFixture(t);g.hook.palPosition(g.pos(fnv(line,true)));g.tick(3500);g.line(line);assert.equal(g.positions().length,0);
});

test('a hidden (blanked) line still gives its place while the original is replaced',t=>{
 const f=palFixture(t),line='生徒手帳もその返信に入っていたものだ。';f.hook.enabled=true;f.hook.preferences={};f.hook.state={...f.hook.state,replacementState:'clear-requested'};f.line(line);
 f.hook.palPosition(f.pos(0,[...line].length));assert.equal(f.positions().length,1);
 f.hook.palPosition(f.pos(0,2));assert.equal(f.positions().length,1,'a blank speaker plate is too short');
 const g=palFixture(t);g.line(line);g.hook.palPosition(g.pos(0,[...line].length));assert.equal(g.positions().length,0,'blank draws count only while MeguLit hides the line');
});

test('Pal.cpp hooks the sprite transaction and reports it as pal_sprite_v1',()=>{
 const src=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','native','megulithook','Pal.cpp'),'utf8');
 for(const name of ['PalSpriteLock','PalSpriteSetPos','PalSpriteUnlock','PalFontDrawText','PalFontGetFontSize'])assert.match(src,new RegExp('"'+name+'"'));
 assert.match(src,/ToMeTextPos::Glyph\("pal_sprite_v1", px \+ g\.x, py \+ g\.y/);
 assert.match(src,/ToMeTextPos::Begin\(any \? token : 0\)/);
 assert.match(src,/for \(auto func : \{"PalSpriteCreateTextEx", "PalSpriteCreateText"\}\)/);
 assert.ok(require('node:fs').readFileSync(require('node:path').join(__dirname,'..','native','HookBridge.cs'),'utf8').includes('ToMe_TEXTPOS engine=('+String.fromCharCode(92)+'w+) line='),'any engine name passes the bridge');
});
