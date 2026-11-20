// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 每一次画字都要分清角色：台词 / 可交互 UI / 系统和装饰文字，按引擎内部身份分，不靠看画面猜) the draw role of one text draw.
   The identity is what the engine layer knows about the call that drew the text:
     {hook:'TextRender', cls:['Window_ChoiceList','Window_Command','Window_Selectable','Window_Base'], call:'selectLink', layer:'msg'}
   cls is the class chain, own class first, so a plugin's subclass of Window_ChoiceList is a choice list without a rule of its own.
   The rules are profile data (role.* in core/profiles/defaults.cjs): the engine diff names its engine's classes, a game diff
   names its own plugin windows. Order: call, class chain, hook, layer, patterns, fallback. Pure: no I/O. */
const Profiles=require('./profiles/index.cjs');
const ROLES=['dialogue','ui','system'];
const isRole=r=>ROLES.includes(r);

/* identity -> the keys a rule can name, most specific first */
function keys(id){id=id||{};const out=[];
 if(id.call)out.push('call:'+id.call);
 for(const c of Array.isArray(id.cls)?id.cls:id.cls?[id.cls]:[])out.push('class:'+c);
 if(id.hook)out.push('hook:'+id.hook);
 if(id.layer)out.push('layer:'+id.layer);
 return out;}
/* one string that names the identity (report rows, replay files, patterns) */
function label(id){return keys(id).join('|')||'unknown';}

function patternsOf(p){const out=[];for(const row of Profiles.get(p,'role.patterns',[])||[]){if(!Array.isArray(row)||!isRole(row[1]))continue;try{out.push([new RegExp(String(row[0]),'u'),row[1]]);}catch{}}return out;}

/* -> {role, by}; role null = the kernel decides as before (no rule, no fallback) */
function classify(profile,id){const map=Profiles.get(profile,'role.map',{})||{};
 for(const k of keys(id))if(isRole(map[k]))return {role:map[k],by:k};
 const s=label(id);for(const [re,role] of patternsOf(profile))if(re.test(s))return {role,by:'pattern:'+re.source};
 const fb=Profiles.get(profile,'role.fallback',null);return {role:isRole(fb)?fb:null,by:isRole(fb)?'fallback':''};}
/* what the kernel does with a role: 'embed' | 'annotate' | 'leave' | null (as before) */
function treat(profile,role){return role?Profiles.get(profile,'role.treat.'+role,null):null;}
module.exports={ROLES,keys,label,classify,treat};
