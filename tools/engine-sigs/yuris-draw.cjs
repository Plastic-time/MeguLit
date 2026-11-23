// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* engine-draw signature, YU-RIS (docs/engine-draw-native.md). The reference for the native matcher in
   native/megulithook/YurisDraw.h: both must find the same call site and the same slots in the same bytes
   (validation/engine-draw-sig-yuris.test.cjs runs this one on the owner's exes and on the fixture snippets).

   The dialogue glyph loop of every YU-RIS build seen so far (euphoria / euphoria HD / 女装山脈 / サイコロジック):
     ...                         the blitter's stack arguments, among them  mov [esp+X], <x>  and  mov [esp+X+4], <y>
     call <glyph blitter>        (Borland register call: eax = the character's SJIS bytes in the string)
     add  <x accumulator>, eax   the blitter returns the advance: 03 /r (register)  or  01 44 24 d8 ([esp+d8])
     movzx <r>, byte [<string + index>]
     movzx eax, byte [<r> + <lead-byte length table>]
     inc  eax / movsx edx, al / add <index>, edx
   X is found from the accumulator: the store of that register (or of the register loaded from that slot) into the
   caller's stack before the call. Everything is in the text canvas' pixels (the window's text bitmap), not the screen. */

const CALL_TAIL=/\xe8([\s\S]{4})(\x03[\xc0-\xff]|\x01\x44\x24[\s\S])\x0f\xb6[\s\S]{2,3}?\x0f\xb6[\x80-\xbf]([\s\S]{4})\x40\x0f\xbe\xd0\x03/g;
const REG={0xc0:'eax',0xc1:'ecx',0xc2:'edx',0xc3:'ebx',0xc4:'esp',0xc5:'ebp',0xc6:'esi',0xc7:'edi'};

/* the x slot: the last  mov [esp+d8], reg  (89 /r, mod 01, rm 100, SIB 24) before the call whose reg is the accumulator
   (or was loaded from the accumulator slot: 8b /r [esp+d8]) */
function xSlot(code,callAt,acc){
 const from=Math.max(0,callAt-0x90);let x=-1,loaded=null;
 for(let i=from;i+4<=callAt;i++){
  const op=code[i],modrm=code[i+1],d8=code[i+3],reg=(modrm>>3)&7,espD8=code[i+2]===0x24&&(modrm&0xc7)===0x44;
  /* the register that carries the accumulator's value is reloaded from anywhere else: it carries something else now */
  if(op===0x8b&&reg===loaded&&!(espD8&&d8===acc.slot)){loaded=null;continue;}
  if(!espD8)continue;
  if(op===0x8b&&acc.slot!==null&&d8===acc.slot)loaded=reg;
  if(op===0x89&&(reg===acc.reg||reg===loaded)&&d8!==acc.slot)x=d8;
 }
 return x;
}
function stored(code,callAt,slot){const from=Math.max(0,callAt-0x90);for(let i=from;i+4<=callAt;i++)if(code[i]===0x89&&(code[i+1]&0xc7)===0x44&&code[i+2]===0x24&&code[i+3]===slot)return true;return false;}

/* code: Buffer of the .text section, va: its virtual address. Returns [{call, blitter, table, x, y, acc}] */
function find(code,va){
 const s=code.toString('latin1'),out=[];CALL_TAIL.lastIndex=0;let m;
 while((m=CALL_TAIL.exec(s))){
  const at=m.index,rel=code.readInt32LE(at+1),add=Buffer.from(m[2],'latin1');
  const acc=add[0]===0x03?{reg:(add[1]>>3)&7,slot:null}:{reg:-1,slot:add[3]};
  const x=xSlot(code,at,acc);if(x<0||!stored(code,at,x+4))continue;
  out.push({call:va+at,blitter:va+at+5+rel,table:Buffer.from(m[3],'latin1').readUInt32LE(0),x,y:x+4,acc:acc.slot!==null?'[esp+'+acc.slot.toString(16)+']':Object.values(REG)[acc.reg]});
 }
 return out;
}
/* the .text section of a PE file (x86 only) */
function textOf(buf){
 const pe=buf.readUInt32LE(0x3c);if(buf.toString('latin1',pe,pe+4)!=='PE\0\0')throw Error('not a PE file');
 if(buf.readUInt16LE(pe+4)!==0x14c)throw Error('not x86');
 const n=buf.readUInt16LE(pe+6),opt=buf.readUInt16LE(pe+20),base=buf.readUInt32LE(pe+24+28),sec=pe+24+opt;
 for(let i=0;i<n;i++){const o=sec+i*40,ch=buf.readUInt32LE(o+36);if(!(ch&0x20000000))continue;
  const vsize=buf.readUInt32LE(o+8),rva=buf.readUInt32LE(o+12),raw=buf.readUInt32LE(o+16),rawPtr=buf.readUInt32LE(o+20);
  return {code:buf.subarray(rawPtr,rawPtr+Math.min(raw,vsize||raw)),va:base+rva,base};}
 throw Error('no code section');
}
function scanFile(file){const t=textOf(require('node:fs').readFileSync(file));return {base:t.base,hits:find(t.code,t.va)};}

module.exports={find,textOf,scanFile,CALL_TAIL};
if(require.main===module)for(const f of process.argv.slice(2)){try{const r=scanFile(f);console.log(JSON.stringify({file:f,base:'0x'+r.base.toString(16),hits:r.hits.map(h=>({...h,call:'0x'+h.call.toString(16),blitter:'0x'+h.blitter.toString(16),table:'0x'+h.table.toString(16),x:'0x'+h.x.toString(16),y:'0x'+h.y.toString(16)}))}));}catch(e){console.log(JSON.stringify({file:f,error:e.message}));}}
