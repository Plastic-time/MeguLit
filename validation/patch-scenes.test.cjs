// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E280: Chinese patches for scene-file engines (KiriKiri, Artemis, Ren'Py) are found next to the Japanese game and
// line up file by file.
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const ot=require('../services/original-text.cjs'),scenes=require('../services/original-engines/scenes.cjs'),xp3=require('../services/original-engines/xp3.cjs');
const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;},u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;},u16=n=>{const b=Buffer.alloc(2);b.writeUInt16LE(n);return b;};
const chunk=(tag,body)=>Buffer.concat([Buffer.from(tag,'latin1'),u64(body.length),body]);
function writeXp3(file,entries,flags=0){
 const datas=[],index=[];let at=11+8;
 for(const [name,content] of entries){const data=Buffer.from(content);const n=Buffer.from(name,'utf16le');
  index.push(chunk('File',Buffer.concat([chunk('info',Buffer.concat([u32(flags),u64(data.length),u64(data.length),u16(name.length),n])),chunk('segm',Buffer.concat([u32(0),u64(at),u64(data.length),u64(data.length)])),chunk('adlr',u32(0))])));
  datas.push(data);at+=data.length;}
 const idx=Buffer.concat(index);
 fs.writeFileSync(file,Buffer.concat([xp3.MAGIC,u64(at),...datas,Buffer.from([0]),u64(idx.length),idx]));
}
function writePf8(file,entries){
 const names=entries.map(([n])=>Buffer.from(n,'utf8'));let size=4;for(const n of names)size+=4+n.length+12;
 let offset=7+size;const parts=[u32(entries.length)],datas=[];
 entries.forEach(([,content],i)=>{const d=Buffer.from(content);parts.push(u32(names[i].length),names[i],u32(0),u32(offset),u32(d.length));datas.push(d);offset+=d.length;});
 const index=Buffer.concat(parts),key=crypto.createHash('sha1').update(index).digest();
 for(const d of datas)for(let i=0;i<d.length;i++)d[i]^=key[i%20];
 fs.writeFileSync(file,Buffer.concat([Buffer.from('pf8','latin1'),u32(index.length),index,...datas]));
}
function setup(build){
 const top=fs.mkdtempSync(path.join(os.tmpdir(),'scenes-')),game=path.join(top,'game-jp'),patch=path.join(top,'game-chs'),data=path.join(top,'data');
 fs.mkdirSync(game);fs.mkdirSync(patch);build(game,patch);fs.writeFileSync(path.join(game,'game.exe'),'MZ');
 const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(':memory:');db.exec('CREATE TABLE games(id TEXT,executable TEXT,removed_at TEXT)');
 db.prepare('INSERT INTO games VALUES(?,?,NULL)').run('1',path.join(game,'game.exe'));
 return {db,data,exe:path.join(game,'game.exe')};
}
const ksJa='*start\r\n@bg storage="room"\r\n[name text="ハル"]\r\nおはよう、今日はいい天気だね。[p]\r\n@se storage="door"\r\nそうだね、散歩に行こうか。[p]\r\n@wait time=200\r\n@bgm storage="bgm01"\r\n*end\r\n@jump storage="next.ks"\r\n@s\r\n';
const ksZh=ksJa.replace('おはよう、今日はいい天気だね。','早上好，今天天气真好。').replace('そうだね、散歩に行こうか。','是啊，去散步吧。');

test('KiriKiri: plain XP3 and .ks text, tags removed',()=>{
 const p=scenes.parseKs(Buffer.from(ksJa));
 assert.deepStrictEqual(p.lines,['おはよう、今日はいい天気だね。','そうだね、散歩に行こうか。']);
 assert.ok(p.anchors.includes('@se storage="door"'));
});

test('KiriKiri: Japanese game reads its .ks, a Chinese patch.xp3 next to it is found by itself',async()=>{
 const {db,data,exe}=setup((game,patch)=>{fs.mkdirSync(path.join(game,'scenario'));fs.writeFileSync(path.join(game,'scenario','first.ks'),Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(ksJa,'utf16le')]));
  writeXp3(path.join(patch,'patch.xp3'),[['scenario/first.ks',Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(ksZh,'utf16le')])]]);});
 const state=ot.scanRunning(data,'1',exe);assert.strictEqual(state.runtime.engine,'kirikiri');assert.strictEqual(state.status,'native-japanese');
 const r=await ot.autoPatch(data,db,'1',{drives:false,force:true});assert.ok(r.found,JSON.stringify(r));
 assert.strictEqual(ot.provider(data,exe).resolve('そうだね、散歩に行こうか。').translation,'是啊，去散步吧。');
});

