// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// S9 (2026-11-19, 27 probes of Chinese builds): a translation laid over the Japanese release in the same folder, or one
// that replaced the script archive and kept the Japanese one in a backup folder, still has the Japanese script. The
// game runs the Chinese lines; the Japanese lines under them are adopted as the original by themselves.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const ot=require('../services/original-text.cjs'),scenes=require('../services/original-engines/scenes.cjs'),xp3=require('../services/original-engines/xp3.cjs'),bgi=require('../services/original-engines/bgi.cjs'),sampler=require('../services/align-sample.cjs');
const base=fs.existsSync('H:\\MeguLit-Work')?path.join('H:\\MeguLit-Work','tmp'):os.tmpdir();fs.mkdirSync(base,{recursive:true});
const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;},u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;},u16=n=>{const b=Buffer.alloc(2);b.writeUInt16LE(n);return b;};
const chunk=(tag,body)=>Buffer.concat([Buffer.from(tag,'latin1'),u64(body.length),body]);
function writeXp3(file,entries){const datas=[],index=[];let at=11+8;
 for(const [name,content] of entries){const data=Buffer.from(content),n=Buffer.from(name,'utf16le');
  index.push(chunk('File',Buffer.concat([chunk('info',Buffer.concat([u32(0),u64(data.length),u64(data.length),u16(name.length),n])),chunk('segm',Buffer.concat([u32(0),u64(at),u64(data.length),u64(data.length)])),chunk('adlr',u32(0))])));datas.push(data);at+=data.length;}
 const idx=Buffer.concat(index);fs.writeFileSync(file,Buffer.concat([xp3.MAGIC,u64(at),...datas,Buffer.from([0]),u64(idx.length),idx]));}
function writePf8(file,entries){const names=entries.map(([n])=>Buffer.from(n,'utf8'));let size=4;for(const n of names)size+=4+n.length+12;
 let offset=7+size;const parts=[u32(entries.length)],datas=[];
 entries.forEach(([,content],i)=>{const d=Buffer.from(content);parts.push(u32(names[i].length),names[i],u32(0),u32(offset),u32(d.length));datas.push(d);offset+=d.length;});
 const index=Buffer.concat(parts),key=crypto.createHash('sha1').update(index).digest();for(const d of datas)for(let i=0;i<d.length;i++)d[i]^=key[i%20];
 fs.writeFileSync(file,Buffer.concat([Buffer.from('pf8','latin1'),u32(index.length),index,...datas]));}
const JA=['おはよう、今日はいい天気だね。','そうだね、散歩に行こうか。','公園まで歩いて十分くらいかな。','途中でパンを買っていこう。','あの店のパンはとても美味しいんだ。','楽しみだね、早く行こう！'];
const ZH=['早上好，今天天气真好。','是啊，去散步吧。','走到公园大概十分钟吧。','路上买点面包吧。','那家店的面包非常好吃。','真期待，快走吧！'];
const ks=lines=>Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from('*start\r\n@bg storage="room"\r\n'+lines.map(t=>t+'[p]\r\n').join('')+'@s\r\n','utf16le')]);
const ast=lines=>Buffer.from('astver = 2.0\nast = {\n\tblock_00000 = {\n'+lines.map((t,i)=>'\t\t{"print", "'+t+'", id="l'+i+'"},\n').join('')+'\t},\n}\n','utf8');
function game(build){const dir=fs.mkdtempSync(path.join(base,'megulit-under-'));build(dir);fs.writeFileSync(path.join(dir,'game.exe'),'MZ');return {dir,exe:path.join(dir,'game.exe'),root:fs.mkdtempSync(path.join(base,'megulit-under-root-'))};}

test('KiriKiri: a Chinese patch.xp3 over the Japanese data.xp3 adopts the Japanese scene under it',()=>{
 const g=game(dir=>{writeXp3(path.join(dir,'data.xp3'),[['scenario/a.ks',ks(JA)]]);writeXp3(path.join(dir,'patch.xp3'),[['scenario/a.ks',ks(ZH)]]);});
 assert.deepEqual(scenes.read('kirikiri',g.dir).flatMap(s=>s.lines),ZH);
 assert.deepEqual(scenes.ENGINES.kirikiri.originalLines(g.dir),JA);
 const s=ot.scanRunning(g.root,'k',g.exe);assert.ok(s.original?.index,JSON.stringify(s));assert.equal(s.original.auto,true);
 assert.deepEqual(JSON.parse(fs.readFileSync(s.original.index,'utf8')).lines,JA);
});

