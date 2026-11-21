// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* the dot font rides along only with the capture compositor (off by default since 2026-11-14) */
process.env.MEGULIT_CAPTURE_COMPOSITOR = '1';
/* Text architecture ③ (docs/text-architecture.md): engines that do not take glyphs from Windows hide the current line
   themselves and report each character's box as ToMe_CHARS (core/text-paths.cjs). These tests cover the shared record,
   geometry, hidden confirmation and crash canary, the Ren'Py script against the stand-in Ren'Py, the KiriKiri script's
   record, the web path's switches and page script, and the HookBridge / hook-native wiring. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const TP=require('../core/text-paths.cjs'),W=require('../core/text-paths-web.cjs');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const tmp=()=>fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'megulit-tp-'));

test('ToMe_CHARS round trip: one rect per drawn character, newlines kept in the text only',()=>{
 const line=TP.formatChars({engine:'krkr',line:7,hidden:true,sw:1280,sh:720,rects:[[60,80,28,28],[88,80,28,28],[60,118,28.5,28]],text:'一行\n目'});
 assert.equal(line,'ToMe_CHARS engine=krkr line=7 hidden=1 sw=1280 sh=720 vx=0 vy=0 vw=0 vh=0 n=3 rects=60,80,28,28;88,80,28,28;60,118,28.5,28 text=一行\x1f目');
 const r=TP.parseChars(line);
 assert.deepEqual([r.type,r.engine,r.line,r.hidden,r.sw,r.sh,r.text,r.rects.length],['hookCharRects','krkr',7,true,1280,720,'一行\n目',3]);
 assert.equal(TP.parseChars(line.replace('n=3','n=2')),null,'count must match');
 assert.equal(TP.parseChars(line.replace('text=一行\x1f目','text=一行')),null,'one rect per character');
 assert.equal(TP.parseChars(line.replace('engine=krkr','engine=other')),null,'known engines only');
 assert.equal(TP.parseChars('ToMe_KRKR end line=1'),null);
});

test('game screen -> client: engine viewport wins, otherwise aspect fit centred',()=>{
 const rec={sw:1280,sh:720,viewport:[0,0,0,0],rects:[[0,0,10,10],[1270,710,10,10]]};
 assert.deepEqual(TP.toClient(rec,1280,720),[[0,0,10,10],[1270,710,10,10]]);
 assert.deepEqual(TP.toClient(rec,1920,1200),[[0,60,15,15],[1905,1125,15,15]],'16:9 game in a 16:10 window: bars top and bottom');
 assert.deepEqual(TP.toClient({...rec,viewport:[100,0,640,360]},1920,1200),[[100,0,5,5],[735,355,5,5]]);
});

test('hidden: the latest record of a line decides; a path that never confirms stays read-only',()=>{
 const g=new TP.HiddenGate({grace:2});
 assert.equal(g.report({line:1,hidden:false}),false);assert.equal(g.report({line:1,hidden:true}),true);assert.equal(g.confirmed,true);
 assert.equal(g.report({line:1,hidden:false}),false,'drawn again (MeguLit went away): not hidden');
 g.report({line:2,hidden:false});g.report({line:3,hidden:false});assert.equal(g.confirmed,false);
});

test('crash canary: only an exception exit code turns a path off; kill, clean quit or unseen exit stay on',()=>{
 const dir=tmp(),exe=path.join(dir,'Game.exe');fs.writeFileSync(exe,'MZ');let now=1e6;const mk=()=>new TP.Canary(dir,exe,{now:()=>now});
 assert.equal(path.basename(mk().file),'Game.exe-2.json','same key as HookBridge MemoryPath (name-size)');
 let c=mk();c.settle();c.arm('web');now+=4000;c.alive('web');
 c=mk();c.settle();assert.equal(c.allowed('web'),true,'left armed 4 s in, exit unseen (force kill): not a crash');assert.equal(c.read().armed.web,undefined);
 c.arm('web');c.exited('web',1);assert.equal(c.allowed('web'),true,'taskkill /F exit 1');c.arm('web');c.exited('web',-1);assert.equal(c.allowed('web'),true,'unknown');
 c.arm('web');c.exited('web',-1073741819);c.reset('web');assert.equal(c.allowed('web'),true);
 c.arm('unity');now+=21000;c.alive('unity');c=mk();c.settle();assert.equal(c.allowed('unity'),true);
 c.arm('unity');c.exited('unity',0);assert.equal(c.allowed('unity'),true);
 c.arm('unity');c.exited('unity',-1073741819);assert.equal(c.allowed('unity'),false);assert.match(c.read().off.unity.reason,/-1073741819/);
 fs.rmSync(dir,{recursive:true,force:true});
 const cs=read('native/TextPathCanary.cs');assert.match(cs,/public const long SafeAfter=20000;/);assert.match(read('native/HookBridge.cs'),/TextPathCanary\.SelfTest\(\)/);
});

function python(){for(const [cmd,args] of [['python',['-I']],['py',['-3','-I']]]){const r=spawnSync(cmd,[...args,'-c','import sys;print(sys.version_info[0])'],{encoding:'utf8',windowsHide:true});if(r.status===0&&r.stdout.trim()==='3')return [cmd,args];}return null;}
const py=python();
test('Ren\'Py: every located sentence (ADV too) sends its character boxes; the say Text is drawn at alpha 0 only while asked, and back at once',{skip:!py&&'no CPython 3 on PATH'},()=>{
 const r=spawnSync(py[0],[...py[1],path.join(root,'native/renpytext/selftest/host.py'),'--sink',path.join(root,'native/MeguLitRenpy.py')],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);
 const lines=JSON.parse(r.stdout),chars=lines.filter(l=>l.startsWith('ToMe_CHARS ')).map(TP.parseChars);
 assert.ok(chars.every(Boolean),'every record parses');
 assert.deepEqual(chars.map(c=>[c.line,c.hidden,c.rects.length,c.text]),[[1,false,14,'春の風が吹いた。\n二行目です。'],[2,false,6,'漢字を読む。'],[3,true,6,'普通の台詞。'],[3,false,6,'普通の台詞。'],[4,false,5,'新しい頁。']],'line 3 sent again as drawn when MeguLit stops asking');
 assert.deepEqual(chars[0].rects.slice(0,2),[[120,80,28,38],[148,80,28,38]],'virtual pixels; width from the next glyph when the glyph has none');
 assert.deepEqual(chars[1].rects[0],[220,250,14,19],'zoomed branch scaled');
 assert.deepEqual(chars[2].rects[0],[160,550,24,34],'ADV line located too');
 assert.equal(lines.at(-1),'HOST alpha3=[0.0, 1.0]','alpha 0 while asked, 1 again the frame after MeguLit stops asking');
 const s=read('native/MeguLitRenpy.py');assert.match(s,/MeguLitRenpyHide-%d/);assert.ok(s.includes("r.add_shader('renpy.alpha')"),'gl2 ignores Render.alpha: the renpy.alpha shader does the hiding (live, Ren\'Py 8.4)');assert.match(s,/if not self\.connected:\s*\r?\n\s*return False/,'never hidden without the pipe to MeguLit');
});

test('KiriKiri: the TJS script reports each sentence\'s boxes at its end; hidden only after real opacity-0 draws; the DLL forwards ToMe_CHARS',()=>{
 const s=read('native/krkrtext/script.inc'),c=read('native/krkrtext/KrkrText.cpp'),h=read('native/krkrtext/selftest/host.cpp');
 assert.ok(s.includes("rec.rs+=(rec.cn>0?';':'')+int(cx)+','+int(cy)+','+int(cw)+','+int(size);rec.cn++;"));assert.ok(s.includes("if(role=='line' && this.hideMsg()) rec.hc++;"),'hidden counted per character as drawn (engine-draw: never on the processCh path while the game draws the replacement)');
 assert.ok(s.includes("var h=(rec.role!='name' && rec.hc>=rec.cn)?1:0;"),'live 2026-11-14 Fata Morgana: glyphs drawn invisible stay so after the switch');
 assert.ok(s.includes("'ToMe_CHARS engine=krkr line='+rec.line+' hidden='+h"));
 assert.match(s,/if\(rec\.n>0\) \{this\.send\('end',rec,rec\.x0,rec\.x1\);[\s\S]{0,700}?try \{this\.chars\(rec\);\} catch\(e\) \{this\.charsErr=e\.message;\}\}/,'a failing record never breaks the end line (sent first, the record in its own try)');
 assert.ok(s.includes('global.TextRender.done=(global.__megulitTrHook incontextof null);'),'TextRender engines (Yuzusoft): class-level done hook reaches every instance');
 assert.ok(s.includes('var cs=(inst.getCharacters incontextof inst)(0,100000);'),'character boxes from TextRender.getCharacters');
 assert.ok(s.includes('if(T.opacity!=0) T.opacity=0;'),'hidden = the text-only layer at opacity 0');
 assert.ok(s.includes('if(this.trT.opacity==0) this.trT.opacity=this.trOp;'),'the game\'s own opacity comes back when MeguLit stops asking');
 assert.match(c,/wcsncmp\(text, L"ToMe_CHARS ", 11\) == 0 && len < 28000/);
 assert.match(h,/text architecture 3 char records/);
});

test('web: Chromium shells only, switches only, page script hides by one style rule and measures with getClientRects',()=>{
 const dir=tmp();const exe=path.join(dir,'Game.exe');fs.writeFileSync(exe,'');
 assert.equal(W.chromiumShell(exe),null);fs.writeFileSync(path.join(dir,'icudtl.dat'),'');assert.equal(W.chromiumShell(exe),null);
 fs.writeFileSync(path.join(dir,'nw.dll'),'');assert.equal(W.chromiumShell(exe),'nwjs');fs.rmSync(path.join(dir,'nw.dll'));
 fs.mkdirSync(path.join(dir,'resources'));fs.writeFileSync(path.join(dir,'resources','app.asar'),'');assert.equal(W.chromiumShell(exe),'electron');
 fs.rmSync(dir,{recursive:true,force:true});
 assert.deepEqual(W.launchArgs(9333),['--remote-debugging-port=9333','--remote-debugging-address=127.0.0.1','--remote-allow-origins=http://127.0.0.1:9333']);
 const p=W.PAGE_SCRIPT;new Function(p);
 for(const k of ['.message_inner','[data-content="dialog"]','[class*="TextBox_main"]'])assert.ok(p.includes(k),k);
 assert.match(p,/color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important/);
 assert.match(p,/r\.getClientRects\(\)/);assert.match(p,/devicePixelRatio/);assert.match(p,/closest\('rt,rp,script,style,\.megulit-zh'\)/,'ruby (and MeguLit\'s own Chinese block) left out');
 assert.doesNotMatch(p,/localStorage|indexedDB|\.save\(|writeFile/,'never touches game storage');
});

test('web path end to end over a fake DevTools page: report -> ToMe_CHARS, canary armed on the first hidden record',async()=>{
 const dir=tmp(),exe=path.join(dir,'g.exe');fs.writeFileSync(exe,'x');const canary=new TP.Canary(dir,exe);const out=[];
 const w=new W.WebTextPath({port:1,onChars:l=>out.push(TP.parseChars(l)),canary});
 w.report(JSON.stringify({line:1,hidden:false,sw:1280,sh:720,rects:[[1,2,3,4]],text:'あ'}));
 w.report(JSON.stringify({line:1,hidden:true,sw:1280,sh:720,rects:[[1,2,3,4]],text:'あ'}));
 assert.deepEqual(out.map(r=>[r.engine,r.line,r.hidden,r.viewport]),[['web',1,false,[0,0,1280,720]],['web',1,true,[0,0,1280,720]]]);
 assert.ok(canary.read().armed.web);w.exited(0);assert.equal(canary.read().armed.web,undefined);
 fs.rmSync(dir,{recursive:true,force:true});
});

test('HookBridge and hook-native: char records reach the front end as hookCharRects; Ren\'Py gets the engine hide',()=>{
 const b=read('native/HookBridge.cs');
 assert.ok(b.includes('if(line.StartsWith("ToMe_CHARS ",StringComparison.Ordinal)){if(line.Length<=28000)Emit(new{type="hookChars",line=line});continue;}'));
 assert.ok(b.includes('if(tag=="KRKR"||tag=="RENPY")StartEngineHide(tag);'));
 assert.ok(b.includes('if(!TextPathCanary.Allowed(path)){Diagnostic(path+" invisible drawing off for this game (crash canary): "'));
 assert.ok(b.includes('if(want)TextPathCanary.Arm(path);'));
 assert.ok(b.includes('TextPathCanary.Exited(GameProcess.ExitCode)'));
 assert.ok(read('native/Build-HookBridge.ps1').includes("'TextPathCanary.cs'"));
 const {HookNative}=require('../core/hook-native.cjs');const events=[];
 const hook=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},m=>events.push(m),()=>{},()=>5);hook.trace=()=>{};
 hook.charRects('ToMe_CHARS engine=renpy line=3 hidden=1 sw=1280 sh=720 vx=0 vy=0 vw=0 vh=0 n=2 rects=1,2,3,4;5,6,7,8 text=台詞');
 hook.charRects('ToMe_CHARS engine=renpy line=3 hidden=1 sw=1280 sh=720 vx=0 vy=0 vw=0 vh=0 n=3 rects=1,2,3,4;5,6,7,8 text=台詞');
 hook.stop();
 const got=events.filter(e=>e.type==='hookCharRects');assert.equal(got.length,1,'malformed record dropped');assert.deepEqual([got[0].type,got[0].engine,got[0].hidden,got[0].text],['hookCharRects','renpy',true,'台詞']);
});

const U=require('../core/text-paths-unity.cjs');
function fakeUnity(dir,{bits=32,il2cpp=false,modded=false}={}){const exe=path.join(dir,'Game.exe');const b=Buffer.alloc(512);b.write('MZ');b.writeUInt32LE(0x80,0x3c);b.write('PE\0\0',0x80,'latin1');b.writeUInt16LE(bits===64?0x8664:0x14c,0x84);fs.writeFileSync(exe,b);
 fs.mkdirSync(path.join(dir,'Game_Data','Managed'),{recursive:true});fs.writeFileSync(path.join(dir,'Game_Data','Managed','Assembly-CSharp.dll'),'x');fs.writeFileSync(path.join(dir,'UnityPlayer.dll'),'up');fs.mkdirSync(path.join(dir,'MonoBleedingEdge'));
 if(il2cpp)fs.writeFileSync(path.join(dir,'GameAssembly.dll'),'g');if(modded)fs.writeFileSync(path.join(dir,'winhttp.dll'),'other mod');return exe;}
function fakePack(dir){for(const a of ['x86','x64']){fs.mkdirSync(path.join(dir,a,'BepInEx','core'),{recursive:true});fs.writeFileSync(path.join(dir,a,'winhttp.dll'),'doorstop '+a);fs.writeFileSync(path.join(dir,a,'doorstop_config.ini'),'[General]\nenabled = true\n');fs.writeFileSync(path.join(dir,a,'BepInEx','core','BepInEx.dll'),'b');}fs.writeFileSync(path.join(dir,'MeguLitUnityText.dll'),'plugin');return dir;}
const listAll=d=>fs.readdirSync(d,{recursive:true}).map(String).sort();
const unjunction=d=>{if(!fs.existsSync(d))return;for(const s of fs.readdirSync(d)){const p=path.join(d,s);for(const n of fs.readdirSync(p)){const q=path.join(p,n);if(fs.lstatSync(q).isSymbolicLink())fs.rmdirSync(q);}}};

test('Unity shadow: the game folder is mirrored (junctions + links), never written; doorstop, BepInEx, plugin, port and Steam id live in the shadow only',()=>{
 const base=tmp(),game=path.join(base,'game'),pack=fakePack(path.join(base,'pack'));fs.mkdirSync(game);const exe=fakeUnity(game);
 assert.equal(U.unityGame(exe),'mono');assert.equal(U.bits(exe),32);const before=listAll(game);
 const sh=U.makeShadow({exe,shadowRoot:path.join(base,'shadow'),pack,port:4321,steamAppId:'1776970'});
 assert.deepEqual(listAll(game),before,'game folder unchanged');
 assert.equal(sh.flavour,'x86');assert.ok(fs.lstatSync(path.join(sh.shadow,'Game_Data')).isSymbolicLink(),'data folder is a junction');
 assert.equal(fs.readFileSync(path.join(sh.shadow,'winhttp.dll'),'utf8'),'doorstop x86');
 assert.equal(fs.readFileSync(path.join(sh.shadow,'BepInEx','plugins','MeguLit','MeguLitUnityText.port'),'utf8'),'4321');
 assert.equal(fs.readFileSync(path.join(sh.shadow,'steam_appid.txt'),'utf8'),'1776970');
 assert.ok(fs.existsSync(path.join(sh.shadow,'Game_Data','Managed','Assembly-CSharp.dll')),'the real data through the junction');
 fs.writeFileSync(path.join(sh.shadow,'stale.txt'),'x');U.makeShadow({exe,shadowRoot:path.join(base,'shadow'),pack,port:4322});
 assert.equal(fs.existsSync(path.join(sh.shadow,'stale.txt')),false,'an entry the game no longer has goes');
 assert.deepEqual(listAll(game),before);assert.ok(fs.existsSync(path.join(game,'Game_Data','Managed','Assembly-CSharp.dll')),'nothing behind a junction deleted');
 const other=path.join(base,'il2cpp');fs.mkdirSync(other);assert.throws(()=>U.makeShadow({exe:fakeUnity(other,{il2cpp:true}),shadowRoot:path.join(base,'shadow'),pack,port:1}),/UNITY_PACK_MISSING il2cpp-x86/,'IL2CPP needs the il2cpp part of the pack');
 const mod=path.join(base,'mod');fs.mkdirSync(mod);assert.throws(()=>U.makeShadow({exe:fakeUnity(mod,{modded:true}),shadowRoot:path.join(base,'shadow'),pack,port:1}),/UNITY_ALREADY_MODDED/,'never mixed with someone else\'s mods');
 unjunction(path.join(base,'shadow'));fs.rmSync(base,{recursive:true,force:true});
});

test('Unity control socket: plugin records in, HIDE / WANT out; canary blocks hiding after a crash',async()=>{
 const dir=tmp(),exe=path.join(dir,'g.exe');fs.writeFileSync(exe,'x');const canary=new TP.Canary(dir,exe);const got=[];
 const u=new U.UnityTextPath({canary,onChars:l=>got.push(TP.parseChars(l))});const port=await u.listen();
 const net=require('node:net'),c=net.connect(port,'127.0.0.1');let fromHost='';c.setEncoding('utf8');c.on('data',d=>fromHost+=d);
 await new Promise(r=>c.once('connect',r));await new Promise(r=>setTimeout(r,50));u.want('一行目');u.hide(true);
 c.write('ToMe_UNITY status ok unity=2020.3\nToMe_CHARS engine=unity line=1 hidden=1 sw=1727 sh=971 vx=0 vy=0 vw=1727 vh=971 n=2 rects=364,62,32,33;397,62,32,33 text=前略\n');
 await new Promise(r=>setTimeout(r,150));
 assert.match(fromHost,/WANT 一行目\nHIDE 1\n/);assert.deepEqual(got.map(r=>[r.engine,r.hidden,r.text]),[['unity',true,'前略']]);assert.ok(canary.read().armed.unity);
 u.exited(-1073741819);assert.equal(canary.allowed('unity'),false);fromHost='';u.hide(true);await new Promise(r=>setTimeout(r,100));assert.match(fromHost,/HIDE 0/,'refused after a crash');
 c.destroy();u.stop();fs.rmSync(dir,{recursive:true,force:true});
 const cs=read('native/unitytext/MeguLitUnityText.cs');
 assert.match(cs,/\[BepInPlugin\("com\.megulit\.unitytext"/);assert.match(cs,/tmpAlpha\.SetValue\(c, a, null\)/);assert.ok(cs.includes('bool hidden = hidingCurrent && AllHidden(current);'),'hidden only if the renderers are still at alpha 0 at the end of the frame');
 assert.match(cs,/connected = false; hideAsked = false;/,'socket gone: drawn again');
 assert.doesNotMatch(cs,/PlayerPrefs\.|File\.Write|\.Save\(/,'never writes game data');
});

test('launch: off unless switched on; web gets switches, Unity a shadow program; the reader feeds hide and want',async()=>{
 const L=require('../core/text-paths-launch.cjs'),base=tmp();
 const web=path.join(base,'web');fs.mkdirSync(web);for(const f of ['Game.exe','icudtl.dat','nw.dll'])fs.writeFileSync(path.join(web,f),'');
 assert.equal(await L.prepare({root:base,exe:path.join(web,'Game.exe'),enabled:false}),null);
 const p=await L.prepare({root:base,exe:path.join(web,'Game.exe'),enabled:true,profile:{source:'steam',appid:'42'}});
 assert.equal(p.path,'web');assert.match(p.args[0],/^--remote-debugging-port=\d+$/);assert.equal(p.env.SteamAppId,'42');
 const hook={charRects(){},trace(){},attachTextPath(s){this.textPath=s;}};L.attach(p,hook);assert.equal(hook.textPath,p.session);
 assert.ok(require('../core/hook-native.cjs').HookNative.prototype.attachTextPath,'hook reader takes a text path');
 const src=read('core/hook-native.cjs');assert.ok(src.includes("send(v){if(v&&(v.type==='enable'||v.type==='disable'))try{this.textPath?.hide(v.type==='enable');}catch{}"));assert.ok(src.includes('try{this.textPath?.want(text);}catch{}'));
 const b=read('services/bridge.cjs');assert.ok(b.includes('enabled:prefs.ownTextOutput===true'));assert.ok(b.includes('const steam=steamApp&&!companion&&!textPath&&!steamDirect;'),'never a restart through Steam on this path');
 assert.ok(b.includes('textPath.session.exited(child.exit.code??-1)'),'exit code to the canary');
 assert.equal(require('../core/runtime-packs.cjs').MARKERS['unity-text'],'runtime/unity-text/MeguLitUnityText.dll');
 fs.rmSync(base,{recursive:true,force:true});
});

test('Unity IL2CPP: BepInEx 6 flavour from the pack, plugin hides through CanvasRenderers and leaves ruby out',()=>{
 const cs=read('native/unitytext/MeguLitUnityText.IL2CPP.cs');
 assert.match(cs,/\[BepInPlugin\("com\.megulit\.unitytext\.il2cpp"/);assert.match(cs,/: BasePlugin/);assert.match(cs,/AddComponent<MeguLitTextDriver>\(\)/);
 assert.ok(cs.includes('cr.SetAlpha(0f)'),'CanvasRenderer alpha: the game\'s own vertex-colour animation cannot undo it (live 魔法少女ノ魔女裁判)');
 assert.ok(cs.includes('ci.pointSize < body * 0.75f'),'ruby left out');
 assert.ok(read('native/unitytext/MeguLitUnityText.cs').includes('cr.SetAlpha(0f)'),'Mono plugin hides the same way');
 const u=read('core/text-paths-unity.cjs');assert.ok(u.includes("const flavour=kind==='il2cpp'?'il2cpp-'+arch:arch"));
 const p=read('tools/unity-text-pack.cjs');assert.match(p,/'il2cpp-x64':\{file:'BepInEx-Unity\.IL2CPP-win-x64-6\.0\.0-be\.793/);
 assert.ok(read('core/text-paths-launch.cjs').includes("il2cppReady=kind==='il2cpp'"));
});

test('dot font at the source: in-place outline swap (glyf and CFF), same sizes, file reads and memory, no disk writes',()=>{
 const h=read('native/fontdot/FontDotPatch.h'),c=read('native/fontdot/FontDot.cpp');
 assert.match(h,/int s = upem \/ 12;/,'dot side upem/12, clipped to the black box');
 assert.match(h,/head\.magicNumber/);assert.match(h,/t\[0\] = 'x'; r\.strikes\+\+;/,'embedded bitmap strikes switched off');
 assert.match(h,/static void Cff\(/,'CFF charstrings dotted too');assert.match(h,/tmp\[w\+\+\] = 14;/,'endchar');
 assert.doesNotMatch(h,/#include <windows\.h>/,'pure');
 assert.match(c,/MH_CreateHook\(target, \(void \*\)&HRead/,'ReadFile hook');assert.match(c,/MeguLitFontReady-%lu/,'tells MeguLitLaunch the hooks are in');
 assert.match(c,/m\.Type == MEM_PRIVATE/,'memory scan: writable private memory only');
 assert.doesNotMatch(c,/WriteFile\(own|GENERIC_WRITE, FILE_SHARE/,'never writes a game file');
 assert.match(c,/MEGULIT_FONTDOT_OFF/);
 for(const f of ['native/fontdot/selftest/patch.cpp','native/fontdot/selftest/check.py','native/fontdot/selftest/run.cmd','native/fontdot/build.cmd'])assert.ok(fs.existsSync(path.join(root,f)),f);
});

test('dot font in the normal launch: rides along MeguLitLaunch, crash canary, compositor heartbeat gate',()=>{
 const L=require('../core/text-paths-launch.cjs'),base=tmp();
 fs.mkdirSync(path.join(base,'native'));const exe=path.join(base,'Game.exe');fs.writeFileSync(exe,'MZ');
 const early={file:path.join(base,'native','MeguLitLaunch64.exe'),args:['x.dll',exe],env:{MEGULIT_GLYPH_MODE:'dot-blind'}};
 fs.writeFileSync(path.join(base,'native','MeguLitFontDot64.dll'),'x');process.env.MEGULIT_CAPTURE_COMPOSITOR='1';assert.equal(L.fontDot(base,exe,{...early,env:{}}),null,'the dot font is retired: never loaded without MEGULIT_FONTDOT_FORCE');fs.unlinkSync(path.join(base,'native','MeguLitFontDot64.dll'));
 process.env.MEGULIT_FONTDOT_FORCE='1';
 assert.equal(L.fontDot(base,exe,early),null,'no DLL: nothing');
 fs.writeFileSync(path.join(base,'native','MeguLitFontDot64.dll'),'x');
 const fd=L.fontDot(base,exe,early);assert.ok(fd);assert.equal(early.env.MEGULIT_LAUNCH_EXTRA,path.join(base,'native','MeguLitFontDot64.dll'));
 assert.ok(fd.canary.read().armed.fontdot,'armed at launch');
 /* the game vanishes at once (a kill looks the same): stays on; HookBridge records a real crash code */
 let alive=false;fd.watch(123,{alive:()=>alive,every:1,until:50});
 return new Promise(r=>setTimeout(r,30)).then(()=>{
  assert.equal(fd.canary.allowed('fontdot'),true);fd.canary.exited('fontdot',-1073741819);
  assert.equal(fd.canary.allowed('fontdot'),false);
  const e2={...early,env:{}};assert.equal(L.fontDot(base,exe,e2),null,'canary keeps it off');assert.equal(e2.env.MEGULIT_LAUNCH_EXTRA,undefined);
  const b=read('services/bridge.cjs');assert.ok(b.includes("const fontDot=early&&!textPath?require('../core/text-paths-launch.cjs').fontDot(root,game.executable,early,trace):null;"));
  assert.ok(b.includes('if(fontDot)fontDot.watch(state?.pid);'));
  const l=read('native/fontprobe/Launch.cpp');assert.match(l,/GetEnvironmentVariableW\(L"MEGULIT_LAUNCH_EXTRA"/,'launcher loads the extra DLLs while the game is suspended');
  const c=read('native/fontdot/FontDot.cpp');
  assert.ok(c.includes('MeguLitCompositorBeat-%lu'),'same heartbeat as the glyph dots');
  assert.match(c,/return now - LoadedAt <= 20000;/,'20 s grace before the compositor exists');
  assert.match(c,/memcpy\(f\.at, o->bytes\.data\(\), o->bytes\.size\(\)\)/,'original fonts back when the gate closes');
  assert.match(c,/if \(any && Live && /,'file reads served as they are when the gate is closed');
  assert.match(c,/needs-relaunch/);
  assert.ok(read('Release.ps1').includes("'native/MeguLitFontDot64.dll'"));
  assert.match(read('native/native-builds.json'),/"name":"fontdot"/);
  fs.rmSync(base,{recursive:true,force:true});
 });
});

