'use strict';
/* 2026-11-20 (user, a third-party game: after loading a save the text sat at the right edge of the screen, 「しばらく / 喪服の男 /
   遺族と礼」 one short row under the other; Alt+T put it back). Following the original text keeps the box width, so a line extent
   that starts far right (reported right after a load / scene jump / save-menu return) pushed every row past the game window.
   Such a place is dropped; every plausible place applies at once, with the width fitted to the window. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const gs=require('../core/game-style.js');
function load(layout,prefs={width:60}){
 const classes=new Set();
 const doc={readyState:'complete',addEventListener(){},querySelector:()=>null,body:{classList:{toggle:(c,on)=>{if(on)classes.add(c);else classes.delete(c);return on;},contains:c=>classes.has(c)}},
  documentElement:{style:{setProperty(){},removeProperty(){}}}};
 const p={textColor:'#ffffff',autoGameStyle:true,...prefs};
 const b={previewed:[],galPreferences:()=>p,galLayoutInfo:()=>layout,previewGalPosition:v=>b.previewed.push(v)};
 const ctx={window:{__tomoyoChinese:b,TomoyoGameStyle:gs,devicePixelRatio:1,__tomoyoTranslateRequest(){}},document:doc,getComputedStyle:()=>({getPropertyValue:()=>'',fontSize:'26px'}),Date,Math,Number,String,Map,JSON,Object};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../web/reader/modules/text-position.js'),'utf8'),ctx);return {api:ctx.window.__tomeTextPosition,b};}
/* ADV canvas lines (no calibration needed): 1280x720 canvas on a 1280x720 client */
let n=0;const line=(x0,y0)=>({type:'hookTextPos',engine:'krkr_adv_v1',line:++n,x0,y0,x1:x0+400,y1:y0,size:24,sw:1280,sh:720});

test('after a load, a line starting at the right edge never moves the box there; the next real line puts it back',()=>{
 const {api,b}=load({clientWidth:1280,clientHeight:720});
 b.textPosition(line(180,560));b.textPosition(line(180,560));
 assert.equal(b.previewed.length,1);const home=b.previewed[0];assert.ok(home.x<20,JSON.stringify(home));
 /* load: the first extent starts at x 1180 (92 %) */
 b.textPosition(line(1180,560));
 assert.equal(b.previewed.length,1,'the box stays where the dialogue is: '+JSON.stringify(b.previewed));
 assert.ok(api.followState().dropped,'the implausible place is recorded');
 b.textPosition(line(180,620));
 assert.equal(b.previewed.at(-1).x,home.x);assert.ok(b.previewed.at(-1).y>home.y,'a real new line still moves at once');
});

test('a far-right place is dropped even as the first line of a session (nothing to fall back on but the saved box)',()=>{
 const {b}=load({clientWidth:1280,clientHeight:720});
 b.textPosition(line(1100,560));b.textPosition(line(1100,600));
 assert.equal(b.previewed.length,0);
});

test('a real layout switch (centred narration <-> bottom box) applies at once, and the width follows the place',()=>{
 const {b}=load({clientWidth:1280,clientHeight:720});
 b.textPosition(line(180,560));const home=b.previewed.at(-1);assert.equal(home.width,undefined,'60 % fits from 14 %: width untouched');
 b.textPosition(line(640,300));let p=b.previewed.at(-1);assert.equal(p.x,50);assert.equal(p.width,50,'centred: the box ends at the window edge, at once');
 b.galPreferences().width=p.width; /* what previewGalPosition does to the preferences */
 b.textPosition(line(180,560));p=b.previewed.at(-1);assert.equal(p.x,home.x);assert.equal(p.width,60,'back at the box: its own width again, not the fitted one');
});

test('a width set by the user or a calibration becomes the box width the follow fits from',()=>{
 const {b}=load({clientWidth:1280,clientHeight:720});
 b.textPosition(line(640,300));b.galPreferences().width=b.previewed.at(-1).width;
 b.galPreferences().width=40; /* calibration / slider */
 b.textPosition(line(180,560));assert.equal(b.previewed.at(-1).width,undefined,'40 fits: unchanged');
 b.textPosition(line(900,560));assert.equal(b.previewed.at(-1).width,Math.round((100-Math.round(900*1000/1280)/10)*10)/10);
});

test('a narrow box sits far right when it fits; small moves and moves left always apply at once',()=>{
 const {b}=load({clientWidth:1280,clientHeight:720},{width:25});
 b.textPosition(line(180,560));b.textPosition(line(900,560));
 assert.equal(b.previewed.at(-1).x,Math.round(900*1000/1280)/10,'70 % + 25 % fits the window');
 b.textPosition(line(100,560));assert.equal(b.previewed.at(-1).x,Math.round(100*1000/1280)/10);
});

test('a place below the window bottom is dropped',()=>{
 const {b}=load({clientWidth:1280,clientHeight:720});
 b.textPosition(line(180,560));b.textPosition(line(180,700));
 assert.equal(b.previewed.length,1);
});

test('a new game session starts clean',()=>{
 const {api,b}=load({clientWidth:1280,clientHeight:720});
 b.textPosition(line(180,560));b.textPosition(line(1180,560));
 api.resetSession('x');assert.deepEqual(JSON.parse(JSON.stringify(api.followState())),{baseWidth:null,setWidth:null,dropped:null});
});
