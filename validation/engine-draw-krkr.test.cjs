// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* engine-draw, KiriKiri (docs/engine-draw-protocol.md): roles and the in-game replacement of native/krkrtext/script.inc.
   The engine-draw part of the script (from its "engine-draw" block to the visibility tick) is turned into JavaScript by a
   small TJS-to-JS rewrite (only the TJS forms that block uses) and run against a stand-in KAG message layer: no game, no DLL. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const TP=require('../core/text-paths.cjs');
const root=path.join(__dirname,'..'),script=fs.readFileSync(path.join(root,'native/krkrtext/script.inc'),'utf8').replace(/\r\n/g,'\n');

/* the block: from "st.cfg=" to "st.vis=", raw-string seams removed */
function block(){
 const a=script.indexOf('st.cfg=%['),b=script.indexOf('st.vis=function');
 assert.ok(a>0&&b>a,'engine-draw block present');
 return script.slice(a,b).split(/\)MGLT",? LR"MGLT\(/).join('\n');
}
/* TJS -> JS for the forms the block uses */
function toJs(src){
 src=src.replace(/\/\*[\s\S]*?\*\//g,' ');let out='',i=0;const stack=[];
 /* %[ k=>v ] dictionaries -> { k: v } (bracket matched) */
 while(i<src.length){
  const c=src[i];
  if((c==="'"||c==='"')){let j=i+1;while(j<src.length&&src[j]!==c){if(src[j]==='\\')j++;j++;}out+=src.slice(i,j+1);i=j+1;continue;}
  if(c==='%'&&src[i+1]==='['){stack.push('d');out+='{';i+=2;continue;}
  if(c==='['){stack.push('a');out+='[';i++;continue;}
  if(c===']'){out+=stack.pop()==='d'?'}':']';i++;continue;}
  if(c==='='&&src[i+1]==='>'&&stack[stack.length-1]==='d'){out+=':';i+=2;continue;}
  out+=c;i++;
 }
 return out
  .replace(/\} incontextof (\w+);/g,'}.bind($1);')
  .replace(/function\(args\*\)/g,'function(...args)').replace(/\(args\*\)/g,'(...args)')
  .replace(/\(([\w.]+) incontextof ([\w.]+)\)/g,'($1).bind($2)')
  .replace(/\(global\.Layer\.drawText\)\.bind/g,'(global.Layer.drawText).bind')
  .replace(/typeof ([\w.$]+(?:\[\w+\])?)/g,'__t($1)')
  .replace(/!isvalid ([\w.]+)/g,'!__v($1)').replace(/isvalid ([\w.]+)/g,'__v($1)')
  .replace(/invalidate ([\w.]+);/g,'__inv($1);')
  .replace(/\((\w+) instanceof "(\w+)"\)/g,'__io($1,"$2")')
  .replace(/#t==0xfeff/g,'t.charCodeAt(0)==0xfeff')
  .replace(/\bint\(/g,'__int(')
  .replace(/\bvoid\b/g,'undefined');
}
/* the stand-in layers and sentences are built out here: their arrays speak TJS too */
if(!Object.getOwnPropertyDescriptor(Array.prototype,'count'))Object.defineProperty(Array.prototype,'count',{get(){return this.length;}});
const J=v=>JSON.parse(JSON.stringify(v));
function harness({ctl=null}={}){
 const reports=[],draws=[],copies=[];
 const ctx={reports,draws,copies};
 const font=()=>({height:28,face:'ＭＳ ゴシック',bold:false,getTextWidth(s){return [...String(s)].length*this.height;}});
 class Layer{constructor(){this.font=font();this.children=[];this.visible=true;this.left=0;this.top=0;this.width=0;this.height=0;}
  drawText(x,y,text,color,op,aa,sl,sc,sw,ox,oy){draws.push({on:this.name||'layer',x,y,text,color,size:this.font.height});}
  setImageSize(w,h){this.iw=w;this.ih=h;}
  copyRect(dx,dy,src,sx,sy,w,h){copies.push({to:this.name||'layer',dx,dy,from:src.name||'layer',sx,sy,w,h});}}
 Layer.drawText=Layer.prototype.drawText;
 class ButtonLayer extends Layer{}
 const primary=new Layer();primary.name='primary';
 const L=new Layer();Object.assign(L,{name:'msg',left:40,top:500,width:1200,height:200,marginL:20,marginR:20,marginT:10,marginB:10,lineSpacing:6,chColor:0xffffff,vertical:false});
 const base=new Layer();base.name='base';base.width=1280;base.height=720;base.children=[L];L.parent=base;base.parent=null;
 const kag={scWidth:1280,scHeight:720,primaryLayer:primary,fore:{base,messages:[L]}};
 const ctlFile=ctl!==null?path.join(fs.mkdtempSync(path.join(os.tmpdir(),'megulit-ed-')),'1.txt'):'';
 if(ctlFile)fs.writeFileSync(ctlFile,Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(ctl,'utf16le')]));
 const sandbox={global:null,reports,__int:v=>Math.trunc(Number(v)),__v:o=>o!=null,__inv:o=>{o.__gone=true;},
  __io:(o,k)=>k==='ButtonLayer'?o instanceof ButtonLayer:o instanceof Layer,
  __t:v=>v===undefined?'undefined':typeof v==='string'?'String':typeof v==='number'?(Number.isInteger(v)?'Integer':'Real'):'Object'};
 vm.createContext(sandbox);
 vm.runInContext(`Object.defineProperty(Array.prototype,'count',{get(){return this.length;}});Array.prototype.add=function(v){this.push(v);return this.length-1;};
  Array.prototype.assign=function(o){this.length=0;for(const k of Object.keys(o))this.push(k,o[k]);return this;};
  Array.prototype.load=function(p){const t=__read(p);this.length=0;for(const l of t.replace(/\\r/g,'').split('\\n'))this.push(l);if(this.length&&this[this.length-1]==='')this.pop();return this;};
  String.prototype.substring=function(s,n){return n===undefined?this.substr(s):this.substr(s,n);};`,Object.assign(sandbox,{__read:p=>{const b=fs.readFileSync(p);return b[0]===0xff&&b[1]===0xfe?b.subarray(2).toString('utf16le'):b.toString('utf8');}}));
 sandbox.global=sandbox;sandbox.Layer=Layer;sandbox.__megulitKrkrCtlPath=ctlFile;
 const st={kag,recs:[],report:s=>reports.push(s),charsErr:'',
  screen(){return [1280,720];},
  abs(l){let ax=0,ay=0;for(let i=0;i<16&&l.parent;i++){ax+=l.left;ay+=l.top;l=l.parent;}return [ax,ay];},
  drawFont(l){return l.font;}};
 sandbox.st=st;vm.runInContext(toJs(block()),sandbox);
 return {st,L,kag,reports,draws,copies,ButtonLayer,Layer,base,ctx};
}

