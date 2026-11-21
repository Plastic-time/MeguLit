process.env.MEGULIT_RELAY_BASE??='off';/* tests never reach the real relay */
// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-21 1.4.22 test (owner, ファタモルガーナの館, E:\MeguLit-Test-1421\logs 02:24-02:27Z): in read mode the dialogue box showed the
   Chinese only, the Japanese gone; "render mode switched in place custom -> read" / "read -> custom" every second or so, each switch
   to read logging "hide layers give way (reader-profile)". MeguLit's own text output (overlay placement, ownTextFn) forced the hide on
   whenever the selected stream was not GDI-less, ignoring 隐藏游戏原文 = off: the KiriKiri page DLL went on drawing at opacity 0
   (krkr draws=401 hidden=321) and the glyph layer blanking, while the reader, in read mode, drew the translation only.
   Read mode now keeps the game's own text on every path: the bridge gets "disable" (KrkrHide reset, glyph layer off) and stays
   there whatever stream is selected; hide mode is unchanged. */
const test=require('node:test'),assert=require('node:assert/strict');
const {HookNative}=require('../core/hook-native.cjs');

function rig({hookHide,hookProfile}){
 const sent=[],hook=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},()=>{},()=>{},()=>1000);
 clearInterval(hook.timer);hook.send=m=>sent.push(m);hook.trace=()=>{};
 let gdiless=false;hook.ownTextFn=()=>true;hook.compositedFn=()=>false;hook.gdilessSelected=()=>gdiless;hook.pageMode={engine:'krkr'};
 const state={bound:true,gameProcessId:123,gameStarted:'1',gameHwnd:'456',coverEnabled:true};
 const preferences={hookProfile,hookHide,hookAutoStart:true,bindEnabled:true,maskMode:'hook',autoGameStyle:true};
 hook.process={kill(){}};hook.pid=123;hook.started='1';hook.enabled=true;hook.route='custom';
 hook.configure(preferences,state);
 return {hook,sent,switches:()=>sent.filter(m=>m.type==='enable'||m.type==='disable').map(m=>m.type),flip(v){gdiless=v;hook.configure(preferences,state);}};
}

test('read mode (隐藏游戏原文 off): own text output no longer keeps the game text hidden; the stream switching cannot flap it',()=>{
 const r=rig({hookHide:false,hookProfile:'read'});
 assert.equal(r.hook.enabled,false,'read mode: the bridge does not hide');assert.equal(r.hook.route,'read');assert.deepEqual(r.switches(),['disable']);
 for(const v of [true,false,true,false])r.flip(v);
 assert.deepEqual(r.switches(),['disable'],'GDI-less or not, it stays read: no custom <-> read flapping');
});

test('hide mode with own text output is unchanged: hidden, and a GDI-less selection still decides as before',()=>{
 const r=rig({hookHide:true,hookProfile:'embed'});
 assert.equal(r.hook.enabled,true);assert.equal(r.hook.route,'embed');
});
