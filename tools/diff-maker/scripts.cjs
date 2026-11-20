// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* diff-maker: what the game's own script says each text is, from the probe's scripts/ folder:
     scripts/lines.json        the original-text index (services/original-engines: {lines:[...]}) or a plain array: dialogue
     scripts/**\/*.ks|*.txt    KAG scenario text: tags and labels removed, the rest is dialogue; [link]...[endlink] / [glink text=]
                               / [seladd text=] targets are choices
     scripts/data/*.json       RPG Maker MV/MZ data: 401 / 405 lines are dialogue, 102 choices, System.json terms and the
                               database names (items, skills, weapons, armors, classes, enemies, states) are UI words
   Used to check the replay (are the lines the hooks caught the game's dialogue) and to propose a role for an identity no rule
   names (its texts are script dialogue -> dialogue, choices / terms -> ui, neither -> system). */
const fs=require('node:fs'),path=require('node:path');
const {fold}=require('./samples.cjs');

function emptyIndex(){return {dialogue:new Set(),choices:new Set(),ui:new Set(),files:0,lines:0};}
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

function load(dir,files){const ix=emptyIndex();
 for(const rel of files||[]){const f=path.join(dir,rel),low=rel.toLowerCase();let text;try{text=fs.readFileSync(f,'utf8').replace(/^﻿/,'');}catch{continue;}ix.files++;
  if(/(^|\/)lines\.json$/.test(low)){let j;try{j=JSON.parse(text);}catch{continue;}for(const s of Array.isArray(j)?j:j.lines||[])if(typeof s==='string'&&s){add(ix.dialogue,s);ix.lines++;}continue;}
  if(low.endsWith('.json')){let j;try{j=JSON.parse(text);}catch{continue;}readRpgm(rel,j,ix);continue;}
  if(/\.(ks|txt|scn)$/.test(low))readKag(text,ix);}
 return ix;}

/* where a text sits in the script: 'dialogue' | 'choice' | 'ui' | '' (lines of 6+ characters also match inside a script line,
   the hooks often deliver a page split in two) */
function whereIs(ix,text){const k=fold(text);if(!k)return '';
 if(ix.choices.has(k))return 'choice';if(ix.ui.has(k))return 'ui';if(ix.dialogue.has(k))return 'dialogue';
 if([...k].length>=6){for(const d of ix.dialogue)if(d.includes(k)||k.includes(d)&&[...d].length>=6)return 'dialogue';}
 return '';}
/* only the script lines a replay touches (the trimmed sample probe keeps these, not the game's whole script) */
function touched(ix,texts){const out=new Set();for(const t of texts){const k=fold(t);if(!k)continue;if(ix.dialogue.has(k)){out.add(k);continue;}
 if([...k].length>=6)for(const d of ix.dialogue)if(d.includes(k)||k.includes(d)&&[...d].length>=6)out.add(d);}return [...out];}
module.exports={load,whereIs,touched,emptyIndex};
