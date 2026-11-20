// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* diff-maker: the game's own script, from the probe's scripts/ folder:
     scripts/lines.json        the original-text index ({lines:[...], ruby:[[[base,reading],...]|null,...]}, services/original-engines)
                               or a plain array: dialogue, and the game's own ruby per line
     scripts/patch.json        a translation aligned with lines.json ({lines:[...]}, the original-text patch index): zh per line
     scripts/**\/*.ks|*.txt    KAG scenario text: tags removed, the rest is dialogue; [link]...[endlink] / [glink text=] /
                               [seladd text=] targets are choices
     scripts/data/*.json       RPG Maker MV/MZ data: 401 / 405 lines are dialogue, 102 choices, System.json terms and the
                               database names are UI words
   Used to check the replay (are the lines the engine drew the game's dialogue, are its UI items the script's choices / terms)
   and to build the line replacement data of engine-draw ({k, ruby, zh}, docs/engine-draw-protocol.md). */
const fs=require('node:fs'),path=require('node:path');
const {fold}=require('./samples.cjs');

function emptyIndex(){return {dialogue:new Set(),choices:new Set(),ui:new Set(),entries:[],files:0,lines:0};}
const add=(set,s)=>{const k=fold(s).replace(/\\[A-Za-z]+\[[^\]]*\]|\\[A-Za-z{}.|!<>^$]/g,'');if(k)set.add(k);return k;};

function readKag(text,ix){for(let l of String(text).split(/\r?\n/)){l=l.trim();if(!l||l.startsWith(';')||l.startsWith('*')||l.startsWith('@'))continue;
  for(const m of l.matchAll(/\[(?:glink|seladd|link|button)\b[^\]]*?\btext\s*=\s*"?([^"\]]+)"?/gi))add(ix.choices,m[1]);
  for(const m of l.matchAll(/\[link\b[^\]]*\]([^\[]+)\[endlink\]/gi))add(ix.choices,m[1]);
  const body=l.replace(/\[[^\]]*\]/g,'');if(body.trim()){add(ix.dialogue,body);ix.lines++;}}}

function readRpgm(file,json,ix){const name=path.basename(file).toLowerCase();
 const walkList=list=>{for(const c of list||[]){if(!c||typeof c!=='object')continue;const p=c.parameters||[];
  if((c.code===401||c.code===405)&&typeof p[0]==='string'){add(ix.dialogue,p[0]);ix.lines++;}
  else if(c.code===102&&Array.isArray(p[0]))for(const s of p[0])add(ix.choices,s);}};
 const walk=v=>{if(Array.isArray(v)){if(v.length&&v.every(x=>x&&typeof x==='object'&&'code' in x))walkList(v);else for(const x of v)walk(x);}else if(v&&typeof v==='object')for(const x of Object.values(v))walk(x);};
 if(name==='system.json'){const t=json.terms||{};for(const k of ['basic','commands','params'])for(const s of t[k]||[])if(typeof s==='string')add(ix.ui,s);
  for(const k of ['elements','skillTypes','weaponTypes','armorTypes','equipTypes'])for(const s of json[k]||[])if(typeof s==='string')add(ix.ui,s);return;}
 if(/^(items|skills|weapons|armors|classes|enemies|states)\.json$/.test(name)){for(const r of json||[])if(r&&typeof r.name==='string')add(ix.ui,r.name);return;}
 walk(json);}

/* engine-draw replacement key: the line without white space (code points, not NFKC: the engine compares what it draws) */
const keyOf=s=>String(s||'').replace(/\s+/g,'');
/* [[base, reading], ...] of one line -> [[start, len, reading]] over keyOf(line), left to right; a base not found is skipped */
function rubyRanges(k,pairs){const cs=[...k],out=[];let from=0;
 for(const p of Array.isArray(pairs)?pairs:[]){const base=[...keyOf(p?.[0])],reading=String(p?.[1]||'');if(!base.length||!reading)continue;
  for(let i=from;i+base.length<=cs.length;i++){if(base.every((c,j)=>cs[i+j]===c)){out.push([i,base.length,reading]);from=i+base.length;break;}}}
 return out;}

function load(dir,files){const ix=emptyIndex();const readJson=rel=>{try{return JSON.parse(fs.readFileSync(path.join(dir,rel),'utf8').replace(/^﻿/,''));}catch{return null;}};
 const patch=(files||[]).includes('patch.json')?readJson('patch.json'):null;
 for(const rel of files||[]){const low=rel.toLowerCase();if(low==='patch.json')continue;let text;try{text=fs.readFileSync(path.join(dir,rel),'utf8').replace(/^﻿/,'');}catch{continue;}ix.files++;
  if(/(^|\/)lines\.json$/.test(low)){let j;try{j=JSON.parse(text);}catch{continue;}const lines=Array.isArray(j)?j:j.lines||[],ruby=Array.isArray(j?.ruby)?j.ruby:[],zh=Array.isArray(patch?.lines)&&patch.lines.length===lines.length?patch.lines:[];/* a patch with another line count is not aligned: no zh */
   lines.forEach((s,i)=>{if(typeof s!=='string'||!s)return;add(ix.dialogue,s);ix.lines++;ix.entries.push({line:s,ruby:ruby[i]||null,zh:typeof zh[i]==='string'&&zh[i]!==s?zh[i]:''});});continue;}
  if(low.endsWith('.json')){let j;try{j=JSON.parse(text);}catch{continue;}readRpgm(rel,j,ix);continue;}
  if(/\.(ks|txt|scn)$/.test(low))readKag(text,ix);}
 return ix;}

/* the replacement data of engine-draw for the given script entries (deduplicated by k; only lines with ruby or zh) */
function replacements(entries){const seen=new Set(),out=[];
 for(const e of entries){const k=keyOf(e.line);if(!k||seen.has(k))continue;const ruby=rubyRanges(k,e.ruby);if(!ruby.length&&!e.zh)continue;seen.add(k);
  out.push({k,ruby,zh:e.zh||''});}
 return out;}

const near=(k,d)=>d.includes(k)||k.includes(d)&&[...d].length>=6;
/* where a text sits in the script: 'dialogue' | 'choice' | 'ui' | '' (lines of 6+ characters also match inside a script line,
   the engines often deliver a page split in two) */
function whereIs(ix,text){const k=fold(text);if(!k)return '';
 if(ix.choices.has(k))return 'choice';if(ix.ui.has(k))return 'ui';if(ix.dialogue.has(k))return 'dialogue';
 if([...k].length>=6){for(const d of ix.dialogue)if(near(k,d))return 'dialogue';}
 return '';}
/* the script entries a replay touches (the trimmed sample probe keeps these, not the game's whole script) */
function touched(ix,texts){const keys=texts.map(fold).filter(Boolean);
 return ix.entries.filter(e=>{const d=fold(e.line);return keys.some(k=>k===d||[...k].length>=6&&near(k,d));});}
module.exports={load,whereIs,touched,replacements,rubyRanges,keyOf,emptyIndex};