test('KiriKiri: no Japanese layer under the patch: nothing adopted',()=>{
 const g=game(dir=>{writeXp3(path.join(dir,'data.xp3'),[['scenario/a.ks',ks(ZH)]]);});
 assert.equal(scenes.ENGINES.kirikiri.originalLines(g.dir),null);
 const s=ot.scanRunning(g.root,'k',g.exe);assert.notEqual(s.status,'ready');assert.ok(!s.original);
});

test('Artemis: a Chinese root.pfs.010 over the Japanese root.pfs adopts the Japanese scene under it',()=>{
 const g=game(dir=>{writePf8(path.join(dir,'root.pfs'),[['script\\a.ast',ast(JA)]]);writePf8(path.join(dir,'root.pfs.010'),[['script\\a.ast',ast(ZH)]]);});
 assert.deepEqual(scenes.read('artemis',g.dir).flatMap(s=>s.lines),ZH);
 assert.deepEqual(scenes.ENGINES.artemis.originalLines(g.dir),JA);
});

test('backup folder: a translation that replaced data.xp3 and kept the Japanese one in backup/ is imported by itself',()=>{
 const g=game(dir=>{writeXp3(path.join(dir,'data.xp3'),[['scenario/a.ks',ks(ZH)]]);fs.mkdirSync(path.join(dir,'backup','原版'),{recursive:true});writeXp3(path.join(dir,'backup','原版','data.xp3'),[['scenario/a.ks',ks(JA)]]);});
 assert.equal(ot.backupOriginal(g.dir,'kirikiri','game'),null,'too few lines for a release');
 const many=game(dir=>{const ja=[],zh=[];for(let i=0;i<12;i++){ja.push(...JA);zh.push(...ZH);}writeXp3(path.join(dir,'data.xp3'),[['scenario/a.ks',ks(zh)]]);fs.mkdirSync(path.join(dir,'backup','原版'),{recursive:true});writeXp3(path.join(dir,'backup','原版','data.xp3'),[['scenario/a.ks',ks(ja)]]);});
 assert.equal(ot.backupOriginal(many.dir,'kirikiri','game'),path.join(many.dir,'backup','原版'));
 const s=ot.scanRunning(many.root,'b',many.exe);assert.equal(s.original?.backup,true,JSON.stringify(s));assert.equal(s.original.dir,path.join(many.dir,'backup','原版'));
});

test('alignLines: a sound effect the translation added is left out, the rest of an uneven run pairs',()=>{
 const run=[{name:'s',lines:['v01','莉莎','「呐－那边的大哥哥，和我一起化作星光吧ー」','这家伙。','非要用这么麻烦的说法么。','咚','v02']}];
 const jp=[{name:'s',lines:['v01','リサ','「ねー、そこのおにーさん、わたしと光ろーよー」','やれやれだ。','やっかいを起こさなきゃいいが。','v02']}];
 assert.deepEqual(bgi.alignLines(run,jp),['v01','リサ','「ねー、そこのおにーさん、わたしと光ろーよー」','やれやれだ。','やっかいを起こさなきゃいいが。','','v02']);
 const c=sampler.census(['咚','这家伙。'],['','']);assert.deepEqual(c.reasons,{'no-japanese-line':1});assert.equal(c.total,1);assert.deepEqual(c.added,{count:1,sound:1,line:0,rewritten:0});
});

test('alignLines: a voiced block the Japanese lacks, a speaker name in katakana and a rewritten line are told apart; census keeps them out of unpaired',()=>{
 const run=[{name:'s',lines:['v01','梅尔特','「了解－盛谢惠顾了哦?」','喀啷喀啷','门铃响起。','喧哗瞬间安静下来。','v02','凯伊姆','「真豪奢啊」','v03','「羽化病吗」','这下子就更麻烦了。','被《羽狩》看到的话，钱也就会被揣进他们的腰包了。','v04']}];
 const jp=[{name:'s',lines:['v01','メルト','「りょーかい。毎度どうも♪」','入り口の扉が開いた。','喧噪が瞬時に静まる。','v03','「羽つきか」','《羽つき》は《羽化病》という伝染病に冒された人間の通称だ。','感染拡大を防ぐため、国が《羽狩り》を設立した。','奴らの仕事は、罹患者を《羽狩り》が保護することだ。','v04']}];
 const out=bgi.alignLines(run,jp);
 assert.deepEqual(out.slice(1,6),['メルト','「りょーかい。毎度どうも♪」','','入り口の扉が開いた。','喧噪が瞬時に静まる。']);
 assert.deepEqual(out.added,[7,8]);assert.deepEqual(out.rewritten,[11,12]);
 const c=sampler.census(run[0].lines,out,out.added,out.rewritten);assert.equal(c.unpaired,0);assert.deepEqual(c.added,{count:5,sound:1,line:2,rewritten:2});
});

