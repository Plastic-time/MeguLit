'use strict';
/* 2026-11-19 (user: "alt+t开关会开关文本框的bug给我修好了 这个bug修了20多次了还没解决"). The invariant, not one more symptom:
   pressing Alt+T, losing or regaining focus, previewing settings in the menu must leave three things exactly as they were,
   with no flip in between: whether the subtitles show (Immersion.visible), whether the game's own text is replaced (hook
   route), and what the bridge was told about both. Only facts may change them: the engine's own signal, a new line, the
   player's keys and switches. Anything read off the screen (wait marker, text-window / scene / box probes) is an inference
   and is refused while the context is frozen (menu open, game not in front, settling after the return).
   Recorded scene: validation/helpers/altt-replay/senren-1119-reader-host.jsonl (千恋＊万花, test copy of main 21e9cb0f, 14:54-15:00 local).
   MEGULIT_TEST_IMMERSION=<path to an older core/immersion.cjs> runs the same tests against that code. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Immersion,FACT,SETTLE=0}=require(process.env.MEGULIT_TEST_IMMERSION||'../core/immersion.cjs');
const {Reader}=require('../services/reader.cjs');
const {GalNative}=require('../core/gal-native.cjs');

function rng(seed){let s=seed>>>0;return()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function host(config={immersion:true,dialogDetection:'marker'}){
 let now=100000;
 const visibility=[],native=[],routes=[];
 const immersion=new Immersion(m=>{if(Object.prototype.hasOwnProperty.call(m,'dialogVisible'))visibility.push({at:now,...m});},()=>now);
 immersion.configure(config);immersion.bind('game|1|1');
 const gal={preferences:{hookProfile:'embed',hookHide:true,hookAutoStart:true,hookFast:true,bindEnabled:true,gameProcess:'fixture',x:10,y:25,width:90},state:{bound:true,coverEnabled:true},previewPreferences:null,
  hooks:{configure:p=>routes.push(p.hookProfile),advance(){}},styleSync:{configure(){}},compositor:{configure(){}},placement:{configure(){}},send:m=>native.push({at:now,...m})};
 gal.hookPrefs=GalNative.prototype.hookPrefs.bind(gal);gal.preview=GalNative.prototype.preview.bind(gal);gal.endPreview=GalNative.prototype.endPreview.bind(gal);
 const reader=Object.assign(Object.create(Reader.prototype),{immersion,gal,root:path.join(__dirname,'no-such-root'),runtime:{config:()=>config,services:()=>({gameEvent:async()=>{}}),emit(){}}});
 const h={reader,immersion,visibility,native,routes,gal,
  now:()=>now,
  /* time passes with the 100 ms tick the reader service runs */
  advance(ms){const end=now+ms;while(now<end){now=Math.min(end,now+100);immersion.tick();}},
  event(m){reader.event(m);},message:m=>reader.message(m),
  snapshot(){return{line:immersion.currentText,visible:immersion.visible,route:gal.preferences.hookProfile,preview:gal.previewPreferences,flips:visibility.length,routesAllEmbed:routes.every(r=>r==='embed'),cover:native.filter(m=>m.type==='cover'||m.type==='dialogVisibility').length};}};
 return h;
}
/* what a screen probe may report at any moment: all of it is inference. Hides only for the box / scene probes: a
   "shown again" of those is kept for the thaw by design and is tested on its own below. */
const NOISE=[
 h=>h.event({type:'markerPresence',present:true}),h=>h.event({type:'markerPresence',present:false}),h=>h.event({type:'waitMarkerDrawn'}),
 h=>h.event({type:'dialogScene',visible:false,box:true,reason:'text window hidden: box 53%, picture 8%'}),
 h=>h.event({type:'dialogScene',visible:false,reason:'changed 98%'}),
 h=>h.event({type:'dialogAuto',visible:false}),h=>h.event({type:'dialogAuto',visible:true}),
 h=>h.event({type:'dialogEvidence',visible:false}),
 h=>h.event({type:'readerInput',complete:true,skipHeld:false}),
 /* the hook's "left the dialogue screen" verdict (silent stream + menu labels): an empty line of origin leave */
 h=>h.immersion.source('','krkr','leave'),
];
const noise=(h,r,n)=>{for(let i=0;i<n;i++){NOISE[Math.floor(r()*NOISE.length)](h);if(r()<0.5)h.advance(Math.floor(r()*120));}};
/* the probes read the half-drawn frame right after the return: noise until just before the settle time is over */
const settling=(h,r)=>{const end=h.now()+Math.max(0,SETTLE-60);while(h.now()<end){NOISE[Math.floor(r()*NOISE.length)](h);h.advance(Math.min(20+Math.floor(r()*120),end-h.now()));}};
/* one Alt+T round as the app does it: menu message, the bridge's context report (sometimes late, sometimes missing: an
   older bridge), previews while it is open, the end of the preview, the close, the context back */
