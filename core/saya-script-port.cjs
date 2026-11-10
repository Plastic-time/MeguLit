// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E409 Japanese script for the Steam "The Song of Saya" (user 2026-11-11). The Steam HD build (Saya_Steam.exe, N4
// engine, script.npk) carries an English or Chinese script; the 2003 Japanese release (saya.exe, script.pak) holds the
// same scenario as one Shift-JIS file with the same commands line for line. Each Steam scene file (media/script/nps/*.nps)
// is lined up with the Japanese script by line signatures (voice file, command line, plain text), and the text of each
// matched line is swapped for the Japanese one while the N4 commands and the line layout stay exactly as they were.
// Lines that find no partner keep their old text and are listed. The result is a new script.npk; the HD pictures stay.
const fs=require('node:fs'),path=require('node:path');
const npk=require('./nitroplus-npk.cjs');

const SCENE=/^media\/script\/nps\/[^/]+\.nps$/i;
const BOM=new RegExp('^'+String.fromCharCode(0xfeff));
const BLANK=/^[\s　]*$/;
// Leading command tags (not ruby <R>, which belongs to the text).
const LEAD=/^(?:[ \t]*<(?!\/?R[\s>])[^>]*>)*/i;
const tagNorm=t=>t.toLowerCase().replace(/\s+/g,' ').replace(/\s*=\s*/g,'=').trim();
function lead(line){const m=line.match(LEAD)[0];return {lead:m,rest:line.slice(m.length)};}
// Signature of one line: null for comments and empty lines (never aligned), T: a command line, B: a spacer line of
// full-width spaces, X: a text line keyed by its leading commands (a voice line by its voice file).
function signature(line){
 const t=line.replace(BOM,'').replace(/(>)[ \t]*\/\/.*$/,'$1');if(/^\s*\/\//.test(t)||!t.trim())return null;
 const {lead:l,rest}=lead(t),text=rest.replace(/<[^>]*>/g,'');
 if(BLANK.test(text)){if(/　/.test(rest))return 'B';return 'T:'+tagNorm(t);}
 const voice=l.match(/<voice\b[^>]*\bsrc\s*=\s*"([^"]*)"/i);
 return 'X:'+(voice?'voice='+voice[1].toLowerCase():(l.match(/<\s*([a-z0-9_]+)/gi)||[]).map(x=>x.replace(/[<\s]/g,'').toLowerCase()).join(','));}
const splitLines=text=>text.replace(/^\ufeff/,'').split(/\r\n|\r|\n/);

// Patience-style alignment: lines unique on both sides (voice files, most command lines) fix the frame, the gaps
// between them are filled by a plain LCS. Returns pairs [steamIndex, originalIndex].
function lcs(A,B,a0,a1,b0,b1,out){
 const n=a1-a0,m=b1-b0;if(!n||!m)return;if(n*m>4e6)return;
 const W=m+1,dp=new Uint16Array((n+1)*W);
 for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)dp[i*W+j]=A[a0+i]!==null&&A[a0+i]===B[b0+j]?dp[(i+1)*W+j+1]+1:Math.max(dp[(i+1)*W+j],dp[i*W+j+1]);
 let i=0,j=0;while(i<n&&j<m){if(A[a0+i]!==null&&A[a0+i]===B[b0+j]){out.push([a0+i,b0+j]);i++;j++;}else if(dp[(i+1)*W+j]>=dp[i*W+j+1])i++;else j++;}}
function lis(items){const tails=[],prev=new Array(items.length);const at=[];
 items.forEach((it,k)=>{let lo=0,hi=tails.length;while(lo<hi){const mid=(lo+hi)>>1;if(items[tails[mid]].b<it.b)lo=mid+1;else hi=mid;}prev[k]=lo?tails[lo-1]:-1;tails[lo]=k;});
 let k=tails.length?tails[tails.length-1]:-1;while(k>=0){at.push(items[k]);k=prev[k];}return at.reverse();}
