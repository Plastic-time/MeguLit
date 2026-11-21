// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Text architecture ③, web path (docs/text-architecture.md). Games that run in their own Chromium (NW.js, Electron:
   TyranoScript, WebGAL, Monogatari, ink web, any DOM-text engine) lay out their dialogue as HTML text. MeguLit starts
   such a game with Chromium's remote debugging switch on a free loopback port and attaches over the DevTools protocol:
     - a page script (PAGE_SCRIPT, added for every new document as well) finds the message layer: the known message
       containers of the common engines first, otherwise the smallest visible element whose text is the current hook
       line (MeguLit sends it with want());
     - while MeguLit asks for it, that element's text is drawn transparent by one style rule (color /
       -webkit-text-fill-color transparent, no shadow or stroke): layout, wrapping, typewriter and click wait stay the
       game's own; nothing in the game's files, storage or saves is written;
     - after every change (typewriter included) each character's box is read with Range.getClientRects, converted from
       CSS pixels to client pixels (devicePixelRatio, transforms included by the browser) and reported as one
       ToMe_CHARS record (core/text-paths.cjs); hidden=1 only when the computed colour of every text node of the line is
       transparent at that moment.
   Canvas engines (RenJS / Phaser, PixiJS text) draw no DOM text: the page script reports "canvas" and this path stays
   off for them. Nothing here starts the game; services/bridge.cjs adds launchArgs() when the path is allowed. */
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),http=require('node:http');
const {formatChars}=require('./text-paths.cjs');
/* engine-draw: the RPG Maker MV/MZ reader (engine layer) rides along with the DOM page script */
const {RPGM_SCRIPT}=require('./text-paths-rpgm.cjs');

/* ---- which games: a Chromium shell next to the program (generic, any web engine) ---------------------------------- */
function chromiumShell(exe){const dir=path.dirname(String(exe||''));let names;try{names=fs.readdirSync(dir).map(n=>n.toLowerCase());}catch{return null;}
 const has=n=>names.includes(n);
 if(!has('icudtl.dat'))return null;
 if(has('nw.dll')||has('package.nw')||has('nw_elf.dll'))return 'nwjs';
 try{const res=fs.readdirSync(path.join(dir,'resources')).map(n=>n.toLowerCase());if(res.includes('app.asar')||res.includes('app'))return 'electron';}catch{}
 return null;}
function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.unref();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const {port}=s.address();s.close(()=>resolve(port));});});}
/* Chromium switches only: the game's own command line and package are not changed. */
function launchArgs(port){return ['--remote-debugging-port='+port,'--remote-debugging-address=127.0.0.1','--remote-allow-origins=http://127.0.0.1:'+port];}

/* ---- the page side --------------------------------------------------------------------------------------------------
   Runs in the game's page. Exposes window.__megulitText {hide(on), want(text), scan()} and reports through the CDP
   binding __megulitReport (JSON strings). Kept dependency-free and defensive: any failure leaves the page as it was. */