async function menuRound(h,r){
 await h.message({type:'galMenu',open:true});
 if(r()<0.85){h.advance(Math.floor(r()*60));h.event({type:'readerContext',active:false});}
 const steps=1+Math.floor(r()*4);
 for(let i=0;i<steps;i++){
  noise(h,r,Math.floor(r()*4));
  if(r()<0.6)await h.message({type:'galPreview',settings:{...h.gal.preferences,hookProfile:r()<0.5?'read':'embed',x:Math.floor(r()*80)}});
  h.advance(Math.floor(r()*4000));
 }
 await h.message({type:'galPreviewEnd'});
 await h.message({type:'galMenu',open:false});
 /* keyboard handed back: layer -> nothing -> game; the bridge re-reports the context around it */
 if(r()<0.5){h.event({type:'readerContext',active:false});h.advance(Math.floor(r()*80));}
 noise(h,r,Math.floor(r()*3));
 h.event({type:'readerContext',active:true});
 settling(h,r);
}
function focusRound(h,r){
 h.event({type:'readerContext',active:false});noise(h,r,Math.floor(r()*5));h.advance(Math.floor(r()*15000));noise(h,r,Math.floor(r()*5));
 h.event({type:'readerContext',active:true});
 settling(h,r);
}
const START={
 'a line on screen':h=>{h.immersion.source('同じ台詞を読み続けている','krkr');h.advance(900);h.event({type:'readerContext',active:true});h.advance(2000);h.event({type:'markerPresence',present:true});h.advance(600);},
 'a line the player clicked up, marker seen':h=>{h.event({type:'readerContext',active:true});h.advance(2000);h.event({type:'readerInput',complete:true,skipHeld:false});h.immersion.source('クリックで出した台詞','krkr');h.advance(900);h.event({type:'markerPresence',present:true});h.advance(600);},
 'hidden by the engine':h=>{h.immersion.source('エンジンが隠した台詞','cs2');h.event({type:'readerContext',active:true});h.advance(2000);h.event({type:'hookDialog',visible:false,engine:'cs2'});h.advance(900);assert.equal(h.immersion.visible,false);},
 'hidden with the scene':h=>{h.immersion.source('場面が変わった台詞','krkr');h.event({type:'readerContext',active:true});h.advance(2000);h.event({type:'dialogScene',visible:false,reason:'changed 98%'});h.advance(300);assert.equal(h.immersion.visible,false);},
 'immersion off':h=>{h.immersion.configure({immersion:false,dialogDetection:'marker'});h.immersion.source('没入オフの台詞','krkr');h.event({type:'readerContext',active:true});h.advance(2000);},
};

for(const [name,start] of Object.entries(START))test(`property: Alt+T / focus / preview in any order change nothing, with no flip in between (${name})`,async()=>{
 for(let seed=1;seed<=60;seed++){
  const r=rng(seed*7919+name.length),h=host();start(h);
  const before=h.snapshot(),rounds=3+Math.floor(r()*8);
  for(let i=0;i<rounds;i++){
   if(r()<0.7)await menuRound(h,r);else focusRound(h,r);
   const mid=h.snapshot();
   assert.deepEqual({visible:mid.visible,route:mid.route,preview:mid.preview,flips:mid.flips,cover:mid.cover},{visible:before.visible,route:before.route,preview:null,flips:before.flips,cover:before.cover},`seed ${seed} round ${i+1}: ${JSON.stringify(h.visibility.slice(before.flips))}`);
  }
  /* long after the last round, still nothing: no stale evidence expires later */
  h.advance(SETTLE+200);h.advance(20000);
  const after=h.snapshot();
  assert.equal(after.visible,before.visible,`seed ${seed}: late change ${JSON.stringify(h.visibility.slice(before.flips))}`);
  assert.equal(after.flips,before.flips,`seed ${seed}: late flip ${JSON.stringify(h.visibility.slice(before.flips))}`);
  assert.equal(after.routesAllEmbed,true,`seed ${seed}: the hook route left embed`);
  assert.equal(h.native.filter(m=>m.type==='menu'&&m.open).length,h.native.filter(m=>m.type==='menu'&&!m.open).length);
 }
});

