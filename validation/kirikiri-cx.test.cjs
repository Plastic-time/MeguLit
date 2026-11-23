// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E282: cx-encrypted KiriKiri Z scene files (Steam 千恋＊万花 and others) are read without the game's key, and their own
// Chinese language slot lines up with the Japanese one.
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const psb=require('../services/original-engines/psb.cjs'),worker=require('../services/original-engines/cx-worker.cjs'),xp3=require('../services/original-engines/xp3.cjs');

const {buildPsb,arr}=require('./helpers/psb-writer.cjs');
const scene={name:'001・テスト.ks',scenes:[{label:'start',texts:[
 [null,null,[[null,'「[し]志[な]那[つ]都荘まで行って欲しいんですけど」'],[null,'To Shinatsu Inn, please.'],[null,'「请送我到志那都庄。」'],[null,'「請送我到志那都莊。」']]],
 ['将臣',null,[[null,'「………」'],['Masaomi','......'],['将臣','「……」'],['將臣','「……」']]],
 [null,null,[[null,'電車も走っておらず、\\n１時間に一本。'],[null,'No trains.'],[null,'这里没有电车，\\n一小时才一班。'],[null,'這裡沒有電車。']]]]}]};

function cxEncode(plain,split,k1=0x5a,k2=0xc3){
 const raw=Buffer.from(plain);
 for(let i=0;i<raw.length;i++)raw[i]^=i<split?k1:k2;
 return raw;
}
function writeXp3(file,entries){
 const parts=[],files=[];let at=19;
 const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;};
 const chunk=(tag,body)=>Buffer.concat([Buffer.from(tag,'latin1'),u64(body.length),body]);
 for(const {name,data} of entries){
  parts.push(data);
  const nm=Buffer.from(name,'utf16le'),info=Buffer.concat([Buffer.from([1,0,0,0]),u64(data.length),u64(data.length),Buffer.from([name.length,0]),nm]);
  const segm=Buffer.concat([Buffer.alloc(4),u64(at),u64(data.length),u64(data.length)]),adlr=Buffer.alloc(4);
  files.push(chunk('File',Buffer.concat([chunk('info',info),chunk('segm',segm),chunk('adlr',adlr)])));
  at+=data.length;
 }
 const idx=Buffer.concat(files);
 fs.writeFileSync(file,Buffer.concat([xp3.MAGIC,u64(at),...parts,Buffer.from([0]),u64(idx.length),idx]));
}

test('PSB writer and reader agree',()=>{
 const doc=psb.parse(buildPsb(scene));
 assert.deepStrictEqual(doc.root,scene);
});

test('cx: two XOR bytes split at a boundary plus a stray byte are undone without a key',()=>{
 const plain=buildPsb(scene),raw=Buffer.from(plain),entries=plain.readUInt32LE(36),split=entries-3,k1=0x5a,k2=0xc3;
 for(let i=0;i<raw.length;i++)raw[i]^=i<split?k1:k2;
 raw[0]^=0x77; // the first byte carries an extra XOR in these archives
 raw[entries+3]^=0x40; // and a stray byte past the boundary: here the width byte of the root's key array
 const doc=psb.openCx(raw);assert.ok(doc,'decrypted');
 assert.deepStrictEqual(doc.root,scene);
});

test('cx: stray byte in name table and UTF-8 key name with split past entries are still decrypted',()=>{
 const utf8Key=Buffer.from('extra日本語','utf8').toString('latin1');
 const utf8Scene={...scene,extraA:1,extraB:2,extraC:3,extraD:4,extraE:5,extraF:6,extraG:7,extraH:8,extraI:9,extraJ:10,[utf8Key]:'ok'};
 const plain=buildPsb(utf8Scene),names=plain.readUInt32LE(12),entries=plain.readUInt32LE(36);
 const raw=cxEncode(plain,entries+120);
 // Corrupt the first entry in nameIndexes (which is 'extraA', leaving 'scenes'/'texts'/'name' intact).
 const niOff=entries-2*(Object.keys(utf8Scene).length+4);
 raw[niOff+5]^=0x33;
 const doc=psb.openCx(raw);
 assert.ok(doc,'decrypted despite UTF-8 name and stray byte in name table');
 assert.strictEqual(doc.root['extra日本語'],'ok');
 assert.strictEqual(worker.textsOf(doc)[0].rows.length,3);
});

test('cx: stray bytes in PSB header (flags and offStrings) are repaired',()=>{
 const plain=buildPsb(scene),entries=plain.readUInt32LE(36);
 const withFlags=cxEncode(plain,entries-3);
 withFlags[6]^=0x91; // sets encrypted-header flag bit
 const doc1=psb.openCx(withFlags);
 assert.ok(doc1,'repaired header flags stray byte');
 assert.deepStrictEqual(doc1.root,scene);

 const withOffStrings=cxEncode(plain,entries-3);
 withOffStrings[17]^=0x02; // corrupts offStrings past WINDOW
 const doc2=psb.openCx(withOffStrings);
 assert.ok(doc2,'repaired header offStrings stray byte');
 assert.deepStrictEqual(doc2.root,scene);
});

