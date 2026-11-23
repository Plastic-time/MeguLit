// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sources=new Set(['script','patch','official','machine','local','api','mt','cache']);
const number=n=>Number.isSafeInteger(n)&&n>=0?n:null;
const source=s=>sources.has(s)?s:'unknown';
const revision=s=>typeof s==='string'&&/^(?:v\d+(?:\.g\d+)?|g\d+)$/.test(s)?s:null;
const coordinate=n=>Number.isSafeInteger(n)&&Math.abs(n)<=65536?n:null;
const rect=r=>r&&[r.x,r.y,r.width,r.height].every(v=>coordinate(v)!==null)&&r.width>0&&r.height>0?
 {x:r.x,y:r.y,width:r.width,height:r.height}:null;
const position=p=>p?{sequence:number(p.sequence),scriptIndex:number(p.scriptIndex),line:number(p.line),scriptCursor:number(p.scriptCursor),rect:rect(p.rect)}:null;
function clean(r){
 return {before:position(r.before),current:position(r.current),after:position(r.after),seedRevision:revision(r.seedRevision),
  translationSource:source(r.translationSource),translationOrigin:source(r.translationOrigin),
  original:['hidden','visible'].includes(r.original)?r.original:'unknown'};
}
function filename(root,id){
 return path.join(root,'data','sentence-marks',crypto.createHash('sha256').update(String(id)).digest('hex')+'.json');
}
function read(root,id){
 return readFile(filename(root,id));
}
function readFile(file){
 try{if(fs.statSync(file).size>65536)return [];return JSON.parse(fs.readFileSync(file,'utf8')).slice(-24).map(clean);}catch{return [];}
}
class Session{
 constructor(){this.rows=new Map();}
 observe(game,episode,message,seedRevision){
  if(!game||!episode)return;
  if(game!==this.game){this.rows.clear();this.game=game;this.session=crypto.randomUUID();this.previous=null;}
  episode=this.session+':'+episode;
  if(this.rows.has(episode))return episode;
  const current=position({sequence:message.hookSequence,scriptIndex:message.hookSourceIndex,line:message.hookSourceLine,scriptCursor:message.scriptCursor});
  const prior=this.rows.get(this.lastEpisode);if(prior)prior.after=current;this.lastEpisode=episode;
  this.rows.set(episode,{before:this.previous,current,seedRevision});this.previous=current;
  if(this.rows.size>96)this.rows.delete(this.rows.keys().next().value);
  return episode;
 }
 displayed(game,args){
  const row=this.rows.get(args.episode);if(!row||game!==this.game)return;
  row.current.rect=rect(args.rect);row.translationSource=source(args.translationSource);row.translationOrigin=source(args.translationOrigin);
 }
 mark(root,game,args){
  const r=this.rows.get(args.episode);if(!r||game!==this.game)throw Error('SENTENCE_EXPIRED');
  const file=filename(root,game),marks=read(root,game);
  marks.push(clean({...r,translationSource:r.translationSource??args.translationSource,translationOrigin:r.translationOrigin??args.translationOrigin}));
  fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+crypto.randomUUID()+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(marks.slice(-24)));fs.renameSync(tmp,file);return {saved:true};
 }
}
function all(root){
 const dir=path.join(root,'data','sentence-marks');let files;
 try{files=fs.readdirSync(dir).filter(name=>/^[a-f0-9]{64}\.json$/.test(name)).map(name=>({name,time:fs.statSync(path.join(dir,name)).mtimeMs}));}catch{return [];}
 return files.sort((a,b)=>b.time-a.time).slice(0,24).flatMap(({name})=>{
  const marks=readFile(path.join(dir,name));return marks.length?[{gameKey:name.slice(0,64),marks}]:[];
 });
}
module.exports={Session,read,all};