test('facts still decide while the menu is open or the game is not in front',()=>{
 const h=host();START['a line on screen'](h);
 h.event({type:'readerContext',active:false});
 h.event({type:'hookDialog',visible:false,engine:'cs2'});h.advance(700);
 assert.equal(h.immersion.visible,false,'the engine hid its text window');
 h.immersion.source('次の台詞','cs2');h.event({type:'hookDialog',visible:true,engine:'cs2'});h.advance(900);
 assert.equal(h.immersion.visible,true,'a new line with the engine showing it');
 h.immersion.choices(true);assert.equal(h.immersion.visible,true);
});

test('after the game is back and settled the probes work as before',()=>{
 const h=host();START['a line on screen'](h);
 h.event({type:'readerContext',active:false});h.advance(3000);h.event({type:'readerContext',active:true});h.advance(SETTLE+200);
 h.event({type:'dialogScene',visible:false,box:true,reason:'text window hidden'});
 assert.equal(h.immersion.visible,false,'the player hid the text window');
 h.event({type:'dialogScene',visible:true,box:true,reason:'text window back'});
 assert.equal(h.immersion.visible,true);
 h.event({type:'markerPresence',present:true});h.advance(500);
 h.event({type:'readerInput',complete:true,skipHeld:false});h.event({type:'markerPresence',present:false});h.advance(700);
 assert.equal(h.immersion.visible,false,'marker gone after an advance click');
 assert.equal(h.visibility.at(-1).reason,'marker');
});

test('a text window that came back while frozen is shown at the thaw, a hide read while frozen is dropped for good',()=>{
 const h=host();START['a line on screen'](h);
 h.event({type:'dialogScene',visible:false,box:true,reason:'text window hidden'});assert.equal(h.immersion.visible,false);
 h.event({type:'readerContext',active:false});
 h.event({type:'dialogScene',visible:true,box:true,reason:'text window back'});
 assert.equal(h.immersion.visible,false,'nothing moves while frozen');
 h.event({type:'readerContext',active:true});h.advance(SETTLE+200);
 assert.equal(h.immersion.visible,true,'the kept "shown again" is applied once settled');
 h.event({type:'readerContext',active:false});h.event({type:'dialogScene',visible:false,box:true,reason:'half-drawn frame'});
 h.event({type:'readerContext',active:true});h.advance(SETTLE+20000);
 assert.equal(h.immersion.visible,true);
});

/* 2026-11-19 16:17 (user, on the build with the Alt+T fix: "一切屏回来就啥都没了"). Leaving for another window and coming back, in
   any state: what a fact decided is the same before and after, with no flip in between; a hide that rested only on a lost
   wait marker ends with the return, because its evidence is thrown away when the context freezes and nothing else could
   lift it before the next line. */