const PAGE_SCRIPT=String.raw`(function(){
 if(window.__megulitText)return;
 var KNOWN=['.message_inner','.tyrano_base .message_inner','#tyrano_base .message_inner','[data-content="dialog"]','text-box [data-content="text"]','#textBoxMain','[class*="TextBox_main"]','[class*="textbox_main"]','#story p:last-of-type','.story p:last-of-type','#dialogue','.dialogue-text','.textbox .text','#message','.message-text'];
 var S={on:false,wanted:'',el:null,line:0,last:'',live:false,first:null,timer:0,style:null,canvas:false,cfg:{roles:false,embed:false,zh:true},emb:{},order:[],asked:{},embDone:-1,embLevel:0,embFlat:'',embNodes:[],embTimer:0,ui:0,uiKey:{}};
 function send(o){try{window.__megulitReport(JSON.stringify(o));}catch(e){}}
 function norm(s){return String(s||'').replace(/[\s　]+/g,'');}
 function kag(){var k=window.TYRANO&&window.TYRANO.kag;return k&&k.stat&&typeof k.getMessageInnerLayer==='function'?k:null;}
 function tyrano(el){return !!(kag()||el&&el.closest('.tyrano_base,#tyrano_base'));}
 function painted(el){try{for(var p=el;p;p=p.parentElement){var cs=getComputedStyle(p);if(cs.visibility==='hidden'||cs.visibility==='collapse'||cs.display==='none'||+cs.opacity===0)return false;}return true;}catch(e){return false;}}
 function visible(el){try{var r=el.getBoundingClientRect();return r.width>=4&&r.height>=4&&painted(el);}catch(e){return false;}}
 var UI_TEXT='.chara_name_area,.glink_button,.tyrano_button_text,[data-event-tag="glink"],[data-event-tag="link"]';
 function nameAreas(){try{var k=kag(),ns=k&&k.chara&&typeof k.chara.getCharaNameArea==='function'&&k.chara.getCharaNameArea();return ns?Array.from(ns).slice(0,40):[];}catch(e){return [];}}
 function walker(el,body){var names=body?nameAreas():[];return document.createTreeWalker(el,NodeFilter.SHOW_TEXT,{acceptNode:function(n){var p=n.parentElement;if(!p||p.closest('rt,rp,script,style,.megulit-zh'))return 2;
  if(tyrano(p)){if(p.closest('.stroke,.dummy')&&p.closest('.char'))return 2;if(body&&(p.closest(UI_TEXT)||names.some(function(a){return a&&a.contains(p);})))return 2;}return 1;}});}
 function textOf(el,body){var out='',w=walker(el,body!==false);for(var n;(n=w.nextNode());)out+=n.data;return out;}
 function firstOf(el){var w=walker(el,true),n;while((n=w.nextNode()))if(norm(n.data))return n;return null;}
 function pick(){
  var k=kag();if(k){try{var own=k.getMessageInnerLayer(),el=own&&(typeof own.get==='function'?own.get(0):own[0]);return el&&el.isConnected&&visible(el)&&norm(textOf(el))?el:null;}catch(e){return null;}}
  for(var i=0;i<KNOWN.length;i++){var list;try{list=document.querySelectorAll(KNOWN[i]);}catch(e){continue;}for(var j=list.length-1;j>=0;j--){var el=list[j];if(visible(el)&&norm(textOf(el)))return el;}}
  var want=norm(S.wanted);if(want.length<2)return null;
  var best=null,bestLen=1e9,all=document.body?document.body.getElementsByTagName('*'):[];
  for(var k=0;k<all.length&&k<20000;k++){var e=all[k];if(/^(SCRIPT|STYLE|RT|RP|HTML|BODY)$/.test(e.tagName))continue;var t=norm(e.textContent);if(t.length<want.length||t.length>=bestLen)continue;
   if(t.indexOf(want)>=0||want.indexOf(t)===0&&t.length>=Math.min(want.length,4)){var tt=norm(textOf(e));if((tt.indexOf(want)>=0||want.indexOf(tt)===0)&&visible(e)){best=e;bestLen=t.length;}}}
  return best;}
 function ensureStyle(){if(S.style&&S.style.isConnected)return;S.style=document.createElement('style');S.style.setAttribute('data-megulit','hide');
  S.style.textContent='[data-megulit-hide],[data-megulit-hide] *{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;-webkit-text-stroke-color:transparent!important;text-decoration-color:transparent!important;caret-color:transparent!important}';
  (document.head||document.documentElement).appendChild(S.style);}
 function mixed(el){return tyrano(el)&&(!!el.querySelector(UI_TEXT)||nameAreas().some(function(a){return a&&el.contains(a);}));}
 function apply(){var can=S.on&&!S.cfg.embed&&S.el&&!mixed(S.el)&&textOf(S.el).length<=4000,old=document.querySelectorAll('[data-megulit-hide]');for(var i=0;i<old.length;i++)if(old[i]!==S.el||!can)old[i].removeAttribute('data-megulit-hide');
  if(can){ensureStyle();S.el.setAttribute('data-megulit-hide','');}}
 function transparent(c){var m=/rgba?\(([^)]*)\)/.exec(c||'');if(!m)return c==='transparent';var p=m[1].split(/[ ,\/]+/).filter(Boolean);return p.length>=4&&+p[3]===0;}
 function fits(m){if(!m||!m.rects.length||m.text.length>4000||m.rects.length>4000)return false;var cs=Array.from(m.text.replace(/\n/g,''));return cs.length===m.rects.length&&cs.every(function(c){var cp=c.codePointAt(0);return cp<0xd800||cp>0xdfff;});}
 function measure(el,body){
  if(!el||!el.isConnected)return null;var dpr=window.devicePixelRatio||1,rects=[],text='',hidden=body&&S.on&&!S.cfg.embed&&el.hasAttribute('data-megulit-hide'),prevTop=null,w=walker(el,body);
  for(var n;(n=w.nextNode());){var p=n.parentElement,cs=getComputedStyle(p);if(!painted(p))continue;
   if(hidden&&!(transparent(cs.color)&&transparent(cs.webkitTextFillColor||cs.color)||transparent(cs.webkitTextFillColor)))hidden=false;
   var d=n.data;for(var i=0;i<d.length;){var cp=d.codePointAt(i),len=cp>0xffff?2:1,ch=d.substr(i,len);
    if(!/[\s　​﻿]/.test(ch)){var r=document.createRange();r.setStart(n,i);r.setEnd(n,i+len);var b=r.getClientRects();
     if(b.length&&b[0].width>0&&b[0].height>0){var q=b[0];if(prevTop!==null&&Math.abs(q.top-prevTop)>q.height/2)text+='\n';prevTop=q.top;text+=ch;rects.push([q.left*dpr,q.top*dpr,q.width*dpr,q.height*dpr]);}}
    i+=len;}}
  return {rects:rects,text:text,hidden:hidden&&rects.length>0,sw:innerWidth*dpr,sh:innerHeight*dpr,color:gameColor(el)};}
 /* The colour the game gives this line (read / unread colours), also while MeguLit hides it: the hide rule is lifted for one
    synchronous style read (nothing is painted in between) and put back. The first visible text node speaks for the line. */
 function hex(c){var m=/rgba?\(([^)]*)\)/.exec(c||'');if(!m)return '';var p=m[1].split(/[ ,\/]+/).filter(Boolean);if(p.length<3||p.length>=4&&+p[3]===0)return '';var s='';for(var i=0;i<3;i++){var v=Math.max(0,Math.min(255,Math.round(+p[i])));if(!(v>=0))return '';s+=(v<16?'0':'')+v.toString(16);}return s;}
 function gameColor(el){var on=el.hasAttribute('data-megulit-hide'),c='';try{if(on)el.removeAttribute('data-megulit-hide');
   var w=walker(el,true),n;while((n=w.nextNode()))if(/\S/.test(n.data)&&painted(n.parentElement))break;
   if(n){var cs=getComputedStyle(n.parentElement);c=hex(cs.webkitTextFillColor)||hex(cs.color);}}catch(e){}
  try{if(on)el.setAttribute('data-megulit-hide','');}catch(e){}return c;}
 function clearBody(){clearTimeout(S.embTimer);S.embTimer=0;if(S.live)send({line:S.line,hidden:false,sw:innerWidth*(window.devicePixelRatio||1),sh:innerHeight*(window.devicePixelRatio||1),rects:[],text:''});S.live=false;S.last='';S.key='';S.first=null;S.embDone=-1;S.embLevel=0;}
 function restoreEmbed(){for(var i=S.embNodes.length-1;i>=0;i--){var n=S.embNodes[i];if(!n.parentNode)continue;if(n.className==='megulit-zh')n.remove();else{var rt=n.querySelector('rt');if(rt)rt.remove();while(n.firstChild)n.parentNode.insertBefore(n.firstChild,n);n.remove();}}S.embNodes=[];S.embFlat='';S.embDone=-1;S.embLevel=0;}
 function scan(){S.timer=0;try{
  var el=pick();if(el!==S.el){restoreEmbed();clearBody();S.el=el;}apply();
  if(!el){if(!S.canvas&&document.querySelector('canvas')&&!document.querySelector(KNOWN.join(','))){S.canvas=true;send({status:'canvas'});}return;}
  var first=firstOf(el);if(S.live&&first!==S.first){restoreEmbed();clearBody();}S.first=firstOf(el);
  if(S.embFlat&&S.embFlat!==norm(textOf(el))){restoreEmbed();S.first=firstOf(el);}
  var m=measure(el,true);if(!fits(m)){el.removeAttribute('data-megulit-hide');restoreEmbed();clearBody();return;}var flat=norm(m.text);
  if(S.last&&flat.length<S.last.length){clearBody();S.first=firstOf(el);}
  if(!(S.last&&(flat.indexOf(S.last)===0||S.last.indexOf(flat)===0)))S.line++;
  var emb=S.embDone===S.line?S.embLevel:0;
  if(S.on&&S.cfg.embed&&S.embDone!==S.line&&!S.embTimer)S.embTimer=setTimeout(embTry,300);
  var key=S.line+'|'+m.text+'|'+m.hidden+'|'+m.color+'|'+emb+'|'+m.rects.map(function(q){return q.map(Math.round).join(',');}).join(';');
  if(key===S.key)return;S.key=key;S.last=flat;S.live=true;
  send({line:S.line,hidden:m.hidden,sw:m.sw,sh:m.sh,rects:m.rects,text:m.text,color:m.color,emb:emb});
 }catch(e){send({status:'error '+(e&&e.message)});}}
 function later(){if(!S.timer)S.timer=setTimeout(scan,40);}
 /* The engine's is_adding_text and visible glyphs gate Tyrano embedding; a quiet DOM alone is not typewriter completion.
    Only owned ruby/Chinese additions are removed on withdrawal, preserving native ruby and game nodes/events. */
 function embTry(){S.embTimer=0;try{
  if(!S.on||!S.cfg.embed||!S.el||pick()!==S.el||S.embDone===S.line||mixed(S.el))return;
  var engine=kag();if(engine&&engine.stat.is_adding_text)return;
  var k=norm(textOf(S.el)),m=measure(S.el,true);if(!k||!m||norm(m.text)!==k)return;var e=S.emb[k];
  if(!e){if(!S.asked[k]){S.asked[k]=1;send({ask:k,text:k,engine:'web'});}return;}
  var level=embApply(S.el,k,e);S.embDone=S.line;S.embLevel=level;S.embFlat=k;S.first=firstOf(S.el);S.key='';later();
 }catch(err){restoreEmbed();S.first=S.el?firstOf(S.el):null;send({status:'emb error '+(err&&err.message)});}}
 function charMap(el){var map=[],w=walker(el,true);
  for(var n;(n=w.nextNode());){var d=n.data;for(var i=0;i<d.length;){var cp=d.codePointAt(i),len=cp>0xffff?2:1;if(!/[\s\u3000]/.test(d.substr(i,len)))map.push([n,i,len]);i+=len;}}return map;}
 /* the element that holds nothing but this one character (a typewriter's per-character span): moved whole, never split */
 function own(el,c){if(c[1]!==0||c[2]!==c[0].data.length)return null;var n=c[0],top=null,ch=n.parentElement.closest('.char');if(tyrano(el)&&ch&&el.contains(ch)&&norm(textOf(ch))===norm(n.data))return ch;while(n.parentElement&&n.parentElement!==el&&n.parentElement.textContent===c[0].data){n=n.parentElement;top=n;}return top;}
 function overflow(el){for(var p=el,i=0;p&&i<4;p=p.parentElement,i++){if(p.clientHeight>0&&p.scrollHeight>p.clientHeight+2)return true;}return false;}
 function embApply(el,k,e){
  var lvl=0,spans=(e.ruby||[]).filter(function(s){return Array.isArray(s)&&Number.isInteger(s[0])&&Number.isInteger(s[1])&&s[0]>=0&&s[1]>s[0]&&typeof s[2]==='string'&&s[2]&&s[2].length<=320;}).sort(function(a,b){return b[0]-a[0];}),bound=Infinity;
  var map=charMap(el);if(map.length!==Array.from(k).length)return 0;
  for(var i=0;i<spans.length;i++){var s=spans[i];if(s[1]>map.length||s[1]>bound)continue;var native=false;for(var j=s[0];j<s[1];j++)if(map[j][0].parentElement.closest('ruby')){native=true;break;}if(native)continue;bound=s[0];
   var a=map[s[0]],b=map[s[1]-1],r=document.createRange(),ea=own(el,a),eb=own(el,b);if(ea)r.setStartBefore(ea);else r.setStart(a[0],a[1]);if(eb)r.setEndAfter(eb);else r.setEnd(b[0],b[1]+b[2]);
   var ru=document.createElement('ruby');ru.className='megulit-ruby';S.embNodes.push(ru);ru.appendChild(r.extractContents());var rt=document.createElement('rt');rt.textContent=String(s[2]);ru.appendChild(rt);r.insertNode(ru);}
  if(S.embNodes.length&&overflow(el)){restoreEmbed();return 0;}
  lvl=1;
  if(S.cfg.zh&&e.zh){var z=document.createElement('div');z.className='megulit-zh';S.embNodes.push(z);z.textContent=String(e.zh).replace(/\x1f/g,'\n');z.style.cssText='display:block;white-space:pre-wrap;font-size:0.8em;line-height:1.35;margin-top:0.15em;';el.appendChild(z);
   if(overflow(el))z.style.fontSize='0.7em';if(overflow(el))z.remove();else lvl=2;}
  return lvl;}
 /* Engine-owned UI stays visible and clickable; glyph rects keep wrapped rows out of the space between them. */
 var ROLE_SEL=[['name','.chara_name_area'],['choice','.glink_button,[data-event-tag="glink"],[data-event-tag="link"]'],['button','.tyrano_button_text']];
 function clearUi(){ROLE_SEL.forEach(function(rs){if(S.uiKey[rs[0]]&&S.uiKey[rs[0]]!=='[]')send({ui:true,line:++S.ui,hidden:false,sw:innerWidth*(window.devicePixelRatio||1),sh:innerHeight*(window.devicePixelRatio||1),role:rs[0],id:'D'+rs[0]+':',box:[0,0,0,0],rects:[],text:''});});S.uiKey={};}
 function uiScan(){try{if(!S.on||!S.cfg.roles)return;var dpr=window.devicePixelRatio||1,sw=innerWidth*dpr,sh=innerHeight*dpr;
  ROLE_SEL.forEach(function(rs){var list=document.querySelectorAll(rs[1]),items=[];
   list=Array.from(list);if(rs[0]==='name')nameAreas().forEach(function(a){if(list.indexOf(a)<0)list.push(a);});
   for(var i=0;i<list.length&&items.length<40;i++){var el=list[i];if(!visible(el))continue;var m=measure(el,false);if(!fits(m))continue;var r=el.getBoundingClientRect();items.push({t:m.text,rects:m.rects,box:[r.left*dpr,r.top*dpr,r.width*dpr,r.height*dpr]});}
   var key=JSON.stringify(items.map(function(it){return [it.t,it.box.map(Math.round),it.rects.map(function(q){return q.map(Math.round);})];})),had=S.uiKey[rs[0]];if(had===key||had===undefined&&!items.length)return;S.uiKey[rs[0]]=key;var line=++S.ui;
   if(!items.length){send({ui:true,line:line,hidden:false,sw:sw,sh:sh,role:rs[0],id:'D'+rs[0]+':',box:[0,0,0,0],rects:[],text:''});return;}
   items.forEach(function(it,j){send({ui:true,line:line,hidden:false,sw:sw,sh:sh,role:rs[0],id:'D'+rs[0]+':'+j,box:it.box,rects:it.rects,text:it.t});});});
 }catch(e){}}
 setInterval(function(){uiScan();if(S.on)later();},300);
 window.__megulitText={hide:function(on){on=!!on;if(S.on&&!on){restoreEmbed();clearBody();clearUi();}S.on=on;apply();S.key='';later();return S.on;},want:function(t){S.wanted=String(t||'');later();},scan:scan,
  config:function(c){c=c||{};var cfg={roles:c.roles===true,embed:c.embed===true,zh:c.zh!==false};if(S.cfg.roles&&!cfg.roles)clearUi();if(S.cfg.embed!==cfg.embed||S.cfg.zh!==cfg.zh){restoreEmbed();clearBody();}S.cfg=cfg;apply();S.key='';later();return S.cfg;},
  stop:function(){this.config({});this.hide(false);S.emb={};S.order=[];S.asked={};},
  embed:function(k,e){k=String(k||'');if(!k)return;if(!S.emb[k])S.order.push(k);S.emb[k]={ruby:Array.isArray(e&&e.ruby)?e.ruby:[],zh:String(e&&e.zh||'')};while(S.order.length>64)delete S.emb[S.order.shift()];if(S.cfg.embed){clearTimeout(S.embTimer);S.embTimer=setTimeout(embTry,0);}}};
 function observe(){try{new MutationObserver(later).observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','style']});}catch(e){}window.addEventListener('resize',later);later();}
 if(document.documentElement)observe();else document.addEventListener('DOMContentLoaded',observe);
 send({status:'ok'});
})();`;

