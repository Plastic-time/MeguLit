'use strict';
/* 2026-11-19 (rig2 千恋＊万花 bound after the game was already on its title): its TextRender renderers existed before MeguLit's
   script wrapped the class, so no line reported its character boxes and the reader stayed in its own box. A TextRender game
   MeguLit did not start itself whose dialogue gives three lines without one character record is told once to start it from
   the library; hiding is never changed for it. A game that reports boxes, one started from the library, or a KiriKiri game
   without the TextRender plugin is left alone. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {HookNative}=require('../core/hook-native.cjs');
const BOX='ToMe_CHARS engine=krkr line=100001 hidden=1 sw=1280 sh=720 vx=0 vy=0 vw=0 vh=0 n=2 rects=300,560,28,28;328,560,28,28 text=お客';
function fixture(t,{textRender=true,launched=false}={}){let now=1e6;const notes=[],sent=[];
 const hook=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-late-attach-log'},m=>{if(m?.hookNotice)notes.push(m.hookNotice);},()=>{},()=>now);
 hook.trace=()=>{};hook.send=m=>sent.push(m);hook.artLocate=()=>{};hook.process={stdin:{write(){},end(){}},kill(){}};hook.enabled=true;t.after(()=>hook.stop());
 hook.state={...(hook.state||{}),gameProcessId:4242};if(launched)hook.launchedPid=4242;
 if(textRender){hook.source({text:'オ',sourceName:'TextRender',origin:'live'},'');now+=3000;}
 return {hook,notes,sent,lines(n){for(let i=0;i<n;i++){hook.source({text:'台詞の'+i+'番目です。よろしくお願いします。',sourceName:'EmbedKrkrZ',origin:'live'},'');now+=3000;}},
  disabled:()=>sent.filter(m=>m.type==='disable'&&m.reason==='no-positions').length,enabled:()=>sent.filter(m=>m.type==='enable').length};}
const NOTICE=/从 MeguLit 游戏库启动/;
test('late binding (no box in three lines): told once, hiding is left as it is',t=>{
 const f=fixture(t);f.lines(1);assert.equal(f.notes.filter(n=>NOTICE.test(n)).length,0);f.lines(2);assert.equal(f.notes.filter(n=>NOTICE.test(n)).length,1);
 f.lines(5);assert.equal(f.notes.filter(n=>NOTICE.test(n)).length,1,'told once');assert.equal(f.sent.filter(m=>m.type==='disable'||m.type==='enable').length,0,'hiding untouched');
 f.hook.charRects(BOX);assert.equal(f.sent.filter(m=>m.type==='disable'||m.type==='enable').length,0);
});
test('started from the library: no notice and hiding untouched even when the opening lines have no boxes',t=>{
 const f=fixture(t,{launched:true});f.lines(6);assert.equal(f.notes.filter(n=>NOTICE.test(n)).length,0);assert.equal(f.sent.filter(m=>m.type==='disable').length,0);
});
test('boxes from the start, or no TextRender plugin: left alone',t=>{
 const a=fixture(t);a.hook.charRects(BOX);a.lines(6);assert.equal(a.notes.length,0);
 const b=fixture(t,{textRender:false});b.lines(6);assert.equal(b.notes.length,0);
});
test('library launches mark their process for the check',()=>{
 assert.match(fs.readFileSync(path.join(__dirname,'..','services','runtime.cjs'),'utf8'),/bindLaunched\(pid\)\{[^}]*h\.launchedPid=Number\(pid\)/);
});