for(const [name,start] of Object.entries(START))test(`property: focus away and back, any number of times, with probe noise, changes nothing (${name})`,async()=>{
 for(let seed=1;seed<=60;seed++){
  const r=rng(seed*104729+name.length),h=host();start(h);const before=h.snapshot(),rounds=2+Math.floor(r()*8);
  for(let i=0;i<rounds;i++){
   focusRound(h,r);if(r()<0.3)h.event({type:'readerContext',active:false}),h.advance(Math.floor(r()*300)),h.event({type:'readerContext',active:true}),settling(h,r);
   const mid=h.snapshot();assert.deepEqual([mid.line,mid.visible,mid.flips,mid.route,mid.cover],[before.line,before.visible,before.flips,before.route,before.cover],`seed ${seed} round ${i+1}: ${JSON.stringify(h.visibility.slice(before.flips))}`);
  }
  h.advance(SETTLE+200);h.advance(20000);const after=h.snapshot();
  assert.deepEqual([after.line,after.visible,after.flips],[before.line,before.visible,before.flips],`seed ${seed}: late change ${JSON.stringify(h.visibility.slice(before.flips))}`);
 }
});
const markerHidden=h=>{START['a line on screen'](h);h.event({type:'readerInput',complete:true,skipHeld:false});h.event({type:'markerPresence',present:false});h.advance(900);assert.equal(h.immersion.visible,false);assert.equal(h.visibility.at(-1).reason,'marker');};
test('recorded 07:17:09Z: a line hidden by a lost wait marker is back once the player returns, whatever the probes report meanwhile',()=>{
 for(let seed=1;seed<=60;seed++){
  const r=rng(seed*31337),h=host();markerHidden(h);const flips=h.visibility.length;
  h.event({type:'readerContext',active:false});noise(h,r,Math.floor(r()*5));h.advance(1000+Math.floor(r()*15000));
  assert.equal(h.immersion.visible,false,'nothing moves while away');assert.equal(h.visibility.length,flips);
  h.event({type:'readerContext',active:true});settling(h,r);h.advance(200);
  assert.equal(h.immersion.visible,true,`seed ${seed}: the current line is shown again after the return`);
  assert.equal(h.visibility.length,flips+1,`seed ${seed}: exactly one change, the return: ${JSON.stringify(h.visibility.slice(flips))}`);
  h.advance(20000);assert.equal(h.immersion.visible,true,`seed ${seed}: and stays`);
 }
});
test('a return lifts nothing a fact or a stronger probe asked for: engine, scene, text window, skip held',()=>{
 for(const hide of [h=>{h.event({type:'hookDialog',visible:false,engine:'cs2'});h.advance(900);},h=>h.event({type:'dialogScene',visible:false,reason:'changed 98%'}),h=>h.event({type:'dialogScene',visible:false,box:true,reason:'text window hidden'})]){
  const h=host();START['a line on screen'](h);hide(h);assert.equal(h.immersion.visible,false);const flips=h.visibility.length;
  h.event({type:'readerContext',active:false});h.advance(5000);h.event({type:'readerContext',active:true});h.advance(SETTLE+20000);
  assert.equal(h.immersion.visible,false);assert.equal(h.visibility.length,flips);
 }
});
/* 2026-11-19 16:57 (user: "切屏回来还是直接消失 必须推进一两句才出来"). hook log at that moment: "left dialogue screen: stream silent
   111s, labels=[...]" — three tooltips the pointer crossed on the way back, and the reader's current line was cleared. */
