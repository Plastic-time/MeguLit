// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const scenes=require('../services/original-engines/scenes.cjs');
const {probeGame}=require('../services/adapter-probe-core.cjs');

const align=b=>Buffer.concat([b,Buffer.alloc((4-b.length%4)%4)]);
const u32=v=>{const b=Buffer.alloc(4);b.writeUInt32LE(v>>>0);return b;};
const i32=v=>{const b=Buffer.alloc(4);b.writeInt32LE(v|0);return b;};
const str=s=>{const b=Buffer.from(String(s),'utf8');return Buffer.concat([u32(b.length),align(b)]);};

function locMonoRaw(locale,entries){
 const keys=entries.map(e=>e[0]),vals=entries.map(e=>e[1]);
 return Buffer.concat([
  Buffer.alloc(12),i32(1),Buffer.alloc(12),
  str(locale),str(locale),
  u32(keys.length),...keys.map(str),
  u32(vals.length),...vals.map(str),
  u32(0),
 ]);
}

function serializedNoTree(monos){
 const ver=Buffer.from('2022.3.17f1\0','latin1');
 const meta=[ver,u32(19),Buffer.from([0]),u32(1),i32(114),Buffer.from([0]),Buffer.from([0xff,0xff]),Buffer.alloc(32),u32(monos.length)];
 let len=48+meta.reduce((s,b)=>s+b.length,0);const entries=[];let dataAt=0;
 monos.forEach((m,i)=>{
  const pad=Buffer.alloc((4-len%4)%4);len+=pad.length;
  const e=Buffer.alloc(24);e.writeBigInt64LE(BigInt(i+1),0);e.writeBigUInt64LE(BigInt(dataAt),8);e.writeUInt32LE(m.length,16);e.writeInt32LE(0,20);
  entries.push(pad,e);len+=24;dataAt+=m.length;
 });
 const dataOffset=(len+15)&~15,head=Buffer.alloc(48);
 head.writeUInt32BE(22,8);head[16]=0;head.writeUInt32BE(len-48,20);
 head.writeBigUInt64BE(BigInt(dataOffset+dataAt),24);head.writeBigUInt64BE(BigInt(dataOffset),32);
 return Buffer.concat([head,...meta,...entries,Buffer.alloc(dataOffset-len),...monos]);
}

/* TypeTree SerializedFile inside a stored UnityFS bundle holding YarnSpinner Localization MonoBehaviours. */
function bundleWithLocTypeTree(locales){
 const strs=[];const strMap=new Map();
 const addS=s=>{if(strMap.has(s))return strMap.get(s);const off=strs.reduce((a,b)=>a+b.length,0);const b=Buffer.from(s+'\0','utf8');strs.push(b);strMap.set(s,off);return off;};
 const treeNodes=[
  [0,0,'MonoBehaviour','Base',-1,0],
  [1,0,'string','m_Name',-1,0x4000],
  [1,0,'string','_LocaleCode',-1,0x4000],
  [1,0,'StringTable','_stringTable',-1,0],
  [2,0,'vector','keys',-1,0],
  [3,1,'Array','Array',-1,0],
  [4,0,'int','size',4,0],
  [4,0,'string','data',-1,0x4000],
  [2,0,'vector','values',-1,0],
  [3,1,'Array','Array',-1,0],
  [4,0,'int','size',4,0],
  [4,0,'string','data',-1,0x4000],
 ];
 const nodeBufs=treeNodes.map(([lvl,arr,tp,nm,bs,meta])=>{
  const b=Buffer.alloc(32);b.writeUInt16LE(0,0);b[2]=lvl;b[3]=arr;
  b.writeUInt32LE(addS(tp),4);b.writeUInt32LE(addS(nm),8);b.writeInt32LE(bs,12);b.writeUInt32LE(meta,20);return b;
 });
 const sb=Buffer.concat(strs);
 const ver=Buffer.from('2022.3.17f1\0','latin1');
 const objects=locales.map(([loc,entries])=>Buffer.concat([
  str(loc),str(loc),
  u32(entries.length),...entries.map(e=>str(e[0])),
  u32(entries.length),...entries.map(e=>str(e[1])),
 ]));
 const meta=[ver,u32(19),Buffer.from([1]),u32(1),i32(114),Buffer.from([0]),Buffer.from([0xff,0xff]),Buffer.alloc(32),
  u32(treeNodes.length),u32(sb.length),...nodeBufs,sb,u32(0),u32(objects.length)];
 let len=48+meta.reduce((s,b)=>s+b.length,0);const ents=[];let dataAt=0;
 objects.forEach((m,i)=>{
  const pad=Buffer.alloc((4-len%4)%4);len+=pad.length;
  const e=Buffer.alloc(24);e.writeBigInt64LE(BigInt(i+1),0);e.writeBigUInt64LE(BigInt(dataAt),8);e.writeUInt32LE(m.length,16);e.writeInt32LE(0,20);
  ents.push(pad,e);len+=24;dataAt+=m.length;
 });
 const dataOffset=(len+15)&~15,head=Buffer.alloc(48);
 head.writeUInt32BE(22,8);head[16]=0;head.writeUInt32BE(len-48,20);
 head.writeBigUInt64BE(BigInt(dataOffset+dataAt),24);head.writeBigUInt64BE(BigInt(dataOffset),32);
 const file=Buffer.concat([head,...meta,...ents,Buffer.alloc(dataOffset-len),...objects]);
 const name=Buffer.from('CAB-yarn\0','utf8');
 const info=Buffer.concat([Buffer.alloc(16),(()=>{const b=Buffer.alloc(4);b.writeUInt32BE(1);return b;})(),(()=>{const b=Buffer.alloc(10);b.writeUInt32BE(file.length,0);b.writeUInt32BE(file.length,4);return b;})(),(()=>{const b=Buffer.alloc(4);b.writeUInt32BE(1);return b;})(),(()=>{const b=Buffer.alloc(20);b.writeBigUInt64BE(0n,0);b.writeBigUInt64BE(BigInt(file.length),8);b.writeUInt32BE(4,16);return b;})(),name]);
 const bh=Buffer.concat([Buffer.from('UnityFS\0','latin1'),(()=>{const b=Buffer.alloc(4);b.writeUInt32BE(8);return b;})(),Buffer.from('5.x.x\0','latin1'),ver,Buffer.alloc(8),(()=>{const b=Buffer.alloc(12);b.writeUInt32BE(info.length,0);b.writeUInt32BE(info.length,4);b.writeUInt32BE(0x200,8);return b;})()]);
 const pad1=Buffer.alloc((16-bh.length%16)%16),mid=Buffer.concat([bh,pad1,info]),pad2=Buffer.alloc((16-mid.length%16)%16);
 return Buffer.concat([mid,pad2,file]);
}

