'use strict';
/* E591 Artemis multi-language releases (Steam The Shell: every .ast message holds ja/en/cn/tw, but the language list and
   the save offer no Japanese). Nothing of the game is changed: one extra archive <base>.pfs.NNN (numbered after the
   game's own patches, so it is read last and wins) carries the game's own Lua file that defines get_language, with the
   text tables read in Japanese. UI language, sub language and voices stay the game's. Undo deletes that archive. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sc=()=>require('../services/original-engines/scenes.cjs');
const ADAPTER='artemis-pfs',BACKUP_DIR='.megulit-japanese';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');

/* archives in load order: base.pfs, then base.pfs.000, .001 ... (numeric) */
function archives(gameDir){
 let names=[];try{names=fs.readdirSync(gameDir);}catch{return [];}
 const bases=names.filter(n=>/\.pfs$/i.test(n));
 return bases.map(b=>({base:b,files:[b,...names.filter(n=>n.toLowerCase().startsWith(b.toLowerCase()+'.')&&/\.\d{3}$/.test(n)).sort((x,y)=>+x.slice(-3)-+y.slice(-3))]}));
}
function entries(file){try{return sc().pfsList(file);}catch{return null;}}
function readEntry(file,list,name){const e=list.files.find(f=>f.name.toLowerCase()===name.toLowerCase());return e?sc().pfsRead(file,e,list.key):null;}