test('Steam direct start for the early launcher: shadow of hard links + steam_appid.txt, game folder untouched',()=>{
 const L=require('../core/text-paths-launch.cjs'),base=tmp(),game=path.join(base,'steamapps','common','G');
 fs.mkdirSync(path.join(game,'data'),{recursive:true});fs.writeFileSync(path.join(game,'G.exe'),'MZ');fs.writeFileSync(path.join(game,'data','a.pfs'),'x');
 const shadows=path.join(base,'MeguLit-Shadow');
 assert.equal(L.steamDirect({exe:path.join(game,'G.exe'),appid:'x'}),null);
 const d=L.steamDirect({exe:path.join(game,'G.exe'),appid:'2258770',shadowRoot:shadows});
 assert.equal(d.exe,path.join(shadows,'G.exe-2','G.exe'));assert.equal(d.env.SteamAppId,'2258770');
 assert.equal(fs.readFileSync(path.join(d.cwd,'steam_appid.txt'),'utf8'),'2258770');assert.ok(fs.lstatSync(path.join(d.cwd,'data')).isSymbolicLink());
 assert.equal(fs.readFileSync(path.join(d.cwd,'data','a.pfs'),'utf8'),'x');assert.equal(fs.existsSync(path.join(game,'steam_appid.txt')),false,'game folder never written');
 fs.writeFileSync(path.join(game,'steam_appid.txt'),'2258770');const p=L.steamDirect({exe:path.join(game,'G.exe'),appid:'2258770',shadowRoot:shadows});assert.equal(p.shadow,null);assert.equal(p.exe,path.join(game,'G.exe'));
 const b=read('services/bridge.cjs');assert.ok(b.includes('const steam=steamApp&&!companion&&!textPath&&!steamDirect;'));assert.ok(b.includes('earlyStart(root,launchExe,'));
 fs.rmdirSync(path.join(shadows,'G.exe-2','data'));fs.rmSync(base,{recursive:true,force:true});
});

