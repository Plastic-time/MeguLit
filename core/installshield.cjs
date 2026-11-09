// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E348 InstallShield cabinets (data1.hdr + data1.cab, data2.cab, ...) for the Japanese import (user 2026-11-10: "直接帮忙
// 安装好"): the 2003 沙耶の唄 disc only holds an InstallShield 6 setup. The game files are unpacked from the cabinets
// directly; the setup program is never run. Header layout as in unshield (version 5 and 6+ file descriptors);
// compressed files are a series of chunks, each a 16-bit length and a raw deflate block of up to 64 KB.
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),zlib=require('node:zlib');
const sjis=new TextDecoder('shift_jis');
const ENGINE=/^(corecomp\.ini|ctor\.dll|objectps\.dll|iuser\.dll|iscript\.dll|ikernel\.ex[e_]|setup\.(inx|exe|ini|ibt)|value\.shl|isrt\.dll|default\.pal|_isres\.dll|_setup\.dll|layout\.bin|data\d+\.(hdr|cab)|isbew64\.exe|_isuser.*)$/i;

function majorVersion(v){if((v>>>24)===1)return (v>>>12)&0xf;if((v>>>24)===2||(v>>>24)===4){const m=v&0xffff;return m?Math.floor(m/100):0;}return 0;}

function list(hdrFile){
 const h=fs.readFileSync(hdrFile);if(h.readUInt32LE(0)!==0x28635349)throw Error('IMPORT_INSTALLER_UNSUPPORTED');
 const version=majorVersion(h.readUInt32LE(4)),cd=h.readUInt32LE(0x0c);
 const ftOff=h.readUInt32LE(cd+0x0c),dirCount=h.readUInt32LE(cd+0x1c),fileCount=h.readUInt32LE(cd+0x28),ft2=h.readUInt32LE(cd+0x2c),base=cd+ftOff;
 const str=o=>{const s=base+o,e=h.indexOf(0,s);return e>s?sjis.decode(h.subarray(s,e)):'';};
 const dirs=[];for(let i=0;i<dirCount;i++)dirs.push(str(h.readUInt32LE(base+i*4)));
 const files=[];
 for(let i=0;i<fileCount;i++){let f;
  if(version>=6){const p=base+ft2+i*0x57;if(p+0x57>h.length)break;
   f={flags:h.readUInt16LE(p),size:Number(h.readBigUInt64LE(p+2)),packed:Number(h.readBigUInt64LE(p+0x0a)),offset:Number(h.readBigUInt64LE(p+0x12)),name:str(h.readUInt32LE(p+0x3a)),dir:dirs[h.readUInt16LE(p+0x3e)]||'',volume:h.readUInt16LE(p+0x55)};}
  else{const p=base+h.readUInt32LE(base+(dirCount+i)*4);if(p+0x3a>h.length)break;
   f={flags:h.readUInt16LE(p+0x08),size:h.readUInt32LE(p+0x0c),packed:h.readUInt32LE(p+0x10),offset:h.readUInt32LE(p+0x14),name:str(h.readUInt32LE(p)),dir:dirs[h.readUInt32LE(p+0x04)]||'',volume:1};}
  f.index=i;files.push(f);}
 return {version,files};
}
// The game's own files: valid, stored in a cabinet, not the setup engine, not under an http:// "directory".
function gameFiles(hdrFile){return list(hdrFile).files.filter(f=>!(f.flags&8)&&f.name&&(f.offset>0||f.packed>0)&&(f.size>0||f.packed>0)&&!ENGINE.test(f.name)&&!/^https?:/i.test(f.dir));}

async function readFile(dir,f){
 if(f.flags&1)throw Error('IMPORT_INSTALLER_UNSUPPORTED'); /* split across volumes: not needed so far */
 if(f.flags&2)throw Error('IMPORT_INSTALLER_UNSUPPORTED'); /* obfuscated */
 const cab=path.join(dir,'data'+(f.volume||1)+'.cab'),fd=await fsp.open(cab,'r');
 try{const buf=Buffer.alloc(f.packed);await fd.read(buf,0,f.packed,f.offset);
  if(!(f.flags&4))return buf;
  const out=[];let p=0;while(p+2<=buf.length){const n=buf.readUInt16LE(p);p+=2;out.push(zlib.inflateRawSync(buf.subarray(p,p+n),{finishFlush:zlib.constants.Z_SYNC_FLUSH}));p+=n;}
  const data=Buffer.concat(out);if(data.length!==f.size)throw Error('IMPORT_INSTALLER_UNSUPPORTED');return data;}
 finally{await fd.close();}
}
// Unpacks the game files into dest (keeping their folders); returns the relative paths written.
async function extract(hdrFile,dest){
 const dir=path.dirname(hdrFile),root=path.resolve(dest),out=[];
 for(const f of gameFiles(hdrFile)){const rel=path.join(f.dir.replace(/^[\\/]+/,''),f.name),target=path.resolve(root,rel);if(!target.startsWith(root+path.sep))continue;
  await fsp.mkdir(path.dirname(target),{recursive:true});await fsp.writeFile(target,await readFile(dir,f));out.push(rel);}
 return out;
}
function findHeader(base){const stack=[[base,3]];while(stack.length){const [d,depth]=stack.pop();let list;try{list=fs.readdirSync(d,{withFileTypes:true});}catch{continue;}
  const hdr=list.find(e=>e.isFile()&&/^data1\.hdr$/i.test(e.name));if(hdr&&list.some(e=>/^data\d+\.cab$/i.test(e.name)))return path.join(d,hdr.name);
  for(const e of list)if(e.isDirectory()&&depth>0)stack.push([path.join(d,e.name),depth-1]);}
 return '';}
module.exports={list,gameFiles,extract,findHeader,majorVersion};
