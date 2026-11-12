// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E375 RPG Maker MV / MZ (NW.js). The game data is plain JSON in www/data (MV) or data (MZ):
     Map###.json      events[].pages[].list[]   event commands
     CommonEvents.json [].list[]
     Troops.json       [].pages[].list[]
   Message commands: 101 Show Text header (face, background, position; MZ: speaker name in parameters[4]) followed by
   one 401 per text row; 102 Show Choices (parameters[0] = the choices); 105 Scrolling Text header followed by 405 rows.
   Every line has a key (file, event, page, kind and its ordinal in that page), so a translated copy of the data folder
   pairs line by line even when the translators wrote more or fewer rows per message. A page whose message count differs
   in the translation keeps the Japanese text.
   Control codes (\C[n], \I[n], \V[n], \{ \} \. \| \! \> \< \^ \$ and plugin codes like \FS[n]) are dropped, \N[n] becomes
   the actor's name from Actors.json and \n (not \n[n]) is a line break. Encrypted data (rare) is not read.
   Hook side: MV/MZ draws through Chromium (NW.js); LunaHook has no reliable hook for its V8 strings, so the library marks
   it unverified (hook:null) and live text reaches MeguLit only if the hook layer gets some or through OCR. This adapter
   reads the script itself, so whatever text does arrive is matched to its Japanese line and the patch's Chinese. */
const fs=require('node:fs'),path=require('node:path');
const {stat}=require('./file-key.cjs');
const DATA_FILE=n=>/^(?:map\d+|commonevents|troops)\.json$/i.test(n);
// The data folder of a game folder: www/data (MV) or data (MZ), recognised by System.json and MapInfos.json.
function dataDir(dir){for(const rel of ['www/data','data','www/Data','Data']){const d=path.join(dir,rel);if(fs.existsSync(path.join(d,'System.json'))&&fs.existsSync(path.join(d,'MapInfos.json')))return d;}return '';}
const isDataDir=d=>fs.existsSync(path.join(d,'System.json'))&&fs.existsSync(path.join(d,'MapInfos.json'));
function readJson(buf){let t=Buffer.isBuffer(buf)?buf.toString('utf8'):String(buf);if(t.charCodeAt(0)===0xfeff)t=t.slice(1);return JSON.parse(t);}
function actorNames(d){try{return (readJson(fs.readFileSync(path.join(d,'Actors.json')))||[]).map(a=>a&&typeof a.name==='string'?a.name:'');}catch{return [];}}
/* Escape codes are case-insensitive in the engine (\n[3] is an actor name too). */
function clean(text,actors=[]){
 let t=String(text??'');
 t=t.replace(/\\\\/g,'\u0000');
 t=t.replace(/\\N\[(\d+)\]/gi,(_,n)=>actors[+n]||'');
 t=t.replace(/\\n(?![\[<])/g,'\n');
 t=t.replace(/\\[A-Za-z]+(?:\[[^\]]*\]|<[^>]*>)?/g,'');
 t=t.replace(/\\[{}.|!><^$]/g,'');
 return t.replace(/\u0000/g,'\\').replace(/[ \t]+\n/g,'\n').trim();
}
// Every message of one command list: [{kind, text, speaker}] in order. 401/405 rows after their header form one message.
function messages(list,actors){const out=[];if(!Array.isArray(list))return out;
 for(let i=0;i<list.length;i++){const c=list[i];if(!c||typeof c!=='object')continue;const p=Array.isArray(c.parameters)?c.parameters:[];
  if(c.code===101||c.code===401&&(i===0||![101,401].includes(list[i-1]?.code))){
   const speaker=c.code===101&&typeof p[4]==='string'?clean(p[4],actors):'';const rows=[];let j=i+1;if(c.code===401)j=i;
   while(j<list.length&&list[j]?.code===401){rows.push(String(list[j].parameters?.[0]??''));j++;}
   i=j-1;const text=clean(rows.join('\n'),actors);if(text)out.push({kind:'m',text,speaker});continue;}
  if(c.code===105){const rows=[];let j=i+1;while(j<list.length&&list[j]?.code===405){rows.push(String(list[j].parameters?.[0]??''));j++;}i=j-1;const text=clean(rows.join('\n'),actors);if(text)out.push({kind:'s',text});continue;}
  if(c.code===102&&Array.isArray(p[0]))p[0].forEach(choice=>{const text=clean(choice,actors);out.push({kind:'c',text});});}
 return out;}
