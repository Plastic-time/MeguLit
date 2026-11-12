// E477 (player, small ~470x350 game window): MeguLit's embedded text came out desktop-sized and re-fit did nothing;
// embed replacement never hid the original of a newly added game.
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const {HookControl}=require('../core/hook-control.cjs');

for(const file of ['web/reader/modules/game-style.js','core/game-style.js']){
 const style=require('../'+file);
 const settings=style.clean({japaneseSize:34,translationSize:30,width:92,autoScale:true});
 const small={clientWidth:470,clientHeight:350,readerWidth:430};

 test(file+': scale follows the game client even while the Alt+T menu is open',()=>{
  const open=style.gameScaleFor({settings,layout:small,bound:true,dpr:1,innerWidth:1920,dialogOpen:true,previous:1});
  assert.ok(open<.4,'menu open must not keep the desktop scale 1, got '+open);
  assert.equal(open,style.gameScaleFor({settings,layout:small,bound:true,dpr:1,innerWidth:1920,dialogOpen:false,previous:1}));
  assert.ok(settings.japaneseSize*open<14,'Japanese line ~13 px in a 470 px client');
 });

 test(file+': re-fit after calibration recomputes from the measured size',()=>{
  const calibrated=style.clean({...settings,japaneseSize:39});
  const a=style.gameScaleFor({settings,layout:small,bound:true,dpr:1,innerWidth:1920,dialogOpen:true,previous:1});
  const b=style.gameScaleFor({settings:calibrated,layout:small,bound:true,dpr:1,innerWidth:1920,dialogOpen:true,previous:a});
  assert.ok(Math.abs(calibrated.japaneseSize*b-39*470/1280)<.01);
 });

 test(file+': automatic sizes are capped by the client height; a hand-set size is not',()=>{
  const big=style.clean({...settings,japaneseSize:60,translationSize:60});
  const s=style.gameScaleFor({settings:big,layout:{clientWidth:1280,clientHeight:300},bound:true,dpr:1,innerWidth:1920,dialogOpen:false,previous:1});
  assert.ok(60*s<=300*.06+1e-9);
  const user=style.clean({...big,sizeSource:'user'});
  assert.ok(Math.abs(style.gameScaleFor({settings:user,layout:{clientWidth:1280,clientHeight:300},bound:true,dpr:1,innerWidth:1920,dialogOpen:false,previous:1})-1)<1e-9);
 });

 test(file+': DPI and unchanged fullscreen defaults',()=>{
  const full=style.gameScaleFor({settings,layout:{clientWidth:1920,clientHeight:1080},bound:true,dpr:1,innerWidth:1920,dialogOpen:false,previous:1});
  assert.equal(full,1.5);
  const hi=style.gameScaleFor({settings,layout:{clientWidth:1920,clientHeight:1080},bound:true,dpr:1.5,innerWidth:1280,dialogOpen:false,previous:1});
  assert.ok(Math.abs(hi-1)<1e-9);
  assert.equal(style.gameScaleFor({settings,layout:null,bound:true,dpr:1,innerWidth:1920,dialogOpen:true,previous:.4}),.4,'no client yet and menu open: keep the last scale');
 });
}

test('gal.js scales with gameScaleFor, not a dialog-frozen viewport width',()=>{
 const gal=read('web/reader/modules/gal.js');
 assert.match(gal,/gameScale = appearance\.gameScaleFor\(/);
 assert.doesNotMatch(gal,/if \(!document\.querySelector\('\.tomoyo-cn-dialog\[open\]'\)\) gameScale/);
});

function host(){const sent=[],conf=[];return {sent,conf,preferences:{hookHide:true,hookProfile:'embed',autoGameStyle:false,hookFast:false},state:{gameProcessId:7,gameStarted:'t',bound:true},
 hooks:{state:{hookThreads:[{id:'e',name:'EmbedX',selected:true,embeddable:true,sample:'「こんにちは」'}]},preflight:false,configure(){conf.push(this.preflight);}},notify:m=>sent.push(m),send:()=>{},save(p){this.preferences=p;}};}

test('failed screen checks still promote an embeddable stream after two lines',()=>{
 const h=host(),c=new HookControl(h,()=>0);c.start('embed');assert.equal(h.hooks.preflight,true);
 for(const seq of [1,2]){c.source('「こんにちは、世界」');assert.equal(c.seq,seq);c.visual({sequence:seq,stage:'baseline',valid:false,error:'capture failed'});}
 assert.equal(h.hooks.preflight,false);assert.equal(c.stage,'switching');assert.equal(h.sent.at(-1).hookCheckState,'switching');
});

test('one line counts once, and a non-embeddable stream is never promoted',()=>{
 const h=host(),c=new HookControl(h,()=>0);c.start('embed');c.source('「こんにちは、世界」');
 c.visual({sequence:1,stage:'baseline',valid:true,matched:false,sample:2,sourceCharacters:9});c.visual({sequence:1,stage:'baseline',valid:false});
 assert.equal(h.hooks.preflight,true,'two reports of one line are one miss');
 const r=host();r.hooks.state.hookThreads[0].embeddable=false;const d=new HookControl(r,()=>0);d.plan='embed';d.running=true;r.hooks.preflight=true;d.stage='baseline';
 for(const seq of [1,2]){d.seq=seq;d.visual({sequence:seq,stage:'baseline',valid:false});}
 assert.equal(r.hooks.preflight,true);
});

test('learned-unsafe streams are scoped to the game folder, with the self-test in the build',()=>{
 const policy=read('native/EmbedTextPolicy.cs'),bridge=read('native/HookBridge.cs');
 assert.match(policy,/public static string UnsafeKey\(string process, string exe, string name, int role\)/);
 assert.match(policy,/UnsafeKey\("SiglusEngine", @"D:\\Games\\A\\SiglusEngine\.exe", "EmbedSiglus", 1\) != UnsafeKey\("SiglusEngine", @"D:\\Games\\B/);
 assert.match(bridge,/EmbedTextPolicy\.UnsafeKey\(BoundProcess,UnsafeExe,name,role\)/);
});