test('probe: a Chinese patch over the Japanese release reads as Japanese (original: layer); a plain Chinese build says whether it can be restored',()=>{
 const {probeGame}=require('../services/adapter-probe-core.cjs');const ja=[],zh=[];for(let i=0;i<12;i++){ja.push(...JA);zh.push(...ZH);}
 const g=game(dir=>{writeXp3(path.join(dir,'data.xp3'),[['scenario/a.ks',ks(ja)]]);writeXp3(path.join(dir,'patch.xp3'),[['scenario/a.ks',ks(zh)]]);});
 const r=probeGame({dir:g.dir,executable:g.exe,title:'t'},{budgetMs:30000});assert.equal(r.step,'ok',JSON.stringify(r.engines));assert.equal(r.original,'layer');assert.equal(r.japaneseLines,ja.length);
 const c=game(dir=>{writeXp3(path.join(dir,'data.xp3'),[['scenario/a.ks',ks(zh)]]);});
 const q=probeGame({dir:c.dir,executable:c.exe,title:'t'},{budgetMs:30000});assert.equal(q.step,'chinese-build');assert.equal(q.original,null);assert.equal(typeof q.restore,'string');
});

function writeTree(dir,files){for(const [rel,data] of Object.entries(files)){const full=path.join(dir,rel);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,data);}}

test('QLIE: Chinese overlay packs (GameData/data9.pack + root data6.pack) over Japanese GameData/data6.pack adopt the underlying Japanese scenes',()=>{
 const F=require('./helpers/engine-fixtures-c.cjs'),{probeGame}=require('../services/adapter-probe-core.cjs');
 const ja1=[],zh1=[],zhRoot=[],ja2=[];for(let i=0;i<10;i++){ja1.push(...JA);zh1.push(...ZH);zhRoot.push(...ZH.map(l=>l+'（修正）'));}for(let i=0;i<2;i++)ja2.push(...JA);
 const sFile=lines=>lines.join('\r\n')+'\r\n';
 const g=game(dir=>{
  writeTree(dir,{
   'GameData/data6.pack':F.qliePack({'scenario/s01.s':F.sjis(sFile(ja1)),'scenario/s02.s':F.sjis(sFile(ja2))},{version:'3.1'}),
   'GameData/data8.pack':Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]),
   'GameData/data9.pack':F.qliePack({'scenario/s01.s':F.gbk(sFile(zh1))},{version:'3.1'}),
   'data6.pack':F.qliePack({'scenario/s01.s':F.gbk(sFile(zhRoot))},{version:'3.1'}),
   'UnInstallData.pack':Buffer.from('not-a-qlie-pack-header'),
  });
 });
 const running=scenes.read('qlie',g.dir).flatMap(s=>s.lines);
 assert.deepEqual(running,[...zhRoot,...ja2]);
 assert.deepEqual(scenes.ENGINES.qlie.originalLines(g.dir),[...ja1,...ja2]);
 const r=probeGame({dir:g.dir,executable:g.exe,title:'t'},{budgetMs:30000});
 assert.equal(r.step,'ok',JSON.stringify(r.engines));
 assert.equal(r.detail,'qlie');
 assert.equal(r.original,'layer');
 assert.equal(r.japaneseLines,ja1.length+ja2.length);
 const s=ot.scanRunning(g.root,'q',g.exe);
 assert.ok(s.original?.index,JSON.stringify(s));
 assert.equal(s.original.auto,true);
 assert.deepEqual(JSON.parse(fs.readFileSync(s.original.index,'utf8')).lines,[...ja1,...ja2]);
});

