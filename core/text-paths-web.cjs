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
 var S={on:false,wanted:'',el:null,line:0,last:'',timer:0,style:null,canvas:false};
 function send(o){try{window.__megulitReport(JSON.stringify(o));}catch(e){}}
 function norm(s){return String(s||'').replace(/[\s　]+/g,'');}
 function visible(el){try{var r=el.getBoundingClientRect();if(r.width<4||r.height<4)return false;var cs=getComputedStyle(el);return cs.visibility!=='hidden'&&cs.display!=='none'&&+cs.opacity>0;}catch(e){return false;}}
 function textOf(el){var out='',w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,{acceptNode:function(n){var p=n.parentElement;if(!p)return 2;if(p.closest('rt,rp,script,style'))return 2;return 1;}});for(var n;(n=w.nextNode());)out+=n.data;return out;}
 function pick(){
  for(var i=0;i<KNOWN.length;i++){var list;try{list=document.querySelectorAll(KNOWN[i]);}catch(e){continue;}for(var j=list.length-1;j>=0;j--){var el=list[j];if(visible(el)&&norm(textOf(el)))return el;}}
  var want=norm(S.wanted);if(want.length<2)return null;
  var best=null,bestLen=1e9,all=document.body?document.body.getElementsByTagName('*'):[];
  for(var k=0;k<all.length&&k<20000;k++){var e=all[k];if(/^(SCRIPT|STYLE|RT|RP|HTML|BODY)$/.test(e.tagName))continue;var t=norm(e.textContent);if(t.length<want.length||t.length>=bestLen)continue;
   if(t.indexOf(want)>=0||want.indexOf(t)===0&&t.length>=Math.min(want.length,4)){var tt=norm(textOf(e));if((tt.indexOf(want)>=0||want.indexOf(tt)===0)&&visible(e)){best=e;bestLen=t.length;}}}
  return best;}
 function ensureStyle(){if(S.style&&S.style.isConnected)return;S.style=document.createElement('style');S.style.setAttribute('data-megulit','hide');
  S.style.textContent='[data-megulit-hide],[data-megulit-hide] *{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;-webkit-text-stroke-color:transparent!important;text-decoration-color:transparent!important;caret-color:transparent!important}';
  (document.head||document.documentElement).appendChild(S.style);}
 function apply(){var old=document.querySelectorAll('[data-megulit-hide]');for(var i=0;i<old.length;i++)if(old[i]!==S.el||!S.on)old[i].removeAttribute('data-megulit-hide');
  if(S.on&&S.el){ensureStyle();S.el.setAttribute('data-megulit-hide','');}}
 function transparent(c){var m=/rgba?\(([^)]*)\)/.exec(c||'');if(!m)return c==='transparent';var p=m[1].split(/[ ,\/]+/).filter(Boolean);return p.length>=4&&+p[3]===0;}
 function measure(){
  var el=S.el;if(!el||!el.isConnected)return null;var dpr=window.devicePixelRatio||1,rects=[],text='',hidden=S.on,prevTop=null,w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,{acceptNode:function(n){var p=n.parentElement;if(!p||p.closest('rt,rp,script,style'))return 2;return 1;}});
  for(var n;(n=w.nextNode());){var p=n.parentElement,cs=getComputedStyle(p);if(cs.visibility==='hidden'||cs.display==='none')continue;
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
   var w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,{acceptNode:function(n){var p=n.parentElement;if(!p||p.closest('rt,rp,script,style')||!/\S/.test(n.data))return 2;return 1;}}),n=w.nextNode();
   if(n){var cs=getComputedStyle(n.parentElement);c=hex(cs.webkitTextFillColor)||hex(cs.color);}}catch(e){}
  try{if(on)el.setAttribute('data-megulit-hide','');}catch(e){}return c;}
 function scan(){S.timer=0;try{
  var el=pick();if(el!==S.el){S.el=el;apply();}
  if(!el){if(!S.canvas&&document.querySelector('canvas')&&!document.querySelector(KNOWN.join(','))){S.canvas=true;send({status:'canvas'});}return;}
  var m=measure();if(!m||!m.rects.length)return;var flat=norm(m.text);
  if(!(S.last&&(flat.indexOf(S.last)===0||S.last.indexOf(flat)===0)))S.line++;
  var key=S.line+'|'+m.hidden+'|'+m.color+'|'+m.rects.map(function(q){return q.map(Math.round).join(',');}).join(';');
  if(key===S.key)return;S.key=key;S.last=flat;
  send({line:S.line,hidden:m.hidden,sw:m.sw,sh:m.sh,rects:m.rects,text:m.text,color:m.color});
 }catch(e){send({status:'error '+(e&&e.message)});}}
 function later(){if(!S.timer)S.timer=setTimeout(scan,40);}
 window.__megulitText={hide:function(on){S.on=!!on;apply();S.key='';later();return S.on;},want:function(t){S.wanted=String(t||'');later();},scan:scan};
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
  this.closed=new Promise(r=>{this.ws.onclose=r;});}
 send(method,params={}){const id=++this.id;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});try{this.ws.send(JSON.stringify({id,method,params}));}catch(e){this.pending.delete(id);reject(e);}});}
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
 async attachPage(t){const c=new Cdp(t.webSocketDebuggerUrl);await c.ready;this.pages.set(t.id,c);c.closed.then(()=>this.pages.delete(t.id));
  c.handlers.add(m=>{if(m.method==='Runtime.bindingCalled'&&m.params?.name==='__megulitReport')this.report(m.params.payload);});
  await c.send('Runtime.enable');await c.send('Runtime.addBinding',{name:'__megulitReport'});
  await c.send('Page.enable').catch(()=>{});await c.send('Page.addScriptToEvaluateOnNewDocument',{source:PAGE_SCRIPT}).catch(()=>{});await c.send('Page.addScriptToEvaluateOnNewDocument',{source:RPGM_SCRIPT}).catch(()=>{});
  await this.evaluate(c,PAGE_SCRIPT);await this.evaluate(c,RPGM_SCRIPT);await this.sync(c);
  /* a reload or new document: the page script runs again; give it the current state */
  c.handlers.add(m=>{if(m.method==='Runtime.executionContextCreated')setTimeout(()=>this.sync(c).catch(()=>{}),300);});}
 evaluate(c,expression){return c.send('Runtime.evaluate',{expression,returnByValue:true}).catch(()=>null);}
 sync(c){return this.evaluate(c,'window.__megulitText&&(window.__megulitText.want('+JSON.stringify(this.wanted)+'),window.__megulitText.hide('+(this.on?'true':'false')+'));'+(this.drawCfg?'window.__megulitRpgm&&window.__megulitRpgm.config('+JSON.stringify(this.drawCfg)+')':''));}
 /* engine-draw (core/engine-draw.cjs): roles / embed switches and one sentence's replacement for the RPG Maker reader */
 async drawConfig(cfg){const c={roles:cfg?.roles===true,embed:cfg?.embed===true,zh:cfg?.zh!==false};if(JSON.stringify(c)===JSON.stringify(this.drawCfg))return;this.drawCfg=c;for(const p of this.pages.values())await this.sync(p);}
 async drawEmbed(key,o={}){const e={ruby:Array.isArray(o.ruby)?o.ruby:[],zh:String(o.zh||'')},js='window.__megulitRpgm&&window.__megulitRpgm.embed('+JSON.stringify(String(key||''))+','+JSON.stringify(e)+')';for(const p of this.pages.values())await this.evaluate(p,js);}
 async hide(on){this.on=!!on;if(this.on&&this.canary&&!this.canary.allowed('web')){this.on=false;this.onStatus('web invisible drawing off for this game (crash canary)');}
  for(const c of this.pages.values())await this.sync(c);}
 async want(text){this.wanted=String(text||'');for(const c of this.pages.values())await this.sync(c);}
 report(payload){let o;try{o=JSON.parse(payload);}catch{return;}if(o.status){this.onStatus(o.status);return;}
  if(typeof o.ask==='string'&&o.ask){this.onAsk({key:o.ask,text:String(o.text||o.ask),engine:'rpgm'});return;}
  if(!Array.isArray(o.rects))return;
  if(o.hidden&&this.canary){if(!this.armed){this.canary.arm('web');this.armed=true;}else this.canary.alive('web');}
  this.onChars(formatChars({engine:o.engine==='rpgm'?'rpgm':'web',line:o.line,hidden:o.hidden,sw:o.sw,sh:o.sh,viewport:[0,0,o.sw,o.sh],rects:o.rects,text:o.text,color:o.color,role:o.role,id:o.id,box:o.box,sel:o.sel,emb:o.emb}));}
 exited(code){if(this.canary&&this.armed)this.canary.exited('web',code);}
 stop(){this.stopped=true;for(const c of this.pages.values()){this.evaluate(c,'window.__megulitText&&window.__megulitText.hide(false)').finally(()=>c.close());}this.pages.clear();}
}

module.exports={chromiumShell,freePort,launchArgs,PAGE_SCRIPT,WebTextPath,getJson};
