// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-12 (user: 沙耶の唄's 2003 program opened a Windows "install DirectPlay" window, then asked to restart the PC;
   "这个一定要修复", "有没有什么方法可以安装不需要重启电脑", "一定要做完善"). Windows keeps every DirectPlay DLL as a stub until
   the optional feature is installed; a game that loads one gets the Windows install window, and the install wants a restart
   because the system copy can only be swapped at boot. Windows loads a DLL from the game's own folder first, so before a
   launch, for each DirectPlay DLL the game's programs (its folder and subfolders) name:
   - the real DLL is already in WinSxS (DirectPlay installed, PC not restarted yet): copy it next to the game, it works now;
   - otherwise a game that only tries to load it (a name in its code, not an import) gets MeguLit's decline DLL, which
     refuses to load: the answer the game gets when the window is cancelled, with no window;
   - a game that imports it cannot start without it: say so (DIRECTPLAY_REQUIRED) and offer the install (no restart),
     then the next launch copies the real DLL.
   A packed program hides the names: when a launch still made Windows ask for DirectPlay (core/windows-features.cjs sees the
   install window), the folder is marked and every DirectPlay DLL is placed from then on.
   Placed files are listed in .megulit-compat.json; nothing that was already there is touched. */
const fs=require('node:fs'),path=require('node:path');
const manifest=require('./compat-manifest.cjs');
const NAMES=['dplayx','dplay','dpwsock','dpwsockx','dpmodemx','dpnet','dpnaddr','dpnathlp','dpnhpast','dpnhupnp','dpnlobby'];
const REF=new RegExp('(?<![A-Za-z0-9_])('+NAMES.join('|')+')\\.dll(?![A-Za-z0-9_])','gi');
const MAX=256*1024*1024,MAX_FILES=400,DEPTH=3;

