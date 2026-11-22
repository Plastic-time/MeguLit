// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path');
const Musica=require('./engine-sigs/musica-basic.cjs');
const stamp=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].join(':');
function canonical(file){const absolute=path.resolve(file);let dir=absolute;for(;;){if(fs.lstatSync(dir).isSymbolicLink())throw Error('OWNER_NATIVE_LINK');const next=path.dirname(dir);if(next===dir)break;dir=next;}const real=fs.realpathSync.native(absolute);if(real.toLowerCase()!==absolute.toLowerCase())throw Error('OWNER_NATIVE_PATH');return real;}
function read(file,bytes){const real=canonical(file),before=fs.statSync(real,{bigint:true});if(!before.isFile()||before.size!==BigInt(bytes))throw Error('OWNER_NATIVE_SIZE');let fd;try{fd=fs.openSync(real,'r');if(stamp(fs.fstatSync(fd,{bigint:true}))!==stamp(before))throw Error('OWNER_NATIVE_CHANGED');const data=Buffer.alloc(bytes+1);let used=0;while(used<data.length){const n=fs.readSync(fd,data,used,data.length-used,null);if(!n)break;used+=n;}if(used!==bytes||stamp(fs.fstatSync(fd,{bigint:true}))!==stamp(before)||stamp(fs.statSync(real,{bigint:true}))!==stamp(before)||canonical(real)!==real)throw Error('OWNER_NATIVE_CHANGED');return {real,bytes:data.subarray(0,used)};}finally{if(fd!==undefined)fs.closeSync(fd);}}
/* Called only after the actual isolated owner manifest has passed status(). Native still rechecks its own pins. */
function environment(entries){const out={};if(entries.some(e=>e.engine==='iga'||e.engine==='innocentgrey'))out.MEGULIT_IGA_TEXT='1';const candidates=entries.filter(e=>e.engine==='musica'&&e.exeSHA256===Musica.PIN.exeSha256&&e.files?.some(f=>f.path==='scr.dat'&&f.bytes===Musica.PIN.scriptBytes&&f.sha256===Musica.PIN.scriptSha256));
 if(candidates.length!==1)return out;try{const exe=read(candidates[0].exe,Musica.PIN.fileBytes),script=read(path.join(path.dirname(exe.real),'scr.dat'),Musica.PIN.scriptBytes);if(!Musica.inspect(exe.bytes,script.bytes).matched)return out;out.MEGULIT_MUSICA_BASIC=Musica.PIN.exeSha256;out.MEGULIT_MUSICA_EXE=exe.real;}catch{}return out;}
module.exports={environment};
