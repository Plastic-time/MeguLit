// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* engine-draw, RPG Maker MV/MZ (core/text-paths-rpgm.cjs): the page script runs in a vm against a stand-in of the parts of
   rpg_core.js / rpg_windows.js it touches (Bitmap, Window_Base, Window_Message's text loop, command windows, a scene). No
   game, no browser. */
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {RPGM_SCRIPT}=require('../core/text-paths-rpgm.cjs'),W=require('../core/text-paths-web.cjs'),TP=require('../core/text-paths.cjs');

const STANDIN=String.raw`
var draws=[],timers=[],reports=[],now=0;
var performance={now:function(){return now;}};
function setInterval(f){timers.push(f);return timers.length;}function clearInterval(){}
var innerWidth=816,innerHeight=624,devicePixelRatio=1;
var document={querySelector:function(){return null;}};
var Utils={RPGMAKER_NAME:'MV'};
var Graphics={width:816,height:624,_canvas:{getBoundingClientRect:function(){return {left:0,top:0,width:816,height:624};}}};
function Bitmap(w,h){this.width=w;this.height=h;this.fontSize=28;this.outlineWidth=4;}
Bitmap.prototype.measureTextWidth=function(t){return Array.from(String(t)).length*this.fontSize;};
Bitmap.prototype.drawText=function(t,x,y,mw,lh,al){draws.push({t:String(t),x:x,y:y,mw:mw,lh:lh,al:al,fs:this.fontSize,bmp:this});};
function Window_Base(x,y,w,h){this.x=x;this.y=y;this.width=w;this.height=h;this.padding=18;this.visible=true;this.openness=255;this.contents=new Bitmap(w-36,h-36);
 this._windowContentsSprite={worldTransform:{tx:x+18,ty:y+18}};this.worldTransform={tx:x,ty:y};}
Window_Base.prototype.isOpen=function(){return this.openness>=255;};
Window_Base.prototype.standardFontSize=function(){return 28;};
Window_Base.prototype.resetFontSettings=function(){this.contents.fontSize=this.standardFontSize();};
Window_Base.prototype.convertEscapeCharacters=function(t){return String(t).replace(/\\/g,'\x1b');};
Window_Base.prototype.calcTextHeight=function(ts){return this.contents.fontSize+8;};
Window_Base.prototype.processEscapeCharacter=function(code,ts){if(code==='}')this.contents.fontSize-=12;};
function Window_Message(){Window_Base.call(this,0,444,816,180);}
Window_Message.prototype=Object.create(Window_Base.prototype);Window_Message.prototype.constructor=Window_Message;
Window_Message.prototype.startMessage=function(){this._textState={index:0,text:this.convertEscapeCharacters($gameMessage.allText())};this.newPage(this._textState);};
Window_Message.prototype.newPage=function(ts){this.resetFontSettings();ts.x=0;ts.y=0;ts.left=0;ts.height=this.calcTextHeight(ts,false);};
Window_Message.prototype.updateMessage=function(){var ts=this._textState;if(!ts)return false;
 while(ts.index<ts.text.length){var c=ts.text[ts.index++];
  if(c==='\n'){ts.x=0;ts.y+=ts.height;ts.height=this.calcTextHeight(ts,false);continue;}
  if(c==='\x1b'){var m=/^[\$\.\|\^!><\{\}\\]|^[A-Z]+/i.exec(ts.text.slice(ts.index));var code=m?m[0]:'';ts.index+=code.length;var pm=/^\[\d*\]/.exec(ts.text.slice(ts.index));if(pm)ts.index+=pm[0].length;this.processEscapeCharacter(code.toUpperCase(),ts);continue;}
  var w=this.contents.measureTextWidth(c);this.contents.drawText(c,ts.x,ts.y,w*2,ts.height);ts.x+=w;}
 this.startPause();this._textState=null;return true;};
Window_Message.prototype.startPause=function(){this.paused=true;};
Window_Message.prototype.terminateMessage=function(){};
function Window_Selectable(x,y,w,h){Window_Base.call(this,x,y,w,h);this._index=0;}
Window_Selectable.prototype=Object.create(Window_Base.prototype);
Window_Selectable.prototype.index=function(){return this._index;};
Window_Selectable.prototype.itemRect=function(i){return {x:0,y:i*36,width:this.contents.width,height:36};};
Window_Selectable.prototype.itemRectForText=function(i){var r=this.itemRect(i);r.x+=6;r.width-=12;return r;};
function Window_Command(x,y,w,h,list){Window_Selectable.call(this,x,y,w,h);this._list=list.map(function(n){return {name:n};});}
Window_Command.prototype=Object.create(Window_Selectable.prototype);
Window_Command.prototype.maxItems=function(){return this._list.length;};
Window_Command.prototype.commandName=function(i){return this._list[i].name;};
function Window_ChoiceList(list){Window_Command.call(this,500,300,300,108,list);}
Window_ChoiceList.prototype=Object.create(Window_Command.prototype);
function Window_TitleCommand(list){Window_Command.call(this,300,400,240,108,list);}
Window_TitleCommand.prototype=Object.create(Window_Command.prototype);
function Window_NameBox(name){Window_Base.call(this,0,380,200,64);this._name=name;}
Window_NameBox.prototype=Object.create(Window_Base.prototype);
var $gameMessage={_t:'',allText:function(){return this._t;}};
var msg=new Window_Message(),layer={children:[msg]},SceneManager={_scene:null};
`;
function rig(){
 const ctx={};vm.createContext(ctx);vm.runInContext(STANDIN,ctx);
 ctx.window=ctx;ctx.__megulitReport=s=>ctx.reports.push(JSON.parse(s));
 vm.runInContext(RPGM_SCRIPT,ctx);
 const boot=()=>{ctx.SceneManager._scene={children:[ctx.layer]};ctx.timers.shift()();};
 const say=(t)=>{ctx.$gameMessage._t=t;ctx.msg.startMessage();return ctx.msg.updateMessage();};
 return {ctx,boot,say,api:ctx.__megulitRpgm,run:js=>vm.runInContext(js,ctx)};
}
/* the page's reports through the web path's own conversion, parsed as the kernel parses them */
const recs=r=>{const out=[],p=new W.WebTextPath({port:1,onChars:l=>out.push(TP.parseChars(l))});for(const o of r.ctx.reports)p.report(JSON.stringify(o));return out.filter(Boolean);};

test('patches only once the game booted (plugins loaded), then reports each message with its characters on screen',()=>{
 const r=rig();assert.equal(r.api.state().patched,false);
 r.ctx.timers[0]();assert.equal(r.api.state().patched,false,'no scene yet');
 r.boot();assert.equal(r.api.state().patched,true);assert.deepEqual(r.ctx.reports.find(o=>o.status),{status:'rpgm ok MV',engine:'rpgm'});
 r.say('今日は\\c[2]晴れ\n二行目');
 const [line]=recs(r);
 assert.deepEqual([line.engine,line.text,line.hidden,line.rects.length,line.emb],['rpgm','今日は晴れ\n二行目',false,8,undefined]);
 assert.deepEqual(line.rects[0],[18,444+18+4,28,28],'contents origin + the glyph box (line height = size + 8, glyph centred in it)');
 assert.deepEqual(line.rects[5],[18,444+18+36+4,28,28].map((v,i)=>i===1?444+18+36+4:v),'second row');
});

test('roles: choice list, title command and name box are reported as UI snapshots, never as dialogue; closing sends an empty one',()=>{
 const r=rig();r.boot();r.api.config({roles:true,embed:false});
 const ch=new r.ctx.Window_ChoiceList(['はい','いいえ']),name=new r.ctx.Window_NameBox('\\c[3]ハルカ'),title=new r.ctx.Window_TitleCommand(['ニューゲーム','コンティニュー']);
 ch._index=1;r.ctx.layer.children.push(ch,name,title);
 r.ctx.timers.at(-1)();r.ctx.timers.at(-1)();
 const ui=recs(r).filter(x=>x.role);
 assert.deepEqual(ui.map(x=>[x.role,x.text,x.sel]),[['choice','はい',false],['choice','いいえ',true],['name','ハルカ',false],['menu','ニューゲーム',true],['menu','コンティニュー',false]]);
 assert.deepEqual(ui[0].box,[500+18+6,300+18,300-36-12,36],'item text rect (itemRectForText) in client px');
 assert.equal(ui.filter(x=>x.role==='choice').length,2,'unchanged windows are not sent again');
 ch.openness=0;r.ctx.timers.at(-1)();
 const gone=recs(r).at(-1);assert.deepEqual([gone.role,gone.text,gone.box],['choice','',[0,0,0,0]]);assert.match(gone.id,/^W\d+:$/);
 r.say('台詞');assert.equal(recs(r).filter(x=>!x.role).length,1,'the message window itself is no UI item');
});

test('embed: the message waits for its replacement, then draws ruby above the base and the Chinese rows under it (emb=2)',()=>{
 const r=rig();r.boot();r.api.config({roles:false,embed:true});
 r.ctx.$gameMessage._t='今日は晴れ';r.ctx.msg.startMessage();
 assert.deepEqual(JSON.parse(JSON.stringify(r.ctx.reports.filter(o=>o.ask).map(o=>o.ask))),['今日は晴れ'],'asked once');
 assert.equal(r.ctx.msg.updateMessage(),true,'held: nothing drawn yet');assert.equal(r.ctx.draws.length,0);
 r.api.embed('今日は晴れ',{ruby:[[0,2,'きょう']],zh:'今天晴朗'});
 r.ctx.msg.updateMessage();
 const d=r.ctx.draws,ruby=d.find(x=>x.t==='きょう'),zh=d.filter(x=>'今天晴朗'.includes(x.t)&&x.t.length===1&&x.fs===Math.round(28*0.8));
 assert.ok(ruby,'ruby drawn');assert.equal(ruby.fs,Math.round(24*0.45),'45 % of the 85 % main size');assert.equal(ruby.al,'center');
 assert.equal(d.find(x=>x.t==='今').fs,24,'main size 85 %');
 assert.equal(zh.length,4);assert.equal(zh[0].fs,Math.round(28*0.8));assert.ok(zh[0].y>d.find(x=>x.t==='今').y,'Chinese under the Japanese');
 const line=recs(r).at(-1);assert.deepEqual([line.text,line.emb,line.rects.length],['今日は晴れ',2,5],'the line is the Japanese only, emb=2');
});

test('embed: no replacement in time = the game\'s own message, no emb; a box with no room keeps the Chinese out (emb=1)',()=>{
 const r=rig();r.boot();r.api.config({embed:true});
 r.ctx.$gameMessage._t='遅い';r.ctx.msg.startMessage();r.ctx.now=1300;r.ctx.msg.updateMessage();
 assert.equal(r.ctx.draws.length,2);assert.equal(recs(r).at(-1).emb,undefined);
 r.api.embed('一\n二\n三\n四'.replace(/\n/g,''),{ruby:[],zh:'很长'});
 r.ctx.$gameMessage._t='一\n二\n三\n四';r.ctx.msg.startMessage();r.ctx.msg.updateMessage();
 assert.equal(recs(r).at(-1).emb,1,'four rows fill the box');assert.ok(!r.ctx.draws.some(x=>x.t==='很'));
});

test('web path wiring: the RPG Maker reader rides along, asks go to onAsk, config and replacements go to the page',async()=>{
 const asks=[],lines=[],p=new W.WebTextPath({port:1,onAsk:a=>asks.push(a),onChars:l=>lines.push(l)});
 p.report(JSON.stringify({ask:'今日は',text:'今日は',engine:'rpgm'}));assert.deepEqual(asks,[{key:'今日は',text:'今日は',engine:'rpgm'}]);
 p.report(JSON.stringify({engine:'rpgm',ui:true,line:3,hidden:false,sw:816,sh:624,role:'choice',id:'W1:0',box:[1,2,3,4],rects:[],text:'はい',sel:true}));
 assert.equal(lines[0],'ToMe_CHARS engine=rpgm line=3 hidden=0 sw=816 sh=624 vx=0 vy=0 vw=816 vh=624 n=0 rects= role=choice id=W1:0 box=1,2,3,4 sel=1 text=はい');
 const evals=[];p.pages.set('a',{});p.evaluate=(c,js)=>{evals.push(js);return Promise.resolve();};
 await p.drawConfig({roles:true,embed:true,zh:true});await p.drawConfig({roles:true,embed:true,zh:true});
 assert.equal(evals.filter(j=>j.includes('__megulitRpgm.config({"roles":true,"embed":true,"zh":true})')).length,1,'sent once per change');
 await p.drawEmbed('今日は',{ruby:[[0,2,'きょう']],zh:'今天'});assert.ok(evals.at(-1).includes('__megulitRpgm.embed("今日は",{"ruby":[[0,2,"きょう"]],"zh":"今天"})'));
 const prof=require('../core/profiles/index.cjs');assert.deepEqual(prof.profileFor({engine:'RPG Maker MV/MZ'}).draw,{roles:true,embed:true,embedTranslation:true,viaRoles:[]},'engine diff turns it on for RPG Maker only');
 assert.deepEqual(prof.profileFor({engine:'KiriKiri'}).draw,{roles:false,embed:false,embedTranslation:true,viaRoles:[]});
});

test('MZ: text drawn in buffered runs (flushTextState) still gives one box per character; rows use the window line height',()=>{
 const r=rig();r.run(String.raw`Utils.RPGMAKER_NAME='MZ';Window_Base.prototype.lineHeight=function(){return 36;};
  Window_Message.prototype.updateMessage=function(){var ts=this._textState;if(!ts)return false;var buf='';var self=this;
   function flush(){if(buf){self.contents.drawText(buf,ts.x,ts.y,self.contents.measureTextWidth(buf),ts.height);ts.x+=self.contents.measureTextWidth(buf);buf='';}}
   while(ts.index<ts.text.length){var c=ts.text[ts.index++];if(c==='\n'){flush();ts.x=0;ts.y+=36;continue;}buf+=c;}flush();this.startPause();this._textState=null;return true;};`);
 r.boot();r.say('ルビ付き文\n次');
 const line=recs(r).at(-1);assert.equal(line.text,'ルビ付き文\n次');assert.equal(line.rects.length,6);
 assert.deepEqual(line.rects.slice(0,2).map(q=>q[0]),[18,46],'each character of a run at its own x');
 assert.equal(r.ctx.reports.find(o=>o.status).status,'rpgm ok MZ');
});