test('engine-draw block: control file sets roles / embed / zh and the replacement table; no file = everything off',()=>{
 const none=harness();none.st.ctl();assert.deepEqual(J(none.st.cfg),{roles:0,embed:0,zh:1});
 const h=harness({ctl:'#cfg roles=1 embed=1 zh=0\r\n今日は晴れ\t0:2:きょう|2:1:は\t今天晴朗\x1f第二行\r\n'});
 h.st.ctl();
 assert.deepEqual(J(h.st.cfg),{roles:1,embed:1,zh:0});
 assert.deepEqual(J(h.st.embMap['今日は晴れ']),['0:2:きょう|2:1:は','今天晴朗\x1f第二行']);
 assert.deepEqual(J(h.st.embSpans('0:2:きょう|2:1:は|bad|3:0:x|4:1:')),[[0,2,'きょう'],[2,1,'は'],[3,0,'x']],'malformed and empty readings dropped');
});

test('roles: [link] text becomes one choice record per link, a clear sends an empty snapshot',()=>{
 const h=harness({ctl:'#cfg roles=1\n'});h.st.ctl();
 const rec={target:h.L,lk:undefined,lkDirty:0,lkQuiet:0};h.st.recs.push(rec);
 [...'はい'].forEach((c,i)=>h.st.linkCh(rec,h.L,0,c,100+28*i,560,28,1280,720));
 [...'いいえ'].forEach((c,i)=>h.st.linkCh(rec,h.L,1,c,100+28*i,600,28,1280,720));
 h.L.keyLink=1;h.st.sendLinks(rec);
 const recs=h.reports.map(TP.parseChars);
 assert.deepEqual(recs.map(r=>[r.role,r.id,r.text,r.box,r.sel]),[['choice','L0:0','はい',[100,560,56,28],false],['choice','L0:1','いいえ',[100,600,84,28],true]]);
 assert.equal(recs[0].line,recs[1].line,'one snapshot, one line number');
 h.st.linkClear(rec);const clr=TP.parseChars(h.reports.at(-1));
 assert.deepEqual([clr.role,clr.text,clr.box,clr.rects.length],['choice','',[0,0,0,0],0]);assert.ok(clr.line>recs[0].line);
});