function alignRange(A,B,a0,a1,b0,b1,out,depth=0){
 while(a0<a1&&b0<b1&&A[a0]!==null&&A[a0]===B[b0]){out.push([a0,b0]);a0++;b0++;}
 const tail=[];while(a1>a0&&b1>b0&&A[a1-1]!==null&&A[a1-1]===B[b1-1]){tail.push([a1-1,b1-1]);a1--;b1--;}
 if(a0<a1&&b0<b1){
  const ca=new Map(),cb=new Map();
  for(let i=a0;i<a1;i++)if(A[i]!==null)ca.set(A[i],(ca.get(A[i])||0)+1);
  for(let j=b0;j<b1;j++)if(B[j]!==null&&ca.has(B[j]))cb.set(B[j],cb.has(B[j])?-1:j);
  const anchors=[];if(depth<40)for(let i=a0;i<a1;i++){const s=A[i];if(s!==null&&ca.get(s)===1&&cb.get(s)>=0)anchors.push({a:i,b:cb.get(s)});}
  const frame=lis(anchors);
  if(frame.length){let pa=a0,pb=b0;for(const f of frame){alignRange(A,B,pa,f.a,pb,f.b,out,depth+1);out.push([f.a,f.b]);pa=f.a+1;pb=f.b+1;}alignRange(A,B,pa,a1,pb,b1,out,depth+1);}
  else lcs(A,B,a0,a1,b0,b1,out);}
 for(let k=tail.length-1;k>=0;k--)out.push(tail[k]);}

// One Steam scene file against the Japanese script: unique lines place it, then the window around them is aligned.
function alignScene(steam,orig,origSigs,origCount){
 const A=steam.map(signature),anchors=[];
 const inScene=new Map();for(const s of A)if(s!==null)inScene.set(s,(inScene.get(s)||0)+1);
 A.forEach((s,i)=>{if(s!==null&&inScene.get(s)===1&&origCount.get(s)===1)anchors.push({a:i,b:origSigs.first.get(s)});});
 const frame=lis(anchors),pairs=[];
 if(!frame.length)return {A,pairs};
 const first=frame[0],last=frame[frame.length-1],margin=k=>Math.ceil(k*1.5)+40;
 const lo=Math.max(0,first.b-margin(first.a)),hi=Math.min(orig.length,last.b+1+margin(A.length-last.a));
 alignRange(A,origSigs.list,0,A.length,lo,hi,pairs);
 return {A,pairs};}

function portLine(steamLine,origLine){
 const bom=steamLine.startsWith('\ufeff')?'\ufeff':'',s=lead(steamLine.slice(bom.length)),o=lead(origLine);
 return bom+s.lead+o.rest;}

// Steam scene texts {name: string} + Japanese files {name: string} -> new texts and a report.
function port(steamScenes,japanese){
 const main=Object.entries(japanese).sort((a,b)=>b[1].length-a[1].length)[0];if(!main)throw Error('SAYA_JAPANESE_SCRIPT_MISSING');
 const byBase=new Map(Object.entries(japanese).map(([n,t])=>[path.posix.basename(n).toLowerCase(),t]));
 const prepared=new Map();
 const prepare=text=>{if(prepared.has(text))return prepared.get(text);const lines=splitLines(text).flatMap(l=>l.split(/(?<=<k>)(?=<voice\b)/i)),list=lines.map(signature),count=new Map(),first=new Map();
  list.forEach((s,i)=>{if(s===null)return;count.set(s,(count.get(s)||0)+1);if(!first.has(s))first.set(s,i);});const v={lines,sigs:{list,first},count,used:new Set()};prepared.set(text,v);return v;};
 const out={},report={scenes:0,textLines:0,matched:0,loose:0,joined:0,unmatched:[],files:[]};
 for(const [name,text] of Object.entries(steamScenes)){
  const base=path.posix.basename(name).toLowerCase(),own=byBase.get(base),src=prepare(own&&own!==main[1]?own:main[1]);
  const steam=splitLines(text),eol=/\r\n/.test(text)?'\r\n':'\n',{A,pairs}=alignScene(steam,src.lines,src.sigs,src.count);
  const partner=new Map(pairs),inSteam=new Set(A);
  // Text lines left between two matched lines pair up in order when both sides have the same number of them.
  const sorted=[...pairs].sort((x,y)=>x[0]-y[0]),taken=new Set(pairs.map(p=>p[1]));
  for(let k=1;k<sorted.length;k++){const [pa,pb]=sorted[k-1],[a,b]=sorted[k],sa=[],sb=[];
   for(let i=pa+1;i<a;i++)if(A[i]?.startsWith('X:')&&!partner.has(i))sa.push(i);
   for(let j=pb+1;j<b;j++)if(src.sigs.list[j]?.startsWith('X:')&&!taken.has(j))sb.push(j);
   if(sa.length&&sa.length===sb.length)sa.forEach((i,n)=>{partner.set(i,sb[n]);taken.add(sb[n]);report.loose++;});}
  let texts=0,matched=0;const lines=steam.map((line,i)=>{const s=A[i];if(!s?.startsWith('X:'))return line;texts++;const j=partner.get(i);
   if(j===undefined){report.unmatched.push({file:name,line:i+1,text:line.replace(BOM,'').slice(0,120)});return line;}
   matched++;src.used.add(j);
   // A Japanese voice line split in parts (SRC x, x_2, x_3) that the Steam script keeps as one line: the parts follow.
   let jp=src.lines[j];const voice=s.match(/^X:voice=(.+)$/);
   if(voice)for(let k=j+1,n=2;k<src.lines.length;k++,n++){const sig=src.sigs.list[k];if(sig!=='X:voice='+voice[1].replace(/_\d+$/,'')+'_'+n)break;if(inSteam.has(sig)||src.used.has(k))break;jp+=lead(src.lines[k]).rest;src.used.add(k);report.joined++;}
   return portLine(line,jp);});
  report.scenes++;report.textLines+=texts;report.matched+=matched;report.files.push({file:name,textLines:texts,matched});
  out[name]=(BOM.test(text)?String.fromCharCode(0xfeff):'')+lines.join(eol);}
 report.rate=report.textLines?report.matched/report.textLines:0;
 // Japanese lines no Steam line took (cut or merged in the Steam script), for the report.
 report.originalTextLines=0;report.originalUnused=[];
 for(const src of prepared.values())src.sigs.list.forEach((s,j)=>{if(!s?.startsWith('X:'))return;report.originalTextLines++;if(!src.used.has(j))report.originalUnused.push(src.lines[j].slice(0,120));});
 return {scenes:out,report};}

