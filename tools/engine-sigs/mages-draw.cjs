// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* engine-draw signature, MAGES. (docs/engine-draw-native.md). The reference for the native matcher in
   native/megulithook/MagesDrawSig.h: both must find the same functions and the same addresses in the same bytes
   (validation/engine-draw-sig-mages.test.cjs runs this one on the owner's exes, decrypted in memory with steamstub.cjs,
   and on the fixture snippets). Static only: found in STEINS;GATE, STEINS;GATE 0, CHAOS;CHILD, STEINS;GATE 線形拘束の
   フェノグラム and STEINS;GATE 比翼恋理のだーりん (Steam builds), names as in Committee of Zero's LanguageBarrier.

   MAGES keeps every text window's characters in "dialogue pages", one big static array of pages:
     page = { int f0, f4, drawNextPageNow, pageLength /+0xC/, ...; header 0x3C bytes, then for S characters:
              int fontNumber[S], charColor[S], charOutlineColor[S]; u8 glyphCol[S], glyphRow[S], glyphOrigWidth[S],
              glyphOrigHeight[S]; i16 charDisplayX[S], charDisplayY[S], glyphDisplayWidth[S], glyphDisplayHeight[S];
              u8 flag[S] /the commit's third argument/; int f[S]; u8 opacity[S] }      stride = 0x3C + 30*S
   S = 2000 in SG / SG0 / CC / LBP, 7000 in MDE. The glyph code is glyphRow*64 + glyphCol = the SC3 character code
   without 0x8000 (the same charset the script decoder uses; the font sheet has 64 cells a row, 32 px each).

   Found here (all positions are virtual addresses in the file; the hook turns them into module offsets):
     drawDialogue / drawDialogue2   push ebp; mov ebp,esp; sub esp,0C|10; push ebx; ... imul r, <page>, stride;
                                    ... cmp dword [r + pages+0xC], 0; je        (two functions, same stride and pages)
                                    their three  call drawGlyph ... add esp,2Ch  give drawGlyph (cdecl, 11 arguments:
                                    texture, src x y w h, dst x0 y0 x1 y1, color, opacity), their first
                                    movss xmm1,[abs] gives the design-to-screen scale (a float in .rdata)
     commit (layout -> page)        cmp dword [count], eax; jbe ...  movzx edx, word [eax*2 + codes]  mov ecx, <info>
                                    ... inc dword [r + pages+0xC]: copies the laid-out string (count, u16 codes[]
                                    where 0x8000|c is a control marker kept from SC3: 0x8001 name start, 0x8002 name
                                    end, info[] 16 bytes a glyph) into page arg1, appending at pageLength
     clear page                     imul r, <page>, stride; push S; (push 0 / push reg; lea eax,[r + glyphCol] | lea; push 0)
                                    ... memset of the page's arrays; pageLength = 0 */

const u32=(b,i)=>b.readUInt32LE(i),i32=(b,i)=>b.readInt32LE(i);
const PROLOGUE=(b,i)=>b[i]===0x55&&b[i+1]===0x8b&&b[i+2]===0xec;

/* imul r32, r/m32, imm32 (69 /r): returns {imm, len} for the forms the compiler used (register, [ebp+d8]) */
function imul(b,i){
 if(b[i]!==0x69)return null;const m=b[i+1],mod=m>>6,rm=m&7;
 if(mod===3)return {imm:u32(b,i+2),len:6};
 if(mod===1&&rm!==4)return {imm:u32(b,i+3),len:7};
 return null;
}
const sizeOf=stride=>(stride-0x3c)%30===0&&(stride-0x3c)/30>=500&&(stride-0x3c)/30<=8000?(stride-0x3c)/30:0;

/* drawDialogue candidates: { at, stride, S, pages } */
function dialogueHeads(b){
 const out=[];
 for(let i=0;i+48<b.length;i++){
  if(!PROLOGUE(b,i)||b[i+3]!==0x83||b[i+4]!==0xec||(b[i+5]!==0x0c&&b[i+5]!==0x10)||b[i+6]!==0x53)continue;
  for(let j=i+7;j<i+24;j++){
   const m=imul(b,j);if(!m)continue;const S=sizeOf(m.imm);if(!S)continue;
   for(let k=j+m.len;k<j+m.len+8;k++){
    if(b[k]===0x83&&(b[k+1]&0xf8)===0xb8&&b[k+6]===0x00&&b[k+7]===0x0f&&b[k+8]===0x84){out.push({at:i,stride:m.imm,S,pages:(u32(b,k+2)-0xc)>>>0});k=1e9;j=1e9;}
   }
  }
 }
 return out;
}
/* the body of a function: up to the next  int3 int3 + prologue  (or cap) */
function bodyEnd(b,at,cap=0x600){for(let i=at+3;i<Math.min(b.length-3,at+cap);i++)if(b[i-1]===0xcc&&PROLOGUE(b,i))return i;return Math.min(b.length,at+cap);}
/* call targets followed by add esp,2Ch within 0x30 bytes, counted */
function glyphCalls(b,at,end){
 const n=new Map();
 for(let i=at;i+5<end;i++){if(b[i]!==0xe8)continue;const t=i+5+i32(b,i+1);
  for(let k=i+5;k<Math.min(end,i+0x30);k++)if(b[k]===0x83&&b[k+1]===0xc4&&b[k+2]===0x2c){n.set(t,(n.get(t)||0)+1);break;}}
 return n;
}
function scaleOf(b,at,end){for(let i=at;i+8<end;i++)if(b[i]===0xf3&&b[i+1]===0x0f&&b[i+2]===0x10&&b[i+3]===0x0d)return u32(b,i+4);return 0;}

function find(b,va){
 const heads=dialogueHeads(b),out={dialogue:[],drawGlyph:0,pages:0,stride:0,S:0,scale:0,commit:null,clear:[],problems:[]};
 /* the two drawDialogue functions: same stride / pages, each with exactly three calls to the same drawGlyph */
 const ok=[];
 for(const h of heads){const end=bodyEnd(b,h.at),calls=glyphCalls(b,h.at,end);const g=[...calls].filter(([,c])=>c===3);if(g.length===1)ok.push({...h,end,glyph:g[0][0],scale:scaleOf(b,h.at,end)});}
 if(ok.length!==2||ok[0].stride!==ok[1].stride||ok[0].pages!==ok[1].pages||ok[0].glyph!==ok[1].glyph){out.problems.push('drawDialogue: '+ok.length+' candidates');return out;}
 Object.assign(out,{dialogue:ok.map(o=>va+o.at),drawGlyph:va+ok[0].glyph,pages:ok[0].pages,stride:ok[0].stride,S:ok[0].S,scale:ok[0].scale});
 const lenAt=Buffer.alloc(4);lenAt.writeUInt32LE((out.pages+0xc)>>>0);
 const col=Buffer.alloc(4);col.writeUInt32LE((out.pages+0x3c+12*out.S)>>>0);
 const strideB=Buffer.alloc(4);strideB.writeUInt32LE(out.stride);
 /* commit: count compare in the first 0x10 bytes, codes / info in the first 0x60, stride and pageLength++ in the body */
 const commits=[];
 for(let i=0;i+0x60<b.length;i++){
  if(!PROLOGUE(b,i))continue;let c=-1;
  for(let k=i+3;k<i+0x10;k++)if(b[k]===0x39&&b[k+1]===0x05&&b[k+6]===0x0f&&b[k+7]===0x86){c=k;break;}
  if(c<0)continue;let codes=0,info=0;
  for(let k=c;k<i+0x60;k++){if(!codes&&b[k]===0x0f&&b[k+1]===0xb7&&b[k+2]===0x14&&b[k+3]===0x45)codes=u32(b,k+4);if(!info&&b[k]===0xb9)info=u32(b,k+1);}
  if(!codes||!info)continue;
  const end=bodyEnd(b,i,0x200),body=b.subarray(i,end);let inc=false;
  for(let k=0;k+6<=body.length;k++)if(body[k]===0xff&&(body[k+1]&0xf8)===0x80&&body.subarray(k+2,k+6).equals(lenAt)){inc=true;break;}
  if(inc&&body.indexOf(strideB)>=0)commits.push({at:va+i,count:u32(b,c+2),codes,info});
 }
 if(commits.length===1)out.commit=commits[0];else out.problems.push('commit: '+commits.length+' candidates');
 /* clear page: imul by stride, push S, lea of glyphCol right after (push 0 before or after the lea) */
 const SB=Buffer.alloc(4);SB.writeUInt32LE(out.S);
 for(let i=0;i+24<b.length;i++){
  const m=imul(b,i);if(!m||m.imm!==out.stride||b[i+m.len]!==0x68||!b.subarray(i+m.len+1,i+m.len+5).equals(SB))continue;
  let k=i+m.len+5;if(b[k]===0x6a&&b[k+1]===0)k+=2;else if(b[k]>=0x50&&b[k]<=0x57)k+=1;
  if(b[k]!==0x8d||(b[k+1]&0xc0)!==0x80||!b.subarray(k+2,k+6).equals(col))continue;
  let f=i;while(f>0&&!(b[f-1]===0xcc&&PROLOGUE(b,f))&&i-f<0x80)f--;
  if(b[f-1]===0xcc&&PROLOGUE(b,f)&&!out.clear.includes(va+f))out.clear.push(va+f);
 }
 if(!out.clear.length)out.problems.push('clear: none');
 return out;
}

function scanFile(file){
 const S=require('./steamstub.cjs'),t=S.plainText(require('node:fs').readFileSync(file));
 return {base:t.base,steamstub:t.steamstub,...find(t.code,t.va)};
}
/* module offsets (RVAs) of what was found: the version layer's address table */
function table(r){const rva=v=>v?'0x'+(v-r.base).toString(16):null;
 return {drawDialogue:r.dialogue.map(rva),drawGlyph:rva(r.drawGlyph),commit:r.commit&&rva(r.commit.at),clear:r.clear.map(rva),pages:rva(r.pages),stride:'0x'+r.stride.toString(16),chars:r.S,scale:rva(r.scale),layoutCount:r.commit&&rva(r.commit.count),layoutCodes:r.commit&&rva(r.commit.codes),layoutInfo:r.commit&&rva(r.commit.info)};}

module.exports={find,scanFile,table,dialogueHeads,sizeOf};
if(require.main===module)for(const f of process.argv.slice(2)){try{const r=scanFile(f);console.log(JSON.stringify({file:f,steamstub:r.steamstub,problems:r.problems,table:table(r)}));}catch(e){console.log(JSON.stringify({file:f,error:e.message}));}}
