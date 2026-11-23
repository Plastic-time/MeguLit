// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const ua=require('../services/original-engines/unity-assets.cjs');
const ufs=require('../services/original-engines/unityfs.cjs');

const align=b=>Buffer.concat([b,Buffer.alloc((4-b.length%4)%4)]);
const u32=v=>{const b=Buffer.alloc(4);b.writeUInt32LE(v>>>0);return b;};
const i32=v=>{const b=Buffer.alloc(4);b.writeInt32LE(v|0);return b;};
const be32=v=>{const b=Buffer.alloc(4);b.writeInt32BE(v|0);return b;};
const str=s=>{const b=Buffer.from(String(s),'utf8');return Buffer.concat([u32(b.length),align(b)]);};

/* Build a multi-block UnityFS bundle where block 0 has the SerializedFile object table
   and block 1 has a configurable compression flag (default 35 = unsupported). */
function twoBlockBundle({classId,payload,textObj=null,block1Flags=35}){
 const ver=Buffer.from('2022.3.17f1\0','latin1');
 const objs=textObj?[textObj]:[Buffer.alloc(64)];
 const meta=[ver,u32(19),Buffer.from([0]),u32(1),i32(classId),Buffer.from([0]),Buffer.from([0xff,0xff]),Buffer.alloc(classId===114?32:16),u32(objs.length)];
 let len=48+meta.reduce((s,b)=>s+b.length,0);
 const pad=Buffer.alloc((4-len%4)%4);len+=pad.length;
 const ent=Buffer.alloc(24);
 const dataOffset=(len+24+15)&~15;
 // If textObj is provided, put it inside block 0; otherwise put the dummy object in block 1 so block 0 holds only header+table.
 const objInBlock1=!textObj;
 const block0Size=objInBlock1?Math.max(dataOffset,128):dataOffset+objs[0].length;
 const block1Uncomp=payload.length;
 ent.writeBigInt64LE(1n,0);
 ent.writeBigUInt64LE(BigInt(objInBlock1?(block0Size-dataOffset):0),8);
 ent.writeUInt32LE(objInBlock1?block1Uncomp:objs[0].length,16);
 ent.writeInt32LE(0,20);
 const head=Buffer.alloc(48);
 head.writeUInt32BE(22,8);head[16]=0;head.writeUInt32BE(len+24-48,20);
 head.writeBigUInt64BE(BigInt(block0Size+block1Uncomp),24);head.writeBigUInt64BE(BigInt(dataOffset),32);
 const block0=Buffer.concat([head,...meta,pad,ent,Buffer.alloc(dataOffset-(len+24)),...(objInBlock1?[Buffer.alloc(block0Size-dataOffset)]:objs)]);
 if(objInBlock1)assert.equal(block0.length,block0Size);
 const nodeSize=block0.length+block1Uncomp;
 const name=Buffer.from('CAB-two\0','utf8');
 const b0=Buffer.alloc(10);b0.writeUInt32BE(block0.length,0);b0.writeUInt32BE(block0.length,4);b0.writeUInt16BE(0,8);
 // Block 1 has unknown compression type 35 by default; full read throws UNITYFS_COMPRESSION_35, prefix read never touches it.
 const b1=Buffer.alloc(10);b1.writeUInt32BE(block1Uncomp,0);b1.writeUInt32BE(payload.length,4);b1.writeUInt16BE(block1Flags,8);
 const info=Buffer.concat([Buffer.alloc(16),be32(2),b0,b1,be32(1),(()=>{const b=Buffer.alloc(20);b.writeBigUInt64BE(0n,0);b.writeBigUInt64BE(BigInt(nodeSize),8);b.writeUInt32BE(4,16);return b;})(),name]);
 const bh=Buffer.concat([Buffer.from('UnityFS\0','latin1'),u32(8).swap32(),Buffer.from('5.x.x\0','latin1'),ver,Buffer.alloc(8),(()=>{const b=Buffer.alloc(12);b.writeUInt32BE(info.length,0);b.writeUInt32BE(info.length,4);b.writeUInt32BE(0x200,8);return b;})()]);
 const p1=Buffer.alloc((16-bh.length%16)%16),mid=Buffer.concat([bh,p1,info]),p2=Buffer.alloc((16-mid.length%16)%16);
 return Buffer.concat([mid,p2,block0,payload]);
}

const tmp=p=>fs.mkdtempSync(path.join(os.tmpdir(),p));