test('dot font under 日文环境: the LE early launcher carries it too, fallback clears the arm',()=>{
 const lc=read('core/locale-emulator.cjs');
 assert.ok(lc.includes("const fontDot=early?require('./text-paths-launch.cjs').fontDot(this.root,launchExe,early,trace):null;"));
 assert.ok(lc.includes('if(fontDot)fontDot.watch(result.pid);'));assert.ok(lc.includes("if(fontDot)fontDot.canary.exited('fontdot',0);"));
});

test('engine-draw fields: role / id / box / sel / emb round trip, UI items may come as a box alone, lines stay strict',()=>{
 const ui=TP.formatChars({engine:'rpgm',line:4,hidden:false,sw:816,sh:624,rects:[],text:'はい',role:'choice',id:'w2:0',box:[10,20,200,36],sel:true});
 assert.equal(ui,'ToMe_CHARS engine=rpgm line=4 hidden=0 sw=816 sh=624 vx=0 vy=0 vw=0 vh=0 n=0 rects= role=choice id=w2:0 box=10,20,200,36 sel=1 text=はい');
 const r=TP.parseChars(ui);
 assert.deepEqual([r.role,r.id,r.box,r.sel,r.rects.length,r.text],['choice','w2:0',[10,20,200,36],true,0,'はい']);
 assert.equal(TP.parseChars(ui.replace(' role=choice','')),null,'a line needs one rect per character');
 assert.equal(TP.parseChars(ui.replace('role=choice','role=other')),null,'known roles only');
 const ln=TP.formatChars({engine:'krkr',line:5,hidden:false,sw:1280,sh:720,rects:[[1,2,3,4]],text:'あ',read:true,emb:2,role:'line'});
 assert.equal(ln,'ToMe_CHARS engine=krkr line=5 hidden=0 sw=1280 sh=720 vx=0 vy=0 vw=0 vh=0 n=1 rects=1,2,3,4 read=1 emb=2 text=あ','role=line is the default and is left out');
 const p=TP.parseChars(ln);assert.equal(p.emb,2);assert.equal(p.role,undefined);
 const old='ToMe_CHARS engine=krkr line=7 hidden=1 sw=1280 sh=720 vx=0 vy=0 vw=0 vh=0 n=1 rects=1,2,3,4 color=ffffff read=0 text=あ';
 assert.deepEqual(Object.keys(TP.parseChars(old)).sort(),['color','engine','hidden','line','read','rects','sh','sw','text','type','viewport'],'old records parse as before');
});