// ---- Files ------------------------------------------------------------------------------------------------------
const HEAD=(file,n)=>{try{const fd=fs.openSync(file,'r');try{const b=Buffer.alloc(n);const got=fs.readSync(fd,b,0,n,0);return b.subarray(0,got);}finally{fs.closeSync(fd);}}catch{return Buffer.alloc(0);}};
// The Steam build: script.npk in NPK2 that opens with the Saya key.
function steamArchive(gameDir){const file=path.join(gameDir,'script.npk');if(!npk.isNpk2(HEAD(file,0x20)))return '';
 try{npk.readNpk(fs.readFileSync(file));return file;}catch{return '';}}
// The 2003 release: script.pak with the SAYA tag, in the folder or up to three levels below it.
function japaneseArchive(base){const stack=[[base,3]];
 while(stack.length){const [dir,depth]=stack.pop();let list;try{list=fs.readdirSync(dir,{withFileTypes:true});}catch{continue;}
  const pak=list.find(e=>e.isFile()&&/^script\.pak$/i.test(e.name));
  if(pak){const f=path.join(dir,pak.name),h=HEAD(f,0x118);if(h.length===0x118&&h.readUInt32LE(0)===2&&h.toString('latin1',0x14,0x18)==='SAYA'&&h[0x114]===0x78)return f;}
  if(depth>0)for(const e of list)if(e.isDirectory()&&!/^(save|\.megulit)/i.test(e.name))stack.push([path.join(dir,e.name),depth-1]);}
 return '';}
function decodeJapanese(buf){return new TextDecoder('shift_jis').decode(buf);}

function build(npkBuf,pakBuf){
 const arc=npk.readNpk(npkBuf),scenes={};
 for(const e of arc.entries)if(SCENE.test(e.name))scenes[e.name]=npk.npkData(arc,e).toString('utf8');
 if(!Object.keys(scenes).length)throw Error('SAYA_NO_SCENES');
 const japanese={};for(const e of npk.readPak(pakBuf))if(/\.(txt|nps)$/i.test(e.name))japanese[e.name]=decodeJapanese(e.read());
 const {scenes:ported,report}=port(scenes,japanese);
 const replace=new Map();for(const [name,text] of Object.entries(ported))if(text!==scenes[name])replace.set(name,Buffer.from(text,'utf8'));
 const buffer=npk.writeNpk(arc,replace);
 // Structure check: the new archive opens, every entry's SHA-256 matches, and scene files keep their line count.
 const check=npk.readNpk(buffer);if(check.entries.length!==arc.entries.length)throw Error('SAYA_VERIFY_COUNT');
 for(const e of check.entries){const d=npk.npkData(check,e);if(d.length!==e.length||!require('node:crypto').createHash('sha256').update(d).digest().equals(e.hash))throw Error('SAYA_VERIFY_HASH');
  if(SCENE.test(e.name)&&splitLines(d.toString('utf8')).length!==splitLines(scenes[e.name]).length)throw Error('SAYA_VERIFY_LINES');}
 return {buffer,report,changed:replace.size};}

function detect(gameDir,sourceBase){const steam=steamArchive(gameDir);if(!steam)return null;const pak=japaneseArchive(sourceBase);return pak?{steam,pak}:null;}

module.exports={detect,build,port,signature,steamArchive,japaneseArchive,_internal:{alignRange,splitLines,portLine}};