test('KiriKiri: a patched file with other commands is not used',async()=>{
 const {db,data}=setup((game,patch)=>{fs.writeFileSync(path.join(game,'first.ks'),ksJa);fs.writeFileSync(path.join(patch,'first.ks'),ksZh.replace(/@\w+ storage="[^"]*"/g,'@x storage="y"'));});
 const r=await ot.autoPatch(data,db,'1',{drives:false,force:true});assert.ok(r.notFound,JSON.stringify(r));
});

test('Artemis: pf8 archive (SHA-1 keyed) with .ast scripts',async()=>{
 const ast=t=>`astver = 2.0\nast = {\n block_00000 = {\n  {"bg", file="room"},\n  text = {\n   vo = {{"vo", file="haru_001"}},\n   ja = {{"${t[0]}"}},\n  },\n  {"se", file="door"},\n  text = { ja = {{"${t[1]}"}} },\n  linknext = "block_00001",\n },\n}\n`;
 const {db,data,exe}=setup((game,patch)=>{writePf8(path.join(game,'script.pfs'),[['script\\001.ast',ast(['おはよう、今日はいい天気だね。','そうだね、散歩に行こうか。'])]]);
  writePf8(path.join(patch,'script.pfs'),[['script\\001.ast',ast(['早上好，今天天气真好。','是啊，去散步吧。'])]]);});
 assert.strictEqual(ot.scanRunning(data,'1',exe).runtime.engine,'artemis');
 const r=await ot.autoPatch(data,db,'1',{drives:false,force:true});assert.ok(r.found,JSON.stringify(r));
 assert.strictEqual(ot.provider(data,exe).resolve('おはよう、今日はいい天気だね。').translation,'早上好，今天天气真好。');
});

test("Ren'Py: tl/<language> old/new pairs, the Chinese folder is picked",async()=>{
 const {db,data,exe}=setup((game,patch)=>{const g=path.join(game,'game');fs.mkdirSync(g);
  fs.writeFileSync(path.join(g,'script.rpy'),'label start:\n    scene bg room\n    h "おはよう、今日はいい天気だね。"\n    "そうだね、散歩に行こうか。"\n    return\n');
  const zh=path.join(patch,'game','tl','schinese');fs.mkdirSync(zh,{recursive:true});
  fs.writeFileSync(path.join(zh,'script.rpy'),'translate schinese start_1:\n\n    # h "おはよう、今日はいい天気だね。"\n    h "早上好，今天天气真好。"\n\ntranslate schinese start_2:\n\n    # "そうだね、散歩に行こうか。"\n    "是啊，去散步吧。"\n');
  const en=path.join(patch,'game','tl','english');fs.mkdirSync(en,{recursive:true});
  fs.writeFileSync(path.join(en,'script.rpy'),'translate english start_1:\n\n    # h "おはよう、今日はいい天気だね。"\n    h "Good morning."\n');});
 assert.strictEqual(ot.scanRunning(data,'1',exe).runtime.engine,'renpy');
 const r=await ot.autoPatch(data,db,'1',{drives:false,force:true});assert.ok(r.found,JSON.stringify(r));
 assert.strictEqual(ot.provider(data,exe).resolve('そうだね、散歩に行こうか。').translation,'是啊，去散步吧。');
});

// Real data when this machine has it: Summer Pockets (Steam) restored to Japanese, Chinese column kept in the backup.
const sp=path.join('E:/','Steam','steamapps','common','Summer Pockets');
test('Siglus (Summer Pockets): Japanese column lines up with the Chinese column of the same table',{skip:!fs.existsSync(path.join(sp,'.megulit-japanese','dat'))&&'no local copy'},async()=>{
 const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(':memory:');db.exec('CREATE TABLE games(id TEXT,executable TEXT,removed_at TEXT)');
 const exe=path.join(sp,'SiglusEngine_Steam.exe');db.prepare('INSERT INTO games VALUES(?,?,NULL)').run('1',exe);
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'sp-'));
 assert.strictEqual(ot.scanRunning(data,'1',exe).runtime.engine,'siglus');
 const r=await ot.autoPatch(data,db,'1',{drives:false,force:true});assert.ok(r.found,JSON.stringify(r));
 assert.strictEqual(ot.provider(data,exe).resolve('島の輪郭がはっきりと目にでき始めたころ。').translation,'当能看清楚整个岛屿轮廓的时候。');
});

test('Siglus: a speaker-name column is not taken for the translation (CLANNAD 【朋也】)',()=>{
 const S=0x53,jp=['（俺の生活は、いつか変わるんだろうか…）','「はぁ」','（一日、２０分…）','（ああ、よくわかんねぇ…）','この町は嫌いだ。','忘れたい思い出が染みついた場所だから。'];
 const names=['【朋也】','【朋也】','【朋也】','【朋也】','',''],zh=['（我的生活，总有一天会改变吗…）','「哈啊」','（一天，20分钟…）','（啊啊，搞不懂…）','我讨厌这个小镇。','因为这里充满了想忘记的回忆。'];
 const table=(cols)=>({rows:jp.length,columns:cols.map(()=>({type:S})),cells:jp.map((_,r)=>cols.map(c=>c[r]))});
 assert.strictEqual(scenes.chineseColumn(table([names,jp,jp]),jp),null);
 assert.deepStrictEqual(scenes.chineseColumn(table([names,jp,zh]),jp),zh);
});

const clannad=path.join('E:/','GAL','CLANNAD');
test('CLANNAD restored by a Japanese patch: only its ZH-TW menu table is used; dialogue gets no name as translation',{skip:!fs.existsSync(path.join(clannad,'dat','text00.dbs'))&&'no local copy'},async()=>{
 const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(':memory:');db.exec('CREATE TABLE games(id TEXT,executable TEXT,removed_at TEXT)');
 const exe=path.join(clannad,'SiglusEngine_Steam.exe');db.prepare('INSERT INTO games VALUES(?,?,NULL)').run('1',exe);
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'cl-'));
 const r=await ot.autoPatch(data,db,'1',{drives:false,force:true});assert.ok(r.found,JSON.stringify(r));
 const p=ot.provider(data,exe);
 assert.strictEqual(p.resolve('（ああ、よくわかんねぇ…）').translation,undefined);
 assert.strictEqual(p.resolve('既読文章を早送り').translation,'快進已讀文本');
});

