// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* engine-draw (docs/engine-draw-protocol.md, owner 2026-11-21): the kernel side of the per-engine draw readers. The engine
   layer (native/krkrtext/script.inc, the RPG Maker part of core/text-paths-web.cjs, …) reports every drawn run as
   ToMe_CHARS with its role; this module only
     - routes a parsed record: role=line goes on as a dialogue line, every other role is a UI item (annotated, never
       replaced or hidden),
     - keeps one replacement table per game process ({k, ruby, zh}, newest 64 sentences) and hands it to the engine's
       transport: KiriKiri reads a control file, web / RPG Maker get it over CDP.
   Which engine reads what stays in the engine layer; whether any of this is on is the profile (draw.roles, draw.embed,
   draw.embedTranslation; core/profiles/defaults.cjs, all off = the behaviour before engine-draw). */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Profiles=require('./profiles/index.cjs');
const MAX=64;

function settings(profile){const frames=Profiles.get(profile,'choice.pageFrames',[]);return {clear:Profiles.get(profile,'page.reportClear',false)===true,choiceFrames:Array.isArray(frames)?frames.filter(f=>typeof f==='string'&&f&&!/[\r\n]/.test(f)).slice(0,20):[],roles:Profiles.get(profile,'draw.roles',false)===true,embed:Profiles.get(profile,'draw.embed',false)===true,zh:Profiles.get(profile,'draw.embedTranslation',true)!==false,...withTable(tableLine(Profiles.get(profile,'draw.engineTable',null)))};}
const withTable=t=>t?{table:t}:{};
/* draw.engineTable (the version layer: this exe's addresses for an engine DLL that finds its functions by signature and
   checks them against the table, e.g. MAGES) -> one control-file line "#table <engine> key=value ..."; '' = none */
function tableLine(t){if(!t||typeof t!=='object'||Array.isArray(t)||!/^[a-z0-9]{1,16}$/.test(String(t.engine||'')))return '';
 const parts=[];for(const [k,v] of Object.entries(t)){if(k==='engine'||!/^[A-Za-z][A-Za-z0-9]{0,31}$/.test(k))continue;const val=Array.isArray(v)?v.join(','):v;if((typeof val==='string'||typeof val==='number')&&/^[\w.,-]{1,200}$/.test(String(val)))parts.push(k+'='+val);}
 return parts.length?'#table '+t.engine+' '+parts.join(' '):'';}
/* the key both sides use: the sentence's characters without blanks or line breaks */
const keyOf=t=>String(t||'').replace(/[\s　\u001f]/g,'');
/* reader spans [start, end, reading] (end exclusive, code points of the key) -> start:len:reading|... */
function rubyField(spans){
 if(!Array.isArray(spans))return '';
 return spans.filter(s=>Array.isArray(s)&&Number.isInteger(s[0])&&Number.isInteger(s[1])&&s[1]>s[0]&&s[0]>=0&&typeof s[2]==='string'&&s[2]&&!/[|:\t\r\n]/.test(s[2]))
  .map(s=>s[0]+':'+(s[1]-s[0])+':'+s[2]).join('|');
}
const clean=t=>String(t||'').replace(/\t/g,' ').replace(/\r?\n/g,'\u001f');

/* ---- KiriKiri transport: %TEMP%\MeguLit\draw\<pid>.txt, UTF-16LE with BOM (both KiriKiri 2 and Z read it) ---- */
function krkrControlPath(pid,tmp=os.tmpdir()){return path.join(tmp,'MeguLit','draw',(Number(pid)|0)+'.txt');}
function krkrControlText(cfg,entries){
 const lines=['#cfg roles='+(cfg.roles?1:0)+' embed='+(cfg.embed?1:0)+' zh='+(cfg.zh?1:0)];
 if(cfg.table)lines.push(cfg.table);
 if(cfg.clear)lines.push('#clearline');
 for(const f of cfg.choiceFrames||[])lines.push('#choiceframe '+f);
 for(const [k,e] of entries)if(k&&!/[\t\r\n]/.test(k))lines.push(k+'\t'+rubyField(e.ruby)+'\t'+(cfg.zh?clean(e.zh):''));
 return lines.join('\r\n')+'\r\n';
}
class KrkrTransport{
 constructor(pid,{tmp=os.tmpdir(),delay=40}={}){this.file=krkrControlPath(pid,tmp);this.delay=delay;this.timer=null;this.last='';}
 write(cfg,entries){clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush(cfg,entries),this.delay);this.timer.unref?.();}
 flush(cfg,entries){clearTimeout(this.timer);this.timer=null;const text=krkrControlText(cfg,entries);if(text===this.last)return;this.last=text;
  try{fs.mkdirSync(path.dirname(this.file),{recursive:true});const t=this.file+'.'+process.pid+'.tmp';fs.writeFileSync(t,Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(text,'utf16le')]));fs.renameSync(t,this.file);}catch{}}
 stop(){clearTimeout(this.timer);this.timer=null;try{fs.unlinkSync(this.file);}catch{}}
}

