'use strict';
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const jio=require('../core/japanese-import-original.cjs');
const tar=path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe');
function put(dir,files){for(const [rel,data] of Object.entries(files)){const f=path.join(dir,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,data);}}
function tree(dir){const out={};const walk=r=>{for(const e of fs.readdirSync(path.join(dir,r),{withFileTypes:true})){const rel=path.join(r,e.name);if(e.isDirectory())walk(rel);else out[rel]=fs.readFileSync(path.join(dir,rel),'utf8');}};walk('');return out;}

function setup(){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'jio-')),game=path.join(base,'game'),jp=path.join(base,'下载','女装山脈 日本語版');
 put(game,{'女装山脈.exe':'exe-jp','女装山脉cn1.1.exe':'exe-cn','pac/ysbin.ypf':'script-cn','pac/cg.ypf':'cg','update1.ypf':'cn-patch','save/s1.sav':'mine','readme.txt':'cn readme'});
 put(jp,{'女装山脈.exe':'exe-jp','pac/ysbin.ypf':'script-jp','pac/cg.ypf':'cg','pac/voice.ypf':'voice','readme.txt':'jp readme'});
 return {base,game,jp};
}

test('import from a Japanese folder: preview lists the swap, apply backs up, restore puts everything back',async()=>{
 const {base,game,jp}=setup(),before=tree(game);
 const p=await jio.preview(game,jp);
 assert.deepStrictEqual(p.replace.map(f=>f.file),[path.join('pac','ysbin.ypf')]);
 assert.deepStrictEqual(p.add.map(f=>f.file),[path.join('pac','voice.ypf')]);
 assert.deepStrictEqual(p.remove.map(f=>f.file),['update1.ypf']);
 assert.equal(p.exe,'女装山脈.exe');
 assert.deepStrictEqual(tree(game),before,'preview writes nothing');
 const r=await jio.apply(game,jp,path.join(game,'女装山脉cn1.1.exe'));
 assert.equal(r.replaced,1);assert.equal(r.added,1);assert.equal(r.removed,1);
 assert.equal(fs.readFileSync(path.join(game,'pac','ysbin.ypf'),'utf8'),'script-jp');
 assert.ok(!fs.existsSync(path.join(game,'update1.ypf')));
 assert.equal(fs.readFileSync(path.join(game,'save','s1.sav'),'utf8'),'mine','saves untouched');
 assert.ok(fs.existsSync(path.join(jp,'pac','ysbin.ypf')),'a source folder is copied, not moved');
 await assert.rejects(jio.preview(game,jp),/ALREADY_IMPORTED/);
 const u=jio.restore(game);assert.deepStrictEqual(u.skipped,[]);assert.equal(u.exe,path.join(game,'女装山脉cn1.1.exe'));
 assert.deepStrictEqual(tree(game),before,'restore returns the exact original files');
 fs.rmSync(base,{recursive:true,force:true});
});

