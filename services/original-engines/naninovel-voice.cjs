// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E450 Naninovel voices (夏色四叶草). Auto-voice clips live one per Addressables bundle as
   Assets/Naninovel/Game/Voice/<script>/<line>.<inline>.ogg (an FSB5 AudioClip, remuxed to Ogg by fsb5.cjs), where
   <line> is Naninovel's LineNumber (line index + 1) in the SOURCE script.
   Exact: the source scripts are compiled into a bundle (夏色四叶草: a 3 GB bundle, read through its serialized node); a
   source PrintText at script / line / inline is the clip's line. The source language may not be Japanese (this release's
   source is Traditional Chinese): the Japanese is the ja localization document's entry whose comment (the source line,
   "Speaker: text") has the same text. Lines the release never translated into Japanese have no Japanese and are left out.
   Estimated (only when no source script is found): each script's clips in number order are aligned to its printed
   lines in order, only lines with a speaker take a clip, (clip number - line index) never goes down along the
   alignment, and a clip's length must fit its line (seconds ~ 0.176 x characters + 2.44); such pairs are marked
   estimated. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const unityfs=require('./unityfs.cjs'),fsb5=require('./fsb5.cjs');
const VOICE=/Assets\/Naninovel\/Game\/Voice\/([^\0]*?)\.ogg/;
const dataDirs=dir=>{try{return fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.isDirectory()&&/_Data$/i.test(e.name)).map(e=>path.join(dir,e.name));}catch{return [];}};
function bundleDir(dir){for(const d of dataDirs(dir)){const b=path.join(d,'StreamingAssets','aa','StandaloneWindows64');if(fs.existsSync(b))return b;}return '';}
const cacheFile=d=>{let n=0;try{n=fs.readdirSync(d).length;}catch{}return path.join(os.tmpdir(),'megulit-unity-voice',crypto.createHash('sha256').update(path.resolve(d).toLowerCase()+'|'+n+'|2').digest('hex').slice(0,24)+'.json');};
// A bundle's nodes; one too large to load whole gives its serialized node only.
function nodesOf(file){try{return unityfs.read(file);}catch{try{const n=unityfs.readNode(file);return n?[n]:[];}catch{return [];}}}
/* {clips: name ("Kasumi_10/44.0") -> {file, duration}, scripts: bundles holding compiled scripts (PrintText)}; every
   bundle is opened once, then the result is cached next to MeguLit's other caches. */
function catalogOf(dir){const d=bundleDir(dir);if(!d)return null;const cf=cacheFile(d);try{return JSON.parse(fs.readFileSync(cf,'utf8'));}catch{}
 const clips={},scripts=[];let files=[];try{files=fs.readdirSync(d).filter(f=>/\.bundle$/i.test(f));}catch{}
 for(const f of files){let name=null,duration=null,script=false;
  for(const x of nodesOf(path.join(d,f))){const m=VOICE.exec(x.data.toString('latin1',0,Math.min(x.data.length,1<<20)));if(m)name=m[1];const i=x.data.indexOf('FSB5');if(i>=0)duration=fsb5.duration(x.data,i);if(!m&&x.data.indexOf('PrintText')>=0)script=true;}
  if(name&&duration!==null)clips[name]={file:f,duration};if(script)scripts.push(f);}
 const out={clips,scripts};if(Object.keys(clips).length){try{fs.mkdirSync(path.dirname(cf),{recursive:true});fs.writeFileSync(cf,JSON.stringify(out));}catch{}}
 return out;}
const index=dir=>catalogOf(dir)?.clips||null;
// The clips as catalog entries: {key, read} where read gives Ogg.
function audioDir(dir){const ix=index(dir);if(!ix)return null;const d=bundleDir(dir);
 return Object.entries(ix).map(([key,v])=>({key,read:()=>{for(const x of nodesOf(path.join(d,v.file))){const i=x.data.indexOf('FSB5');if(i>=0)return fsb5.playable(x.data,i);}return null;}}));}
// PrintText commands in one serialized file: {script, line, inl, text, author}.
// from / to: a byte range of b (records are 4-byte aligned to the file, so the buffer is never sliced)
function spotsIn(b,out=[],from=0,to=b.length){const U8=new TextDecoder('utf-8',{fatal:true});
 const str=q=>{if(q<0||q+4>b.length)return null;const n=b.readUInt32LE(q);if(n<1||n>4000||q+4+n>b.length)return null;try{return {s:U8.decode(b.subarray(q+4,q+4+n)),next:(q+4+n+3)&~3};}catch{return null;}};
 const tag=Buffer.from('PrintText');let i=b.indexOf(tag,from);
 while(i>=0){for(let q=(i+12)&~3;q<i+260;q+=4){const s=str(q);if(!s||!/^[\w\-]{2,60}$/.test(s.s)||/Naninovel|Elringus/.test(s.s))continue;
   const line=b.readInt32LE(s.next),inl=b.readInt32LE(s.next+4),t=str(s.next+8);
   if(t&&line>=0&&line<100000){let author='';for(let r=t.next;r<t.next+120&&r+4<=b.length;r+=4){const a=str(r);if(a&&/^[\w\-]{1,40}$/.test(a.s)){author=a.s;break;}if(b.readUInt32LE(r)>1000)break;}out.push({script:s.s,line,inl,text:t.s,author});}
   break;}
  i=b.indexOf(tag,i+9);if(i>=to)break;}
 return out;}
