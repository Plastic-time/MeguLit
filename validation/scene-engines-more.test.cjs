'use strict';
// E330 AQUAPLUS KCAP (WHITE ALBUM2), E331 NScripter, E329 YU-RIS scripts outside ysbin.ypf (euphoria: pac\bn.ypf).
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const scenes=require('../services/original-engines/scenes.cjs');

function encoder(label){const dec=new TextDecoder(label),map=new Map();
 for(let a=0x81;a<=0xfe;a++)for(let b=0x40;b<=0xfe;b++){const ch=dec.decode(Buffer.from([a,b]));if(ch.length===1&&ch!=='\ufffd'&&!map.has(ch))map.set(ch,Buffer.from([a,b]));}
 return t=>Buffer.concat(Array.from(t,ch=>ch.charCodeAt(0)<0x80?Buffer.from(ch,'latin1'):map.get(ch)));}
const sjis=encoder('shift_jis'),gbk=encoder('gbk');
function put(dir,files){for(const [rel,data] of Object.entries(files)){const f=path.join(dir,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,data);}}
const tmp=p=>fs.mkdtempSync(path.join(os.tmpdir(),p));

// Leaf LZSS with literals only: a flag byte 0xFF before every 8 bytes.
function literals(data){const out=[];for(let i=0;i<data.length;i+=8){out.push(0xff,...data.subarray(i,i+8));}return Buffer.from(out);}
function kcap(files){const index=[],blobs=[];let off=16+files.length*44;
 for(const [name,data,compressed] of files){const body=compressed?Buffer.concat([Buffer.alloc(8),literals(data)]):data;if(compressed){body.writeUInt32LE(body.length,0);body.writeUInt32LE(data.length,4);}
  const e=Buffer.alloc(44);e.writeUInt32LE(compressed?1:0,0);e.write(name,4,'latin1');e.writeUInt32LE(data.length,32);e.writeUInt32LE(off,36);e.writeUInt32LE(body.length,40);off+=body.length;index.push(e);blobs.push(body);}
 const head=Buffer.alloc(16);head.write('KCAP',0,'latin1');head.writeUInt32LE(files.length,12);return Buffer.concat([head,...index,...blobs]);}

test('AQUAPLUS: script.pak string tables read as text lines, ruby kept, ASCII strings as anchors',()=>{
 const dir=tmp('aqua-');
 put(dir,{'WA2.exe':'x','script.pak':kcap([['1001.bnr',Buffer.from([1,2,3]),true],['1001.txt',sjis(',mv01,「あ…」,<W>とうとう、降ってきた。,sepia.AMP,<R空港|ここ>に着いたときから、\\nいつ泣き出すかもしれなかった空は。,'),true],['GFLAG.dat',Buffer.from('x'),false]])});
 assert.strictEqual(scenes.detect(dir),'aquaplus');
 const list=scenes.read('aquaplus',dir);assert.deepStrictEqual(list.map(s=>s.name),['1001.txt']);
 assert.deepStrictEqual(list[0].lines,['「あ…」','とうとう、降ってきた。','空港に着いたときから、\nいつ泣き出すかもしれなかった空は。']);
 assert.deepStrictEqual(list[0].anchors,['mv01','sepia.AMP']);
 assert.deepStrictEqual(list[0].ruby[2],[['空港','ここ']]);
 fs.rmSync(dir,{recursive:true,force:true});
});

// E344 WHITE ALBUM2 Chinese patch: ck-gal.pak keeps Shift-JIS codes, fon.pak redraws cells 748+ with Chinese glyphs.
const aquaplus=require('../services/original-engines/aquaplus.cjs');
function patchEncoder(){const map=new Map();for(let a=0x81;a<=0x9f;a++)for(let b=0x40;b<=0xfc;b++){const ch=aquaplus._internal.patchDecode(Buffer.from([a,b]));if(ch.length===1&&!map.has(ch))map.set(ch,Buffer.from([a,b]));}
 return t=>Buffer.concat(Array.from(t,ch=>ch.charCodeAt(0)<0x80?Buffer.from(ch,'latin1'):map.get(ch)||sjis(ch)));}
const fonPak=sizes=>kcap(sizes.map((n,i)=>['f'+i+'.tga',Buffer.alloc(n),false]));
test('AQUAPLUS: the WA2 Chinese patch (ck-gal.pak + its fon.pak) reads through the glyph table, other fonts are refused',()=>{
 const dir=tmp('aqua-zh-'),zh=patchEncoder();
 assert.strictEqual(aquaplus._internal.cell(0x889f),748);assert.strictEqual(aquaplus._internal.cell(0x8140),139);
 assert.strictEqual(aquaplus._internal.patchDecode(Buffer.from([0x88,0x9f,0x88,0xa0])),'一丁');
 const ja=',mv01,a.tga,b.tga,c.tga,d.tga,「あ…」,<W>とうとう、降ってきた。,春希,',cn=',mv01,a.tga,b.tga,c.tga,d.tga,「啊…」,<W>终于，还是下起来了。,春希,';
 put(dir,{'WA2.exe':'x','script.pak':kcap([['1001.txt',sjis(ja),true],['1002.txt',sjis(ja),true]]),
  'ck-gal.pak':kcap([['1001.txt',zh(cn),true],['1002.txt',zh(cn.replace('d.tga,','')),true]]),'fon.pak':fonPak([833652,724679,3302082,1918771])});
 const base=scenes.read('aquaplus',dir),found={files:new Map([['ck-gal.pak',{name:'ck-gal.pak',path:path.join(dir,'ck-gal.pak')}]]),dirs:[dir]};
 const list=aquaplus.patchLines(base,found);
 assert.deepStrictEqual(list[0].lines,['「啊…」','终于，还是下起来了。','春希']);assert.ok(list[0].patched);
 assert.strictEqual(list[1].skipped,'anchors');
 fs.writeFileSync(path.join(dir,'fon.pak'),fonPak([833652,724679,3302082,1918772]));
 assert.strictEqual(aquaplus.patchLines(base,found),null);
 fs.rmSync(dir,{recursive:true,force:true});
});

