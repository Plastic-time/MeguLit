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
 ctx.originals={draw:ctx.Bitmap.prototype.drawText,start:ctx.Window_Message.prototype.startMessage,update:ctx.Window_Message.prototype.updateMessage};
 ctx.window=ctx;ctx.__megulitReport=s=>ctx.reports.push(JSON.parse(s));
 vm.runInContext(RPGM_SCRIPT,ctx);
 const boot=(cfg={roles:true,embed:false})=>{ctx.SceneManager._scene={children:[ctx.layer]};ctx.__megulitRpgm.config(cfg);};
 const say=(t)=>{ctx.$gameMessage._t=t;ctx.msg.startMessage();return ctx.msg.updateMessage();};
 return {ctx,boot,say,api:ctx.__megulitRpgm,run:js=>vm.runInContext(js,ctx)};
}
/* the page's reports through the web path's own conversion, parsed as the kernel parses them */
const recs=r=>{const out=[],p=new W.WebTextPath({port:1,onChars:l=>out.push(TP.parseChars(l))});for(const o of r.ctx.reports)p.report(JSON.stringify(o));return out.filter(Boolean);};

test('patches only once the game booted (plugins loaded), then reports each message with its characters on screen',()=>{
 const r=rig();assert.equal(r.api.state().patched,false);
 r.api.config({roles:true});r.ctx.timers[0]();assert.equal(r.api.state().patched,false,'no scene yet');
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

test('embed: timeout or no applied ruby/Chinese keeps the original message and reader fallback, without emb',()=>{
 const r=rig();r.boot();r.api.config({embed:true});
 r.ctx.$gameMessage._t='遅い';r.ctx.msg.startMessage();r.ctx.now=1300;r.ctx.msg.updateMessage();
 assert.equal(r.ctx.draws.length,2);assert.equal(recs(r).at(-1).emb,undefined);
 r.api.embed('一\n二\n三\n四'.replace(/\n/g,''),{ruby:[],zh:'很长'});
 r.ctx.$gameMessage._t='一\n二\n三\n四';r.ctx.msg.startMessage();r.ctx.msg.updateMessage();
 assert.equal(recs(r).at(-1).emb,undefined,'four rows leave no room and no ruby was applied');assert.ok(!r.ctx.draws.some(x=>x.t==='很'));
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
 const prof=require('../core/profiles/index.cjs');assert.deepEqual(prof.profileFor({engine:'RPG Maker MV/MZ'}).draw,{roles:false,advhdInput:false,kemcoSprites:false,embed:false,embedTranslation:true,engineTable:null,viaRoles:[]},'RPG Maker canvas detection does not grant wrapper or embed permission');
 assert.deepEqual(prof.profileFor({engine:'KiriKiri'}).draw,{roles:false,advhdInput:false,kemcoSprites:false,embed:false,embedTranslation:true,engineTable:null,viaRoles:[]});
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

test('default off leaves original methods, message timing, fields and output untouched; unknown engines never install',()=>{
 const r=rig();r.boot({});
 assert.equal(r.api.state().patched,false);assert.equal(r.ctx.timers.length,0);
 assert.equal(r.ctx.Bitmap.prototype.drawText,r.ctx.originals.draw);
 assert.equal(r.ctx.Window_Message.prototype.startMessage,r.ctx.originals.start);
 assert.equal(r.ctx.Window_Message.prototype.updateMessage,r.ctx.originals.update);
 r.say('原文');assert.equal(r.ctx.draws.length,2);assert.equal(r.ctx.reports.length,0);
 assert.equal(Object.keys(r.ctx.msg).some(k=>k.startsWith('_mg')),false);
 r.api.config({roles:'true',embed:1});assert.equal(r.api.state().patched,false,'permission requires booleans');
 r.ctx.Utils.RPGMAKER_NAME='Other';r.api.config({roles:true,embed:true});
 for(const f of [...r.ctx.timers])f();
 assert.equal(r.api.state().patched,false);assert.equal(r.ctx.Bitmap.prototype.drawText,r.ctx.originals.draw);
 r.ctx.Utils.RPGMAKER_NAME='MV';r.api.config({roles:true});assert.equal(r.api.state().patched,true);
 const draw=r.ctx.Bitmap.prototype.drawText,count=r.ctx.timers.length;r.run(RPGM_SCRIPT);r.api.config({roles:true});
 assert.equal(r.ctx.Bitmap.prototype.drawText,draw);assert.equal(r.ctx.timers.length,count,'reinjection does not wrap again');
});

test('missing required API installs no partial wrappers; host return values and exceptions are preserved after opt-in/off',()=>{
 const missing=rig();missing.ctx.Window_Message.prototype.updateMessage=null;missing.boot();
 assert.equal(missing.api.state().patched,false);assert.equal(missing.ctx.Bitmap.prototype.drawText,missing.ctx.originals.draw);
 const r=rig();r.ctx.sentinel={host:true};r.ctx.hostError=new Error('game error');
 r.run(`Bitmap.prototype.drawText=function(){return sentinel;};Window_Message.prototype.startPause=function(){return sentinel;};Window_Message.prototype.terminateMessage=function(){return sentinel;};`);
 r.boot();assert.equal(r.ctx.msg.contents.drawText('字',0,0,28,36),r.ctx.sentinel);
 assert.equal(r.ctx.msg.startPause(),r.ctx.sentinel);assert.equal(r.ctx.msg.terminateMessage(),r.ctx.sentinel);
 r.api.config({});assert.equal(r.ctx.msg.startPause(),r.ctx.sentinel);
 const e=rig();e.ctx.hostError=r.ctx.hostError;e.run('Bitmap.prototype.drawText=function(){throw hostError;};');e.boot();
 assert.throws(()=>e.ctx.msg.contents.drawText('字',0,0,28,36),error=>error===r.ctx.hostError);
 const start=rig();start.ctx.hostError=r.ctx.hostError;start.run('Window_Message.prototype.startMessage=function(){throw hostError;};');start.boot();
 assert.throws(()=>start.ctx.msg.startMessage(),error=>error===r.ctx.hostError);
});

test('affine contents transform uses all four corners, MV source frame, canvas CSS offset and DPR',()=>{
 const r=rig();r.boot();r.ctx.msg.startMessage();
 Object.assign(r.ctx.msg._windowContentsSprite,{_frame:{x:5,y:7},worldTransform:{a:0,b:2,c:-3,d:0,tx:300,ty:100}});
 r.ctx.Graphics._canvas.getBoundingClientRect=()=>({left:10,top:20,width:408,height:312});r.ctx.devicePixelRatio=2;
 r.ctx.msg.contents.drawText('字',10,20,28,36);r.ctx.msg.startPause();
 assert.deepEqual(recs(r).at(-1).rects,[[185,150,84,56]]);
 assert.deepEqual([recs(r).at(-1).sw,recs(r).at(-1).sh],[1632,1248]);
});

test('MZ already-scrolled client transform is not offset a second time; condensed buffered runs use prefix advances',()=>{
 const r=rig();r.ctx.Utils.RPGMAKER_NAME='MZ';r.boot();
 r.ctx.msg._contentsSprite={_frame:{x:0,y:0},worldTransform:{a:1,b:0,c:0,d:1,tx:9,ty:426}};delete r.ctx.msg._windowContentsSprite;
 r.ctx.msg.origin={x:9,y:36};r.say('字');assert.deepEqual(recs(r).at(-1).rects,[[9,430,28,28]]);
 const q=rig();q.boot();q.ctx.msg.startMessage();q.ctx.msg.contents.measureTextWidth=t=>t==='A'?30:t==='AV'?50:28;
 q.ctx.msg.contents.drawText('AV',10,0,25,36,'center');q.ctx.msg.startPause();
 assert.deepEqual(recs(q).at(-1).rects,[[28,466,15,28],[43,466,10,28]],'Canvas maxWidth shrinks the run before alignment');
});

test('twelve message pages keep independent text/rects and clear the exact preceding line, including unpaused pages',()=>{
 const r=rig();r.boot();r.ctx.msg.startMessage();const pageChars=Array.from('一二三四五六七八九十百千');
 pageChars.forEach((ch,i)=>{r.ctx.msg.contents.drawText(ch,0,0,28,36);if(i%2===0)r.ctx.msg.startPause();if(i<11)r.ctx.msg.newPage(r.ctx.msg._textState);});
 r.ctx.msg.terminateMessage();r.ctx.msg.terminateMessage();
 const lines=recs(r).filter(x=>!x.role),body=lines.filter(x=>x.text),clear=lines.filter(x=>!x.text);
 assert.deepEqual(body.map(x=>x.text),pageChars);assert.deepEqual(body.map(x=>x.line),Array.from({length:12},(_,i)=>i+1));
 assert.equal(body.every(x=>x.rects.length===1),true);assert.deepEqual(clear.map(x=>x.line),body.map(x=>x.line));
 assert.equal(clear.every(x=>x.hidden===false&&x.rects.length===0),true);
});

test('ruby positions continue from the preceding Japanese page rather than restarting at character zero',()=>{
 const r=rig();r.boot({embed:true});r.api.embed('春夏秋冬',{ruby:[[2,4,'あきふゆ']]});r.ctx.$gameMessage._t='春夏秋冬';r.ctx.msg.startMessage();
 const w=r.ctx.msg;w.contents.drawText('春夏',0,0,48,32);w.startPause();w.newPage(w._textState);w.contents.drawText('秋冬',0,0,48,32);w.startPause();
 assert.equal(r.ctx.draws.filter(x=>x.t==='あきふゆ').length,1);
 assert.deepEqual(recs(r).filter(x=>x.text).map(x=>x.text),['春夏','秋冬']);
});

test('revoking embed immediately releases the hold and removes pending Chinese/ruby changes before native drawing',()=>{
 const r=rig();r.boot({embed:true});r.ctx.$gameMessage._t='待つ';r.ctx.msg.startMessage();assert.equal(r.ctx.msg.updateMessage(),true);assert.equal(r.ctx.draws.length,0);
 r.api.config({});assert.equal(r.ctx.msg._mgHold,0);r.ctx.msg.updateMessage();assert.equal(r.ctx.draws.length,2);assert.equal(recs(r).length,0);
 const q=rig();q.boot({embed:true});q.api.embed('今日',{ruby:[[0,2,'きょう']],zh:'今天'});q.ctx.$gameMessage._t='今日';q.ctx.msg.startMessage();
 assert.ok(q.ctx.msg._textState.text.includes('MGZ'));assert.equal(q.ctx.msg.contents.fontSize,24);
 q.api.config({roles:true});assert.equal(q.ctx.msg._textState.text,'今日');assert.equal(q.ctx.msg.contents.fontSize,28);assert.equal(q.ctx.msg._textState.y,0);
 q.ctx.msg.updateMessage();assert.deepEqual(Array.from(q.ctx.draws,x=>x.t),['今','日']);assert.equal(recs(q).at(-1).emb,undefined,'revoked replacement must not claim embedded');
});

test('roles revoke, hidden parents, scene replacement and shrinking choices clear only their own UI groups',()=>{
 const r=rig();r.boot();const ch=new r.ctx.Window_ChoiceList(['はい','いいえ']),name=new r.ctx.Window_NameBox('ミナ');r.ctx.layer.children.push(ch,name);
 const scan=()=>r.ctx.timers.at(-1)();scan();
 const {UiTracker}=require('../core/engine-draw.cjs'),deferred=[],removed=[],tracker=new UiTracker({defer:f=>deferred.push(f)});let n=0;
 const feed=()=>{const lines=recs(r).filter(x=>x.role);for(const rec of lines.slice(n))tracker.feed(rec,items=>removed.push(...items));n=lines.length;while(deferred.length)deferred.shift()();};
 feed();assert.equal(tracker.items.size,3);ch._list.pop();scan();feed();assert.equal(tracker.items.size,2);assert.equal(removed.length,1);
 name._name='';scan();feed();assert.equal(tracker.items.size,1);
 r.ctx.layer.visible=false;scan();feed();assert.equal(tracker.items.size,0);
 r.ctx.layer.visible=true;scan();feed();assert.equal(tracker.items.size,1);
 r.api.config({});feed();assert.equal(tracker.items.size,0);const before=r.ctx.reports.length;scan();assert.equal(r.ctx.reports.length,before);
 r.api.config({roles:true});scan();feed();assert.equal(tracker.items.size,1);r.ctx.SceneManager._scene={children:[]};scan();feed();assert.equal(tracker.items.size,0);
});

test('a paused line follows transform changes and clears on visibility/scene loss; invalid geometry never escapes to the host',()=>{
 const r=rig();r.boot();r.say('本文');const first=recs(r).at(-1),scan=()=>r.ctx.timers.at(-1)();
 r.ctx.msg._windowContentsSprite.worldTransform.tx+=10;scan();assert.equal(recs(r).at(-1).line,first.line);assert.equal(recs(r).at(-1).rects[0][0],28);
 r.ctx.layer.visible=false;scan();assert.equal(recs(r).at(-1).text,'');const count=recs(r).length;scan();assert.equal(recs(r).length,count);
 r.ctx.layer.visible=true;scan();assert.equal(recs(r).at(-1).text,'本文');
 r.ctx.SceneManager._scene={children:[]};scan();assert.equal(recs(r).at(-1).text,'');
 const q=rig();q.boot();q.ctx.msg._windowContentsSprite.worldTransform.tx=NaN;assert.doesNotThrow(()=>q.say('本文'));
 assert.equal(recs(q).length,0);assert.equal(q.ctx.draws.length,2);assert.ok(q.ctx.reports.some(x=>x.status==='rpgm observation failed'));
 const bad=new q.ctx.Window_ChoiceList(['壊れた']),good=new q.ctx.Window_NameBox('正常');bad._windowContentsSprite.worldTransform.tx=NaN;q.ctx.layer.children.push(bad,good);
 q.ctx.timers.at(-1)();assert.equal(recs(q).find(x=>x.role==='name').text,'正常','one malformed plugin window cannot block other windows');
});

test('replacement input is bounded, rejects invalid/overlapping ruby and cannot inject engine control codes',()=>{
 const r=rig();r.boot({embed:true});r.api.embed('今日',{ruby:[[0.5,1,'bad'],[0,3,'bad'],[0,1,'いま'],[0,2,'overlap'],[1,2,'ひ\x1bMGZ']],zh:'今天\x1bMGZ'});
 r.ctx.$gameMessage._t='今日';r.ctx.msg.startMessage();r.ctx.msg.updateMessage();
 assert.equal(r.ctx.draws.filter(x=>x.t==='いま').length,1);assert.ok(!r.ctx.draws.some(x=>x.t==='bad'||x.t==='overlap'||x.t.includes('\x1b')));
 for(let i=0;i<70;i++)r.api.embed('鍵'+i,{ruby:[],zh:''});assert.equal(r.api.state().emb,64);
 r.api.embed('字'.repeat(4001),{ruby:[],zh:'無効'});assert.equal(r.api.state().emb,64);
 const q=rig();q.boot({embed:true});q.api.embed('constructor',{ruby:[],zh:''});q.ctx.$gameMessage._t='constructor';q.ctx.msg.startMessage();q.ctx.msg.updateMessage();
 assert.equal(recs(q).at(-1).emb,undefined,'empty replacement does not claim internal ruby or translation');
});

test('large drawn pages remain valid protocol records, including newline and supplementary character budgets',()=>{
 const r=rig();r.boot();r.ctx.msg.startMessage();const b=r.ctx.msg.contents;
 for(let i=0;i<4100;i++)b.drawText('字',0,i*36,28,36);r.ctx.msg.startPause();
 const line=recs(r).at(-1);assert.ok(line);assert.equal(line.rects.length,2000);assert.equal(line.text.length,3999);assert.equal(line.rects.length,Array.from(line.text.replace(/\n/g,'')).length);
 const q=rig();q.ctx.Utils.RPGMAKER_NAME='MZ';q.boot();q.ctx.msg.startMessage();q.ctx.msg.contents.drawText('𠮷野',0,0,56,36);q.ctx.msg.startPause();
 assert.equal(recs(q).at(-1).text,'𠮷野');assert.equal(recs(q).at(-1).rects.length,2);
});

test('every engine profile consumes the full default-off draw contract, including kemcoSprites, without cross-profile permission leaks',()=>{
 const fs=require('node:fs'),path=require('node:path'),P=require('../core/profiles/index.cjs');
 const expected={roles:false,advhdInput:false,kemcoSprites:false,embed:false,embedTranslation:true,engineTable:null,viaRoles:[]};
 const engines=fs.readdirSync(P.ENGINE_DIR).filter(f=>f.endsWith('.cjs')).map(f=>require(path.join(P.ENGINE_DIR,f)).engine);
 assert.ok(engines.includes('rpgmaker'));
 for(const engine of engines)assert.deepEqual(P.profileFor({engine}).draw,expected,engine+' must not inherit another renderer permission');
 const on=P.profileFor({engine:'rpgmaker',official:{draw:{roles:true,embed:true}}});assert.equal(on.draw.roles,true);assert.equal(on.draw.embed,true);assert.equal(on.draw.kemcoSprites,false);
 assert.deepEqual(P.profileFor({engine:'rpgmaker'}).draw,expected,'an opted-in profile does not change the engine default');
 const bad=P.profileFor({engine:'rpgmaker',official:{draw:{roles:'true',embed:1}}});assert.deepEqual(bad.draw,expected,'invalid permission values cannot enable observation or embedding');
});
