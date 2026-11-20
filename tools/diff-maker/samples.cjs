// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* diff-maker: runtime samples -> one replay sequence.
     events   what core/self-check.cjs scores (the same parsers the live gate uses, so a replay is what ran on the player's PC)
     records  the engine-draw records (ToMe_CHARS with role / id / box / sel / emb, docs/engine-draw-protocol.md): every drawn
              run with the role the engine diff gave it (tools/diff-maker/roles.cjs)
   Sources: runtime/hook-events.log + runtime/reader-host.log (MeguLit's own logs) and any other runtime/*.log that carries
   ToMe_CHARS lines, cut to manifest.runtime {from,to} when given. Times in a replay are ms from the first event. */
const {parseTrace,parseReader}=require('../../core/self-check.cjs');
const Roles=require('./roles.cjs');
const TS=/^(\d{4}-\d\d-\d\dT[\d:.]+Z)\s+(.*)$/;
const inWindow=(iso,w)=>(!w.from||iso>=w.from)&&(!w.to||iso<w.to);
const fold=s=>String(s||'').normalize('NFKC').replace(/[\s　]/g,'');

/* -> {events, records, kept} (kept: the raw lines the maker read, for a trimmed sample probe) */
function fromLogs(hookEvents,readerHost,extra,win={}){const events=[],records=[],kept={hook:[],reader:[]};
 for(const text of [hookEvents,extra])for(const raw of String(text||'').split(/\r?\n/)){const m=TS.exec(raw);if(!m||!inWindow(m[1],win))continue;const at=Date.parse(m[1]);let keep=false;
  const e=parseTrace(raw);if(e){events.push(e);keep=true;}
  const r=Roles.record(m[2]);if(r){records.push({at,raw:m[2].slice(m[2].indexOf('ToMe_CHARS ')),...r});keep=true;}
  if(keep)kept.hook.push(raw);}
 for(const raw of String(readerHost||'').split(/\r?\n/)){if(!raw.startsWith('{'))continue;let v;try{v=JSON.parse(raw);}catch{continue;}if(!inWindow(String(v.at||''),win))continue;
  const e=parseReader(v);if(e){events.push(e);kept.reader.push(raw);}}
 return {events,records,kept};}

function replay(probe){const r=fromLogs(probe.runtime.hookEvents,probe.runtime.readerHost,probe.runtime.extra,probe.window);
 const all=[...r.events,...r.records].filter(e=>Number.isFinite(e.at));const t0=all.length?Math.min(...all.map(e=>e.at)):0;
 const rel=e=>({...e,at:e.at-t0});const byAt=(a,b)=>a.at-b.at;
 return {t0,events:r.events.filter(e=>Number.isFinite(e.at)).map(rel).sort(byAt),records:r.records.map(rel).sort(byAt),kept:r.kept};}
module.exports={fromLogs,replay,fold};
