// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* SteamStub 3.1 (x86) code section, decoded in memory for the static signature tests (engine-draw). The Steam builds of the
   MAGES games (STEINS;GATE, STEINS;GATE 0, CHAOS;CHILD, the SG spin-offs) ship Game.exe with the .text section encrypted
   by SteamStub; at run time the stub decrypts it in place before the game's entry point, so the hook sees plain code and
   the signatures are written for that. This reads the owner's exe without changing it and returns the plain .text.

   Format (public knowledge, the layout Steamless documents; this is an independent implementation, nothing copied):
     the 0xF0-byte stub header sits right before the entry point, XOR-chained in dwords: key0 = first dword, every next
     dword ^= the previous ENCODED dword. Signature 0xC0DEC0DF at +4.
     +0x48 code section VA (u64), +0x50 code section raw size (u64), +0x58 AES-256 key, +0x78 IV (stored AES-ECB encrypted
     with the same key), +0x88 the code section's first 16 bytes ("stolen", kept in the header).
     plain .text = AES-256-CBC-decrypt(stolen16 + file bytes of .text[0 .. raw size)), no padding. */
const crypto=require('node:crypto');

function sections(buf){
 const pe=buf.readUInt32LE(0x3c);if(buf.toString('latin1',pe,pe+4)!=='PE\0\0')throw Error('not a PE file');
 const n=buf.readUInt16LE(pe+6),opt=buf.readUInt16LE(pe+20),sec=pe+24+opt,out=[];
 for(let i=0;i<n;i++){const o=sec+i*40;out.push({name:buf.toString('latin1',o,o+8).replace(/\0+$/,''),vsize:buf.readUInt32LE(o+8),rva:buf.readUInt32LE(o+12),raw:buf.readUInt32LE(o+16),ptr:buf.readUInt32LE(o+20),ch:buf.readUInt32LE(o+36)});}
 return {pe,machine:buf.readUInt16LE(pe+4),entry:buf.readUInt32LE(pe+24+16),base:buf.readUInt32LE(pe+24+28),list:out};
}
const fileOff=(s,rva)=>{for(const x of s.list)if(rva>=x.rva&&rva<x.rva+Math.max(x.vsize,x.raw))return x.ptr+(rva-x.rva);return -1;};

/* the decoded stub header, or null when the file is not SteamStub 3.1 x86 */
function header(buf){
 const s=sections(buf);if(s.machine!==0x14c||!s.list.some(x=>x.name==='.bind'))return null;
 const at=fileOff(s,s.entry)-0xf0;if(at<0)return null;
 const h=Buffer.from(buf.subarray(at,at+0xf0));let key=h.readUInt32LE(0);
 for(let i=4;i<0xf0;i+=4){const v=h.readUInt32LE(i);h.writeUInt32LE((v^key)>>>0,i);key=v;}
 if(h.readUInt32LE(4)!==0xc0dec0df)return null;
 return {codeVa:h.readUInt32LE(0x48),codeRaw:h.readUInt32LE(0x50),key:h.subarray(0x58,0x78),iv:h.subarray(0x78,0x88),stolen:h.subarray(0x88,0x98),flags:h.readUInt32LE(0x3c)};
}

/* {code, va, base, steamstub}: the plain code section of an x86 exe (decrypted when SteamStub encrypted it) */
function plainText(buf){
 const s=sections(buf);if(s.machine!==0x14c)throw Error('not x86');
 const text=s.list.find(x=>x.ch&0x20000000);if(!text)throw Error('no code section');
 const h=header(buf);
 if(!h||h.codeVa!==text.rva)return {code:buf.subarray(text.ptr,text.ptr+Math.min(text.raw,text.vsize||text.raw)),va:s.base+text.rva,base:s.base,steamstub:false};
 const ecb=crypto.createDecipheriv('aes-256-ecb',h.key,null);ecb.setAutoPadding(false);const iv=Buffer.concat([ecb.update(h.iv),ecb.final()]);
 const enc=Buffer.concat([h.stolen,buf.subarray(text.ptr,text.ptr+h.codeRaw)]);
 const usable=enc.length-enc.length%16,cbc=crypto.createDecipheriv('aes-256-cbc',h.key,iv);cbc.setAutoPadding(false);
 const plain=Buffer.concat([cbc.update(enc.subarray(0,usable)),cbc.final()]);
 return {code:plain.subarray(0,Math.min(h.codeRaw,text.vsize||h.codeRaw)),va:s.base+text.rva,base:s.base,steamstub:true};
}
module.exports={plainText,header,sections};