test('roles: text ButtonLayer captions on the front page are reported as buttons, once per change',()=>{
 const h=harness({ctl:'#cfg roles=1\n'});h.st.ctl();
 const b=new h.ButtonLayer();Object.assign(b,{caption:'セーブ',left:1100,top:20,width:120,height:40,parent:h.base});h.base.children.push(b);
 const pic=new h.ButtonLayer();Object.assign(pic,{caption:'',left:0,top:0,width:10,height:10,parent:h.base});h.base.children.push(pic);
 h.st.btnScan();h.st.btnScan();
 assert.equal(h.reports.length,1,'unchanged buttons are not sent again');
 const r=TP.parseChars(h.reports[0]);assert.deepEqual([r.role,r.id,r.text,r.box],['button','B0','セーブ',[1100,20,120,40]]);
 b.visible=false;h.st.btnScan();assert.deepEqual(TP.parseChars(h.reports[1]).box,[0,0,0,0],'gone: empty snapshot');
});

test('embed: ruby above its base on the message layer, Chinese under the sentence, record sent again with emb=2',()=>{
 const h=harness({ctl:'#cfg roles=1 embed=1\n今日は晴れ\t0:2:きょう\t今天晴朗\n'});h.st.ctl();
 /* the sentence as track() leaves it: abs rects (layer at 40,500, text row at y 520) */
 const ra=[...'今日は晴れ'].map((c,i)=>[60+28*i,520,28,28]);
 const rec={target:h.L,role:'line',cn:5,ra,ct:'今日は晴れ',size:28,nvl:0,args:undefined,head:'ToMe_CHARS engine=krkr line=9 hidden=0 sw=1280 sh=720 vx=0 vy=0 vw=0 vh=0 n=5 rects='+ra.map(r=>r.join(',')).join(';'),tt:'今日は晴れ',y1:520,cleared:false,n:0};
 const q=h.st.embQueue(rec);assert.ok(q);h.st.embPend=q;h.st.embTry();
 const ruby=h.draws.find(d=>d.text==='きょう'),zh=h.draws.find(d=>d.text==='今天晴朗');
 assert.ok(ruby&&zh,JSON.stringify(h.draws));
 assert.equal(ruby.size,12,'ruby at 45 % of the sentence size');
 assert.equal(ruby.x,Math.trunc(60+(56-36)/2-40),'centred over 今日, layer-local');
 assert.equal(ruby.y,520-12-1-500,'just above the row');
 assert.equal(zh.on,'msg');assert.equal(zh.x,20);assert.equal(zh.y,520-500+28+6,'one line spacing under the sentence');assert.equal(zh.size,22,'80 % of the sentence size');
 assert.equal(h.L.font.height,28,'the layer font is put back');
 const back=TP.parseChars(h.reports.at(-1));assert.deepEqual([back.line,back.emb,back.text,back.hidden],[9,2,'今日は晴れ',false]);
 assert.ok(h.copies.some(c=>c.from==='msg'),'pixels under the Chinese saved');
 h.st.embRestore();assert.ok(h.copies.some(c=>c.to==='msg'),'and put back when the next sentence starts');
});

