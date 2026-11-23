// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* engine-draw signature, BGI / Ethornell (docs/engine-draw-native.md). The reference for the native matcher in
   native/megulithook/BgiDrawSig.h: both must find the same places in the same bytes (validation/engine-draw-sig-bgi.test.cjs
   runs this one on the owner's exes and on the fixture snippets, native/megulithook/selftest/bgidraw.cpp the C++ one).

   BGI lays a whole text out at once (素晴らしき日々 HD: FUN_0043b350, called for every text sprite: message window, name,
   choices, menus) into a chain of 0x48-byte glyph nodes, then draws the chain into the sprite's bitmap and frees it
   (FUN_0043d590). The node: +0x10 x, +0x14 y (pixels on the sprite's text canvas), +0x18 / +0x1c the same again, +0x20 the
   glyph image, +0x38 its ruby text, +0x44 the next node. The layout links each glyph like this (registers vary per build):
     mov [N+0x10], r                     x = pen x + offset
     ...  mov [N+0x14], r                y = pen y + offset
     ...  push r                         one argument
     ...  mov [N+0x18], r ; mov [N+0x1c], r
     call <advance>                      returns the extra spacing
     ...  mov [P+0x44], N                (within 0x30 bytes) link N after the previous node P, P loaded from [esp+prev]
   The glyph's character code (BGI's own: < 0x100 one byte, else the SJIS pair hi<<8|lo) sits in the layout's stack slot that
   the same function compares with 0x8140 (the full-width space):  cmp dword [esp+S], 0x8140  (81 7c 24 S 40 81 00 00), and
   the text colour in the argument it ORs with 0xff000000:  mov r, [ebp+C] ; (up to 5 bytes) ; or r, 0xff000000.
   The glyph chain is freed by a small function that walks +0x44 and frees +0x38 / +0x20 / the node:
     mov r1, [r0+0x44] ; test r1, r1 ; je ; [push edi] ; mov r2, r1 ; mov r3, [r2+0x38] ; mov r1, [r1+0x44]
   Everything is in the text canvas' pixels, not the screen. */

const LAYOUT_SCAN=0x1400;
const isMovStore=(b,i,base,disp)=>b[i]===0x89&&((b[i+1]>>6)===1)&&((b[i+1]&7)===base)&&b[i+2]===disp;

/* one glyph link site ending at the call at `at` (the call's E8), or null */
function linkSite(code,at){
 if(code[at]!==0xe8)return null;
 /* the two stores right before the call: mov [N+0x18], r ; mov [N+0x1c], r (3 bytes each) */
 if(!(code[at-3]===0x89&&(code[at-2]>>6)===1&&code[at-1]===0x1c))return null;
 const node=code[at-2]&7;if(node===4||node===5)return null;
 if(!isMovStore(code,at-6,node,0x18))return null;
 /* within 0x30 bytes before: mov [N+0x10], r then mov [N+0x14], r, and between the +0x14 store and the call exactly one push r32 */
 const from=Math.max(0,at-0x30);let x=-1,y=-1;
 for(let i=from;i<at-6;i++){if(isMovStore(code,i,node,0x10)&&x<0)x=i;if(isMovStore(code,i,node,0x14)&&x>=0&&i>x)y=i;}
 if(x<0||y<0)return null;
 let pushes=0;for(let i=y+3;i<at-6;i++){if(code[i]>=0x50&&code[i]<=0x57&&code[i-1]!==0x0f)pushes++;}
 /* instructions between are mov r,[ebp+d8] (8b 4d d8 ...), mov r,[esp+d8] (8b 4c 24 d8), mov r,r: count the push bytes only
    where they can be an opcode: 0x50-0x57 inside "8b 4c 24 1c" never appears for this layout (1c / 4c / 24 / 8b) */
 if(pushes!==1)return null;
 /* after the call: mov r, [esp+prev] ... mov [r+0x44], N  within 0x30 bytes */
 let prev=-1;
 for(let i=at+5;i<at+5+0x30;i++){
  if(code[i]===0x89&&((code[i+1]>>3)&7)===node&&(code[i+1]>>6)===1&&code[i+2]===0x44){
   const r=code[i+1]&7;
   for(let j=at+5;j<i;j++){
    if(code[j]===0x8b&&((code[j+1]>>3)&7)===r&&(code[j+1]&0xc7)===0x84&&code[j+2]===0x24){prev=code.readInt32LE(j+3);}
    else if(code[j]===0x8b&&((code[j+1]>>3)&7)===r&&(code[j+1]&0xc7)===0x44&&code[j+2]===0x24){prev=code[j+3];}
   }
   break;
  }
 }
 if(prev<0)return null;
 /* the character slot and the colour argument, nearest before the site in the same layout function */
 let ch=-1,color=-1;
 for(let i=at-8;i>=Math.max(0,at-LAYOUT_SCAN);i--){
  if(ch<0&&code[i]===0x81&&code[i+1]===0x7c&&code[i+2]===0x24&&code[i+4]===0x40&&code[i+5]===0x81&&code[i+6]===0&&code[i+7]===0)ch=code[i+3];
  if(color<0&&code[i]===0x81&&(code[i+1]&0xf8)===0xc8&&code[i+2]===0&&code[i+3]===0&&code[i+4]===0&&code[i+5]===0xff){
   const r=code[i+1]&7;for(let j=i-3;j>=i-8;j--)if(code[j]===0x8b&&code[j+1]===(0x45|r<<3)){color=code[j+2];break;}}
  if(ch>=0&&color>=0)break;
 }
 if(ch<0||color<0)return null;
 return {node,ch:ch+4*pushes,prev:prev,color,pushes};
}
/* the glyph chain release: returns the offsets of the function starts (push ebp; mov ebp, esp within 8 bytes before) */
function freeSites(code){
 const out=[];
 for(let i=8;i+16<code.length;i++){
  if(code[i]!==0x8b||(code[i+1]>>6)!==1||code[i+2]!==0x44)continue;
  const r1=(code[i+1]>>3)&7;
  if(code[i+3]!==0x85||code[i+4]!==(0xc0|r1<<3|r1)||code[i+5]!==0x74)continue;
  let k=i+7;if(code[k]===0x57)k++;
  if(code[k]!==0x8b||(code[k+1]>>6)!==3||(code[k+1]&7)!==r1)continue;
  const r2=(code[k+1]>>3)&7;k+=2;
  if(code[k]!==0x8b||(code[k+1]>>6)!==1||(code[k+1]&7)!==r2||code[k+2]!==0x38)continue;k+=3;
  if(code[k]!==0x8b||code[k+1]!==(0x40|r1<<3|r1)||code[k+2]!==0x44)continue;
  let start=-1;for(let j=i-1;j>=i-8;j--)if(code[j]===0x55&&code[j+1]===0x8b&&code[j+2]===0xec){start=j;break;}
  if(start>=0)out.push(start);
 }
 return out;
}

/* code: Buffer of the code section, va: its virtual address. Returns {links:[{call, advance, node, ch, prev, color}], frees:[va]} */
function find(code,va){
 const links=[];
 for(let at=8;at+5+0x30<code.length;at++){
  if(code[at]!==0xe8)continue;const s=linkSite(code,at);if(!s)continue;
  links.push({call:va+at,advance:va+at+5+code.readInt32LE(at+1),node:['eax','ecx','edx','ebx','esp','ebp','esi','edi'][s.node],ch:s.ch,prev:s.prev,color:s.color});
 }
 return {links,frees:freeSites(code).map(o=>va+o)};
}
/* the code section of a PE file (x86 only) */
function textOf(buf){
 const pe=buf.readUInt32LE(0x3c);if(buf.toString('latin1',pe,pe+4)!=='PE\0\0')throw Error('not a PE file');
 if(buf.readUInt16LE(pe+4)!==0x14c)throw Error('not x86');
 const n=buf.readUInt16LE(pe+6),opt=buf.readUInt16LE(pe+20),base=buf.readUInt32LE(pe+24+28),sec=pe+24+opt;
 for(let i=0;i<n;i++){const o=sec+i*40,ch=buf.readUInt32LE(o+36);if(!(ch&0x20000000))continue;
  const vsize=buf.readUInt32LE(o+8),rva=buf.readUInt32LE(o+12),raw=buf.readUInt32LE(o+16),rawPtr=buf.readUInt32LE(o+20);
  return {code:buf.subarray(rawPtr,rawPtr+Math.min(raw,vsize||raw)),va:base+rva,base};}
 throw Error('no code section');
}
function scanFile(file){const t=textOf(require('node:fs').readFileSync(file));return {base:t.base,...find(t.code,t.va)};}
/* BGI's character code -> SJIS bytes */
function charBytes(c){return c<0x100?Buffer.from([c&0xff]):Buffer.from([(c>>8)&0xff,c&0xff]);}

module.exports={find,textOf,scanFile,linkSite,freeSites,charBytes};
if(require.main===module)for(const f of process.argv.slice(2)){try{const r=scanFile(f);console.log(JSON.stringify({file:f,base:'0x'+r.base.toString(16),links:r.links.map(h=>({...h,call:'0x'+h.call.toString(16),advance:'0x'+h.advance.toString(16),ch:'0x'+h.ch.toString(16),prev:'0x'+h.prev.toString(16),color:'0x'+h.color.toString(16)})),frees:r.frees.map(v=>'0x'+v.toString(16))}));}catch(e){console.log(JSON.stringify({file:f,error:e.message}));}}
