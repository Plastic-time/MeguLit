// SPDX-License-Identifier: GPL-3.0-or-later
// E322 (user, 2026-11-10: the whole reading layer faded out by itself, in several games). The scene probe read the
// screen, MeguLit's own layer included, so MeguLit's own text changing after a click looked like the game's picture
// changing. These checks keep it on the game window's own picture and make every whole-layer hide carry its cause.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
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

// 2026-11-21 (user, Aokana: the line stayed after the game's picture had moved on). Its window gave BitBlt one old picture for
// the whole session, so every scene check compared that picture with itself.
test('a BitBlt picture that stays the same while the screen moves is frozen and read through PrintWindow',()=>{
 const cap=read('native/GameCapture.cs'),probe=read('native/GameSceneProbe.cs'),bridge=read('native/GalWindowBridge.cs');
 assert.match(cap,/if\(Blt\(hwnd,image\)&&!Blank\(image\)\)\{if\(AcceptBlt\(c,Signature\(image\),DateTime\.UtcNow,\(r,v\)=>FreezeVote\(hwnd,image,c,r,v\),out frozen\)\)return true;if\(!frozen\)return false;\}/,'Into: frozen prints, stale skips');
 assert.match(cap,/if\(!Blank\(image\)\)\{bool f;if\(AcceptBlt\(c,Signature\(image\),DateTime\.UtcNow,\(r,v\)=>FreezeVote\(hwnd,image,c,r,v\),out f\)\)return true;Skipped=true;return false;\}/,'BltOnly: frozen or stale skips');
 assert.match(cap,/return VoteScreen\(c,round,voteId,now,Samples\(picture\)\);/,'FreezeVote updates c.Screen under the round and voteId check');
 assert.match(cap,/if\(!frozen&&!c\.Proven&&!c\.Blind&&!c\.Frozen&&!c\.HasSig\)\{int vote=BlindVote\(hwnd,image\);lock\(Gate\)\{if\(!c\.Proven&&!c\.Blind&&!c\.Frozen&&!c\.HasSig\)/,'BlindVote skips and never updates a window that already saw a BitBlt picture or froze');
 assert.match(cap,/if\(!KeepPart\(hwnd,c,round,blank,DateTime\.UtcNow\)\)\{Skipped=true;return false;\}/,'Part checks round and state before delivering a partial BitBlt');
 assert.match(cap,/if\(c\.Blind\|\|frozen\)lock\(Gate\)\{Choice cur;if\(Choices\.TryGetValue\(hwnd,out cur\)&&cur==c&&\(frozen\?c\.Frozen:c\.Blind\)&&\(DateTime\.UtcNow-c\.Printed\)\.TotalMilliseconds>=PrintGapMs\)\{c\.Printed=DateTime\.UtcNow;round=c\.Round;print=true;\}\}/,'a frozen window is printed under the same rate limit as a blind one, re-checking state and carrying its round');
 assert.match(cap,/case 0:Skipped=true;return false;\s+case 2:return printed;\s+\}\s+FromScreen=true;return ScreenInto\(hwnd,image\);/,'Into does what AfterPrint (self-tested) decides');
 assert.match(cap,/return DeliverPrint\(hwnd,c,round,image,printed,printed&&!Blank\(image\),frozen,screenFallback\);/,'Into delivers PrintWindow results through DeliverPrint');
 assert.match(cap,/switch\(AfterPrint\(printed,good,frozen,screenFallback\)\)\{\s+case 1:if\(!frozen\|\|Keep\(hwnd,c,round,image\)\)return true;Skipped=true;return false;/);
 assert.match(cap,/printed=PrintWindow\(hwnd,dc,frozen\?printFlags\|1:printFlags\);/,'a frozen window is printed client area only, the same for every reader');
 assert.match(cap,/GetAncestor\(front,2\)!=GetAncestor\(hwnd,2\)\|\|!SameScale\(hwnd\)\)return 0;/,'no vote for a window not drawn at its monitor DPI');
 assert.match(cap,/var own=OwnParts;Cover\(now,own==null\?null:own\(hwnd,picture\.Width,picture\.Height\),picture\.Width,picture\.Height\);/,'MeguLit windows are left out');
 assert.match(bridge,/var ownPids=PageLocate\.OwnPids;GameCapture\.OwnParts=\(ownHwnd,ownW,ownH\)=>OwnCover\.Parts\(ownHwnd,ownW,ownH,ownPids\);/);
 assert.match(probe,/if\(GameCapture\.Into\(target,frame,2\)\)pictureAt=DateTime\.UtcNow;else if\(!GameCapture\.Recent\(target,frame,ref pictureAt\)\)return null;/,'the scene probe sees every print');
 assert.match(probe,/>1900&&seen>=3\)\{Line\(\);return null;\}/,'sparse pictures: at least three after an input');
 assert.match(bridge,/if\(!GameCapture\.FreezeSelfTest\(\)\)return 10;/);
});

// 2026-11-22 (#714 review): GameStyleProbe and the overlay harness compile GameCapture.cs without the bridge's files. The freeze
// rules (votes by round, A-B-A, the order of the screen checks, Part, a blank print, saved pictures, a dropped window) and the
// scene probe run as their own self-tests, built from those two files only.
const csc=['C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe'].find(f=>fs.existsSync(f));
test('GameCapture.cs builds on its own; its freeze rules and the scene probe pass their self-tests',{skip:!csc&&'no csc'},()=>{
 const dir=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-capture-freeze-')),exe=path.join(dir,'freeze.exe'),main=path.join(dir,'main.cs');
 /* GameCapture.cs (as GameStyleProbe and the overlay harness build it) and the scene probe that reads through it */
 fs.writeFileSync(main,'static class FreezeMain{static int Main(){return !GameCapture.FreezeSelfTest()?1:!GameSceneProbe.SelfTest()?2:0;}}');
 try{execFileSync(csc,['/nologo','/target:exe','/platform:x64','/reference:System.Drawing.dll','/out:'+exe,
   ...['native/GameCapture.cs','native/GameSceneProbe.cs'].map(f=>path.join(__dirname,'..',f)),main],{windowsHide:true});
  let code=0;try{execFileSync(exe,[],{windowsHide:true,timeout:30000});}catch(e){code=e.status;}
  assert.equal(code,0,'1: GameCapture.FreezeSelfTest failed, 2: GameSceneProbe.SelfTest failed');}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});