/* ---- DevTools protocol -------------------------------------------------------------------------------------------- */
function getJson(port,p){return new Promise((resolve,reject)=>{const req=http.get({host:'127.0.0.1',port,path:p,timeout:2000},res=>{let s='';res.setEncoding('utf8');res.on('data',d=>s+=d);res.on('end',()=>{try{resolve(JSON.parse(s));}catch(e){reject(e);}});});req.on('error',reject);req.on('timeout',()=>req.destroy(Error('timeout')));});}
class Cdp{
 constructor(url){this.ws=new WebSocket(url);this.id=0;this.pending=new Map();this.handlers=new Set();
  this.ready=new Promise((resolve,reject)=>{this.ws.onopen=resolve;this.ws.onerror=()=>reject(Error('CDP_CONNECT'));});
  this.ws.onmessage=ev=>{let m;try{m=JSON.parse(ev.data);}catch{return;}if(m.id&&this.pending.has(m.id)){const p=this.pending.get(m.id);this.pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}else if(m.method)for(const h of this.handlers)h(m);};
  this.closed=new Promise(r=>{this.ws.onclose=()=>{this.isClosed=true;for(const p of this.pending.values())p.reject(Error('CDP_CLOSED'));this.pending.clear();r();};});}
 send(method,params={}){if(this.isClosed)return Promise.reject(Error('CDP_CLOSED'));const id=++this.id;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});try{this.ws.send(JSON.stringify({id,method,params}));}catch(e){this.pending.delete(id);reject(e);}});}
 close(){try{this.ws.close();}catch{}}
}

