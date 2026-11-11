// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E450 Naninovel voices (夏色四叶草). Auto-voice clips live one per Addressables bundle as
   Assets/Naninovel/Game/Voice/<script>/<line>.<inline>.ogg (an FSB5 AudioClip, remuxed to Ogg by fsb5.cjs). The number is
   the line in the script the voices were recorded against; a release that rewrote its scripts (the Chinese release
   puts every line four apart) no longer has those numbers, and nothing in the game maps them. So each script's clips (in
   number order) are aligned to its printed lines (in order) under three rules:
   - only lines with a speaker take a voice (narration and the hero's unvoiced lines are skipped at no cost);
   - along the alignment, (clip number - line index) never goes down: between two voiced lines the original script had
     at least as many lines as the text has between them;
   - a clip's length should fit its line's length (seconds ~ 0.176 x characters + 2.44, fitted on scripts whose voiced
     line count equals their clip count; Pearson r 0.67).
   A pair is kept only when its line has a speaker and the clip is within e times the expected length. Kept pairs are
   marked estimated: the voice is inferred, not named by the game. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const unityfs=require('./unityfs.cjs'),fsb5=require('./fsb5.cjs');
const VOICE=/Assets\/Naninovel\/Game\/Voice\/([^\0]*?)\.ogg/;
function bundleDir(dir){let names=[];try{names=fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.isDirectory()&&/_Data$/i.test(e.name));}catch{}
 for(const e of names){const b=path.join(dir,e.name,'StreamingAssets','aa','StandaloneWindows64');if(fs.existsSync(b))return b;}return '';}
const cacheFile=d=>{let n=0;try{n=fs.readdirSync(d).length;}catch{}return path.join(os.tmpdir(),'megulit-unity-voice',crypto.createHash('sha256').update(path.resolve(d).toLowerCase()+'|'+n).digest('hex').slice(0,24)+'.json');};
// name ("Kasumi_10/44.0") -> {file, duration}; read once (every bundle opened), then cached next to MeguLit's other caches.
function index(dir){const d=bundleDir(dir);if(!d)return null;const cf=cacheFile(d);try{return JSON.parse(fs.readFileSync(cf,'utf8'));}catch{}
 const out={};let files=[];try{files=fs.readdirSync(d).filter(f=>/\.bundle$/i.test(f));}catch{}
 for(const f of files){let nodes;try{nodes=unityfs.read(path.join(d,f));}catch{continue;}let name=null,duration=null;
  for(const x of nodes){const m=VOICE.exec(x.data.toString('latin1'));if(m)name=m[1];const i=x.data.indexOf('FSB5');if(i>=0)duration=fsb5.duration(x.data,i);}
  if(name&&duration!==null)out[name]={file:f,duration};}
 if(Object.keys(out).length){try{fs.mkdirSync(path.dirname(cf),{recursive:true});fs.writeFileSync(cf,JSON.stringify(out));}catch{}}
 return out;}
// The clips as catalog entries: {key, read} where read gives Ogg.
function audioDir(dir){const ix=index(dir);if(!ix)return null;const d=bundleDir(dir);
 return Object.entries(ix).map(([key,v])=>({key,read:()=>{for(const x of unityfs.read(path.join(d,v.file))){const i=x.data.indexOf('FSB5');if(i>=0)return fsb5.playable(x.data,i);}return null;}}));}