test('cx-worker: skips non-scene assets when building archive cache',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cxskip-'));
 try{
  const scn=cxEncode(buildPsb(scene),64);
  const fakePsb=Buffer.alloc(128,0x11);fakePsb[1]=0x53;fakePsb[2]=0x42;fakePsb[3]=0x00;
  const f1=path.join(tmp,'data.xp3');
  writeXp3(f1,[{name:'scn/001.scn',data:scn},{name:'ui/menu.pimg',data:fakePsb},{name:'bg/a.png',data:fakePsb}]);
  const r1=worker.build(f1);
  assert.strictEqual(r1.docs.length,1);
  assert.strictEqual(r1.files,1,'only .scn entries are read when archive has .scn');

  const f2=path.join(tmp,'others.xp3');
  writeXp3(f2,[{name:'ui/menu.pimg',data:fakePsb},{name:'bg/a.png',data:fakePsb},{name:'script/boot.tjs',data:fakePsb}]);
  const r2=worker.build(f2);
  assert.strictEqual(r2.docs.length,0);
  assert.strictEqual(r2.files,0,'non-scene asset archive skips reading entries');
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

test('scene text: ruby and \\n markup removed, every language slot kept',()=>{
 const scenes=worker.textsOf({root:scene});
 assert.deepStrictEqual(scenes[0].rows[0],['「志那都荘まで行って欲しいんですけど」','To Shinatsu Inn, please.','「请送我到志那都庄。」','「請送我到志那都莊。」']);
 assert.strictEqual(scenes[0].rows[2][0],'電車も走っておらず、\n１時間に一本。');
});

test('game ruby: neighbouring readings make one word, space-padded group readings join',()=>{
 assert.deepStrictEqual(worker.rubyOf('「[し]志[な]那[つ]都荘まで」'),[['志那都','しなつ']]);
 assert.deepStrictEqual(worker.rubyOf('[くら]鞍[ま]馬[　げんじ　]玄[　ゅう]十[　ろう]郎'),[['鞍馬','くらま'],['玄十郎','げんじゅうろう']]);
 assert.deepStrictEqual(worker.rubyOf('ルビなし'),[]);
 const {ENGINES}=require('../services/original-engines/scenes.cjs'),doc={entry:'x',name:'001',scenes:worker.textsOf({root:scene})};
 assert.deepStrictEqual(ENGINES['kirikiri-cx'].parse(Buffer.from(JSON.stringify(doc))).ruby,[[['志那都','しなつ']],null,null]);
});

test('script ruby reaches the hook line (game readings before dictionary ones)',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','core','hook-native.cjs'),'utf8');
 assert.match(src,/if\(this\.originalText\?\.kind==='patch'\)\{const r=this\.resolveSource\(text\);if\(r&&Array\.isArray\(r\.ruby\)/);
});

test('kirikiri-cx engine: the Simplified Chinese slot is the translation of the Japanese line',()=>{
 const {ENGINES}=require('../services/original-engines/scenes.cjs'),eng=ENGINES['kirikiri-cx'];
 const doc={entry:'x',name:'001',scenes:worker.textsOf({root:scene})},parsed=eng.parse(Buffer.from(JSON.stringify(doc)));
 assert.strictEqual(parsed.lines[1],'「………」');
 const list=eng.patchLines([{name:'001',...parsed}]);
 assert.strictEqual(list[0].lines[0],'「请送我到志那都庄。」');
});

// Real data when this machine has it.
const senren=path.join('E:/','GAL','SenrenBanka');
test('千恋＊万花 (Steam): Japanese lines get the release\'s own Chinese',{skip:!fs.existsSync(path.join(senren,'scn.xp3'))&&'no local copy',timeout:1800000},async()=>{
 const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(':memory:');db.exec('CREATE TABLE games(id TEXT,executable TEXT,removed_at TEXT)');
 const exe=path.join(senren,'SenrenBanka.exe');db.prepare('INSERT INTO games VALUES(?,?,NULL)').run('1',exe);
 const ot=require('../services/original-text.cjs'),sc=require('../services/original-engines/scenes.cjs'),data=fs.mkdtempSync(path.join(os.tmpdir(),'cx-'));
 ot.scanRunning(data,'1',exe);while(sc.cxBuilds.size)await new Promise(r=>setTimeout(r,1000));
 assert.strictEqual(ot.scanRunning(data,'1',exe).runtime.engine,'kirikiri-cx');
 const r=await ot.autoPatch(data,db,'1',{drives:false,force:true});assert.ok(r.found,JSON.stringify(r));
 assert.strictEqual(ot.provider(data,exe).resolve('明るい笑顔を浮かべながら手を振っているこの人は、馬庭芦花。').translation,'眼前这位笑容爽朗，正冲着我挥手的女性叫作马庭芦花。');
 assert.deepStrictEqual(ot.provider(data,exe).resolve('「すみません、客じゃないんです。鞍馬玄十郎はいますか？」').ruby,[['鞍馬','くらま'],['玄十郎','げんじゅうろう']]);
});