function put(dir,files){for(const [rel,data] of Object.entries(files)){const f=path.join(dir,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,data);}}
const tmp=p=>fs.mkdtempSync(path.join(os.tmpdir(),p));

test('YarnSpinner player assets: separates languages, strips tags/speakers, pairs zh-Hans and provides foreign lookup',()=>{
 const dir=tmp('ys-player-');
 try{
  const ja=[['line:001','アリス:……遠くで<color=white>音が聞こえる</color>……｜誰だろう？'],['line:002','扉を開ける']];
  const zh=[['line:001','爱丽丝:……远处<color=white>传来了声音</color>……｜是谁呢？'],['line:002','打开门']];
  const en=[['line:001','Alice:I hear a sound from afar…|Who is it?'],['line:002','Open the door']];
  for(let i=0;i<35;i++){
   ja.push(['line:x'+i,'アリス:テストの台詞その'+i+'です。']);
   zh.push(['line:x'+i,'爱丽丝:这是第'+i+'句测试台词。']);
   en.push(['line:x'+i,'Alice:Test dialogue line '+i+'.']);
  }
  put(dir,{
   'Demo.exe':'x',
   'Demo_Data/Managed/YarnSpinner.Unity.dll':'x',
   'Demo_Data/sharedassets0.assets':serializedNoTree([locMonoRaw('ja',ja),locMonoRaw('zh-Hans',zh),locMonoRaw('en',en)]),
  });
  assert.equal(scenes.detect(dir),'yarnspinner');
  const list=scenes.read('yarnspinner',dir);
  assert.equal(list.length,1);
  assert.equal(list[0].lines[0],'……遠くで音が聞こえる……\n誰だろう？');
  assert.equal(list[0].speakers[0],'アリス');
  assert.equal(list[0].zh[0],'……远处传来了声音……\n是谁呢？');
  assert.equal(list[0].lines[1],'扉を開ける');
  assert.equal(list[0].speakers[1],'');
  const patched=scenes.ENGINES.yarnspinner.patchLines(list,{dirs:[dir]});
  assert.equal(patched[0].lines[0],'……远处传来了声音……\n是谁呢？');
  const fMap=scenes.ENGINES.yarnspinner.foreign(dir);
  assert.equal(fMap.get('打开门'),'扉を開ける');
  const p=probeGame({dir,executable:path.join(dir,'Demo.exe')});
  assert.equal(p.step,'ok');
  assert.equal(p.detected,'yarnspinner');
  assert.equal(p.lines,37);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('YarnSpinner Addressables bundle with TypeTree: reads Localization fallback from bundle',()=>{
 const dir=tmp('ys-bundle-');
 try{
  const ja=[['line:a1','メアリ:もしもし、聞こえますか？']];
  const tc=[['line:a1','瑪莉:喂喂，聽得到嗎？']];
  for(let i=0;i<35;i++){
   ja.push(['line:b'+i,'メアリ:通話テスト'+i+'回目です。']);
   tc.push(['line:b'+i,'瑪莉:通話測試第'+i+'次。']);
  }
  put(dir,{
   'Demo.exe':'x',
   'Demo_Data/Managed/YarnSpinner.Unity.dll':'x',
   'Demo_Data/StreamingAssets/aa/StandaloneWindows64/yarn_loc.bundle':bundleWithLocTypeTree([['ja',ja],['zh-Hant',tc]]),
  });
  assert.equal(scenes.detect(dir),'yarnspinner');
  const list=scenes.read('yarnspinner',dir);
  assert.equal(list[0].lines[0],'もしもし、聞こえますか？');
  assert.equal(list[0].zh[0],'瑪莉:喂喂，聽得到嗎？'.replace(/^瑪莉:/,''));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('YarnSpinner non-Japanese build does not report ok',()=>{
 const dir=tmp('ys-cn-');
 try{
  const zh=[];
  for(let i=0;i<60;i++)zh.push(['line:c'+i,'角色:这是一段简体中文测试台词编号'+i+'。']);
  put(dir,{
   'Demo.exe':'x',
   'Demo_Data/Managed/YarnSpinner.Unity.dll':'x',
   'Demo_Data/sharedassets0.assets':serializedNoTree([locMonoRaw('zh-Hans',zh)]),
  });
  const p=probeGame({dir,executable:path.join(dir,'Demo.exe')});
  assert.equal(p.step,'chinese-build');
  assert.equal(p.detected,'yarnspinner');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
