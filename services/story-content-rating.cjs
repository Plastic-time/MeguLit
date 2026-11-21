// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const KINDS=new Set(['gallery-group','scene-marker','adult-audio','adult-only','game-rating']);
const SCRIPT_KINDS=new Set(['scene-marker','adult-audio','adult-only']);
const FIELDS={
 'gallery-group':['kind','file','entry','marker','category'],
 'scene-marker':['kind','file','entry','marker','prefix','offset'],
 'adult-audio':['kind','file','entry','marker','prefix','offset'],
 'adult-only':['kind','file','entry','contextProof','occurrences','adultOccurrences'],
 'game-rating':['kind','rating','vndb','release']
};
function plain(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const prototype=Object.getPrototypeOf(value);
 if(prototype!==null&&prototype!==Object.prototype)return false;
 return Reflect.ownKeys(value).every(key=>{const d=Object.getOwnPropertyDescriptor(value,key);return typeof key==='string'&&d.enumerable&&Object.hasOwn(d,'value');});
}
function dense(value,limit){
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>limit)return false;
 const keys=Reflect.ownKeys(value);
 if(keys.length!==value.length+1)return false;
 return keys.every(key=>{if(key==='length')return true;if(typeof key!=='string'||!/^0$|^[1-9]\d*$/.test(key)||Number(key)>=value.length)return false;const d=Object.getOwnPropertyDescriptor(value,key);return d.enumerable&&Object.hasOwn(d,'value');});
}
const privateText=/(?:^|[\s"'=])[a-z]:[\\/]|\\\\|\/(?:Users|home)\/|\\Users\\|@[a-z0-9-]+\.[a-z]{2,}/i;
const text=value=>typeof value==='string'&&value.length>0&&value.length<=240&&!/[\x00-\x1f]/.test(value)&&!privateText.test(value);
const relative=value=>text(value)&&!value.startsWith('/')&&!value.startsWith('\\')&&!value.split(/[\\/]/).some(part=>part==='..'||part==='')&&!value.includes(':');
const imageName=value=>relative(value)&&!/[\\/]/.test(value);

function hasAdultMarker(value,prefixes=[]){
 if(typeof value!=='string'||value.length>240)return false;
 const normalized=value.normalize('NFKC');
 if(/エッチ|Hシーン|濡れ場/i.test(normalized))return true;
 if(/(?:^|[^a-z0-9])(?:h(?:scene)?|sex|ero)(?=$|[^a-z]|\d)/i.test(normalized))return true;
 return Array.isArray(prefixes)&&prefixes.length<=16&&prefixes.some(prefix=>typeof prefix==='string'&&/^[a-z0-9_-]{2,40}$/i.test(prefix)&&normalized.toLowerCase().startsWith(prefix.toLowerCase()));
}

function validReason(reason){
 if(!plain(reason)||!KINDS.has(reason.kind)||Object.keys(reason).some(key=>!FIELDS[reason.kind].includes(key)))return false;
 if(reason.kind==='game-rating'){
  if(!['adult','all-ages','unknown'].includes(reason.rating))return false;
  if(reason.vndb!==undefined&&!/^v[1-9]\d{0,8}$/.test(reason.vndb))return false;
  if(reason.release!==undefined&&!/^r[1-9]\d{0,8}$/.test(reason.release))return false;
  return reason.rating==='unknown'||typeof reason.vndb==='string';
 }
 if(!relative(reason.file)||!relative(reason.entry))return false;
 if(reason.kind==='gallery-group')return ['adult','general'].includes(reason.category)&&(reason.marker===undefined||text(reason.marker));
 if(reason.kind==='adult-only')return ['gallery-adult','scene-and-audio'].includes(reason.contextProof)&&Number.isSafeInteger(reason.occurrences)&&reason.occurrences>0&&reason.occurrences<=1000000&&reason.adultOccurrences===reason.occurrences;
 if(!text(reason.marker))return false;
 if(reason.offset!==undefined&&(!Number.isSafeInteger(reason.offset)||reason.offset<0||reason.offset>2147483647))return false;
 if(reason.prefix!==undefined&&(typeof reason.prefix!=='string'||!/^[a-z0-9_-]{2,40}$/i.test(reason.prefix)))return false;
 return hasAdultMarker(reason.marker,reason.prefix===undefined?[]:[reason.prefix]);
}

function decision(reasons){
 const gallery=reasons.filter(reason=>reason.kind==='gallery-group');
 if(gallery.length)return {adult:gallery.some(reason=>reason.category==='adult'),basis:'gallery'};
 if(new Set(reasons.filter(reason=>SCRIPT_KINDS.has(reason.kind)).map(reason=>reason.kind)).size>=2)return {adult:true,basis:'script'};
 const game=reasons.filter(reason=>reason.kind==='game-rating');
 if(game.length!==1)return null;
 return {adult:game[0].rating!=='all-ages',basis:'game'};
}

function independent(reasons){
 const seen=new Set();
 for(const reason of reasons)if(SCRIPT_KINDS.has(reason.kind)){
  const key=JSON.stringify([reason.file,reason.entry,reason.marker||'',reason.offset??null,reason.contextProof||'',reason.occurrences??null]);
  if(seen.has(key))return false;
  seen.add(key);
 }
 return true;
}

function classify(input={}){
 if(!plain(input)||Object.keys(input).some(key=>!['name','gallery','script','gameRating'].includes(key)))throw Error('STORY_CONTENT_FACTS');
 const {name,gallery=[],script=[],gameRating={rating:'unknown'}}=input;
 if(!imageName(name)||!dense(gallery,15)||!dense(script,15)||gallery.length+script.length>15)throw Error('STORY_CONTENT_FACTS');
 const facts=[...gallery,...script];
 if(facts.some(reason=>!validReason(reason))||gallery.some(reason=>reason.kind!=='gallery-group')||script.some(reason=>!SCRIPT_KINDS.has(reason.kind))||!independent(script))throw Error('STORY_CONTENT_FACTS');
 let reasons=facts.map(reason=>({...reason}));
 if(!gallery.length&&new Set(script.map(reason=>reason.kind)).size<2){
  if(!plain(gameRating))throw Error('STORY_CONTENT_GAME_RATING');
  const fallback={kind:'game-rating',...gameRating};
  if(fallback.kind!=='game-rating'||!validReason(fallback))throw Error('STORY_CONTENT_GAME_RATING');
  reasons.push(fallback);
 }
 const result=decision(reasons);
 if(!result)throw Error('STORY_CONTENT_FACTS');
 return {name,...result,reasons};
}

function validateRows(rows,{names}={}){
 if(!dense(rows,100000))return false;
 const allowed=names===undefined?null:new Set([...names].map(name=>String(name).toLowerCase()));
 const seen=new Set();let reasons=0;
 for(const row of rows){
  if(!plain(row)||Object.keys(row).some(key=>!['name','adult','basis','reasons'].includes(key))||!imageName(row.name)||typeof row.adult!=='boolean'||!['gallery','script','game'].includes(row.basis)||!dense(row.reasons,16)||!row.reasons.length)return false;
  const key=row.name.toLowerCase();
  if(seen.has(key)||allowed&&!allowed.has(key))return false;
  seen.add(key);reasons+=row.reasons.length;
  if(reasons>200000||row.reasons.some(reason=>!validReason(reason))||!independent(row.reasons))return false;
  const result=decision(row.reasons);
  if(!result||result.adult!==row.adult||result.basis!==row.basis)return false;
  if(result.basis!=='game'&&row.reasons.some(reason=>reason.kind==='game-rating'))return false;
 }
 return true;
}
function validateRatings(rows,options){try{return validateRows(rows,options);}catch{return false;}}

module.exports={classify,validateRatings,hasAdultMarker};