test('binary image and model TextAssets cannot supply dialogue, even when their payload contains Japanese',t=>{
 const dir=tmp('ua-binary-');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const root=path.join(dir,'Game_Data','StreamingAssets');
 fs.mkdirSync(root,{recursive:true});
 const sentence=Buffer.from('今日は晴れです。\nまた明日。');
 const payloads=[Buffer.from('89504e470d0a1a0a','hex'),Buffer.from('RIFF\x20\0\0\0WEBP','latin1'),Buffer.from('PSB\0','latin1')];
 for(const [i,signature] of payloads.entries()){
  const bytes=Buffer.concat([signature,sentence]),object=Buffer.concat([str('model'+i),u32(bytes.length),align(bytes)]);
  fs.writeFileSync(path.join(root,'entry'+i+'.bundle'),twoBlockBundle({classId:49,payload:Buffer.alloc(64),textObj:object}));
  fs.writeFileSync(path.join(root,'raw'+i+'.bytes'),bytes);
 }
 fs.writeFileSync(path.join(root,'scenario.bytes'),Buffer.from('RIFFという名前です。\nPSBの話です。'));
 assert.deepEqual(ua.scenes(dir).map(s=>s.name),['scenario']);
 assert.deepEqual(ua.parse(ua.scenes(dir)[0].read()).lines,['RIFFという名前です。','PSBの話です。']);
});

test('a protected hybrid excludes a line-breaking table from bundles and keeps an authored TextAsset with the same name',t=>{
 const dir=tmp('ua-linebreak-');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const d=path.join(dir,'Game_Data'),stream=path.join(d,'StreamingAssets');
 fs.mkdirSync(stream,{recursive:true});
 const cat=path.join(dir,'CatSystem');fs.mkdirSync(cat);
 const zip=require('./helpers/engine-fixtures.cjs').zip({'scene/story.cstx':''},{flagged:['scene/story.cstx']});
 fs.writeFileSync(path.join(cat,'data_01.dat'),zip);
 for(const [file,text] of [['layout','〕〉》ぁぃぅぇぉっゃゅょ'],['story','また会いましょう。\nまた明日。']]){
  const obj=Buffer.concat([str('LineBreaking Following Characters'),str(text)]);
  fs.writeFileSync(path.join(stream,file+'.bundle'),twoBlockBundle({classId:49,payload:Buffer.alloc(64),textObj:obj}));
 }
 assert.deepEqual(ua.scenes(dir).flatMap(s=>ua.parse(s.read()).lines),['また会いましょう。','また明日。']);
});

test('unityfs.readMatchingNodes skips trailing blocks for media-only bundles and TextAsset prefix reads',()=>{
 const dir=tmp('ua-perf-');
 try{
  const mediaBundle=path.join(dir,'Game_Data','StreamingAssets','aa','media.bundle');
  const scriptBundle=path.join(dir,'Game_Data','StreamingAssets','aa','script.bundle');
  fs.mkdirSync(path.dirname(mediaBundle),{recursive:true});
  fs.writeFileSync(path.join(dir,'Game.exe'),'x');
  // Media-only bundle (Texture2D = classId 28): block 1 is poisoned; old full readNode would fail or inflate it.
  fs.writeFileSync(mediaBundle,twoBlockBundle({classId:28,payload:Buffer.alloc(128,0xaa)}));
  // Bundle with TextAsset (classId 49) inside block 0, followed by poisoned unused block 1.
  const ta=Buffer.concat([str('scene01'),str('テスト台詞です。\nもう一行あります。')]);
  fs.writeFileSync(scriptBundle,twoBlockBundle({classId:49,payload:Buffer.alloc(128,0xbb),textObj:ta}));

  assert.throws(()=>ufs.readNode(mediaBundle,0,96<<20),/UNITYFS_COMPRESSION_35/);
  const list=ua.scenes(dir);
  assert.equal(list.length,1);
  assert.equal(list[0].name,'scene01');
  assert.deepEqual(ua.parse(list[0].read()).lines,['テスト台詞です。','もう一行あります。']);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('unity-assets.scenes stops promptly when deadline has expired',()=>{
 const dir=tmp('ua-deadline-');
 try{
  const ta=Buffer.concat([str('scene02'),str('日本語のテスト行です。')]);
  const b=twoBlockBundle({classId:49,payload:Buffer.alloc(64),textObj:ta,block1Flags:0});
  const aa=path.join(dir,'Game_Data','StreamingAssets','aa');
  fs.mkdirSync(aa,{recursive:true});
  fs.writeFileSync(path.join(dir,'Game.exe'),'x');
  fs.writeFileSync(path.join(aa,'a.bundle'),b);
  assert.deepEqual(ua.scenes(dir,{deadline:Date.now()-100}),[]);
  // Unexpired call still works and is not polluted by the timed-out partial run.
  assert.equal(ua.scenes(dir).length,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
