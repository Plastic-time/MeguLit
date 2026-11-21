// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* engine-draw signature, SiglusEngine (docs/engine-draw-native.md). The reference for the native matcher in
   native/megulithook/SiglusDrawSig.h: both must find the same functions, call sites and field offsets in the same bytes
   (validation/engine-draw-sig-siglus.test.cjs runs this one on the owner's exes and on the fixture segments).

   Static reverse engineering of CLANNAD (SiglusEngine_Steam.exe 1.1.134.0) and Summer Pockets (1.1.137.0), owner's exes,
   read only. The names are ours (the exe has no symbols); what each function does is read from its code and from which
   VM command reaches it (element codes from SiglusSceneScriptUtility const.py: mwnd.print 4, mwnd.sel 5 / selmsg 50..52,
   mwnd.ruby 12, mwnd.namae 62/63, global.selbtn 76/77/126/128):
     msg        one text area of a message window, 0x1c0 bytes; mwnd keeps a vector of them (+0x228) and a separate name
                window msg (+0xc34). Its glyphs ("moji", 0x3b4 bytes each) are a std::vector at msg+VEC (0x1ac).
     add_msg    msg::add_msg(const wstring&, wstring* overflow): the per-character layout loop. Found by the 「 『 （ bracket
                check it alone does (cmp r,0x300c / 0x300e / 0xff08). It fills a moji on its stack and calls
     push       std::vector<moji>::push_back(const moji&): the one place every glyph of every text area goes through.
                moji: +0 type (0 = character), +4 code (UTF-16), +8 size px, +0xc colour no., +0x10 shadow, +0x14 fuchi,
                +0x18 x, +0x1c y (the text area's own pixels).
   Every call of push is told apart by the bytes just before it (same in both builds):
     print   lea eax,[ebp-x]; push eax; lea ecx,[ebx+VEC]; call push           in add_msg
     ruby    mov byte [ebp-x],1; call push            (x2)                       the ruby layout (mwnd.ruby end): one
             moji per reading character, above the base; the reading is the wstring at msg+RUBYSTR, the base runs from
             (msg+RUBYX, msg+RUBYY) to the pen (msg+PENX) on the same line; glyph x = pen x + msg+PENADD
     name    lea ecx,[edi+d]; lea eax,[ebp-x]; push eax; call push               the name window (mwnd.namae)
     msgsel  push eax; lea ecx,[ecx+d]; mov [ebp-x],0; call push                 a choice item of mwnd.sel / selmsg
     selbtn  push eax; mov [ebp-x],edi; mov [ebp-x],ebx; mov [ebp-x],edx; call push   a global.selbtn item
   add_msg itself is called by
     line    push [ebp+c]; push [ebp+8]; call add_msg                            mwnd.print
     namemsg push 0; push [ebp+8]; mov [esi+d],eax; call add_msg                 a name drawn inside the message (【名前】)
     backlog push 0; push ecx; lea ecx,[esi+d]; call add_msg   (x2)              the backlog page (name, then text)
   and the push hook reads add_msg's return address ([ebp+4]: push is called with add_msg's frame) to tell them apart.
     clear   msg::clear(): resets the ruby state, the plain text, the glyph vector; called on a new page / clear.
   Nothing here is an absolute address: everything is found by these patterns, so another build with the same code
   shape matches too; one that does not, matches nothing and the hook stays off. */

const TRIPLE=/\x81[\xf8-\xff]\x0c\x30\x00\x00\x74[\s\S]\x81[\xf8-\xff]\x0e\x30\x00\x00\x74[\s\S]\x81[\xf8-\xff]\x08\xff\x00\x00/g;
const PRINT=/\x8d\x85[\s\S]{2}\xff\xff\x50\x8d\x8b([\s\S]{2})\x00\x00\xe8([\s\S]{4})/g;
/* add_msg's head: the glyph count, (end - begin) / sizeof(moji): mov ecx,[ebx+END]; mov eax,magic; sub ecx,[ebx+VEC] */
const COUNT=/\x8b\x8b([\s\S]{2})\x00\x00\xb8[\s\S]{4}\x2b\x8b([\s\S]{2})\x00\x00/;
const PENADD=/\x8b\x8b([\s\S]{2})\x00\x00\x03\x8b([\s\S]{2})\x00\x00/;
const PROLOGUE=/\xcc\x55\x8b\xec\x6a\xff\x68[\s\S]{4}\x64\xa1\x00\x00\x00\x00/g;
const CLEAR=/\x55\x8b\xec\x83\xec\x08\x33\xc0\x56\x57\x8b\xf9\x66\x89\x87[\s\S]{2}\x00\x00\x89\x87[\s\S]{2}\x00\x00\x89\x87[\s\S]{2}\x00\x00\x89\x87/g;
const RUBYSTR=/\x83\xbf[\s\S]{2}\x00\x00\x08\x8d\x87([\s\S]{2})\x00\x00/;
const RUBYPOS=/\x8b\xb7([\s\S]{2})\x00\x00\x8b\x9f([\s\S]{2})\x00\x00\x8b\x8f([\s\S]{2})\x00\x00/;
/* the bytes right before a call (the regex must end at the E8) */
const PUSH_TAILS={
 ruby:/\xc6\x85[\s\S]{2}\xff\xff\x01$/,
 name:/\x8d\x8f[\s\S]{2}\x00\x00\x8d\x85[\s\S]{2}\xff\xff\x50$/,
 msgsel:/\x50\x8d\x89[\s\S]{2}\x00\x00\xc7\x85[\s\S]{2}\xff\xff\x00\x00\x00\x00$/,
 selbtn:/\x50\x89\xbd[\s\S]{2}\xff\xff\x89\x9d[\s\S]{2}\xff\xff\x89\x95[\s\S]{2}\xff\xff$/,
};
const ADD_TAILS={
 line:/\xff\x75\x0c\xff\x75\x08$/,
 namemsg:/\x6a\x00\xff\x75\x08\x89\x86[\s\S]{2}\x00\x00$/,
 backlog:/\x6a\x00\x51\x8d\x4e[\s\S]$/,
};
/* push call sites the hook needs, and how many of each (both known builds) */
const WANT={print:1,ruby:2,name:1,msgsel:1,selbtn:1};
const u16=s=>s.charCodeAt(0)|s.charCodeAt(1)<<8;

/* segs: [{va, code: Buffer}] (one .text section, or the fixture's windows). The segment a VA falls in. */
function at(segs,va){for(const s of segs)if(va>=s.va&&va<s.va+s.code.length)return s;return null;}
function each(segs,re,fn){for(const s of segs){const t=s.code.toString('latin1');re.lastIndex=0;let m;while((m=re.exec(t)))fn(s,m);}}
/* every E8 call to target: [{site, seg, off}] */
function callsTo(segs,target){
 const out=[];
 for(const s of segs){const c=s.code;for(let i=0;i+5<=c.length;i++)if(c[i]===0xe8&&s.va+i+5+c.readInt32LE(i+1)===target)out.push({site:s.va+i,seg:s,off:i});}
 return out;
}
function tailOf(seg,off,n){return seg.code.toString('latin1',Math.max(0,off-n),off);}
function classify(seg,off,tails){for(const [k,re] of Object.entries(tails))if(re.test(tailOf(seg,off,24)))return k;return 'other';}

/* Returns {ok, why, addMsg, push, vec, clear, sites:{role:[site...]}, adds:{role:[site...]}, off:{...}} */
function find(segs){
 const r={ok:false,why:'',sites:{},adds:{},off:{}};
 const triples=[];each(segs,TRIPLE,(s,m)=>triples.push({s,i:m.index}));
 if(triples.length!==1){r.why=triples.length+' bracket checks (want 1)';return r;}
 const {s:ts,i:ti}=triples[0],t=ts.code.toString('latin1');
 /* add_msg's start: the last SEH prologue after int3 padding before the bracket check */
 let start=-1;PROLOGUE.lastIndex=Math.max(0,ti-0x800);let m;
 while((m=PROLOGUE.exec(t))&&m.index<ti)start=m.index+1;
 if(start<0){r.why='no add_msg prologue';return r;}
 r.addMsg=ts.va+start;
 /* the glyph vector: add_msg counts it first thing */
 const cnt=COUNT.exec(t.slice(start,ti));
 if(!cnt||u16(cnt[1])!==u16(cnt[2])+4){r.why='no glyph count in add_msg';return r;}
 /* the print push inside add_msg, after the bracket check: the one into that vector */
 const prints=[];PRINT.lastIndex=ti;while((m=PRINT.exec(t))&&m.index<ti+0x400){const off=m.index+13;if(u16(m[1])===u16(cnt[2]))prints.push({vec:u16(m[1]),push:ts.va+off+5+ts.code.readInt32LE(off+1)});}
 if(prints.length!==1){r.why=prints.length+' print pushes (want 1)';return r;}
 r.push=prints[0].push;r.vec=prints[0].vec;
 const pa=PENADD.exec(t.slice(start,ti));if(pa){r.off.penAdd=u16(pa[1]);r.off.penX=u16(pa[2]);}
 /* every call of push, by role */
 for(const c of callsTo(segs,r.push)){
  const role=c.seg===ts&&c.off>ti&&c.off<ti+0x400?'print':classify(c.seg,c.off,PUSH_TAILS);
  (r.sites[role]=r.sites[role]||[]).push(c.site);
 }
 for(const [k,n] of Object.entries(WANT))if((r.sites[k]||[]).length!==n){r.why=k+' pushes '+((r.sites[k]||[]).length)+' (want '+n+')';return r;}
 if(r.sites.other){r.why=r.sites.other.length+' unknown pushes';return r;}
 /* the ruby layout's fields, from the code before its first push */
 const rs=at(segs,r.sites.ruby[0]),ro=r.sites.ruby[0]-rs.va,win=rs.code.toString('latin1',Math.max(0,ro-0x300),ro);
 const str=RUBYSTR.exec(win),pos=RUBYPOS.exec(win);
 if(!str||!pos){r.why='ruby fields not found';return r;}
 r.off.rubyStr=u16(str[1]);r.off.rubyX=u16(pos[1]);r.off.rubyY=u16(pos[2]);
 if(r.off.penX!==undefined&&u16(pos[3])!==r.off.penX){r.why='ruby pen x differs from add_msg';return r;}
 r.off.penX=u16(pos[3]);
 if(r.off.penAdd===undefined){r.why='pen offset not found';return r;}
 /* who calls add_msg */
 for(const c of callsTo(segs,r.addMsg)){const role=classify(c.seg,c.off,ADD_TAILS);(r.adds[role]=r.adds[role]||[]).push(c.site);}
 if(!r.adds.line){r.why='no mwnd.print call of add_msg';return r;}
 /* msg::clear */
 const clears=[];each(segs,CLEAR,(s,m)=>clears.push(s.va+m.index));
 if(clears.length!==1){r.why=clears.length+' clear functions (want 1)';return r;}
 r.clear=clears[0];
 r.ok=true;return r;
}
/* the .text section of a PE file (x86 only); same as yuris-draw.cjs */
function textOf(buf){
 const pe=buf.readUInt32LE(0x3c);if(buf.toString('latin1',pe,pe+4)!=='PE\0\0')throw Error('not a PE file');
 if(buf.readUInt16LE(pe+4)!==0x14c)throw Error('not x86');
 const n=buf.readUInt16LE(pe+6),opt=buf.readUInt16LE(pe+20),base=buf.readUInt32LE(pe+24+28),sec=pe+24+opt;
 for(let i=0;i<n;i++){const o=sec+i*40,ch=buf.readUInt32LE(o+36);if(!(ch&0x20000000))continue;
  const vsize=buf.readUInt32LE(o+8),rva=buf.readUInt32LE(o+12),raw=buf.readUInt32LE(o+16),rawPtr=buf.readUInt32LE(o+20);
  return {code:buf.subarray(rawPtr,rawPtr+Math.min(raw,vsize||raw)),va:base+rva,base};}
 throw Error('no code section');
}
function scanFile(file){const t=textOf(require('node:fs').readFileSync(file));return {base:t.base,...find([{va:t.va,code:t.code}])};}
/* the windows a fixture keeps of one exe: enough bytes for find() to give the same answer as on the whole file */
function windows(segs,r){
 const w=[];const add=(va,before,after)=>w.push([va-before,va+after]);
 add(r.addMsg,0x10,0x800);
 for(const role of Object.keys(r.sites))for(const s of r.sites[role])add(s,role==='ruby'?0x300:0x40,8);
 for(const role of Object.keys(r.adds))for(const s of r.adds[role])add(s,0x20,8);
 add(r.clear,0x10,0x40);
 w.sort((a,b)=>a[0]-b[0]);const merged=[];
 for(const x of w){const last=merged[merged.length-1];if(last&&x[0]<=last[1])last[1]=Math.max(last[1],x[1]);else merged.push(x.slice());}
 return merged.map(([a,b])=>{const s=at(segs,a);return {va:a,code:s.code.subarray(a-s.va,b-s.va)};});
}
const hex=v=>'0x'+v.toString(16);
function describe(r){if(!r.ok)return {ok:false,why:r.why};
 const o={ok:true,addMsg:hex(r.addMsg),push:hex(r.push),vec:hex(r.vec),clear:hex(r.clear),sites:{},adds:{},off:{}};
 for(const [k,v] of Object.entries(r.sites))o.sites[k]=v.map(hex);for(const [k,v] of Object.entries(r.adds))o.adds[k]=v.map(hex);
 for(const [k,v] of Object.entries(r.off))o.off[k]=hex(v);return o;}

module.exports={find,textOf,scanFile,windows,describe,callsTo,TRIPLE,WANT};
if(require.main===module)for(const f of process.argv.slice(2)){try{console.log(JSON.stringify({file:f,...describe(scanFile(f))}));}catch(e){console.log(JSON.stringify({file:f,error:e.message}));}}