test('QLIE: GameData/data7.pack over data0.pack, loose scenario/*.s over data0.pack, and GameData/gamedata dedup adopt underlying Japanese',()=>{
 const F=require('./helpers/engine-fixtures-c.cjs'),qlie=require('../services/original-engines/qlie.cjs'),{probeGame}=require('../services/adapter-probe-core.cjs');
 const ja=[],zh=[];for(let i=0;i<10;i++){ja.push(...JA);zh.push(...ZH);}
 const sFile=lines=>lines.join('\r\n')+'\r\n';
 const gTwo=game(dir=>{
  writeTree(dir,{
   'GameData/data0.pack':F.qliePack({'s01.s':F.sjis(sFile(ja))},{version:'3.1'}),
   'GameData/data7.pack':F.qliePack({'s01.s':F.gbk(sFile(zh))},{version:'3.1'}),
  });
 });
 assert.deepEqual(scenes.read('qlie',gTwo.dir).flatMap(s=>s.lines),zh);
 assert.deepEqual(scenes.ENGINES.qlie.originalLines(gTwo.dir),ja);
 const rTwo=probeGame({dir:gTwo.dir,executable:gTwo.exe,title:'t'},{budgetMs:30000});
 assert.equal(rTwo.step,'ok',JSON.stringify(rTwo.engines));assert.equal(rTwo.original,'layer');assert.equal(rTwo.japaneseLines,ja.length);
 const deduped=qlie._internal.dedupFiles([path.join(gTwo.dir,'GameData','data0.pack'),path.join(gTwo.dir,'gamedata','data0.pack')]);
 if(process.platform==='win32')assert.equal(deduped.length,1);
 const gLoose=game(dir=>{
  writeTree(dir,{
   'GameData/data0.pack':F.qliePack({'s01.s':F.sjis(sFile(ja))},{version:'3.1'}),
   'GameData/scenario/s01.s':F.gbk(sFile(zh)),
  });
 });
 assert.deepEqual(scenes.read('qlie',gLoose.dir).flatMap(s=>s.lines),zh);
 assert.deepEqual(scenes.ENGINES.qlie.originalLines(gLoose.dir),ja);
});

test('QLIE: single Chinese pack, Chinese-over-Chinese packs, and plain Japanese pack do not mis-adopt originals',()=>{
 const F=require('./helpers/engine-fixtures-c.cjs'),{probeGame}=require('../services/adapter-probe-core.cjs');
 const ja=[],zh=[];for(let i=0;i<10;i++){ja.push(...JA);zh.push(...ZH);}
 const sFile=lines=>lines.join('\r\n')+'\r\n';
 const singleZh=game(dir=>{writeTree(dir,{'GameData/data0.pack':F.qliePack({'s01.s':F.gbk(sFile(zh))},{version:'3.1'})});});
 assert.equal(scenes.ENGINES.qlie.originalLines(singleZh.dir),null);
 const r1=probeGame({dir:singleZh.dir,executable:singleZh.exe,title:'t'},{budgetMs:30000});
 assert.equal(r1.step,'chinese-build');assert.equal(r1.original,null);
 const s1=ot.scanRunning(singleZh.root,'q1',singleZh.exe);assert.notEqual(s1.status,'ready');assert.ok(!s1.original);
 const zhOverZh=game(dir=>{
  writeTree(dir,{
   'GameData/data6.pack':F.qliePack({'s01.s':F.gbk(sFile(zh))},{version:'3.1'}),
   'GameData/data9.pack':F.qliePack({'s01.s':F.gbk(sFile(zh))},{version:'3.1'}),
  });
 });
 assert.equal(scenes.ENGINES.qlie.originalLines(zhOverZh.dir),null);
 const r2=probeGame({dir:zhOverZh.dir,executable:zhOverZh.exe,title:'t'},{budgetMs:30000});
 assert.equal(r2.step,'chinese-build');assert.equal(r2.original,null);
 const plainJa=game(dir=>{writeTree(dir,{'GameData/data0.pack':F.qliePack({'s01.s':F.sjis(sFile(ja))},{version:'3.1'})});});
 assert.equal(scenes.ENGINES.qlie.originalLines(plainJa.dir),null);
 const r3=probeGame({dir:plainJa.dir,executable:plainJa.exe,title:'t'},{budgetMs:30000});
 assert.equal(r3.step,'ok');assert.equal(r3.original,null);assert.equal(r3.japaneseLines,ja.length);
});