// PrintText commands of the compiled scripts: {script, line, inl, text, author}.
function spots(dir){const out=[],U8=new TextDecoder('utf-8',{fatal:true});let files=[];
 try{files=fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.isDirectory()&&/_Data$/i.test(e.name)).map(e=>path.join(dir,e.name,'resources.assets')).filter(f=>fs.existsSync(f));}catch{}
 for(const f of files){const b=fs.readFileSync(f);const str=q=>{if(q<0||q+4>b.length)return null;const n=b.readUInt32LE(q);if(n<1||n>4000||q+4+n>b.length)return null;try{return {s:U8.decode(b.subarray(q+4,q+4+n)),next:(q+4+n+3)&~3};}catch{return null;}};
  const tag=Buffer.from('PrintText');let i=b.indexOf(tag);
  while(i>=0){for(let q=(i+12)&~3;q<i+260;q+=4){const s=str(q);if(!s||!/^[\w\-]{2,60}$/.test(s.s)||/Naninovel|Elringus/.test(s.s))continue;
    const line=b.readInt32LE(s.next),inl=b.readInt32LE(s.next+4),t=str(s.next+8);
    if(t&&line>=0&&line<100000){let author='';for(let r=t.next;r<t.next+120&&r+4<=b.length;r+=4){const a=str(r);if(a&&/^[\w\-]{1,40}$/.test(a.s)){author=a.s;break;}if(b.readUInt32LE(r)>1000)break;}out.push({script:s.s,line,inl,text:t.s,author});}
    break;}
   i=b.indexOf(tag,i+9);}}
 return out;}
const speaker=a=>/^[A-Z][A-Za-z]+\d?$/.test(a||'');
const chars=t=>[...String(t).replace(/<[^>]*>/g,'').replace(/[「」『』（）\s…―ー・、。！？!?]/g,'')].length;
const pred=c=>Math.max(0.4,0.176*c+2.44);
function align(L,V){const n=L.length,m=V.length,INF=1e9,D=Array.from({length:n+1},()=>new Float64Array(m+1).fill(INF)),P=Array.from({length:n+1},()=>new Int8Array(m+1)),G=Array.from({length:n+1},()=>new Float64Array(m+1).fill(-1e9));D[0][0]=0;
 const pair=(l,v)=>Math.abs(Math.log(v.d/pred(chars(l.text))))+(speaker(l.author)?0:2.5),skipL=l=>speaker(l.author)?1.2:0,skipV=3,set=(i,j,x,p,g)=>{if(x<D[i][j]){D[i][j]=x;P[i][j]=p;G[i][j]=g;}};
 for(let i=0;i<=n;i++)for(let j=0;j<=m;j++){const c=D[i][j];if(c>=INF)continue;const g=G[i][j];
  if(i<n&&j<m){const ng=V[j].n-L[i].idx;if(ng>=g)set(i+1,j+1,c+pair(L[i],V[j]),1,ng);}if(i<n)set(i+1,j,c+skipL(L[i]),2,g);if(j<m)set(i,j+1,c+skipV,3,g);}
 const out=[];let i=n,j=m;while(i>0||j>0){const p=P[i][j];if(p===1){out.push([L[i-1],V[j-1]]);i--;j--;}else if(p===2)i--;else j--;}return out.reverse();}
// [{text, ref, estimated:true}] for the Japanese lines that take a clip.
function voiceLines(dir){const ix=index(dir);if(!ix||!Object.keys(ix).length)return [];const byScript=new Map();
 for(const s of spots(dir)){if(!/[ぁ-ゖ]/.test(s.text))continue;let m=byScript.get(s.script);if(!m)byScript.set(s.script,m=new Map());m.set(s.line+'.'+s.inl,s);}
 const clips=new Map();for(const [name,v] of Object.entries(ix)){const [s,n]=name.split('/');if(!clips.has(s))clips.set(s,[]);clips.get(s).push({name,n:parseFloat(n),d:v.duration});}
 const out=[];for(const [s,V] of clips){V.sort((a,b)=>a.n-b.n);const L=[...(byScript.get(s)||new Map()).values()].sort((a,b)=>a.line-b.line||a.inl-b.inl);let k=-1,prev=-1;for(const l of L){if(l.line!==prev){k++;prev=l.line;}l.idx=k;}
  for(const [l,v] of align(L,V))if(speaker(l.author)&&Math.abs(Math.log(v.d/pred(chars(l.text))))<=1)out.push({text:l.text,ref:v.name,estimated:true});}
 return out;}
module.exports={index,audioDir,voiceLines,spots,align,bundleDir};