test('embed: no room under the sentence = ruby only (emb=1); no entry yet = waits, a late entry is still drawn; a cleared page gives up',()=>{
 const h=harness({ctl:'#cfg embed=1\nあ\t\t很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长\n'});h.st.ctl();
 const mk=(t)=>({target:h.L,role:'line',cn:1,ra:[[60,660,28,28]],ct:t,size:28,nvl:0,head:'ToMe_CHARS engine=krkr line=3 hidden=0 sw=1280 sh=720 vx=0 vy=0 vw=0 vh=0 n=1 rects=60,660,28,28',tt:t,y1:660,cleared:false,n:0});
 h.st.embPend=h.st.embQueue(mk('あ'));h.st.embTry();
 assert.equal(TP.parseChars(h.reports.at(-1)).emb,1,'the box has no room for the Chinese');
 const late=mk('い');h.st.embPend=h.st.embQueue(late);h.st.embTry();h.st.embTry();
 assert.ok(h.st.embPend,'still waiting for its entry');
 h.st.embMap['い']=['0:1:イ',''];h.st.embTry();assert.equal(TP.parseChars(h.reports.at(-1)).emb,1);assert.ok(h.draws.some(d=>d.text==='イ'));
 const gone=mk('う');h.st.embPend=h.st.embQueue(gone);gone.cleared=true;h.st.embMap['う']=['','中'];h.st.embTry();
 assert.equal(h.st.embPend,undefined);assert.ok(!h.draws.some(d=>d.text==='中'),'never drawn on a cleared page');
 const name={...mk('え'),role:'name'};assert.equal(h.st.embQueue(name),undefined,'name plates are never replaced');
 const off=harness({ctl:'#cfg roles=1\n'});off.st.ctl();assert.equal(off.st.embQueue(mk('あ')),undefined,'embed off');
});

test('script wiring: name plates only with roles, links routed before the sentence starts, processCh path never hidden while embedding',()=>{
 assert.ok(script.includes("if(L.height<sh*0.2) {if(!this.cfg.roles) return;role='name';}"));
 assert.ok(script.includes("if(il>=0) {this.linkCh(rec,L,il,ch,cx,cy,size,sw,sh);return;}"));
 assert.ok(script.indexOf("this.linkCh(rec,L,il")<script.indexOf("if(rec.n==0) {\n     if(role=='line') this.fontReport(L);"));
 assert.ok(script.includes("st.hideMsg=function(){return !this.cfg.embed && this.hideOn();}"));
 assert.ok(script.includes("if(st.hideMsg() && ui=='') {"),'drawText wrapper');
 assert.ok(script.includes("if(rec.role=='name') return; /* engine-draw"),'no page records for name plates');
 assert.ok(script.includes("this.st.flush(this,true)"),'a clear never queues a replacement');
 const cpp=fs.readFileSync(path.join(root,'native/krkrtext/KrkrText.cpp'),'utf8');
 assert.ok(cpp.includes('L"__megulitKrkrCtlPath"')&&cpp.includes('L"MeguLit\\\\draw\\\\%lu.txt"'));
});

test('one rule for glyphs the game keeps drawing: [link] text always (ファタ incr11), name plates with draw.roles',()=>{
 const a=script.indexOf('st.uiDraw=function(ll){'),b=script.indexOf('} incontextof st;',a);
 const fn=new Function('st',('st.uiDraw=function(ll){'+script.slice(a+'st.uiDraw=function(ll){'.length,b)+'}').replace(/typeof P\.inLink!='undefined'/,"P.inLink!==undefined").replace(/!isvalid P/,'false').replace(/\bvoid\b/g,'undefined')+';');
 const st={cfg:{roles:1},screen:()=>[1280,720],choicePage:()=>false};fn(st); /* the choice page has its own test (fata-choice-page) */
 const msg={height:200,inLink:-1},name={height:60},link={height:200,inLink:2};
 assert.deepEqual([st.uiDraw({parent:msg}),st.uiDraw({parent:name}),st.uiDraw({parent:link}),st.uiDraw({parent:null})],['','name','link','']);
 st.cfg.roles=0;assert.deepEqual([st.uiDraw({parent:name}),st.uiDraw({parent:link})],['','link'],'roles off: links still drawn by the game, name plates as before');
 assert.ok(script.includes("var ui=st.uiDraw(self);if(ui=='link') st.link++;")&&script.includes("if(st.hideMsg() && ui=='') {"));
 assert.ok(!script.includes('inLink=true'),'no second inLink rule (the drawText wrapper asks uiDraw only)');
});

/* ---- KiriKiri Z TextRender (Yuzusoft) ---- */
function trRig(ctl){const h=harness({ctl});h.st.ctl();Object.assign(h.st,{shown:()=>1,trLine:7,trTailA:' sw=1280 sh=720 vx=0 vy=0 vw=0 vh=0 n=5 rects=x',trCol:'f7f77b'});
 h.L.textLayer={opacity:255};h.L.defaultEdge=true;h.L.defaultEdgeColor=0x202020;return h;}
