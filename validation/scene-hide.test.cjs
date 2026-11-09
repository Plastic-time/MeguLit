// SPDX-License-Identifier: GPL-3.0-or-later
// E322 (user, 2026-11-10: the whole reading layer faded out by itself, in several games). The scene probe read the
// screen, MeguLit's own layer included, so MeguLit's own text changing after a click looked like the game's picture
// changing. These checks keep it on the game window's own picture and make every whole-layer hide carry its cause.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Immersion}=require('../core/immersion.cjs');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('the scene probe reads the game window through GameCapture, never the screen with MeguLit on it',()=>{
 const probe=read('native/GameSceneProbe.cs');
 assert.doesNotMatch(probe,/GetDC\(IntPtr\.Zero\)/);
 assert.match(probe,/GameCapture\.Into\(target,frame,2\)/);
 assert.match(probe,/public static bool SelfTest\(\)/);
 const bridge=read('native/GalWindowBridge.cs');
 assert.match(bridge,/Scene\.Tick\(Target,/);assert.match(bridge,/GameSceneProbe\.SelfTest\(\)/);
});

test('every whole-layer hide carries its cause, and the reader host logs it',()=>{
 let now=1000;const out=[];const im=new Immersion(m=>out.push(m),()=>now);
 im.configure({immersion:true,dialogDetection:'hook'});im.bind('game');
 im.scene(false,'scene changed 80%, box 60%');
 assert.deepEqual(out.at(-1),{dialogVisible:false,reason:'scene changed 80%, box 60%'});
 im.scene(true);assert.deepEqual(out.at(-1),{dialogVisible:true});
 im.skip(true);now+=400;im.tick();assert.deepEqual(out.at(-1),{dialogVisible:false,reason:'skip'});
 const reader=read('services/reader.cjs');
 assert.match(reader,/logVisibility\(\{type:'dialogVisibility',visible:message\.dialogVisible,reason:message\.reason\}\)/);
 assert.match(reader,/message\.type==='dialogSceneKept'/);
});
