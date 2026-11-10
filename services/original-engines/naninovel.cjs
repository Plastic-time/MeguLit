// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E355 Naninovel (Unity) games with official localization (Steam 魔法少女ノ魔女裁判 / manosaba). The localization
   bundles (StreamingAssets/aa/StandaloneWindows64/*-localization-<lang>-scripts-*.bundle, UnityFS + LZ4) hold one
   "localization document" per scenario script:
     # 0101Adv29_Narrative001
     ; 見張りのためか、看守はよく玄関ホールに立っている。<br>いつのっそりと…
     看守经常会来玄关大厅这边巡逻站岗。<br>
     它什么时候悄悄出现在这里都不出奇。
   The "; " line is the Japanese source (a "; > Name: |#id|" line is the speaker command and is skipped), the plain lines
   after it are the translation. So one document gives both the running Japanese text and the release's own Chinese.
   Simplified Chinese is preferred, then Traditional, then any other localization (its Japanese side is still read). */
const fs=require('node:fs'),path=require('node:path'),unityfs=require('./unityfs.cjs');
const memo=new Map();
const stat=f=>{try{const s=fs.statSync(f);return s.size+'|'+s.mtimeMs;}catch{return '';}};
function bundleDir(dir){let names;try{names=fs.readdirSync(dir,{withFileTypes:true});}catch{return '';}
 for(const e of names)if(e.isDirectory()&&/_Data$/i.test(e.name)){const d=path.join(dir,e.name,'StreamingAssets','aa','StandaloneWindows64');if(fs.existsSync(d))return d;}
 return '';}
function localizationBundles(dir){const d=bundleDir(dir);if(!d)return [];let files;try{files=fs.readdirSync(d);}catch{return [];}
 const loc=files.filter(f=>/-localization-[a-z-]+-scripts-.*\.bundle$/i.test(f)&&!/-scripts-debug/i.test(f));if(!loc.length)return [];
 const lang=f=>(/-localization-([a-z-]+?)-scripts-/i.exec(f)||[])[1]||'';
 const order=['zhhans','zh-hans','zhcn','zhhant','zh-hant','zhtw'];const langs=[...new Set(loc.map(lang))].sort((a,b)=>((order.indexOf(a)+1)||99)-((order.indexOf(b)+1)||99));
 return loc.filter(f=>lang(f)===langs[0]).sort().map(f=>path.join(d,f));}
const DOC=Buffer.from('localization document for');
// The documents inside one bundle: { name, text }.
function documents(file){const key=file+'|'+stat(file);if(memo.has(key))return memo.get(key);const out=[];
 try{for(const node of unityfs.read(file)){const b=node.data;let at=0;
  while((at=b.indexOf(DOC,at))>=0){let start=b.lastIndexOf(Buffer.from('; '),at);for(let p=start;p>=Math.max(0,start-8);p-=1){if(p%4===0&&p>=4){const n=b.readUInt32LE(p-4);if(n>0&&p+n<=b.length&&b.toString('utf8',p,p+2)==='; '){start=p;break;}}}
   const n=start>=4?b.readUInt32LE(start-4):0,text=n>0&&start+n<=b.length?b.toString('utf8',start,start+n):'';at+=DOC.length;if(!text)continue;
   const name=(/for '([^']+)'/.exec(text)||[])[1]||('doc'+out.length);out.push({name:path.basename(name)+'.nani',text});}}}catch{}
 memo.set(key,out);return out;}
const tidy=t=>t.replace(/<br>\s*/gi,'\n').replace(/<\/?[a-z][^>]*>/gi,'').replace(/\r/g,'').trim();
function parse(buf){const text=Buffer.isBuffer(buf)?buf.toString('utf8'):String(buf),lines=[],zh=[],anchors=[];
 for(const block of text.split(/\n(?=# )/)){const m=/^# (\S+)/.exec(block);if(!m)continue;anchors.push(m[1]);
  const src=[],dst=[];for(const raw of block.split('\n').slice(1)){const l=raw.replace(/\r$/,'');if(!l.trim())continue;if(l.startsWith('; >'))continue;if(l.startsWith('; '))src.push(l.slice(2));else if(!l.startsWith(';'))dst.push(l);}
  if(!src.length)continue;lines.push(tidy(src.join('\n')));zh.push(tidy(dst.join('\n')));}
 return {lines,anchors,zh};}
const naninovel={
 id:'naninovel',hint:'<游戏>_Data\\StreamingAssets\\aa（本地化剧本）',
 scenes(dir){const out=new Map();for(const file of localizationBundles(dir))for(const d of documents(file))if(!out.has(d.name.toLowerCase()))out.set(d.name.toLowerCase(),{name:d.name,read:()=>Buffer.from(d.text,'utf8')});
  return [...out.values()].sort((a,b)=>a.name.localeCompare(b.name));},
 archives:()=>[],
 sources:dir=>localizationBundles(dir),
 parse,test:()=>false,
 patchLines(base){let any=false;const list=base.map(scene=>{const zh=scene.zh||[];if(!zh.some(Boolean))return scene;any=true;return {...scene,patched:true,lines:scene.lines.map((t,k)=>zh[k]||t)};});return any?list:null;},
 _internal:{documents,localizationBundles,tidy},
};
module.exports=naninovel;