/* One game process. `transport` = {write(cfg, entries), stop()} */
class EngineDraw{
 constructor({profile,transport,onAsk=()=>{}}){this.cfg=settings(profile);this.transport=transport;this.onAsk=onAsk;this.entries=new Map();this.asked=new Set();this.sync();}
 setProfile(profile){const c=settings(profile);if(JSON.stringify(c)===JSON.stringify(this.cfg))return;this.cfg=c;this.sync();}
 get active(){return this.cfg.roles||this.cfg.embed||this.cfg.clear||(this.cfg.choiceFrames||[]).length>0;}
 sync(){if(this.active)this.transport.write(this.cfg,this.entries);else this.transport.stop();}
 /* a dialogue record (role=line) without emb: ask the reader for its replacement once */
 line(rec){if(!this.cfg.embed||!rec||rec.emb)return false;const k=keyOf(rec.text);if(!k||this.entries.has(k)||this.asked.has(k))return false;
  this.asked.add(k);if(this.asked.size>4*MAX)this.asked.delete(this.asked.values().next().value);this.onAsk({key:k,text:k,engine:rec.engine});return true;}
 put(key,{ruby=[],zh=''}={}){const k=keyOf(key);if(!k)return;this.entries.delete(k);this.entries.set(k,{ruby,zh:String(zh||'')});
  while(this.entries.size>MAX)this.entries.delete(this.entries.keys().next().value);if(this.cfg.embed)this.transport.write(this.cfg,this.entries);}
 stop(){this.transport.stop();this.entries.clear();this.asked.clear();}
}

/* ---- UI items -> the reader's art-text items (web/reader/modules/art-text.js: an invisible, look-up-able copy of each row
   plus its translation beside it; nothing takes the pointer, a click always reaches the game). One snapshot of a group
   (role + the id's part before ':', e.g. choice:L0) shares one line number; a newer snapshot replaces the older one, and an
   empty one (text '', box 0,0,0,0) clears the group. */
function rowsOf(rec){
 const text=String(rec.text||''),rows=[];
 if(rec.rects&&rec.rects.length){let i=0;
  for(const part of text.split('\n')){const n=[...part].length;if(!n)continue;const rs=rec.rects.slice(i,i+n);i+=n;if(!rs.length)continue;
   const x=Math.min(...rs.map(r=>r[0])),y=Math.min(...rs.map(r=>r[1])),x1=Math.max(...rs.map(r=>r[0]+r[2])),y1=Math.max(...rs.map(r=>r[1]+r[3]));
   rows.push({text:part,x,y,w:x1-x,h:y1-y});}
  return rows;}
 if(rec.box&&rec.box[2]>0&&rec.box[3]>0&&text.trim()){const [x,y,w,h]=rec.box,lines=text.split('\n').filter(Boolean),lh=Math.min(h/lines.length,h);
  lines.forEach((t,j)=>rows.push({text:t,x,y:y+j*lh,w,h:lh}));}
 return rows;
}
class UiTracker{
 constructor({defer=(fn)=>{const t=setTimeout(fn,60);t.unref?.();}}={}){this.items=new Map();this.groups=new Map();this.defer=defer;}
 /* returns the art-text messages to apply now; `later` gets the removals of a replaced snapshot once it is complete */
 feed(rec,later=()=>{}){
  const role=rec.role||'system',id=String(rec.id||''),group=role+':'+(id.includes(':')?id.split(':')[0]:''),line=Number(rec.line)||0,out=[];
  const g=this.groups.get(group);
  if(!g||g.line!==line){const was=g?g.ids:new Set();this.groups.set(group,{line,ids:new Set()});
   if(was.size)this.defer(()=>{const now=this.groups.get(group);const gone=[...was].filter(k=>!now||!now.ids.has(k));for(const k of gone)this.items.delete(k);if(gone.length)later(gone.map(k=>({type:'artText',id:k,visible:false})));});}
  const rows=rowsOf(rec);if(!rows.length)return out;
  const key='ui:'+group+':'+(id||rows[0].text),cur=this.groups.get(group);cur.ids.add(key);
  const sig=JSON.stringify([rec.text,rows]);if(this.items.get(key)===sig)return out;this.items.set(key,sig);
  out.push({type:'artText',id:key,visible:true,source:'engine',role,text:String(rec.text||'').replace(/\n/g,''),rows,sw:rec.sw,sh:rec.sh,...(typeof rec.sel==='boolean'?{selected:rec.sel}:{})});
  return out;
 }
}

/* the kernel's routing of one parsed ToMe_CHARS record: 'ui' for every role but line */
const routeOf=rec=>rec&&rec.role&&rec.role!=='line'?'ui':'line';

module.exports={tableLine,EngineDraw,UiTracker,rowsOf,KrkrTransport,krkrControlPath,krkrControlText,rubyField,keyOf,routeOf,settings,MAX};
