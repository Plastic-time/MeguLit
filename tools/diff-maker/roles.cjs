// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* diff-maker: the draw roles of a probe, read from the engine-draw records (docs/engine-draw-protocol.md, feat/engine-draw).
   The engine diff reports every drawn run as ToMe_CHARS ... [role=] [id=] [box=] [sel=] [emb=] text=...; the role comes from the
   engine's own identity of the draw (KAG link / selectLink, RPG Maker Window_ChoiceList ...), this file only consumes it:
     line                       dialogue: the only role that may be hidden or replaced (emb 0/1/2)
     choice / button / menu     ui: never replaced or hidden, furigana + translation beside the box, the click area stays the game's
     name / system              system: never replaced, annotated
   UI items are deduplicated by (role, id, text). A record that breaks the protocol (a non-line record hidden or embedded) is
   reported. */
const TP=require('../../core/text-paths.cjs');
const ROLES=TP.ROLES||new Set(['line','name','choice','button','menu','system']);
const KIND={line:'dialogue',choice:'ui',button:'ui',menu:'ui',name:'system',system:'system'};

/* until feat/engine-draw is merged the kernel parser does not know the new fields: same record, parsed here (delete with it) */
const RE=/^ToMe_CHARS engine=([a-z]+) line=(\d+) hidden=([01]) sw=([\d.]+) sh=([\d.]+) vx=(-?[\d.]+) vy=(-?[\d.]+) vw=([\d.]+) vh=([\d.]+) n=(\d+) rects=([-\d.,;]*)(?: color=([0-9a-f]{6}))?(?: read=([01]))?(?: role=([a-z]+))?(?: id=([A-Za-z0-9:._-]{1,32}))?(?: box=([-\d.]+,[-\d.]+,[\d.]+,[\d.]+))?(?: sel=([01]))?(?: emb=([012]))? text=(.*)$/;
function parseLocal(line){const m=RE.exec(String(line||''));if(!m)return null;const role=m[14]||'line';if(!ROLES.has(role))return null;
 const rects=m[11]?m[11].split(';').map(s=>s.split(',').map(Number)):[];const text=m[19].replace(/\x1f/g,'\n');const box=m[16]?m[16].split(',').map(Number):null;
 if(rects.length!==Number(m[10])||!(role!=='line'&&box&&!rects.length)&&rects.length!==[...text.replace(/\n/g,'')].length)return null;
 return {type:'hookCharRects',engine:m[1],line:+m[2],hidden:m[3]==='1',sw:+m[4],sh:+m[5],viewport:[m[6],m[7],m[8],m[9]].map(Number),rects,text,
  ...(m[12]?{color:'#'+m[12]}:{}),...(m[13]?{read:m[13]==='1'}:{}),...(m[14]?{role}:{}),...(m[15]?{id:m[15]}:{}),...(box?{box}:{}),...(m[17]?{sel:m[17]==='1'}:{}),...(m[18]?{emb:+m[18]}:{})};}
const parse=TP.ROLES?TP.parseChars:parseLocal;

/* one log line (any prefix before ToMe_CHARS) -> record or null */
function record(line){const s=String(line||'');const i=s.indexOf('ToMe_CHARS ');return i<0?null:parse(s.slice(i).replace(/\r$/,''));}
const roleOf=r=>r.role||'line';
const kindOf=r=>KIND[roleOf(r)];
const key=r=>roleOf(r)+'|'+(r.id||'')+'|'+String(r.text||'').replace(/\s+/g,'');
/* protocol breaks: only `line` may be hidden or carry an embedded replacement */
function violations(r){const out=[];if(roleOf(r)!=='line'){if(r.hidden)out.push('hidden');if(r.emb)out.push('emb='+r.emb);}return out;}

/* an empty snapshot (n=0, box 0,0,0,0, id '<group>:', no text) clears that group of UI items: not an item */
const clearGroup=r=>!String(r.text||'')&&!(r.rects||[]).length&&(!r.box||r.box.every(v=>v===0));
/* the records of a replay -> per role {records, unique, texts, emb counts, violations} and the unique UI items */
function summary(records){const by={};const seen=new Set(),items=[];
 for(const r of records){if(clearGroup(r))continue;const role=roleOf(r);const s=by[role]||(by[role]={role,kind:KIND[role],records:0,unique:0,texts:[],emb:{0:0,1:0,2:0},hidden:0,boxOnly:0,violations:0});
  s.records++;s.emb[r.emb||0]++;if(r.hidden)s.hidden++;if(!r.rects?.length&&r.box)s.boxOnly++;if(violations(r).length)s.violations++;
  const k=key(r);if(!seen.has(k)){seen.add(k);s.unique++;if(s.texts.length<6)s.texts.push(String(r.text).slice(0,40));if(role!=='line')items.push({role,id:r.id||'',text:r.text,box:r.box||null});}}
 return {roles:Object.values(by).sort((a,b)=>b.records-a.records),items};}
module.exports={clearGroup,ROLES,KIND,record,roleOf,kindOf,key,violations,summary,parse};