const trAll=(t,x=60,y=560)=>[...t].map((c,i)=>[x+28*i,y,28,28,c]);

test('TextRender embed: ruby and Chinese on the message layer under its text layer, whole layer saved, record emb=2, taken off with the next line',()=>{
 const h=trRig('#cfg embed=1\n今日は晴れ\t0:2:きょう\t今天晴朗\n'),all=trAll('今日は晴れ');
 h.st.embPend=h.st.embTrQueue(h.L,all,'今日は晴れ',0,'今日は晴れ',0);h.st.embTry();
 const ruby=h.draws.find(d=>d.text==='きょう'),zh=h.draws.find(d=>d.text==='今天晴朗');
 assert.ok(ruby&&zh,JSON.stringify(h.draws));assert.equal(ruby.color,0xf7f77b,'the colour sampled from the glyphs');
 assert.ok(h.copies.some(c=>c.from==='msg'&&c.w===1200&&c.h===200),'the whole layer saved (its image is not cleared with the text)');
 const r=TP.parseChars(h.reports.at(-1).replace('rects=x','rects=').replace('n=5','n=0'));
 assert.ok(h.reports.at(-1).startsWith('ToMe_CHARS engine=krkr line=100007 hidden=0 sw=1280')&&/ color=f7f77b emb=2 text=今日は晴れ$/.test(h.reports.at(-1)),h.reports.at(-1));
 h.st.embTrOff();assert.ok(h.copies.some(c=>c.to==='msg'),'put back for the next line');
 h.st.trLine=8;const q=h.st.embTrQueue(h.L,all,'今日は晴れ',0,'今日は晴れ',0);h.st.trLine=9;h.st.embPend=q;h.st.embTry();assert.equal(h.st.embPend,undefined,'a line that moved on is given up');
});

test('TextRender embed: a page that grew by a sentence asks for the new sentence only',()=>{
 const h=trRig('#cfg embed=1\n二文目\t\t第二句\n'),all=trAll('一文目二文目');
 const q=h.st.embTrQueue(h.L,all,'一文目二文目',3,'一文目二文目',0);assert.equal(q.k,'二文目');assert.equal(q.ra.length,3);assert.equal(q.x0,60+28*3);
 assert.equal(h.st.embTrQueue(h.L,all.slice(0,4),'一文目二文目',0,'',0),undefined,'boxes and text out of step: nothing');
});

test('TextRender roles: name plate from processNameText (the game method still runs), links from KAG hot spots with their characters',()=>{
 const h=trRig('#cfg roles=1\n');let called=0;
 const nl=new h.Layer();Object.assign(nl,{name:'name',left:20,top:-40,width:200,height:36,parent:h.L});h.L.nameLayer=nl;h.L.processNameText=function(n){called++;return 'ok:'+n;};
 h.st.nameScan();assert.equal(h.reports.length,0,'no name yet');
 assert.equal(h.L.processNameText('ハルカ'),'ok:ハルカ');assert.equal(called,1);
 h.st.nameScan();const n=TP.parseChars(h.reports.at(-1));assert.deepEqual([n.role,n.id,n.text,n.box],['name','N:0','ハルカ',[60,460,200,36]]);
 h.st.nameScan();assert.equal(h.reports.length,1,'unchanged');
 nl.visible=false;h.st.nameScan();assert.deepEqual(TP.parseChars(h.reports.at(-1)).box,[0,0,0,0]);
 h.st.trAll=trAll('はいいいえ',60,560);h.st.trAllL=h.L;h.L.numLinks=2;h.L.keyLink=0;
 h.L.links=[{x:[20],y:[60],w:[56],h:[28]},{x:[76],y:[60],w:[84],h:[28]}];
 h.st.trLinkScan();const ls=h.reports.slice(-2).map(TP.parseChars);
 assert.deepEqual(ls.map(x=>[x.role,x.id,x.text,x.box,x.sel]),[['choice','K0:0','はい',[60,560,56,28],true],['choice','K0:1','いいえ',[116,560,84,28],false]]);
 h.L.numLinks=0;h.st.trLinkScan();assert.equal(TP.parseChars(h.reports.at(-1)).text,'');
 assert.ok(script.includes("var T=L.textLayer,on=this.hideOn() && !(typeof this.cfg=='Object' && this.cfg.embed);"),'never hidden while the game draws the replacement');
});