// Localized scripts (resources.assets) and source scripts (script bundles).
function spots(dir){const out=[];for(const d of dataDirs(dir)){const f=path.join(d,'resources.assets');if(fs.existsSync(f))spotsIn(fs.readFileSync(f),out);}return out;}
function sourceSpots(dir){const c=catalogOf(dir),d=bundleDir(dir),out=[];if(!c||!d)return out;
 for(const f of c.scripts||[])for(const x of nodesOf(path.join(d,f)))if(x.data.indexOf('PrintText')>=0)spotsIn(x.data,out);
 return out;}
/* Localization documents of a serialized file: [{at, lang, src, script}] by header, then each one's entries. A document
   is the byte range after its header; an entry is a comment (the source line, "Speaker: text") at document line L and its
   translation printed at line L + 1 (inline parts joined). Pairing by line, not by order, keeps an untranslated entry
   from taking its neighbour's text. */
function docHeads(b){const H=/<([A-Za-z-]+)>\s+to\s+.*?<([A-Za-z-]+)>\s+localization document for [`']([^`']+)[`']/,heads=[];let i=b.indexOf('localization document for');
 while(i>=0){const m=H.exec(b.toString('utf8',Math.max(0,i-160),i+160));if(m)heads.push({at:i,src:m[1].toLowerCase(),lang:m[2].toLowerCase(),script:m[3].replace(/\.nani$/i,'')});i=b.indexOf('localization document for',i+1);}
 for(let k=0;k<heads.length;k++)heads[k].end=k+1<heads.length?heads[k+1].at:b.length;return heads;}
function docEntries(b,from,to){const U8=new TextDecoder('utf-8',{fatal:true}),comments=new Map(),prints=new Map();
 const str=q=>{if(q<0||q+4>b.length)return null;const n=b.readUInt32LE(q);if(n<1||n>4000||q+4+n>b.length)return null;try{return {s:U8.decode(b.subarray(q+4,q+4+n)),next:(q+4+n+3)&~3};}catch{return null;}};
 let p=b.indexOf('CommentScriptLine',from);while(p>=0&&p<to){for(let q=(p+20)&~3;q<p+200;q+=4){const n=b.readInt32LE(q);if(n>=0&&n<100000){const h=str(q+4);if(h&&/^[0-9a-f]{8}$/.test(h.s)){const t=str(h.next);if(t)comments.set(n,t.s);break;}}}p=b.indexOf('CommentScriptLine',p+17);}
 for(const s of spotsIn(b,[],from,to)){const a=prints.get(s.line)||[];a[s.inl]=s.text;prints.set(s.line,a);}
 return [...comments].sort((a,c)=>a[0]-c[0]).map(([L,z])=>({source:z,key:light(z),text:(prints.get(L+1)||[]).filter(Boolean).join('')}));}
// Japanese documents: script -> [{key, ja}] in order.
function jaDocs(file){const b=fs.readFileSync(file),out=new Map();
 for(const h of docHeads(b)){if(!/^ja/.test(h.lang)||out.has(h.script))continue;out.set(h.script,docEntries(b,h.at,h.end).map(e=>({key:e.key,ja:e.text})));}
 return out;}
const light=t=>String(t).replace(/^[^:：「『（]{1,24}[:：]\s*/,'').replace(/<[^>]*>/g,'').replace(/\s+/g,'');
// Exact pairs [{text, ref}], or null when no source script is found.
/* Source lines (their inline parts joined) meet the document's entries in the same order: they are matched as the
   longest common subsequence of their texts, so two short lines with the same words cannot swap translations. */