// The command lists of one data file with their place: [{group, list}].
function lists(name,doc){const out=[],n=name.toLowerCase();
 if(/^map\d+\.json$/.test(n)){for(const e of doc?.events||[])if(e)(e.pages||[]).forEach((pg,p)=>out.push({group:'e'+e.id+'.p'+p,list:pg?.list}));}
 else if(n==='commonevents.json'){for(const e of doc||[])if(e)out.push({group:'c'+e.id,list:e.list});}
 else if(n==='troops.json'){for(const t of doc||[])if(t)(t.pages||[]).forEach((pg,p)=>out.push({group:'t'+t.id+'.p'+p,list:pg?.list}));}
 return out;}
/* parse(buf): buf is either one data file wrapped by scenes() ({rpgmaker:1,name,actors,data}) or a bare data file
   (named by its own shape). lines: message texts; keys: group:kind#ordinal; groups: message count per group. */
function parse(buf){
 let doc=readJson(buf),name='',actors=[];
 if(doc&&doc.rpgmaker===1){name=doc.name;actors=doc.actors||[];doc=doc.data;}
 else name=Array.isArray(doc)?(doc.some(e=>e&&Array.isArray(e.pages))?'Troops.json':'CommonEvents.json'):'Map000.json';
 const lines=[],keys=[],speakers=[],anchors=[],groups={};
 for(const {group,list} of lists(name,doc)){const seen={};const msgs=messages(list,actors);if(!msgs.length)continue;anchors.push(group);groups[group]=msgs.length;
  for(const m of msgs){seen[m.kind]=(seen[m.kind]||0)+1;lines.push(m.text);keys.push(group+':'+m.kind+'#'+seen[m.kind]);speakers.push(m.speaker||'');}}
 return {lines,anchors,keys,speakers,groups};}
const wrap=(name,file,actors)=>()=>Buffer.from(JSON.stringify({rpgmaker:1,name,actors,data:readJson(fs.readFileSync(file))}));
function sceneFiles(d){try{return fs.readdirSync(d).filter(DATA_FILE).sort();}catch{return [];}}
const memo=new Map();
function parsedFile(file){const k=file+'|'+stat(file);if(memo.has(k))return memo.get(k);let v=null;
 try{const d=path.dirname(file);v=parse(Buffer.from(JSON.stringify({rpgmaker:1,name:path.basename(file),actors:actorNames(d),data:readJson(fs.readFileSync(file))})));}catch{}
 memo.set(k,v);if(memo.size>2000)memo.delete(memo.keys().next().value);return v;}
/* The translated copy of one running file: the same file name in any data folder the patch offers. A copy whose lines
   are all the same as the running ones is the running game (or an untranslated copy) and is passed over; among the
   rest the one that changes the most lines wins. */
function pairScene(scene,dirs){let best=null,bestChanged=0;
 for(const d of dirs){const file=path.join(d,scene.name);if(!fs.existsSync(file))continue;const p=parsedFile(file);if(!p)continue;
  const byKey=new Map(p.keys.map((k,i)=>[k,p.lines[i]]));let changed=0;
  const lines=scene.lines.map((t,i)=>{const k=scene.keys?.[i],g=k&&k.slice(0,k.indexOf(':'));if(!k||p.groups[g]!==scene.groups?.[g])return t;const v=byKey.get(k);if(v===undefined||v===t)return t;changed++;return v;});
  if(changed>bestChanged){best=lines;bestChanged=changed;}}
 return best;}
// Every folder the patch offers that holds data files (a patch that only replaces the maps has no System.json).
function patchDirs(found){const out=new Set();
 for(const d of found.dirs){let names=[];try{names=fs.readdirSync(d);}catch{}if(names.some(DATA_FILE))out.add(d);}
 return [...out];}
const rpgmaker={
 id:'rpgmaker',hint:'www\\data（或 data）文件夹',
 scenes(dir){const d=dataDir(dir);if(!d)return [];const actors=actorNames(d);return sceneFiles(d).map(f=>({name:f,read:wrap(f,path.join(d,f),actors)}));},
 archives:()=>[],
 sources:dir=>{const d=dataDir(dir);return d?[...sceneFiles(d),'Actors.json'].map(f=>path.join(d,f)):[];},
 parse,test:DATA_FILE,
 patchLines(base,found){const dirs=patchDirs(found);let any=false;
  const list=base.map(scene=>{const lines=pairScene(scene,dirs);if(!lines)return scene;any=true;return {...scene,patched:true,lines};});
  return any?list:null;},
 dataDir,clean,messages,
};
module.exports=rpgmaker;
