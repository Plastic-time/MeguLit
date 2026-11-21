// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* engine-draw GDI draw sites (docs/engine-draw-native.md "其余原生引擎"): the reference for native/megulithook/DrawSitesSig.h.
   The signature table is read from that header (one source), the algorithm is the same: every `call dword ptr [slot]`
   (FF 15) whose slot is the module's import of the signature's API and whose preceding bytes match the pattern.
   validation/engine-draw-sig-sites.test.cjs runs it on the fixture snippets and on the owner's exes. */
const fs=require('node:fs'),path=require('node:path');
const HEADER=path.join(__dirname,'..','..','native','megulithook','DrawSitesSig.h');

function sigs(file=HEADER){
 const out=[],re=/^\s*\{\s*"([^"]+)",\s*"([^"]*)",\s*"([^"]+)",\s*"([^"]*)",\s*(\d+),\s*(0x[0-9a-fA-F]+|\d+)\s*\},/gm;let m;
 const s=fs.readFileSync(file,'utf8');while((m=re.exec(s)))out.push({id:m[1],module:m[2],api:m[3],pre:m[4],count:+m[5],frame:+m[6]});
 return out;
}
/* pattern tokens: hex byte, ?? (any), SLOT (4 bytes: the API's IAT slot) -> [byte | null | 'S'] */
function pattern(pre){const out=[];for(const t of pre.trim().split(/\s+/).filter(Boolean)){if(t==='SLOT')out.push('S','S','S','S');else out.push(t==='??'?null:parseInt(t,16));}return out;}
/* code: Buffer, slots: [uint32], pre: pattern string -> offsets of the call in code: FF 15 <slot> after the pattern, or with SLOT
   in the pattern a call reg (FF D0..D7) right after it */
function find(code,slots,pre){
 const p=pattern(pre),set=new Set(slots),out=[],sa=p.indexOf('S');
 for(let i=p.length;i+6<=code.length;i++){
  if(code[i]!==0xff)continue;
  if(sa<0){if(code[i+1]!==0x15||!set.has(code.readUInt32LE(i+2)))continue;}
  else{if((code[i+1]&0xf8)!==0xd0||!set.has(code.readUInt32LE(i-p.length+sa)))continue;}
  let ok=true;for(let k=0;k<p.length&&ok;k++)if(typeof p[k]==='number'&&code[i-p.length+k]!==p[k])ok=false;
  if(ok)out.push(i);
 }
 return out;
}
/* the IAT slot a site found by find() calls through */
function slotOf(code,at,pre){const p=pattern(pre),sa=p.indexOf('S');return sa<0?code.readUInt32LE(at+2):code.readUInt32LE(at-p.length+sa);}
/* a PE file (x86): image base, executable sections, IAT slots of an API imported by name */
function pe(buf){
 const at=buf.readUInt32LE(0x3c);if(buf.toString('latin1',at,at+4)!=='PE\0\0')throw Error('not a PE file');
 if(buf.readUInt16LE(at+4)!==0x14c)throw Error('not x86');
 const n=buf.readUInt16LE(at+6),opt=at+24,optSize=buf.readUInt16LE(at+20),base=buf.readUInt32LE(opt+28),sec=opt+optSize,secs=[];
 for(let i=0;i<n;i++){const o=sec+i*40;secs.push({name:buf.toString('latin1',o,o+8).replace(/\0+$/,''),vsize:buf.readUInt32LE(o+8),rva:buf.readUInt32LE(o+12),raw:buf.readUInt32LE(o+16),ptr:buf.readUInt32LE(o+20),ch:buf.readUInt32LE(o+36)});}
 const off=rva=>{for(const s of secs)if(rva>=s.rva&&rva<s.rva+Math.max(s.vsize,s.raw))return s.ptr+rva-s.rva;return -1;};
 const cstr=o=>{let e=o;while(buf[e])e++;return buf.toString('latin1',o,e);};
 const slots=api=>{const r=[],imp=buf.readUInt32LE(opt+104);if(!imp)return r;
  for(let d=off(imp);buf.readUInt32LE(d+12);d+=20){const oft=buf.readUInt32LE(d),ft=buf.readUInt32LE(d+16),names=off(oft||ft);
   for(let i=0;;i++){const v=buf.readUInt32LE(names+i*4);if(!v)break;if(v&0x80000000)continue;if(cstr(off(v)+2)===api)r.push(base+ft+i*4);}}
  return r;};
 const code=secs.filter(s=>s.ch&0x20000000).map(s=>({va:base+s.rva,bytes:buf.subarray(s.ptr,s.ptr+Math.min(s.raw,s.vsize||s.raw))}));
 return {base,secs,code,slots};
}
/* every signature of the table that applies to this module file: [{id, api, sites:[va], count, ok}] */
function scanFile(file,moduleName=''){
 const p=pe(fs.readFileSync(file)),out=[];
 for(const g of sigs()){if(g.module.toLowerCase()!==moduleName.toLowerCase())continue;
  const sl=p.slots(g.api);if(!sl.length)continue;const sites=[];
  for(const c of p.code)for(const o of find(c.bytes,sl,g.pre))sites.push(c.va+o);
  if(sites.length)out.push({id:g.id,api:g.api,sites,count:g.count,ok:sites.length===g.count,slots:sl});}
 return {base:p.base,hits:out};
}
module.exports={sigs,pattern,find,slotOf,pe,scanFile,HEADER};
if(require.main===module)for(const f of process.argv.slice(2)){try{const r=scanFile(f,process.env.MODULE||'');console.log(JSON.stringify({file:f,base:'0x'+r.base.toString(16),hits:r.hits.map(h=>({...h,sites:h.sites.map(v=>'0x'+v.toString(16)),slots:h.slots.map(v=>'0x'+v.toString(16))}))}));}catch(e){console.log(JSON.stringify({file:f,error:e.message}));}}