test('the "left the dialogue screen" verdict is frozen with the context: nothing collected or decided while away or settling, E530 still works in front',()=>{
 const {HookNative}=require('../core/hook-native.cjs');let now=1000,frozen=false;const out=[];
 const h=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},m=>out.push(m),()=>{},()=>now);h.trace=()=>{};h.send=()=>{};h.contextFrozen=()=>frozen;
 const sel={id:'a',selected:true,sample:'「同じ台詞を読み続けている」'},threads=list=>{h.state.hookThreads=list;return h.leaveCheck();},cleared=()=>out.some(m=>m.hookSource===''&&m.hookSourceOrigin==='leave');
 h.lastSource='「同じ台詞を読み続けている」';h.lastSourceAt=1000;threads([sel,{id:'b',sample:''}]);
 /* reading for 111 s, then away; on the way back the pointer crosses three buttons while the context is still frozen */
 now+=111000;frozen=true;
 assert.equal(threads([sel,{id:'b',sample:'读档界面'}]),false);assert.equal(threads([sel,{id:'b',sample:'快读速档'}]),false);assert.equal(threads([sel,{id:'b',sample:'保存界面'},{id:'c',sample:'自定义'}]),false);
 assert.equal(cleared(),false,'frozen: the line stays');assert.equal(h.lastSource,'「同じ台詞を読み続けている」');
 /* thawed: what was seen while frozen does not count afterwards */
 frozen=false;now+=600;assert.equal(threads([sel,{id:'b',sample:'保存界面'},{id:'c',sample:'自定义'}]),false);assert.equal(cleared(),false,'labels from the frozen time were dropped');
 /* in front and settled the game really goes to its menu: three new labels clear the reader as before */
 now+=1000;threads([sel,{id:'b',sample:'New Game'}]);threads([sel,{id:'b',sample:'Load Game'}]);assert.equal(threads([sel,{id:'b',sample:'Settings'},{id:'c',sample:'Extras'}]),true);assert.equal(cleared(),true);
 const reader=fs.readFileSync(path.join(__dirname,'..','services','reader.cjs'),'utf8');
 assert.match(reader,/this\.gal\.hooks\.contextFrozen=\(\)=>this\.immersion\?\.frozen\?\.\(\)===true/);
 assert.match(reader,/this\.immersion\.source\(message\.hookSource,message\.hookSourceEngine,message\.hookSourceOrigin\)/);
});
test('an empty line of origin leave is an inference for the arbiter; a real empty hook line stays a fact',()=>{
 const h=host();START['a line on screen'](h);h.event({type:'readerContext',active:false});
 h.immersion.source('','krkr','leave');h.advance(2000);assert.equal(h.immersion.visible,true,'refused while frozen');
 h.immersion.source('','krkr');h.advance(600);assert.equal(h.immersion.visible,false,'the hook itself said the text is gone');
});
test('switching to another application keeps the layer visible in the game z-order and freezes mask sampling',()=>{
 const s=fs.readFileSync(path.join(__dirname,'..','native','GalWindowBridge.cs'),'utf8'),p=fs.readFileSync(path.join(__dirname,'..','native','ReaderLayerPolicy.cs'),'utf8');
 assert.match(s,/if\(!alive\|\|iconic\)\{\s*if\(IsShown\|\|IsWindowVisible\(Overlay\)\)ShowWindow\(Overlay,0\);\s*IsShown=false;DropLayers\(\);return;/);
 assert.match(s,/if\(IsShown&&TopmostGuard\.Sink\(Overlay,GetAncestor\(Target,2\)\)\)/);
 assert.match(s,/if\(contextActive&&TextMask!=null\)TextMask\.Tick/);
 assert.match(p,/if\(foreign\.Float\|\|!foreign\.Context\)/);
});
test('the bridge looks at the order after every raise and has a way out when topmost is not taken',()=>{
 const s=fs.readFileSync(path.join(__dirname,'..','native','GalWindowBridge.cs'),'utf8'),p=fs.readFileSync(path.join(__dirname,'..','native','ReaderLayerPolicy.cs'),'utf8');
 assert.match(s,/string how=ReaderLayerPolicy\.Raise\(new LayerZ\(gameRoot,gameTop\),front\);/);
 assert.match(s,/type="layerRaise",how=how,above=aboveGame,topmost=topmost/);
 assert.doesNotMatch(s,/SetWindowPos\(Overlay,Layer\.Float\?new IntPtr\(-1\):IntPtr\.Zero,0,0,0,0,0x0001\|0x0002\|0x0010\);\s*Emit\(new\{type="coverDebug"/,'a raise that asks and never looks');
 assert.match(p,/if\(!z\.BelowGame\(\)\)return z\.Topmost\(\)\?"topmost":"above-game";\s*z\.PlaceAboveGame\(\);/);
 assert.match(p,/the old raise does not fail on the recorded case/);
});
test('a source nobody listed is an inference: a detector added later cannot hide under the menu',{skip:!FACT},()=>{
 const h=host();START['a line on screen'](h);
 assert.equal(FACT.has('some-new-detector'),false);
 h.event({type:'readerContext',active:false});
 assert.equal(h.immersion.set(false,'new probe','some-new-detector'),false);
 assert.equal(h.immersion.set(false,'no source at all'),false);
 assert.equal(h.immersion.visible,true);
 const s=fs.readFileSync(path.join(__dirname,'..','core','immersion.cjs'),'utf8');
 const calls=s.match(/this\.set\([^)]*\)/g)||[];
 assert.ok(calls.length>=15);
 for(const c of calls)assert.match(c,/^this\.set\([^,]+,[^,]+,[^)]+\)$/,`${c}: every visibility change names its source`);
});

test('recorded scene 2026-11-19 14:54-15:00: replayed context and probe events never flip the subtitles inside a freeze window',()=>{
 const rows=fs.readFileSync(path.join(__dirname,'helpers','altt-replay','senren-1119-reader-host.jsonl'),'utf8').split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l));
 assert.ok(rows.length>40);
 const h=host({immersion:true,dialogDetection:'marker'}),t0=Date.parse(rows[0].at);let line=0;
 h.immersion.source('録画の最初の台詞','krkr');
 const frozen=[];let closedAt=null;
 for(const row of rows){
  const at=100000+Date.parse(row.at)-t0;if(at>h.now())h.advance(at-h.now());
  if(row.type==='readerContext'){h.event({type:'readerContext',active:row.active});if(!row.active)closedAt=h.now();else{frozen.push([closedAt??h.now(),h.now()+SETTLE]);closedAt=null;}}
  else if(row.type==='dialogScene')h.event(row);
  else if(row.type==='line'){h.event({type:'readerInput',complete:true,skipHeld:false});h.event({type:'markerPresence',present:false});h.immersion.source('録画の台詞 '+(++line),'krkr');h.event({type:'markerPresence',present:true});}
 }
 h.advance(5000);
 const menuCloses=rows.filter(r=>r.type==='coverDebug'&&/阅读层已移到前台游戏上方/.test(r.text)).length;
 assert.ok(menuCloses>=4,'the fixture holds the menu closes of the recording');
 for(const flip of h.visibility)assert.ok(!frozen.some(([a,b])=>flip.at>=a&&flip.at<b),`flip inside a freeze window: ${JSON.stringify(flip)}`);
});

