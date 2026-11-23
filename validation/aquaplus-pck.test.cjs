// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* #303 AQUAPLUS big-endian "Filename" PCK (WHITE ALBUM -綴られる冬の想い出- PC): Data/Game/Script.sdat, one MES.BIN per
   scene. Synthetic files built the way the reader's header comment describes the format. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {sjis}=require('./helpers/engine-fixtures.cjs');
const pck=require('../services/original-engines/aquaplus-pck.cjs'),scenes=require('../services/original-engines/scenes.cjs');
const tmp=t=>{const r=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'apck-'));t.after(()=>fs.rmSync(r,{recursive:true,force:true}));return r;};
const be32=v=>{const b=Buffer.alloc(4);b.writeUInt32BE(v>>>0);return b;},be16=v=>{const b=Buffer.alloc(2);b.writeUInt16BE(v);return b;};
/* {id, speaker, flag, text} -> 0F <u32 id> <u16 speaker> <u8 flag> text 00; other opcodes between records */
const msg=(id,text,speaker=0,flag=0)=>Buffer.concat([Buffer.from([0x0f]),be32(id),be16(speaker),Buffer.from([flag]),sjis(text),Buffer.from([0,0x41,0,0x22,0])]);
const choice=(id,text)=>Buffer.concat([Buffer.from([0x42,1]),msg(id,text,0xffff,0xff)]);
function container(files){const names=Object.keys(files),nameBufs=names.map(n=>Buffer.from(n+'\0','latin1'));
 const first=names.length*4,offs=[];let at=first;for(const b of nameBufs){offs.push(at);at+=b.length;}
 const end=12+at,pk=(end+3)&~3,dataAt=(pk+16+names.length*8+15)&~15,datas=[],ents=[];let p=dataAt;
 for(const n of names){const d=files[n];ents.push(be32(p),be32(d.length));datas.push(d,Buffer.alloc(((d.length+15)&~15)-d.length));p+=(d.length+15)&~15;}
 const head=Buffer.concat([Buffer.from('Filename','latin1'),be32(end),...offs.map(be32),...nameBufs]);
 return Buffer.concat([head,Buffer.alloc(pk-head.length),Buffer.from('Pack    ','latin1'),be32(8+names.length*8),be32(names.length),...ents,Buffer.alloc(dataAt-(pk+16+names.length*8)),...datas]);}
const SCENE1=Buffer.concat([Buffer.from([0x11,1,0,0,0,0,0,0x14]),msg(0,'「由綺は今年さ、学園祭来られそう？」'),msg(1,'<R咄嗟|とっさ>のことで、\\n<c4河島はるか>は答えた。\\k',1),
 /* a 0F byte inside another opcode: its "id" does not go up, so it is no message */Buffer.from([0x43,0,0x0f,0,0,0,0,0,0,0]),sjis('偽の文'),Buffer.from([0]),
 msg(2,'どうしようか…。\\k',2),Buffer.concat([Buffer.from([0x0f]),be32(3),be16(2),Buffer.from([1]),Buffer.from('h\0','latin1')]),choice(4,'「行こう」'),choice(5,'「ごめん…」')]);
const SCENE2=msg(6,'二本目の話。');
test('AQUAPLUS PCK: big-endian Filename/Pack index, MES.BIN messages in id order with choices; tags and waits dropped',t=>{
 const game=tmp(t),sdat=container({'P00110.MES.BIN':SCENE1,'P00120.MES.BIN':SCENE2,'SCRIPT.FLAG':Buffer.alloc(32)});
 fs.mkdirSync(path.join(game,'Data','Game'),{recursive:true});fs.writeFileSync(path.join(game,'Data','Game','Script.sdat'),sdat);fs.writeFileSync(path.join(game,'WHITE ALBUM.exe'),'MZ');
 assert.deepEqual(pck.list(path.join(game,'Data','Game','Script.sdat')).map(e=>e.name),['P00110.MES.BIN','P00120.MES.BIN','SCRIPT.FLAG']);
 const p=pck.parse(SCENE1);
 assert.deepEqual(p.lines,['「由綺は今年さ、学園祭来られそう？」','咄嗟のことで、\n河島はるかは答えた。','どうしようか…。','「行こう」','「ごめん…」']);
 assert.deepEqual(p.ruby[1],[['咄嗟','とっさ']]);
 assert.equal(scenes.detect(game),'aquaplus-pck');
 const registry=require('../services/original-engines/registry.cjs');assert.equal(registry.engineOf(game)?.name,'AQUAPLUS PCK');assert.deepEqual(registry.readersFor(game),['aquaplus-pck']);
 assert.deepEqual(scenes.read('aquaplus-pck',game).map(s=>[s.name,s.lines.length]),[['P00110.MES.BIN',5],['P00120.MES.BIN',1]]);
 assert.equal(pck.list(path.join(game,'WHITE ALBUM.exe')),null);
});