// E287: lines without a translation are translated just ahead of the reading position and kept per game.
test('gaps are filled ahead of the reading position: next line ready before it is shown, and kept',async()=>{
 const {data,exe}=setup(game=>{fs.writeFileSync(path.join(game,'first.ks'),ksJa);});
 assert.strictEqual(ot.scanRunning(data,'1',exe).status,'native-japanese');
 const provider=ot.provider(data,exe);assert.ok(provider&&provider.kind==='patch'&&!provider.patch);
 const calls=[];const service={translate:async(t)=>{calls.push(t);return '译：'+t;},clearContext(){},observeSource(){},setKey(){}};
 const cached=new Map();const reader={gal:{hooks:{originalText:provider}},prefs:()=>({}),displayLanguage:()=>'',localReady:async()=>{},embedCached:(t,v)=>cached.set(t,v),folder:data,root:data,scriptPrefetch:{service,keysAt:Date.now(),running:false}};
 assert.strictEqual(provider.resolve('おはよう、今日はいい天気だね。').status,'none');
 const prefetch=require('../services/script-prefetch.cjs');
 assert.strictEqual(await prefetch.ahead(reader),1);assert.deepStrictEqual(calls,['そうだね、散歩に行こうか。']);
 const r=provider.resolve('そうだね、散歩に行こうか。');assert.strictEqual(r.translation,'译：そうだね、散歩に行こうか。');assert.strictEqual(r.machine,true);
 assert.strictEqual(cached.get('そうだね、散歩に行こうか。'),'译：そうだね、散歩に行こうか。');
 provider.fill.flush();const again=ot.provider(data,exe);again.resolve('おはよう、今日はいい天気だね。');
 assert.strictEqual(again.resolve('そうだね、散歩に行こうか。').translation,'译：そうだね、散歩に行こうか。','kept for the next session');
});

// E294: an encrypted KiriKiri game that cannot be read yet says it is being prepared, not that it is unsupported.
test('encrypted KiriKiri archives report preparing (unpack, then capture), not unsupported',async()=>{
 const {data,exe}=setup(game=>{writeXp3(path.join(game,'scn.xp3'),[['0123456789abcdef0123456789abcdef',Buffer.from('random bytes that are no PSB')]],0x80000000);});
 const first=ot.scanRunning(data,'1',exe);assert.strictEqual(first.status,'preparing');assert.ok(['unpack','capture'].includes(first.preparing.kind));
 for(let i=0;i<100&&require('../services/original-engines/scenes.cjs').cxBuilds.size;i++)await new Promise(r=>setTimeout(r,50));
 const later=ot.scanRunning(data,'1',exe);assert.strictEqual(later.status,'preparing');assert.strictEqual(later.preparing.kind,'capture');
});
