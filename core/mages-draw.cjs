// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* engine-draw, MAGES. (docs/engine-draw-native.md): the kernel side of native/megulithook/MagesDraw.h. The hook reads the
   engine's own dialogue pages at the moment the engine commits text into them and logs it (hook-diagnostics.log):
     ToMe_DRAWRUN engine=mages ev=add|more|clear|show|glyph ...   ToMe_DRAWBOX engine=mages page= seq= at= rects= color= flag=
   This module turns those lines back into what the game shows:
     - parse(line)            one record, or null
     - PageTracker            one unit per page between clears (page + seq): name, text, ruby, per-character boxes and
                              colours, choices. A sentence the engine commits in several pieces (CHAOS;CHILD: SC3 waits
                              inside a line) stays ONE unit whose text grows; a new unit starts only when the engine starts
                              the page again (commit from 0, or a clear). The unit's key (page:seq) is the line identity.
     - toChars(unit, opts)    ToMe_CHARS records (docs/engine-draw-protocol.md): the dialogue as role=line, the speaker
                              as role=name, each choice as role=choice id=C:<n> (Sel) / Y<page>:<n> (SysSel)
   Glyph codes are the SC3 character codes (font sheet cell index); the charset is this exe's (the version layer's
   draw.engineTable.charset: sghd, default, sglbp, sgmde; services/original-engines/mages.cjs has the lists).
   Layout markers kept from SC3 (0x8000 | control): 0x8000 line break, 0x8001 name start, 0x8002 name end / line start,
   0x8009 ruby base start, 0x800A ruby text start, 0x800B ruby text end (impacto text.h; name markers verified in the
   exes' layout code, ruby markers inferred from SC3 and not yet seen in a log). */

const RUN=/^ToMe_DRAWRUN engine=mages (?:ev=(add|more|clear|show|glyph|view) (.*)|(on|off|note): ?(.*))$/;
const BOX=/^ToMe_DRAWBOX engine=mages page=(\d+) seq=(\d+) at=(\d+) rects=([-\d,;]*) color=([0-9a-f,]*) flag=([\d,]*)$/;
function fields(s){const o={};const m=/ codes=([0-9a-f]*)$/.exec(' '+s);let rest=' '+s;if(m){o.codes=m[1];rest=rest.slice(0,m.index);}
 for(const kv of rest.trim().split(/\s+/)){const i=kv.indexOf('=');if(i>0)o[kv.slice(0,i)]=kv.slice(i+1);}return o;}
const hex4=s=>{const out=[];for(let i=0;i+4<=s.length;i+=4)out.push(parseInt(s.slice(i,i+4),16));return out;};

function parse(line){
 const s=String(line||'').trim();let m=RUN.exec(s);
 if(m){
  if(m[3])return {kind:m[3],detail:m[4]};
  const f=fields(m[2]),num=k=>f[k]===undefined?undefined:Number(f[k]);
  const r={kind:m[1],page:num('page'),seq:num('seq')};
  if(m[1]==='add')Object.assign(r,{role:f.role||'line',from:num('from'),n:num('n'),scale:num('scale'),codes:hex4(f.codes||'')});
  else if(m[1]==='more')r.codes=hex4(f.codes||'');
  else if(m[1]==='show')r.opacity=num('opacity');
  else if(m[1]==='glyph')Object.assign(r,{site:parseInt(f.site,16),n:num('n'),box:(f.box||'').split(',').map(Number),size:num('size'),color:f.color});
  else if(m[1]==='view'){const two=k=>(f[k]||'').split(',').map(Number);return {kind:'view',bb:two('bb'),client:two('client')};}
  if(m[1]!=='glyph'&&(!Number.isInteger(r.page)||!Number.isInteger(r.seq)))return null;
  return r;
 }
 m=BOX.exec(s);if(!m)return null;
 const rects=m[4]?m[4].split(';').map(q=>q.split(',').map(Number)):[],color=m[5]?m[5].split(','):[],flag=m[6]?m[6].split(',').map(Number):[];
 if(rects.some(q=>q.length!==4||q.some(n=>!Number.isFinite(n)))||color.length!==rects.length||flag.length!==rects.length)return null;
 return {kind:'box',page:Number(m[1]),seq:Number(m[2]),at:Number(m[3]),rects,color,flag};
}

const SEL_PAGE=7,SYSSEL_PAGE=5;
class PageTracker{
 /* charset: the exe's character list (string, index = glyph code); pages: {sel, sysSel} page numbers from the version table */
 constructor({charset='',sel=SEL_PAGE,sysSel=SYSSEL_PAGE}={}){this.cs=[...charset];this.sel=sel;this.sysSel=sysSel;this.pages=new Map();this.events=[];this.last=null;}
 char(code){return code<this.cs.length?this.cs[code]:'\u{fffd}';}
 unit(page,seq,role){let u=this.pages.get(page);
  if(!u||u.seq!==seq){if(u&&!u.cleared)this.events.push({type:'end',key:u.page+':'+u.seq});u={page,seq,role:role||'line',stream:[],glyphs:[],cleared:false,shown:false};this.pages.set(page,u);this.events.push({type:'start',key:page+':'+seq});}
  return u;}
 feed(line){const r=typeof line==='string'?parse(line):line;if(!r)return null;
  if(r.kind==='add'){const u=this.unit(r.page,r.seq,r.role);if(r.from!==u.glyphs.length&&r.from===0){u.stream=[];u.glyphs=[];}
   for(const c of r.codes){u.stream.push(c);if(!(c&0x8000))u.glyphs.push({code:c,rect:null,color:null,flag:0});}this.last=u;this.events.push({type:'grow',key:u.page+':'+u.seq});}
  else if(r.kind==='more'){const u=this.pages.get(r.page);if(u&&u.seq===r.seq)for(const c of r.codes){u.stream.push(c);if(!(c&0x8000))u.glyphs.push({code:c,rect:null,color:null,flag:0});}}
  else if(r.kind==='box'){const u=this.pages.get(r.page);if(u&&u.seq===r.seq)r.rects.forEach((q,k)=>{const g=u.glyphs[r.at+k];if(g){g.rect=q;g.color=r.color[k];g.flag=r.flag[k];}});}
  else if(r.kind==='clear'){const u=this.pages.get(r.page);if(u&&u.seq===r.seq&&!u.cleared){u.cleared=true;this.events.push({type:'clear',key:u.page+':'+u.seq});}}
  else if(r.kind==='show'){const u=this.pages.get(r.page);if(u&&u.seq===r.seq)u.shown=true;}
  return r;}
 /* what one page unit shows: name, text (line breaks from 0x8000), ruby [start, end, reading] on the text, glyph lists */
 view(page){const u=this.pages.get(page);if(!u)return null;
  let mode='text',gi=0,rubyBase=-1,reading='';const name=[],text=[],ruby=[],rubyGlyphs=[];let plain='';
  for(const c of u.stream){
   if(c&0x8000){const k=c&0xff;
    if(k===0x01)mode='name';else if(k===0x02)mode='text';else if(k===0x00&&mode==='text')plain+='\n';
    else if(k===0x09){rubyBase=[...plain.replace(/\n/g,'')].length;}
    else if(k===0x0a){mode='ruby';reading='';}
    else if(k===0x0b){if(rubyBase>=0)ruby.push([rubyBase,[...plain.replace(/\n/g,'')].length,reading]);rubyBase=-1;mode='text';}
    continue;}
   const g=u.glyphs[gi++];if(!g)break;const ch=this.char(c);
   if(mode==='name')name.push({...g,ch});else if(mode==='ruby'){reading+=ch;rubyGlyphs.push({...g,ch});}else{text.push({...g,ch});plain+=ch;}
  }
  return {key:u.page+':'+u.seq,page:u.page,seq:u.seq,role:u.role,cleared:u.cleared,shown:u.shown,name:name.map(g=>g.ch).join(''),nameGlyphs:name,text:plain,glyphs:text,ruby,rubyGlyphs};}
 /* the choices on a Sel / SysSel page: one per flag value (the engine's choice number), in order */
 choices(page){const v=this.view(page);if(!v)return [];const by=new Map();
  for(const g of v.glyphs){if(!by.has(g.flag))by.set(g.flag,[]);by.get(g.flag).push(g);}
  return [...by].map(([n,gs])=>({n,id:(page===this.sel?'C':'Y'+page)+':'+n,text:gs.map(g=>g.ch).join(''),glyphs:gs}));}
}

/* ToMe_CHARS records of one page (game canvas = sw x sh, 1920 x 1080 for the Steam builds) */
function toChars(tracker,page,{sw=1920,sh=1080,line=0}={}){
 const T=require('./text-paths.cjs'),v=tracker.view(page);if(!v)return [];
 const out=[],box=gs=>{const r=gs.filter(g=>g.rect).map(g=>g.rect);if(!r.length)return null;const x0=Math.min(...r.map(q=>q[0])),y0=Math.min(...r.map(q=>q[1])),x1=Math.max(...r.map(q=>q[0]+q[2])),y1=Math.max(...r.map(q=>q[1]+q[3]));return [x0,y0,x1-x0,y1-y0];};
 const rec=(gs,extra)=>T.formatChars({engine:'mages',line,hidden:false,sw,sh,rects:gs.map(g=>g.rect||[0,0,0,0]),text:gs.map(g=>g.ch).join(''),color:gs[0]?.color||undefined,...extra});
 const isChoice=page===tracker.sel||(page>=tracker.sysSel&&page<tracker.sel);
 if(isChoice){for(const c of tracker.choices(page))out.push(rec(c.glyphs,{role:'choice',id:c.id,box:box(c.glyphs)}));return out;}
 if(v.nameGlyphs.length)out.push(rec(v.nameGlyphs,{role:'name',id:'N:'+page,box:box(v.nameGlyphs)}));
 if(v.glyphs.length)out.push(T.formatChars({engine:'mages',line,hidden:false,sw,sh,rects:v.glyphs.map(g=>g.rect||[0,0,0,0]),text:v.text,color:v.glyphs[0].color||undefined}));
 return out;
}

/* Where the canvas (1920 x 1080) sits in the client area, client pixels [vx, vy, vw, vh] (the ToMe_CHARS viewport), from the game's
   own presentation (static, all five builds; tools/engine-sigs/mages-draw.cjs backbuffer()): the 16:9 scene is drawn into the
   back buffer at its full width and height (bw >> 4) * 9, centred vertically ((bh - that) * 0.5), then Present stretches the
   back buffer over the whole client area. So a 16:10 back buffer gets bars above and below, an ultrawide one is cut at the top
   and bottom (the scene is wider than tall enough: vy < 0), and a back buffer of another shape than the window is stretched.
   Unknown back buffer: the client size (the usual case: the game sizes them together). Unknown client: [0,0,0,0] (the kernel
   fits the canvas itself). */
function viewport({bb=[0,0],client=[0,0]}={}){
 const [cw,ch]=client;if(!(cw>0&&ch>0))return [0,0,0,0];
 let [bw,bh]=bb;if(!(bw>0&&bh>0)){bw=cw;bh=ch;}
 const h16=(bw>>4)*9,sx=cw/bw,sy=ch/bh,r=v=>Math.round(v*100)/100;
 return [0,r((bh-h16)*0.5*sy),r(bw*sx),r(h16*sy)];
}
/* The live side: hook-diagnostics records in (as HookBridge forwards them: hookEngineDraw), ToMe_CHARS records out, ready for
   HookNative.charRects. One line number per page unit (page:seq), so a sentence the engine commits in pieces is the same line
   reported again with more text (CHAOS;CHILD's split lines); a clear (or the page starting over) reports that line once more,
   empty and not hidden (the protocol's "gone"); choices are one UI snapshot per page (group C / Y<page>) and an empty snapshot at
   the clear; the speaker is role=name (group N). Only complete units go out (every character has its box). */
class MagesLive{
 constructor({table={},charset=null}={}){
  const cs=charset!=null?charset:require('../services/original-engines/mages.cjs')._internal.charset(['sghd','default','sglbp','sgmde'].includes(table.charset)?table.charset:'sghd');
  this.canvas=Array.isArray(table.canvas)&&table.canvas.length===2?table.canvas.map(Number):[1920,1080];
  this.t=new PageTracker({charset:cs,sel:Number.isInteger(table.selPage)?table.selPage:SEL_PAGE,sysSel:Number.isInteger(table.sysSelPage)?table.sysSelPage:SYSSEL_PAGE});
  const m=Array.isArray(table.menuText)?table.menuText.map(v=>parseInt(v,16)):[];this.menu=m.length===2&&m.every(Number.isFinite)?m:null;
  this.view={bb:[0,0],client:[0,0]};this.lines=new Map();this.next=1;this.sent=new Map();this.current=new Map();
 }
 lineOf(key){if(!this.lines.has(key)){this.lines.set(key,this.next++);if(this.lines.size>256)this.lines.delete(this.lines.keys().next().value);}return this.lines.get(key);}
 /* a drawGlyph run outside the dialogue pages: menu (LanguageBarrier's drawSingleTextLine, inferred) or system */
 glyphRole(site){return this.menu&&site>=this.menu[0]&&site<this.menu[1]?'menu':'system';}
 isChoice(page){return page===this.t.sel||(page>=this.t.sysSel&&page<this.t.sel);}
 rec(o){const T=require('./text-paths.cjs');return T.formatChars({engine:'mages',hidden:false,sw:this.canvas[0],sh:this.canvas[1],viewport:viewport(this.view),...o});}
 /* the page unit `key` left the screen: its line (and name / choices) once more, empty */
 gone(page,key){const out=[],line=this.lineOf(key);
  if(this.isChoice(page))out.push(this.rec({line,rects:[],text:'',role:'choice',id:(page===this.t.sel?'C':'Y'+page)+':',box:[0,0,0,0]}));
  else{out.push(this.rec({line,rects:[],text:''}));if(this.sent.get(key+'/name'))out.push(this.rec({line,rects:[],text:'',role:'name',id:'N:',box:[0,0,0,0]}));}
  for(const k of [...this.sent.keys()])if(k===key||k.startsWith(key+'/'))this.sent.delete(k);
  return out;}
 feed(raw){const r=typeof raw==='string'?parse(raw):raw;if(!r)return [];
  if(r.kind==='view'){this.view={bb:r.bb,client:r.client};return [];}
  if(r.kind==='glyph'||r.kind==='on'||r.kind==='off'||r.kind==='note'||r.kind==='show')return [];
  const out=[];
  if(r.kind==='add'){const key=r.page+':'+r.seq,was=this.current.get(r.page);
   if(was&&was!==key&&!this.t.pages.get(r.page)?.cleared)out.push(...this.gone(r.page,was)); /* the page started over without a clear */
   this.current.set(r.page,key);}
  this.t.feed(r);
  if(r.kind==='clear'){const key=r.page+':'+r.seq;if(this.current.get(r.page)===key){out.push(...this.gone(r.page,key));this.current.delete(r.page);}return out;}
  if(r.kind!=='box'&&r.kind!=='more')return out;
  const v=this.t.view(r.page);if(!v||v.key!==this.current.get(r.page))return out;
  const all=[...v.nameGlyphs,...v.glyphs,...v.rubyGlyphs];if(!all.length||all.some(g=>!g.rect))return out; /* boxes still coming */
  const line=this.lineOf(v.key),emit=(k,s)=>{if(this.sent.get(k)!==s){this.sent.set(k,s);out.push(s);}};
  if(this.isChoice(r.page)){const cs=this.t.choices(r.page);for(const c of cs){const rs=c.glyphs.map(g=>g.rect);const x0=Math.min(...rs.map(q=>q[0])),y0=Math.min(...rs.map(q=>q[1])),x1=Math.max(...rs.map(q=>q[0]+q[2])),y1=Math.max(...rs.map(q=>q[1]+q[3]));
    emit(v.key+'/'+c.id,this.rec({line,rects:rs,text:c.text,role:'choice',id:c.id,box:[x0,y0,x1-x0,y1-y0],color:c.glyphs[0].color}));}return out;}
  if(v.nameGlyphs.length){const rs=v.nameGlyphs.map(g=>g.rect);const x0=Math.min(...rs.map(q=>q[0])),y0=Math.min(...rs.map(q=>q[1])),x1=Math.max(...rs.map(q=>q[0]+q[2])),y1=Math.max(...rs.map(q=>q[1]+q[3]));
   emit(v.key+'/name',this.rec({line,rects:rs,text:v.name,role:'name',id:'N:'+r.page,box:[x0,y0,x1-x0,y1-y0],color:v.nameGlyphs[0].color}));}
  if(v.glyphs.length)emit(v.key,this.rec({line,rects:v.glyphs.map(g=>g.rect),text:v.text,color:v.glyphs[0].color}));
  return out;}
}

module.exports={parse,PageTracker,toChars,viewport,MagesLive,SEL_PAGE,SYSSEL_PAGE};
