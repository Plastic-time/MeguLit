// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Text architecture ③ (docs/text-architecture.md, owner 2026-11-14: MeguLit draws all game text itself). For engines
   that do not take their glyphs from Windows (web pages, Unity, KiriKiri's own rasteriser and prerendered .tft fonts,
   Ren'Py) the game side hides the current line itself and reports where every character of it sits, so the
   compositor (②) can draw MeguLit's text on exactly those places. This module is the engine-agnostic part:
     - the char-rect record every path speaks (ToMe_CHARS, one line per sentence) and its parser,
     - the mapping from the game's own screen to the window's client area,
     - the per-line "hidden" confirmation (a line counts as hidden only once the game side says it drew it invisible),
     - the crash canary (a game that dies right after a path was switched on gets that path off on its next launch).
   Nothing here touches the game or its files. */
const fs=require('node:fs'),path=require('node:path');

/* gpu: layer 4 (native/gpuhide, feat/hide-gpu-proxy) speaks the same record, rects in back-buffer px */
const ENGINES=new Set(['krkr','renpy','web','unity','gpu','rpgm','rgss',/* engine-draw MAGES (core/mages-draw.cjs) */'mages']);
/* engine-draw (docs/engine-draw-protocol.md): what a drawn run is in the game. Only `line` may be hidden or replaced; the
   others are annotated beside their box and their click area stays the game's */
const ROLES=new Set(['line','name','choice','button','menu','system']);
const MAX_RECTS=4000;

/* ---- record ------------------------------------------------------------------------------------------------------
   ToMe_CHARS engine=<e> line=N hidden=0|1 sw=W sh=H vx=X vy=Y vw=W vh=H n=K rects=x,y,w,h;... [color=rrggbb] [read=0|1] text=<\x1f = newline>
   color (optional): the colour the game's glyphs of this line really have, taken where hiding cannot reach it (KiriKiri TextRender:
   sampled from its text layer, whose pixels stay when the layer is at opacity 0; web: the computed colour with the hide rule lifted).
   read (optional): the game's own read flag for this line (KAG getCurrentRead). When the line is written back hidden nothing is drawn
   and no colour can be seen; the flag still says which of the game's two looks the line has (reader: text-position.js lineReadDrawn).
   rects: one per character of text (newlines left out), in game-screen pixels (0..sw, 0..sh), top-left origin.
   vx..vh: where the game screen sits in the client area, client pixels; all 0 = unknown (aspect fit, centred). */
const num=v=>{const n=Number(v);return Number.isFinite(n)?Math.round(n*100)/100:0;};
function formatChars(r){
 const rects=(r.rects||[]).slice(0,MAX_RECTS).map(q=>q.map(num).join(',')).join(';');
 const v=r.viewport||[0,0,0,0];
 return 'ToMe_CHARS engine='+r.engine+' line='+(r.line|0)+' hidden='+(r.hidden?1:0)+' sw='+num(r.sw)+' sh='+num(r.sh)+
  ' vx='+num(v[0])+' vy='+num(v[1])+' vw='+num(v[2])+' vh='+num(v[3])+' n='+(r.rects||[]).length+' rects='+rects+(/^#?[0-9a-f]{6}$/i.test(r.color||'')?' color='+String(r.color).replace('#','').toLowerCase():'')+(typeof r.read==='boolean'?' read='+(r.read?1:0):'')+drawFields(r)+formatRuby(r.ruby,r.text||'',(r.rects||[]).length)+' text='+String(r.text||'').replace(/\r?\n/g,'\x1f');
}
/* optional engine-draw fields, fixed order: role id box sel emb (each left out when it says nothing new) */
function drawFields(r){let s='';
 if(r.role&&ROLES.has(r.role)&&r.role!=='line')s+=' role='+r.role;
 if(r.id!=null&&/^[A-Za-z0-9:._-]{1,32}$/.test(String(r.id)))s+=' id='+r.id;
 if(Array.isArray(r.box)&&r.box.length===4&&r.box.every(Number.isFinite))s+=' box='+r.box.map(num).join(',');
 if(typeof r.sel==='boolean')s+=' sel='+(r.sel?1:0);
 if(r.emb===1||r.emb===2)s+=' emb='+r.emb;
 return s;}
const RE=/^ToMe_CHARS engine=([a-z]+) line=(\d+) hidden=([01]) sw=([\d.]+) sh=([\d.]+) vx=(-?[\d.]+) vy=(-?[\d.]+) vw=([\d.]+) vh=([\d.]+) n=(\d+) rects=([-\d.,;]*)(?: color=([0-9a-f]{6}))?(?: read=([01]))?(?: role=([a-z]+))?(?: id=([A-Za-z0-9:._-]{1,32}))?(?: box=(-?[\d.]+,-?[\d.]+,[\d.]+,[\d.]+))?(?: sel=([01]))?(?: emb=([012]))?(?: ruby=([^ ]+))? text=(.*)$/;
function parseChars(line){
 const m=RE.exec(String(line||''));if(!m||!ENGINES.has(m[1]))return null;
 const rects=m[11]?m[11].split(';').slice(0,MAX_RECTS).map(s=>s.split(',').map(Number)):[];
 if(rects.some(q=>q.length!==4||q.some(n=>!Number.isFinite(n))))return null;
 const text=m[20].replace(/\x1f/g,'\n').slice(0,4000),role=m[14]||'line';
 if(!ROLES.has(role))return null;
 const box=m[16]?m[16].split(',').map(Number):null;
 /* a UI item may come as its box alone (the engine knows its text but did not lay it out glyph by glyph) */
 const boxOnly=role!=='line'&&box&&rects.length===0;
 if(rects.length!==Number(m[10])||!boxOnly&&rects.length!==[...text.replace(/\n/g,'')].length)return null;
 const ruby=m[19]===undefined?null:parseRuby(m[19],text,rects.length);if(m[19]!==undefined&&!ruby)return null;
 return {type:'hookCharRects',engine:m[1],line:Number(m[2]),hidden:m[3]==='1',sw:Number(m[4]),sh:Number(m[5]),viewport:[m[6],m[7],m[8],m[9]].map(Number),rects,text,...(ruby?{ruby}:{}),...(m[12]?{color:'#'+m[12]}:{}),...(m[13]?{read:m[13]==='1'}:{}),
  ...(m[14]?{role}:{}),...(m[15]?{id:m[15]}:{}),...(box?{box}:{}),...(m[17]?{sel:m[17]==='1'}:{}),...(m[18]?{emb:Number(m[18])}:{})};
}

/* ruby-v1: indices are codepoints paired with rects, not UTF16 offsets. A span cannot bridge a row break. */
function validReading(s){return typeof s==='string'&&s.length>0&&[...s].length<=160&&!/[\u0000-\u001f\u007f-\u009f]/u.test(s)&&!/[\ud800-\udfff]/u.test(s);}
function validRuby(spans,text,count){
 if(!Array.isArray(spans)||spans.length>64)return false;
 const chars=[...String(text)],positions=[];for(let i=0;i<chars.length;i++)if(chars[i]!=='\n')positions.push(i);
 if(positions.length!==count)return false;let end=0;
 for(let i=0;i<spans.length;i++){const s=spans[i];if(!Array.isArray(s)||s.length!==3||!Number.isSafeInteger(s[0])||!Number.isSafeInteger(s[1])||s[0]<end||s[1]<1||s[1]>80||s[0]+s[1]>count||!validReading(s[2]))return false;
  if(positions[s[0]+s[1]-1]-positions[s[0]]!==s[1]-1)return false;end=s[0]+s[1];}
 return true;
}
function formatRuby(spans,text,count){
 if(spans===undefined||Array.isArray(spans)&&spans.length===0)return '';
 if(!validRuby(spans,text,count))throw Error('INVALID_CHAR_RUBY');
 const field=spans.map(([start,len,reading])=>start+':'+len+':'+Buffer.from(reading,'utf16le').swap16().toString('hex')).join('|');
 if(field.length>8192)throw Error('INVALID_CHAR_RUBY');return ' ruby='+field;
}
function parseRuby(field,text,count){
 if(typeof field!=='string'||!field||field.length>8192)return null;
 const parts=field.split('|');if(parts.length>64)return null;const spans=[];
 for(const part of parts){const m=/^(0|[1-9]\d{0,3}):([1-9]\d?):([0-9a-f]+)$/.exec(part);if(!m||m[3].length%4)return null;
  spans.push([Number(m[1]),Number(m[2]),Buffer.from(m[3],'hex').swap16().toString('utf16le')]);}
 return validRuby(spans,text,count)?spans:null;
}
function rubyPairs(rec){
 if(!validRuby(rec.ruby,rec.text,rec.rects.length))return [];
 const chars=[...rec.text].filter(c=>c!=='\n');return rec.ruby.map(([start,len,reading])=>[chars.slice(start,start+len).join(''),reading,chars.slice(0,start).filter(c=>!/\s/u.test(c)).length]);
}

/* ---- geometry ----------------------------------------------------------------------------------------------------
   Game screen -> client pixels. The engine's own viewport wins; otherwise the game screen is fitted into the client
   area keeping its aspect ratio and centred (KiriKiri and Ren'Py letterbox that way). */
function viewportOf(rec,cw,ch){
 const v=rec.viewport||[0,0,0,0];if(v[2]>0&&v[3]>0)return v;
 if(!(rec.sw>0&&rec.sh>0&&cw>0&&ch>0))return [0,0,cw||rec.sw,ch||rec.sh];
 const k=Math.min(cw/rec.sw,ch/rec.sh),w=rec.sw*k,h=rec.sh*k;return [(cw-w)/2,(ch-h)/2,w,h];
}
function toClient(rec,cw,ch){
 const [vx,vy,vw,vh]=viewportOf(rec,cw,ch),kx=rec.sw>0?vw/rec.sw:1,ky=rec.sh>0?vh/rec.sh:1;
 return (rec.rects||[]).map(([x,y,w,h])=>[vx+x*kx,vy+y*ky,w*kx,h*ky]);
}

/* ---- hidden confirmation -----------------------------------------------------------------------------------------
   The rule the other layers use (E667 glyph hide, E472 KiriKiri): MeguLit only takes a line over after the game side
   reported that very line drawn invisible. A path that never confirms within `grace` lines stays read-only. */
class HiddenGate{
 constructor({grace=3}={}){this.grace=grace;this.lines=new Map();this.misses=0;this.confirmed=false;}
 /* the latest record of a line decides (a game side that draws its text again sends hidden=0 for the same line) */
 report(rec){if(!rec)return false;const hidden=!!rec.hidden,fresh=!this.lines.has(rec.line);this.lines.delete(rec.line);this.lines.set(rec.line,hidden);
  if(this.lines.size>64)this.lines.delete(this.lines.keys().next().value);
  if(hidden){this.confirmed=true;this.misses=0;}else if(fresh&&++this.misses>=this.grace)this.confirmed=false;return hidden;}
 hidden(line){return this.lines.get(line)===true;}
}

/* ---- crash canary ------------------------------------------------------------------------------------------------
   data/text-paths/<exe name>-<exe size>.json (the key HookBridge uses for its per-game memory). Before a path hides
   anything it is armed; it is cleared once the game has run 20 s with it, or when the game quits. Only an exception
   exit code (NTSTATUS >= 0xC0000000, e.g. 0xC0000005) while armed turns that path off for the game's next launches; a
   kill (exit 1), a normal quit or an exit nobody saw is not a crash. Switching it on again is the user's call (reset()). */
const crash=code=>Number.isInteger(code)&&(code>>>0)>=0xC0000000&&(code>>>0)!==0xFFFFFFFF;
const SAFE_AFTER=20000;
function gameKey(exe){let size=0;try{size=fs.statSync(exe).size;}catch{}return path.basename(String(exe)).replace(/[^A-Za-z0-9._-]/g,'_')+'-'+size;}
class Canary{
 constructor(root,exe,{now=()=>Date.now()}={}){this.file=path.join(root,'data','text-paths',gameKey(exe)+'.json');this.now=now;}
 read(){try{return JSON.parse(fs.readFileSync(this.file,'utf8'))||{};}catch{return {};}}
 write(d){try{fs.mkdirSync(path.dirname(this.file),{recursive:true});const t=this.file+'.'+process.pid+'.tmp';fs.writeFileSync(t,JSON.stringify(d,null,1));fs.renameSync(t,this.file);}catch{}}
 /* at launch: an arm left by the last run (exit unseen) is cleared, not counted as a crash */
 settle(){const d=this.read(),armed=d.armed||{};let changed=false;d.off=d.off||{};
  for(const p of Object.keys(armed)){delete armed[p];changed=true;}
  d.armed=armed;if(changed)this.write(d);return d.off;}
 allowed(p){const d=this.read();return !(d.off&&d.off[p]);}
 arm(p){const d=this.read();d.armed=d.armed||{};if(!d.armed[p]){const t=this.now();d.armed[p]={at:t,alive:t};this.write(d);}}
 alive(p){const d=this.read(),a=d.armed?.[p];if(!a)return;a.alive=this.now();if(a.alive-a.at>=SAFE_AFTER)delete d.armed[p];this.write(d);}
 exited(p,code){const d=this.read(),a=d.armed?.[p];if(!a)return;if(crash(code)){d.off=d.off||{};d.off[p]={at:this.now(),reason:'game exited with code '+code+' '+Math.round((this.now()-a.at)/1000)+' s after '+p+' was switched on'};}delete d.armed[p];this.write(d);}
 reset(p){const d=this.read();if(d.off)delete d.off[p];if(d.armed)delete d.armed[p];this.write(d);}
}

module.exports={ENGINES,ROLES,formatChars,parseChars,formatRuby,parseRuby,rubyPairs,viewportOf,toClient,HiddenGate,Canary,gameKey,SAFE_AFTER,crash};