const bridge=name=>[path.join(__dirname,'..','native',name),process.env.MEGULIT_TEST_NATIVE_DIR&&path.join(process.env.MEGULIT_TEST_NATIVE_DIR,name)].filter(Boolean).find(p=>fs.existsSync(p));
test('compiled bridge: the recorded menu close and random hand-overs never sink or hide the layer (when GalWindowBridge.exe is built)',{skip:process.platform!=='win32'||!bridge('GalWindowBridge.exe')},()=>{
 const r=require('node:child_process').spawnSync(bridge('GalWindowBridge.exe'),['--layer-policy-self-test'],{encoding:'utf8',windowsHide:true,timeout:20000});
 assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/"passed":true/);
});
test('compiled hook bridge: a menu or focus hand-over never gives the text back to the game (when HookBridge.exe is built)',{skip:process.platform!=='win32'||!bridge('HookBridge.exe')},()=>{
 const r=require('node:child_process').spawnSync(bridge('HookBridge.exe'),['--overlay-gate-self-test'],{encoding:'utf8',windowsHide:true,timeout:60000});
 assert.ifError(r.error);assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/PASS overlay gate/);
});
test('the tick decides the layer once: no second reading of the foreground decides float, sink or shown',()=>{
 const s=fs.readFileSync(path.join(__dirname,'..','native','GalWindowBridge.cs'),'utf8');
 assert.match(s,/Layer=DecideLayer\(\);/);
 assert.match(s,/LayersMayFloat=Layer\.Float;/);
 assert.match(s,/ReadingVisible\(Layer\.Context,/);
 assert.doesNotMatch(s,/if\(!foregroundGame&&!menuPinned&&\(GetWindowLong\(Overlay,-20\)&8\)!=0\)/,'the tick sank the layer while its own menu held the keyboard');
 assert.doesNotMatch(s,/GetAncestor\(GetForegroundWindow\(\),3\)==gameRoot\?new IntPtr\(-1\)/,'KeepAboveGame chose the band from its own reading of the foreground');
 const hook=fs.readFileSync(path.join(__dirname,'..','native','HookBridge.cs'),'utf8');
 assert.match(hook,/OverlayGate\.Track\(over,ref ok,ref bad,seen\)/);assert.match(hook,/LostSamples=8/);
 for(const f of ['native/Build-GalWindowBridge.ps1','tools/build-reader-bridge.ps1','native/native-builds.json'])assert.ok(fs.readFileSync(path.join(__dirname,'..',f),'utf8').includes('ReaderLayerPolicy.cs'),f);
});
