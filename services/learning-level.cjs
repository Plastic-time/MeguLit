// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 学习 → 日语水平 (2026-11-11): asked the first time the learning page opens, changeable any time. Choosing a level
   marks what lies below it as known: from N5 up every kana is 掌握, from N4 up the N5 grammar points are learned.
   Only raises: picking a lower level later never erases what was learned. N0 means native-like, beyond the JLPT. */
const fs=require('fs'),path=require('path');
const LEVELS=['none','kana','N5','N4','N3','N2','N1','N0'];
const FILE=root=>path.join(root,'data','learning-level.json');
const rank=l=>LEVELS.indexOf(l);
function get(root){try{const o=JSON.parse(fs.readFileSync(FILE(root),'utf8'));return LEVELS.includes(o.level)?{level:o.level,setAt:Number(o.setAt)||0}:{level:null,setAt:0};}catch{return {level:null,setAt:0};}}
/* Where to start for a level: kana first for beginners, the first grammar level above the chosen one otherwise. */
function recommend(level){
  if(level==='none')return {tab:'kana',grammar:'N5',reason:'kana'};
  if(level==='kana')return {tab:'kana',grammar:'N5',reason:'kana-rest'};
  if(level==='N0')return {tab:'readwords',grammar:'N0',reason:'native'};
  return {tab:'grammar',grammar:LEVELS[rank(level)+1],reason:'grammar'};
}
function set(db,root,{level,kana=[]}={}){
  if(!LEVELS.includes(level))throw Error('INVALID_LEARNING_LEVEL');
  const file=FILE(root);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify({level,setAt:Date.now()}));
  const applied={kana:0,grammar:0};
  if(rank(level)>=rank('N5')){
    const k=require('./kana.cjs'),data=k.read(root);
    for(const c of (Array.isArray(kana)?kana:[]).map(String))if([...c].length<=2&&/^[ぁ-ゖァ-ヺー]+$/u.test(c)&&(data.mastery[c]||0)<3){data.mastery[c]=3;applied.kana++;}
    if(applied.kana)k.save(root,data);
  }
  if(rank(level)>=rank('N4')&&db){
    const g=require('./grammar.cjs'),prog=g.progress(db);
    for(const p of g.POINTS)if(!prog[p]?.learned){g.setLearned(db,p,true);applied.grammar++;}
  }
  return {level,applied,recommend:recommend(level)};
}
module.exports={LEVELS,get,set,recommend,rank};