/* One game: attaches to every page target, keeps hide / wanted in sync, turns reports into ToMe_CHARS lines. */
class WebTextPath{
 constructor({port,onChars=()=>{},onStatus=()=>{},onAsk=()=>{},canary=null,now=()=>Date.now()}){Object.assign(this,{port,onChars,onStatus,onAsk,canary,now});this.drawCfg=null;this.pages=new Map();this.on=false;this.wanted='';this.stopped=false;this.armed=false;}
 async attach({timeout=60000}={}){const until=this.now()+timeout;
  while(!this.stopped&&this.now()<until){let list=[];try{list=await getJson(this.port,'/json/list');}catch{}
   for(const t of list)if(t.type==='page'&&t.webSocketDebuggerUrl&&!/^(devtools|chrome|chrome-extension):/i.test(t.url||'')&&!this.pages.has(t.id))await this.attachPage(t).catch(e=>this.onStatus('attach '+e.message));
   if(this.pages.size)return true;await new Promise(r=>setTimeout(r,500));}
  return false;}
 attachPage(t){this.attaching??=new Set();const p=this.attachPageInner(t);this.attaching.add(p);p.then(()=>this.attaching.delete(p),()=>this.attaching.delete(p));return p;}
 async attachPageInner(t){if(this.stopped)return;const c=new Cdp(t.webSocketDebuggerUrl);this.connections??=new Set();this.connections.add(c);const current=()=>{if(this.stopped)throw Error('READER_DISABLED');};try{await c.ready;current();this.pages.set(t.id,c);c.closed.then(()=>this.pages.delete(t.id));
  c.handlers.add(m=>{if(m.method==='Runtime.bindingCalled'&&m.params?.name==='__megulitReport')this.report(m.params.payload);});
  await c.send('Runtime.enable');current();await c.send('Runtime.addBinding',{name:'__megulitReport'});current();
  await c.send('Page.enable').catch(()=>{});current();c.scriptIds=[];for(const source of [PAGE_SCRIPT,RPGM_SCRIPT]){const result=await c.send('Page.addScriptToEvaluateOnNewDocument',{source}).catch(()=>null);if(result?.identifier)c.scriptIds.push(result.identifier);current();}
  current();await this.evaluate(c,PAGE_SCRIPT);current();await this.evaluate(c,RPGM_SCRIPT);current();await this.sync(c);
  /* a reload or new document: the page script runs again; give it the current state */
  c.handlers.add(m=>{if(m.method==='Runtime.executionContextCreated')setTimeout(()=>this.sync(c).catch(()=>{}),300);});}catch(error){if(!this.stopped)c.close();throw error;}finally{if(!this.pages.has(t.id)&&!this.stopped)this.connections.delete(c);}}
 evaluate(c,expression){return c.send('Runtime.evaluate',{expression,returnByValue:true}).catch(()=>null);}
 sync(c){if(this.stopped)return Promise.resolve();return this.evaluate(c,'window.__megulitText&&(window.__megulitText.want('+JSON.stringify(this.wanted)+'),window.__megulitText.hide('+(this.on?'true':'false')+'));'+(this.drawCfg?'window.__megulitRpgm&&window.__megulitRpgm.config('+JSON.stringify(this.drawCfg)+');window.__megulitText&&window.__megulitText.config&&window.__megulitText.config('+JSON.stringify(this.drawCfg)+')':''));}
 /* engine-draw (core/engine-draw.cjs): roles / embed switches and one sentence's replacement for the RPG Maker reader */
 async drawConfig(cfg){const c={roles:cfg?.roles===true,embed:cfg?.embed===true,zh:cfg?.zh!==false};if(JSON.stringify(c)===JSON.stringify(this.drawCfg))return;this.drawCfg=c;for(const p of this.pages.values())await this.sync(p);}
 async drawEmbed(key,o={}){if(this.stopped)return;const e={ruby:Array.isArray(o.ruby)?o.ruby:[],zh:String(o.zh||'')},js='window.__megulitRpgm&&window.__megulitRpgm.embed('+JSON.stringify(String(key||''))+','+JSON.stringify(e)+');window.__megulitText&&window.__megulitText.embed&&window.__megulitText.embed('+JSON.stringify(String(key||''))+','+JSON.stringify(e)+')';for(const p of this.pages.values())await this.evaluate(p,js);}
 async hide(on){this.on=!!on;if(this.on&&this.canary&&!this.canary.allowed('web')){this.on=false;this.onStatus('web invisible drawing off for this game (crash canary)');}
  for(const c of this.pages.values())await this.sync(c);}
 async want(text){this.wanted=String(text||'');for(const c of this.pages.values())await this.sync(c);}
 report(payload){if(this.stopped)return;let o;try{o=JSON.parse(payload);}catch{return;}if(o.status){this.onStatus(o.status);return;}
  if(typeof o.ask==='string'&&o.ask){this.onAsk({key:o.ask,text:String(o.text||o.ask),engine:o.engine==='rpgm'?'rpgm':'web'});return;}
  if(!Array.isArray(o.rects))return;
  if(o.hidden&&this.canary){if(!this.armed){this.canary.arm('web');this.armed=true;}else this.canary.alive('web');}
  this.onChars(formatChars({engine:o.engine==='rpgm'?'rpgm':'web',line:o.line,hidden:o.hidden,sw:o.sw,sh:o.sh,viewport:[0,0,o.sw,o.sh],rects:o.rects,text:o.text,color:o.color,role:o.role,id:o.id,box:o.box,sel:o.sel,emb:o.emb}));}
 exited(code){if(this.canary&&this.armed)this.canary.exited('web',code);}
 stop(){
  if(this.stopping)return this.stopping;
  this.stopped=true;this.on=false;
  const all=this.connections||new Set(this.pages.values());let timer;
  const work=(async()=>{
   await Promise.allSettled([...(this.attaching||[])]);
   const results=await Promise.allSettled([...all].map(async c=>{
    const result=await c.send('Runtime.evaluate',{expression:'window.__megulitText&&(window.__megulitText.stop?window.__megulitText.stop():window.__megulitText.hide(false));window.__megulitRpgm&&window.__megulitRpgm.config({roles:false,embed:false,zh:false});window.__megulitText&&window.__megulitText.config&&window.__megulitText.config({roles:false,embed:false,zh:false});',returnByValue:true});
    if(result?.exceptionDetails)throw Error('READER_STOP_INCOMPLETE');
    for(const identifier of c.scriptIds||[])await c.send('Page.removeScriptToEvaluateOnNewDocument',{identifier});
   }));
   if(results.some(r=>r.status==='rejected'))throw Error('READER_STOP_INCOMPLETE');
  })();
  this.stopping=Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('READER_STOP_INCOMPLETE')),2000);})]).finally(()=>{clearTimeout(timer);for(const c of all)c.close();all.clear();this.pages.clear();});
  this.stopping.catch(()=>{});return this.stopping;
 }
}

module.exports={chromiumShell,freePort,launchArgs,PAGE_SCRIPT,WebTextPath,getJson};