const NS=body=>'*define\ncaption "test"\ngame\n*start\n'+body;
test('NScripter: label blocks pair a Chinese 0.txt with the Japanese nscript.dat (zero-latency translation)',async()=>{
 const base=tmp('ns-'),game=path.join(base,'game');
 const ja=NS('*s20\nbg black,1\n目が覚めると病院のベッドの上だった。@カーテンがゆれている。\\\n!w500「はじめまして、遠野志貴くん」\\\n*s21\nあのこうえんまであるいていこう。\\\n'),
  zh=NS('*s20\nbg black,1\n醒来时发现自己正躺在医院的病床上。@窗帘缓缓地飘动着。\\\n!w500「初次见面，远野志贵君」\\\n*s21\n走到那个公园去吧。\\\n');
 const dat=Buffer.from(sjis(ja).map(c=>c^0x84));
 put(game,{'Tsukihime.exe':'x','nscript.dat':dat,'.megulit-japanese-import/files/0.txt':gbk(zh)});
 assert.strictEqual(scenes.detect(game),'nscripter');
 const list=scenes.read('nscripter',game),s20=list.find(s=>s.name==='*s20');
 assert.deepStrictEqual(s20.lines,['目が覚めると病院のベッドの上だった。','カーテンがゆれている。','「はじめまして、遠野志貴くん」']);
 assert.deepStrictEqual(s20.anchors,['*s20']);
 const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(':memory:');db.exec('CREATE TABLE games(id TEXT,executable TEXT,removed_at TEXT)');
 db.prepare('INSERT INTO games VALUES(?,?,NULL)').run('1',path.join(game,'Tsukihime.exe'));
 const ot=require('../services/original-text.cjs'),data=path.join(base,'data'),r=await ot.autoPatch(data,db,'1',{drives:false,force:true});
 assert.ok(r.found,JSON.stringify(r));
 assert.strictEqual(ot.provider(data,path.join(game,'Tsukihime.exe')).resolve('カーテンがゆれている。').translation,'窗帘缓缓地飘动着。');
 fs.rmSync(base,{recursive:true,force:true});
});

test('NScripter: a text file that is not an NScripter script is not read',()=>{
 const dir=tmp('ns-no-');put(dir,{'0.txt':'あいうえお\n','game.exe':'x'});
 assert.deepStrictEqual(scenes.ENGINES.nscripter.scenes(dir),[]);fs.rmSync(dir,{recursive:true,force:true});
});

// Real installs (skipped elsewhere).
const WA2='E:\\GAL\\WHITE ALBUM2',EU='E:\\GAL\\euphoria\\euphoria';
test('real data: WHITE ALBUM2 script.pak reads as Japanese',{skip:!fs.existsSync(path.join(WA2,'script.pak'))&&'not installed'},()=>{
 const ot=require('../services/original-text.cjs'),loc=ot.locate(WA2,'WA2');assert.strictEqual(loc&&loc.engine,'aquaplus');
 const lines=ot.readScript(loc).lines;assert.ok(lines.length>100000);assert.ok(lines.includes('とうとう、降ってきた。'));
});
test('real data: WHITE ALBUM2 Chinese patch pairs every scene',{skip:!fs.existsSync(path.join(WA2,'ck-gal.pak'))&&'patch not installed'},()=>{
 const base=scenes.read('aquaplus',WA2),list=aquaplus.patchLines(base,{files:new Map(),dirs:[WA2]});
 assert.ok(list);assert.strictEqual(list.filter(s=>s.patched).length,base.length);
 const s=list.find(x=>x.name==='1001.txt');assert.strictEqual(s.lines[1],'终于，还是下起来了。');
 const ot=require('../services/original-text.cjs'),lines=list.flatMap(x=>x.lines);assert.ok(lines.filter(t=>ot.japaneseLine(t)).length<50);
});
test('real data: euphoria scripts in pac\\bn.ypf are found',{skip:!fs.existsSync(path.join(EU,'pac','bn.ypf'))&&'not installed'},()=>{
 const ot=require('../services/original-text.cjs'),loc=ot.locate(EU,'euphoria');assert.strictEqual(loc&&loc.engine,'yuris');
 const lines=ot.readScript(loc).lines;assert.ok(lines.length>30000);assert.ok(lines.filter(t=>ot.japaneseLine(t)).length>lines.length*.5);
});