function pe(buf){
 try{const at=buf.readUInt32LE(0x3c);if(at+24>buf.length||buf.toString('latin1',at,at+4)!=='PE\0\0')return null;
  const machine=buf.readUInt16LE(at+4),count=buf.readUInt16LE(at+6),optSize=buf.readUInt16LE(at+20),opt=at+24,magic=buf.readUInt16LE(opt);
  const dirs=opt+(magic===0x20b?112:96),sections=[];for(let i=0,s=opt+optSize;i<count&&s+40<=buf.length;i++,s+=40)sections.push({va:buf.readUInt32LE(s+12),size:Math.max(buf.readUInt32LE(s+8),buf.readUInt32LE(s+16)),raw:buf.readUInt32LE(s+20)});
  const off=rva=>{const s=sections.find(x=>rva>=x.va&&rva<x.va+x.size);return s?rva-s.va+s.raw:-1;};
  const imports=new Set();let d=off(buf.readUInt32LE(dirs+8));
  for(let n=0;d>0&&d+20<=buf.length&&n<512;n++,d+=20){const nameRva=buf.readUInt32LE(d+12);if(!nameRva)break;const o=off(nameRva);if(o<0||o>=buf.length)break;const end=buf.indexOf(0,o);imports.add(buf.toString('latin1',o,end<0?Math.min(o+64,buf.length):end).toLowerCase().replace(/\.dll$/,''));}
  /* the .NET header (data directory 14) and its runtime version, for core/windows-features.cjs */
  let clr='';const com=off(buf.readUInt32LE(dirs+14*8));
  if(com>0&&com+16<=buf.length){const meta=off(buf.readUInt32LE(com+8));if(meta>0&&meta+16<=buf.length&&buf.readUInt32LE(meta)===0x424a5342){const len=buf.readUInt32LE(meta+12);clr=buf.toString('latin1',meta+16,meta+16+Math.min(len,32)).replace(/\0.*$/,'');}}
  return {bits:machine===0x8664||machine===0xaa64?64:32,imports,clr,dll:!!(buf.readUInt16LE(at+22)&0x2000)};}catch{return null;}
}
/* the program files of a game folder (and its subfolders, a few levels down), without the ones MeguLit placed */
function programs(dir,placed=new Set()){
 const out=[];const walk=(d,depth)=>{if(out.length>=MAX_FILES)return;let entries=[];try{entries=fs.readdirSync(d,{withFileTypes:true});}catch{return;}
  for(const e of entries){if(out.length>=MAX_FILES)return;const full=path.join(d,e.name);
   if(e.isDirectory()){if(depth<DEPTH&&!/^(\.|save|savedata|movie|movies|bgm|voice|sound|se|cg|image|images)$/i.test(e.name))walk(full,depth+1);continue;}
   if(e.isFile()&&/\.(exe|dll|ax|tpm|acm|ocx)$/i.test(e.name)&&!(d===dir&&placed.has(e.name.toLowerCase()))&&!NAMES.includes(e.name.toLowerCase().replace(/\.dll$/i,'')))out.push(full);}};
 walk(dir,0);return out;
}
/* the DirectPlay DLLs the programs in a game folder load, with whether one imports it (it cannot start without it) */
function references(dir){
 const found=new Map(),placed=new Set(manifest.read(dir).files.map(f=>path.basename(f).toLowerCase()));
 for(const file of programs(dir,placed)){
  let buf;try{if(fs.statSync(file).size>MAX)continue;buf=fs.readFileSync(file);}catch{continue;}
  const info=pe(buf);if(!info)continue;const by=path.relative(dir,file);
  /* Windows looks in the folder of the running program first: a program in a subfolder gets the DLL in its own folder */
  const home=!info.dll&&/\.exe$/i.test(file)?path.relative(dir,path.dirname(file)):'';
  const add=(key,imported)=>{const old=found.get(key)||{bits:info.bits,imported:false,by,homes:new Set([''])};old.imported=old.imported||imported;if(home)old.homes.add(home);found.set(key,old);};
  for(const m of buf.toString('latin1').matchAll(REF)){const key=m[1].toLowerCase();add(key,info.imports.has(key));}
  for(const key of info.imports)if(NAMES.includes(key))add(key,true);}
 return found;
}
const isStub=file=>{try{const st=fs.statSync(file);if(st.size>128*1024)return false;const b=fs.readFileSync(file);return b.includes('wcodstub','latin1')||b.includes(Buffer.from('DirectPlay Stub','utf16le'))||b.includes('DirectPlay Stub','latin1');}catch{return false;}};
const systemFile=(name,bits,windows)=>path.join(windows,bits===32?'SysWOW64':'System32',name+'.dll');
/* the newest real copy of a DirectPlay DLL Windows has staged (installed, waiting for a restart) */
function payload(name,bits,windows){
 const sxs=path.join(windows,'WinSxS');let dirs=[];try{dirs=fs.readdirSync(sxs).filter(d=>d.toLowerCase().startsWith(bits===32?'x86_':'amd64_')&&/directplay\d?-payload/i.test(d));}catch{return '';}
 const real=dirs.map(d=>path.join(sxs,d,name+'.dll')).filter(f=>fs.existsSync(f)&&!isStub(f)).map(f=>({f,t:fs.statSync(f).mtimeMs}));
 real.sort((a,b)=>b.t-a.t);return real[0]?.f||'';
}
const exeBits=exe=>{try{const fd=fs.openSync(exe,'r'),b=Buffer.alloc(4096);fs.readSync(fd,b,0,4096,0);fs.closeSync(fd);return pe(b)?.bits||32;}catch{return 32;}};
/* prepare(gameDir,{exe}) places what the game needs; returns {copied,declined,missing} (missing: imported and not installed) */
function prepare(dir,{root=path.join(__dirname,'..'),windows=process.env.SystemRoot||'C:\\Windows',exe='',all=false}={}){
 const result={copied:[],declined:[],missing:[]},refs=references(dir),m=manifest.read(dir);
 /* a launch saw Windows ask for DirectPlay that no name here explains (a packed program): every DirectPlay DLL */
 if(all||m.features.includes('DirectPlay')){const bits=exe?exeBits(exe):32;for(const name of NAMES)if(!refs.has(name))refs.set(name,{bits,imported:false,by:'launch',homes:new Set([''])});}
 if(!refs.size)return result;
 let changed=false;
 for(const [name,ref] of refs){
  if(!isStub(systemFile(name,ref.bits,windows)))continue;
  const real=payload(name,ref.bits,windows);
  for(const home of ref.homes||['']){
   const file=path.join(home,name+'.dll').replace(/\\/g,'/'),target=path.join(dir,file),ours=m.files.some(f=>f.toLowerCase()===file.toLowerCase());
   if(fs.existsSync(target)&&!(ours&&m.kinds[file]==='declined'))continue;
   try{
    if(real){fs.copyFileSync(real,target);m.kinds[file]='copied';result.copied.push(file);}
    else if(!ref.imported){if(ours)continue;fs.copyFileSync(path.join(root,'native','MeguLitDpDecline'+ref.bits+'.dll'),target);m.kinds[file]='declined';result.declined.push(file);}
    else{if(!result.missing.includes(name+'.dll'))result.missing.push(name+'.dll');continue;}
    if(!ours)m.files.push(file);changed=true;
   }catch{if(ref.imported&&!result.missing.includes(name+'.dll'))result.missing.push(name+'.dll');}
  }
 }
 if(changed)manifest.write(dir,m);
 return result;
}
module.exports={prepare,references,programs,isStub,payload,pe,exeBits,NAMES};