// Minimal zip writer: deflate entries, names in Shift-JIS without the UTF-8 flag, as Japanese archivers write them.
function zipOf(dir,prefix){const zlib=require('node:zlib'),files=[],walk=r=>{for(const e of fs.readdirSync(path.join(dir,r),{withFileTypes:true})){const rel=r?r+'/'+e.name:e.name;if(e.isDirectory())walk(rel);else files.push(rel);}};walk('');
 const enc=s=>{const out=[];for(const ch of s){const c=ch.codePointAt(0);if(c<128){out.push(c);continue;}const m={'女':[0x8F,0x97],'装':[0x91,0x95],'山':[0x8E,0x52],'脈':[0x96,0xAC],'日':[0x93,0xFA],'本':[0x96,0x7B],'語':[0x8C,0xEA],'版':[0x94,0xC5],'　':[0x81,0x40]}[ch];assert.ok(m,ch);out.push(...m);}return Buffer.from(out);};
 const crc=b=>{let c=~0;for(const x of b){c^=x;for(let k=0;k<8;k++)c=c&1?(c>>>1)^0xEDB88320:c>>>1;}return ~c>>>0;};
 const locals=[],central=[];let off=0;
 for(const rel of files){const data=fs.readFileSync(path.join(dir,rel)),comp=zlib.deflateRawSync(data),name=enc(prefix+'/'+rel.replace(/ /g,'　'));
  const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(8,8);h.writeUInt32LE(crc(data),14);h.writeUInt32LE(comp.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(name.length,26);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(8,10);c.writeUInt32LE(crc(data),16);c.writeUInt32LE(comp.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(off,42);
  locals.push(h,name,comp);central.push(c,name);off+=30+name.length+comp.length;}
 const cd=Buffer.concat(central),e=Buffer.alloc(22);e.writeUInt32LE(0x06054b50,0);e.writeUInt16LE(files.length,8);e.writeUInt16LE(files.length,10);e.writeUInt32LE(cd.length,12);e.writeUInt32LE(off,16);
 return Buffer.concat([...locals,cd,e]);}

test('import from a zip with Shift-JIS names (no UTF-8 flag), unpacked into a staging folder',async()=>{
 const {base,game,jp}=setup(),before=tree(game),zip=path.join(base,'jp.zip');
 fs.writeFileSync(zip,zipOf(jp,'女装山脈'));
 const p=await jio.preview(game,zip);assert.equal(p.replace.length,1);assert.equal(p.remove.length,1);assert.equal(p.exe,'女装山脈.exe');
 await jio.apply(game,zip,'');
 assert.equal(fs.readFileSync(path.join(game,'pac','ysbin.ypf'),'utf8'),'script-jp');
 assert.ok(!fs.existsSync(path.join(game,'.megulit-japanese-staging')),'staging removed after apply');
 jio.restore(game);assert.deepStrictEqual(tree(game),before);
 fs.rmSync(base,{recursive:true,force:true});
});

test('zip entries cannot escape the target folder',async()=>{
 const z=require('../core/zip-extract.cjs'),base=fs.mkdtempSync(path.join(os.tmpdir(),'zip-'));put(path.join(base,'src'),{'a.txt':'x'});
 fs.writeFileSync(path.join(base,'bad.zip'),zipOf(path.join(base,'src'),'..'));
 await assert.rejects(z.extract(path.join(base,'bad.zip'),path.join(base,'out')),/IMPORT_EXTRACT_FAILED/);
 fs.rmSync(base,{recursive:true,force:true});
});

test('a folder of another game is refused',async()=>{
 const {base,game}=setup(),other=path.join(base,'other');put(other,{'a.exe':'x','data.xp3':'y'});
 await assert.rejects(jio.preview(game,other),/IMPORT_SOURCE_NO_MATCH/);
 fs.rmSync(base,{recursive:true,force:true});
});

// E328: after the Japanese import, the Chinese files moved aside are the translation patch for zero-latency translation.
test('Japanese import then zero-latency translation from the files that were moved aside',async()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'jio-z-')),game=path.join(base,'game'),jp=path.join(base,'jp');
 const ja=['今日はいい天気ですね。','そうだね、散歩に行こうか。','あの公園まで歩いていこう。','桜がきれいに咲いているよ。','お弁当も持っていこうね。','楽しみだなあ、早く行こう。'];
 const zh=['今天天气真好呢。','是啊，去散步吧。','走到那个公园去吧。','樱花开得很漂亮哦。','也带上便当吧。','好期待啊，快走吧。'];
 const ks=lines=>Buffer.from('﻿*start\n'+lines.map((t,i)=>'[voice file="v'+i+'"]\n'+t+'[p]\n').join(''),'utf8');
 put(game,{'game.exe':'exe','scenario/first.ks':ks(zh)});
 put(jp,{'game.exe':'exe','scenario/first.ks':ks(ja)});
 await jio.apply(game,jp,path.join(game,'game.exe'));
 const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(':memory:');db.exec('CREATE TABLE games(id TEXT,executable TEXT,removed_at TEXT)');
 db.prepare('INSERT INTO games VALUES(?,?,NULL)').run('1',path.join(game,'game.exe'));
 const ot=require('../services/original-text.cjs'),data=path.join(base,'data');
 const r=await ot.autoPatch(data,db,'1',{drives:false,force:true});
 assert.ok(r.found&&r.found.includes('.megulit-japanese-import'),JSON.stringify(r));
 assert.strictEqual(ot.provider(data,path.join(game,'game.exe')).resolve('あの公園まで歩いていこう。').translation.trim(),'走到那个公园去吧。');
 fs.rmSync(base,{recursive:true,force:true});
});
