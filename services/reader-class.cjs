// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-12 转职 (class change), service side. A reader's level comes from what they read (characters, minutes,
   words saved). From Lv.20 they must choose an element to keep levelling; until then the level holds at 20 and the
   experience gathered meanwhile waits, paid back in full once an element is chosen (it is all derived from the
   totals, so nothing is lost or stored twice). The element lives in data/config/reader-class.json and rides along
   with the leaderboard submission, together with the level, so other readers can see it. web/reader-class.js keeps
   the same numbers for the interface; validation/reader-class.test.cjs checks both agree. */
const fs=require('node:fs');
const path=require('node:path');
const ELEMENTS=['fire','ice','thunder','wind','water','earth','light','dark'];
const LEGACY={explosion:'fire',frost:'ice'};
const XP_EARLY=[100,150,200,250,300],XP_STEP=600,CLASS_LEVEL=20;
const xpOf=stats=>{const s=stats||{};return Math.floor((Number(s.characters)||0)/50)+Math.floor((Number(s.seconds)||0)/60)*2+(Number(s.words)||0)*10;};
const xpToReach=level=>{let x=0;for(let l=1;l<level;l++)x+=l<=XP_EARLY.length?XP_EARLY[l-1]:XP_STEP;return x;};
function levelOf(xp){let left=Math.max(0,Math.floor(xp)),level=1;
 for(const cost of XP_EARLY){if(left<cost)return {level,into:left,need:cost};left-=cost;level++;}
 const more=Math.floor(left/XP_STEP);return {level:level+more,into:left-more*XP_STEP,need:XP_STEP};}
/* {level,xp,into,need,pending,locked}: without an element the level stops at 20 and pending is the waiting experience */
function readerLevel(stats,element=''){
 const xp=xpOf(stats),cap=xpToReach(CLASS_LEVEL),has=ELEMENTS.includes(element);
 if(has||xp<cap)return {...levelOf(xp),xp,pending:0,locked:false};
 return {level:CLASS_LEVEL,into:0,need:XP_STEP,xp:cap,pending:xp-cap,locked:true};
}
const file=root=>path.join(root,'data','config','reader-class.json');
function read(root){
 try{const v=JSON.parse(fs.readFileSync(file(root),'utf8'));const e=LEGACY[v.school]||v.element||v.school;return {element:ELEMENTS.includes(e)?e:'',at:Number(v.at)||0};}
 catch{return {element:'',at:0};}
}
function write(root,element){
 if(!ELEMENTS.includes(element))throw new Error('READER_CLASS_INVALID');
 const dir=path.dirname(file(root));fs.mkdirSync(dir,{recursive:true});
 const tmp=file(root)+'.tmp',at=Math.floor(Date.now()/1000);fs.writeFileSync(tmp,JSON.stringify({element,at}));fs.renameSync(tmp,file(root));
 return {element,at};
}
module.exports={ELEMENTS,CLASS_LEVEL,XP_EARLY,XP_STEP,xpOf,xpToReach,levelOf,readerLevel,read,write};