function exactLines(dir,ix){const src=sourceSpots(dir);if(!src.length)return null;const docs=new Map();
 for(const d of dataDirs(dir)){const f=path.join(d,'resources.assets');if(fs.existsSync(f))for(const [sc,list] of jaDocs(f))if(!docs.has(sc))docs.set(sc,list);}
 const byScript=new Map();for(const sp of src){let m=byScript.get(sp.script);if(!m)byScript.set(sp.script,m=new Map());const a=m.get(sp.line)||[];a[sp.inl]=sp;m.set(sp.line,a);}
 const out=[];for(const [sc,lines] of byScript){const list=docs.get(sc)||[],rows=[...lines].sort((a,c)=>a[0]-c[0]),keys=rows.map(([,parts])=>light(parts.filter(Boolean).map(p=>p.text).join(''))),match=lcs(keys,list.map(e=>e.key));
  rows.forEach(([line,parts],r)=>{const hit=match[r];const ja=hit>=0?list[hit].ja:'';
   parts.forEach((p,inl)=>{if(!p)return;const ref=sc+'/'+(line+1)+'.'+inl;if(!ix[ref])return;const text=/[ぁ-ゖ]/.test(p.text)?p.text:ja;if(text)out.push({text,ref});});});}
 return out;}
// Longest common subsequence of two key lists: for each a[i], the index in b it is matched to, or -1.
function lcs(a,b){const n=a.length,m=b.length,T=Array.from({length:n+1},()=>new Uint16Array(m+1));
 for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)T[i][j]=a[i]===b[j]?T[i+1][j+1]+1:Math.max(T[i+1][j],T[i][j+1]);
 const out=new Array(n).fill(-1);let i=0,j=0;while(i<n&&j<m){if(a[i]===b[j]){out[i]=j;i++;j++;}else if(T[i+1][j]>=T[i][j+1])i++;else j++;}return out;}
const speaker=a=>/^[A-Z][A-Za-z]+\d?$/.test(a||'');
const chars=t=>[...String(t).replace(/<[^>]*>/g,'').replace(/[「」『』（）\s…―ー・、。！？!?]/g,'')].length;
const pred=c=>Math.max(0.4,0.176*c+2.44);
function align(L,V){const n=L.length,m=V.length,INF=1e9,D=Array.from({length:n+1},()=>new Float64Array(m+1).fill(INF)),P=Array.from({length:n+1},()=>new Int8Array(m+1)),G=Array.from({length:n+1},()=>new Float64Array(m+1).fill(-1e9));D[0][0]=0;
 const pair=(l,v)=>Math.abs(Math.log(v.d/pred(chars(l.text))))+(speaker(l.author)?0:2.5),skipL=l=>speaker(l.author)?1.2:0,skipV=3,set=(i,j,x,p,g)=>{if(x<D[i][j]){D[i][j]=x;P[i][j]=p;G[i][j]=g;}};
 for(let i=0;i<=n;i++)for(let j=0;j<=m;j++){const c=D[i][j];if(c>=INF)continue;const g=G[i][j];
  if(i<n&&j<m){const ng=V[j].n-L[i].idx;if(ng>=g)set(i+1,j+1,c+pair(L[i],V[j]),1,ng);}if(i<n)set(i+1,j,c+skipL(L[i]),2,g);if(j<m)set(i,j+1,c+skipV,3,g);}
 const out=[];let i=n,j=m;while(i>0||j>0){const p=P[i][j];if(p===1){out.push([L[i-1],V[j-1]]);i--;j--;}else if(p===2)i--;else j--;}return out.reverse();}
function estimatedLines(dir,ix){const byScript=new Map();
 for(const s of spots(dir)){if(!/[ぁ-ゖ]/.test(s.text))continue;let m=byScript.get(s.script);if(!m)byScript.set(s.script,m=new Map());m.set(s.line+'.'+s.inl,s);}
 const clips=new Map();for(const [name,v] of Object.entries(ix)){const [s,n]=name.split('/');if(!clips.has(s))clips.set(s,[]);clips.get(s).push({name,n:parseFloat(n),d:v.duration});}
 const out=[];for(const [s,V] of clips){V.sort((a,b)=>a.n-b.n);const L=[...(byScript.get(s)||new Map()).values()].sort((a,b)=>a.line-b.line||a.inl-b.inl);let k=-1,prev=-1;for(const l of L){if(l.line!==prev){k++;prev=l.line;}l.idx=k;}
  for(const [l,v] of align(L,V))if(speaker(l.author)&&Math.abs(Math.log(v.d/pred(chars(l.text))))<=1)out.push({text:l.text,ref:v.name,estimated:true});}
 return out;}
// [{text, ref, estimated?}] for the Japanese lines that take a clip.
function voiceLines(dir){const ix=index(dir);if(!ix||!Object.keys(ix).length)return [];return exactLines(dir,ix)||estimatedLines(dir,ix);}
module.exports={docHeads,docEntries,lcs,jaDocs,light,index,catalogOf,audioDir,voiceLines,exactLines,estimatedLines,sourceSpots,spots,spotsIn,align,bundleDir};
