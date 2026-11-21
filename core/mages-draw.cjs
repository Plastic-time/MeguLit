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

const RUN=/^ToMe_DRAWRUN engine=mages (?:ev=(add|more|clear|show|glyph) (.*)|(on|off): ?(.*))$/;
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

module.exports={parse,PageTracker,toChars,SEL_PAGE,SYSSEL_PAGE};