/* the text holds real Japanese next to other languages (not "*テキスト*" placeholders) */
function multilingual(dir,files){
 for(const f of files){const list=entries(path.join(dir,f));if(!list)continue;
  for(const e of list.files.filter(e=>/\.ast$/i.test(e.name)&&e.size>4000).slice(0,8)){let buf,t='';try{buf=sc().pfsRead(path.join(dir,f),e,list.key);t=buf.toString('utf8');}catch{continue;}
   if(/\bja\s*=\s*\{/.test(t)&&/\b(en|cn|tw|zh)\s*=\s*\{/.test(t)&&sc().parseAst(buf).lines.some(l=>/[ぁ-ゖァ-ヺ]/.test(l)))return true;}}
 return false;
}
/* the game's Lua files (the last archive holding a name wins, like the engine) */
function luaFiles(dir,files){
 const out=new Map();
 for(const f of files){const list=entries(path.join(dir,f));if(!list)continue;
  for(const e of list.files.filter(e=>/\.lua$/i.test(e.name))){let t;try{t=sc().pfsRead(path.join(dir,f),e,list.key);}catch{continue;}out.set(e.name.toLowerCase(),{archive:f,name:e.name,data:t});}}
 return [...out.values()];
}
/* E598 a plain line comment: the switched line can sit inside a --[[ ]] block (The Shell title.lua 344), where a ]] in the
   mark closed that block early and the game stopped at boot. MARKED also knows the old mark. */
const MARK='-- MeguLit ja',MARKED=/MeguLit ja/;
/* only where the current language picks a text table (p[ln], v[l], lang=(ln)) is it set to "ja"; image paths, fonts
   of the UI and the language list keep the game's language (fixing get_language itself left The Shell on a black screen) */
function patchLua(buf){
 const t=buf.toString('utf8');if(MARKED.test(t))return null;
 const lines=t.split('\n');let n=0;
 for(let i=0;i<lines.length;i++){const m=/^(\s*local\s+(\w+)\s*=\s*)get_language\(\s*true\s*\)/.exec(lines[i]);if(!m)continue;
  /* the next lines of the same function only (a function ends at an "end" or starts at "function" in column 0) */
  const next=lines.slice(i+1,i+6),stop=next.findIndex(l=>/^(?:local\s+)?function\b|^end\b/.test(l));
  const v=m[2],after=(stop<0?next:next.slice(0,stop)).join('\n'),esc=v.replace(/\W/g,'');
  const indexes=new RegExp('\[\s*'+esc+'\s*\]|lang\s*=\s*\(\s*'+esc+'\s*\)').test(after),concat=new RegExp('\.\.\s*'+esc+'\b|\b'+esc+'\s*\.\.').test(after);
  /* E598 (user's Steam The Shell went black at boot): a lookup of fonts, images or paths by language (boot.lua font cache,
     confvo.lua font) stays the game's; only text tables are switched */
  if(!indexes||concat||!/text|\bname\b|\.ja\b|\bp\[|block/.test(after)||/font|image|\.show\b|cache|path|\.png|\.ogg|\bfile\b/i.test(after))continue;
  lines[i]=m[1]+'"ja"'+lines[i].slice(m[0].length)+' '+MARK;n++;}
 return n?{data:Buffer.from(lines.join('\n'),'utf8'),changed:n}:null;
}
/* pf8 writer, the layout the engine's own archives use: "pf8", index size, index {count, entries {name, 0, offset,
   size}, count+1, u64 position of every entry's fixed block, 0, table offset}, data XOR SHA-1(index) */
function pf8(files){
 const names=files.map(f=>Buffer.from(f.name,'utf8'));
 const entriesLen=names.reduce((n,b)=>n+4+b.length+12,0),tableLen=4+(files.length+1)*8+4,indexLen=4+entriesLen+tableLen;
 const index=Buffer.alloc(indexLen);let p=0,offset=7+indexLen;const blocks=[];
 index.writeUInt32LE(files.length,p);p+=4;
 files.forEach((f,i)=>{index.writeUInt32LE(names[i].length,p);p+=4;names[i].copy(index,p);p+=names[i].length;blocks.push(p);index.writeUInt32LE(0,p);index.writeUInt32LE(offset,p+4);index.writeUInt32LE(f.data.length,p+8);p+=12;offset+=f.data.length;});
 const table=p;index.writeUInt32LE(files.length+1,p);p+=4;for(const b of blocks){index.writeBigUInt64LE(BigInt(b),p);p+=8;}index.writeBigUInt64LE(0n,p);p+=8;index.writeUInt32LE(table,p);
 const key=crypto.createHash('sha1').update(index).digest(),head=Buffer.alloc(7);head.write('pf8',0,'latin1');head.writeUInt32LE(indexLen,3);
 const data=files.map(f=>{const b=Buffer.from(f.data);for(let i=0;i<b.length;i++)b[i]^=key[i%20];return b;});
 return Buffer.concat([head,index,...data]);
}

function manifestPath(dir){return path.join(dir,BACKUP_DIR,'manifest.json');}
function readManifest(dir){try{const m=JSON.parse(fs.readFileSync(manifestPath(dir),'utf8'));return m?.adapter===ADAPTER?m:null;}catch{return null;}}

/* engine-draw (docs/engine-draw-native.md, Artemis): options.bilingual = 'cn' | 'tw' also appends core/artemis-draw.lua to
   system/image/boot.lua in the same archive: the engine draws the release's Chinese track itself, right under the Japanese */
const DRAW_MARK=/MeguLit draw/;
function drawBlock(sub,scale=0.8){
 const t=fs.readFileSync(path.join(__dirname,'artemis-draw.lua'),'utf8').replace(/\r\n/g,'\n');
 return t.replace('@SUB@',sub).replace('@SCALE@',String(scale));
}
function hasTrack(gameDir,files,sub){
 for(const f of files){const list=entries(path.join(gameDir,f));if(!list)continue;
  for(const e of list.files.filter(e=>/\.ast$/i.test(e.name)&&e.size>4000).slice(0,4)){let t='';try{t=sc().pfsRead(path.join(gameDir,f),e,list.key).toString('utf8');}catch{continue;}if(new RegExp('\\b'+sub+'\\s*=\\s*\\{').test(t))return true;}}
 return false;
}
function plan(gameDir,options={}){
 const sub=/^(cn|tw)$/.test(String(options.bilingual||''))?String(options.bilingual):null;
 for(const set of archives(gameDir)){
  if(!multilingual(gameDir,set.files))continue;
  const lua=luaFiles(gameDir,set.files);
  if(lua.some(l=>MARKED.test(l.data.toString('utf8'))||DRAW_MARK.test(l.data.toString('utf8'))))return {state:'already',adapter:ADAPTER};
  const changed=lua.map(l=>({...l,next:patchLua(l.data)})).filter(l=>l.next);
  if(!changed.length)return {state:'unsupported',reason:'ARTEMIS_NO_TEXT_LANGUAGE'};
  /* no such track in this release, or no boot.lua with get_fontdata to append to: the Japanese fix alone */
  const boot=lua.find(l=>/(^|[\\/])system[\\/]image[\\/]boot\.lua$/i.test(l.name));
  const draw=sub&&boot&&/function\s+get_fontdata\b/.test(boot.data.toString('utf8'))&&hasTrack(gameDir,set.files,sub)?sub:null;
  if(draw){
   const at=changed.find(l=>l===boot||l.name===boot.name),from=at?at.next.data:boot.data;
   const next={data:Buffer.concat([from,Buffer.from('\n'+drawBlock(draw,options.scale||0.8),'utf8')]),changed:(at?at.next.changed:0)};
   if(at)at.next=next;else changed.push({...boot,next});
  }
  const used=set.files.map(f=>/\.(\d{3})$/.exec(f)?.[1]).filter(Boolean).map(Number),n=Math.max(-1,...used)+1;
  if(n>999)return {state:'unsupported',reason:'ARTEMIS_NO_SLOT'};
  return {state:'restorable',adapter:ADAPTER,file:set.base+'.'+String(n).padStart(3,'0'),lua:changed.map(l=>l.name),lines:changed.reduce((k,l)=>k+l.next.changed,0),files:changed.map(l=>({name:l.name,data:l.next.data})),...(draw?{bilingual:draw}:{})};
 }
 return null;
}
function detect(gameDir){
 gameDir=path.resolve(String(gameDir||''));const m=readManifest(gameDir);
 if(m)return {state:'applied',adapter:ADAPTER,files:1,cells:0,pending:0,manifest:{at:m.at,files:1}};
 const p=plan(gameDir);if(!p)return {state:'none'};
 const {files,...rest}=p;return {...rest,files:files?files.length:0,cells:p.lines||0,pending:p.state==='restorable'?1:0};
}
function apply(gameDir,options={}){
 gameDir=path.resolve(String(gameDir||''));if(readManifest(gameDir))throw Error('ALREADY_APPLIED');
 const p=plan(gameDir,options);if(!p||p.state!=='restorable')throw Error('NOTHING_TO_RESTORE');
 const out=pf8(p.files),target=path.join(gameDir,p.file);
 if(fs.existsSync(target))throw Error('ARTEMIS_SLOT_TAKEN');
 /* read back through the same reader the engine layout is checked with */
 const tmp=target+'.megulit-tmp';fs.writeFileSync(tmp,out);
 try{const list=entries(tmp);if(!list||p.files.some(f=>{const back=readEntry(tmp,list,f.name);return !back||!back.equals(f.data);}))throw Error('ROUNDTRIP_FAILED '+p.file);}catch(error){fs.rmSync(tmp,{force:true});throw error;}
 fs.mkdirSync(path.join(gameDir,BACKUP_DIR),{recursive:true});
 fs.renameSync(tmp,target);
 fs.writeFileSync(manifestPath(gameDir),JSON.stringify({version:1,adapter:ADAPTER,at:new Date().toISOString(),added:p.file,sha256:sha(out),lua:p.lua,from:p.from,...(p.bilingual?{bilingual:p.bilingual}:{})},null,1));
 return {applied:p.files.length,cells:p.lines,added:p.file};
}
function restore(gameDir){
 gameDir=path.resolve(String(gameDir||''));const m=readManifest(gameDir);if(!m)throw Error('NOT_APPLIED');
 const target=path.join(gameDir,m.added),skipped=[];
 if(fs.existsSync(target)){if(sha(fs.readFileSync(target))===m.sha256)fs.rmSync(target);else skipped.push(m.added);}
 if(!skipped.length)fs.rmSync(path.join(gameDir,BACKUP_DIR),{recursive:true,force:true});
 return {restored:skipped.length?0:1,skipped};
}
/* the added archive is still ours and readable */
function verify(gameDir){
 const m=readManifest(path.resolve(gameDir));if(!m)return {ok:false,reason:'MANIFEST_MISSING'};
 const f=path.join(gameDir,m.added);if(!fs.existsSync(f))return {ok:false,reason:'FILE_MISSING',file:m.added};
 if(sha(fs.readFileSync(f))!==m.sha256)return {ok:true};
 const list=entries(f),names=[].concat(m.lua),ok=list&&names.every(n=>{const b=readEntry(f,list,n);return b&&MARKED.test(b.toString('utf8'));});
 return ok?{ok:true}:{ok:false,reason:'TABLE_UNREADABLE',file:m.added};
}
module.exports={detect,apply,restore,verify,readManifest,ADAPTER,_internal:{pf8,patchLua,archives,plan,drawBlock,luaFiles,entries,readEntry}};
