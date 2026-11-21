// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// I2 Localization's LanguageSource MonoBehaviour stores a translation array per term,
// followed by the locale table that gives those columns their meaning.

const ser=require('./unity-serialized.cjs');
const locales=/^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*$/i;

function reader(buf,start=0){
 let pos=start;
 function take(n){
  if(n<0||n>buf.length-pos)throw Error('I2_BOUNDARY');
  const begin=pos;pos+=n;return begin;
 }
 function count(max){const n=buf.readUInt32LE(take(4));if(n>max)throw Error('I2_COUNT');return n;}
 function string(){
  const n=count(buf.length),start=take(n);take((4-n%4)%4);
  return buf.toString('utf8',start,start+n);
 }
 return {take,count,string};
}

function readSource(raw){
 const r=reader(raw,28); // GameObject, enabled, MonoScript PPtr (64-bit path ID).
 r.string(); // Object name
 for(let i=0;i<4;i++)r.string(); // Serialized synchronization settings
 r.take(8);
 const terms=r.count(Math.floor(raw.length/20)),rows=[];
 let width=0;
 for(let i=0;i<terms;i++){
  r.string();const type=r.count(255);r.string(); // Term, type, description
  const columns=r.count(256);
  if(!columns||(width&&width!==columns))return null;
  width=columns;
  const translations=[];
  for(let j=0;j<columns;j++){const value=r.string();if(type===0)translations.push(value);}
  if(type===0)rows.push(translations);
  const touch=r.count(256);for(let j=0;j<touch;j++)r.string();
  const flags=r.count(256);r.take((flags+3)&~3);
 }
 const languages=r.count(256);
 if(!width||languages!==width)return null;
 const codes=[];
 for(let i=0;i<languages;i++){
  r.string();const code=r.string().toLowerCase().replace(/_/g,'-');r.take(4);
  if(!locales.test(code)||codes.includes(code))return null;
  codes.push(code);
 }
 const jp=codes.findIndex(c=>c==='ja'||c.startsWith('ja-'));
 if(jp<0)return null;
 const chinese=codes.find(c=>/^zh-(?:hans|cn|sg)(?:-|$)/.test(c))||codes.find(c=>/^zh(?:-|$)/.test(c));
 const cn=codes.indexOf(chinese),lines=[],zh=[];
 for(const values of rows){
  const line=values[jp].trim();if(!line)continue;
  lines.push(line);if(cn>=0)zh.push(values[cn].trim());
 }
 return lines.length?{lines,anchors:[],zh}:null;
}

const i2Class=new Map([['LanguageSource','I2.Loc']]);
function scriptIds(buf,classes=i2Class){
 if(classes===i2Class&&!buf.includes(Buffer.from('I2.Loc')))return new Set();
 const parsed=ser.parse(buf),ids=new Set();
 if(!parsed?.little||parsed.version<17)return ids;
 for(const o of parsed.objects){
  if(o.type!==115)continue;
  const r=reader(buf.subarray(o.offset,o.offset+o.size));
  try{
   const name=r.string();if(!classes.has(name))continue;
   r.take(20); // execution order and serialized properties hash
   if(r.string()===name&&r.string()===classes.get(name))ids.add(o.id);
  }catch{}
 }
 return ids;
}

function references(buf,o,file,ids){
 if(!ids?.size||o.size<32||o.offset+o.size>buf.length)return false;
 const external=file.externals?.[buf.readInt32LE(o.offset+16)-1];
 return external?.toLowerCase()==='globalgamemanagers.assets'&&ids.has(Number(buf.readBigInt64LE(o.offset+20)));
}

function entry(buf,o,file,ids){
 if(!references(buf,o,file,ids))return null;
 try{
  const doc=readSource(buf.subarray(o.offset,o.offset+o.size));
  return doc?{name:'I2-LanguageSource-'+o.id,kind:'i2',bytes:Buffer.from('\u0001I2\n'+JSON.stringify(doc))}:null;
 }catch{return null;}
}
module.exports={scriptIds,entry,references};
