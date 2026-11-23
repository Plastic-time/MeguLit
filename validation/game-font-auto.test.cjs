'use strict';
/* 2026-11-19 (user: "这些字体…可以通过读内存来获取并使用吧 怎么没实装？给我自动装上 校准的时候也要自动去换 手动点查找的时候也要自动去找";
   "扫描游戏字体现在基本上无法使用"; then "别描边"). 千恋＊万花 showed 未发现可导入的游戏字体文件: its dialogue font is a KiriKiri
   pre-rendered glyph file inside the encrypted data.xp3 (font/font1_<size>.tft, "スキップ"), next to outline fonts in the
   same archive. Fixtures: a pre-rendered font and an outline font in an xp3, a font the game registered in memory (font
   probe), and a game that only names its face. A pre-rendered face is recognised among real fonts, never traced. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const ROOT=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const pf=require('../core/prerendered-font.cjs'),gf=require('../core/game-fonts.cjs');
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'megulit-gamefont-'));
/* a Japanese outline font of this PC for the fixtures (one face of a collection) */
const JA=['YuGothR.ttc','YuGothM.ttc','msgothic.ttc','meiryo.ttc','msmincho.ttc'].map(n=>path.join(process.env.SystemRoot||'C:/Windows','Fonts',n)).find(f=>fs.existsSync(f));
const jaFace=()=>gf.collectionFaces(fs.readFileSync(JA))[0];

/* a pre-rendered font: kana and a few kanji, each a ring of ink (run-length coded, version 1) */
function tft(size,codes){const glyphs=codes.map(code=>{const w=size-4,h=size-4,px=Buffer.alloc(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const edge=Math.min(x,y,w-1-x,h-1-y);px[y*w+x]=edge<Math.max(2,size>>3)?64:0;}
  const rle=[];for(let i=0;i<px.length;){let j=i+1;while(j<px.length&&px[j]===px[i]&&j-i<0x3f)j++;rle.push(px[i]);if(j-i>1)rle.push(0x40+(j-i-1));i=j;}return {code,w,h,data:Buffer.from(rle)};});
 const head=Buffer.alloc(36);head.write('TVP pre-rendered font\x1a',0,'latin1');head[22]=1;head[23]=2;head.writeUInt32LE(glyphs.length,24);
 const codesAt=36,itemsAt=codesAt+glyphs.length*2,dataAt=itemsAt+glyphs.length*20;head.writeUInt32LE(codesAt,28);head.writeUInt32LE(itemsAt,32);
 const codeBuf=Buffer.alloc(glyphs.length*2),items=Buffer.alloc(glyphs.length*20),datas=[];let at=dataAt;
 glyphs.forEach((g,i)=>{codeBuf.writeUInt16LE(g.code,i*2);const o=i*20;items.writeUInt32LE(at,o);items.writeUInt16LE(g.w,o+4);items.writeUInt16LE(g.h,o+6);items.writeInt16LE(2,o+8);items.writeInt16LE(size-6,o+10);items.writeInt16LE(size,o+12);items.writeInt16LE(0,o+14);items.writeInt16LE(size,o+16);datas.push(g.data);at+=g.data.length;});
 return Buffer.concat([head,codeBuf,items,...datas]);}
const KANA=[...Array(90)].map((_,i)=>0x3042+i),KANJI=[0x4e00,0x4eba,0x65e5,0x672c];
/* a plain (unencrypted) XP3: header, entries, index with File/info/segm/adlr chunks */
function xp3(entries){const magic=Buffer.from([0x58,0x50,0x33,0x0d,0x0a,0x20,0x0a,0x1a,0x8b,0x67,0x01]);let at=11+8;const blobs=[],files=[];
 for(const [name,data] of entries){const nm=Buffer.from(name,'utf16le'),info=Buffer.alloc(22+nm.length);info.writeUInt32LE(0,0);info.writeBigUInt64LE(BigInt(data.length),4);info.writeBigUInt64LE(BigInt(data.length),12);info.writeUInt16LE(name.length,20);nm.copy(info,22);
  const segm=Buffer.alloc(28);segm.writeUInt32LE(0,0);segm.writeBigUInt64LE(BigInt(at),4);segm.writeBigUInt64LE(BigInt(data.length),12);segm.writeBigUInt64LE(BigInt(data.length),20);const adlr=Buffer.alloc(4);
  const chunk=(tag,b)=>{const h=Buffer.alloc(12);h.write(tag,0,'latin1');h.writeBigUInt64LE(BigInt(b.length),4);return Buffer.concat([h,b]);};
  files.push(chunk('File',Buffer.concat([chunk('info',info),chunk('segm',segm),chunk('adlr',adlr)])));blobs.push(data);at+=data.length;}
 const index=Buffer.concat(files),flag=Buffer.alloc(9);flag[0]=0;flag.writeBigUInt64LE(BigInt(index.length),1);const off=Buffer.alloc(8);off.writeBigUInt64LE(BigInt(at));
 return Buffer.concat([magic,off,...blobs,flag,index]);}

test('a pre-rendered glyph file gives a match sample: kana and kanji cropped to their ink and scaled to 32x32',()=>{
 const s=pf.sample(tft(40,[...KANA,...KANJI]));assert.ok(s);assert.equal(s.cell,40);assert.equal(s.total,94);
 assert.ok(s.chars.length>=20&&s.chars.length===s.glyphs.length);const g=Buffer.from(s.glyphs[0],'base64');assert.equal(g.length,32*32);
 assert.equal(g[0],255,'the ring touches the ink box corner');assert.equal(g[16*32+16],0,'the hole stays empty');
 assert.equal(pf.sample(Buffer.from('not a font')),null);
 assert.doesNotMatch(read('core/prerendered-font.cjs'),/toTrueType|function trace|glyf/,'no traced copy of the bitmaps (user: 别描边)');
});
test('KiriKiri: fonts inside the xp3 are read; a pre-rendered dialogue face is recognised among real fonts, the game\'s own outline font included',{skip:!JA&&'no Japanese font on this PC'},()=>{
 const dir=tmp(),cache=tmp(),outline=jaFace();
 const list=Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from('(const)%[ "name"=>"テスト丸ゴ", "file"=>"main_${size}.tft" ]\n(const)%[ "name"=>"*システム", "file"=>"sys_10.tft" ]\n','utf16le')]);
 fs.writeFileSync(path.join(dir,'data.xp3'),xp3([['startup.tjs',Buffer.from([0xff,0xfe,0x41,0])],['font/main_20.tft',tft(20,[...KANA,...KANJI])],['font/main_40.tft',tft(40,[...KANA,...KANJI])],['font/sys_10.tft',tft(10,KANA)],['font/sys_12.tft',tft(12,KANA)],['font/sys_14.tft',tft(14,KANA)],['font/fontlist.tjs',list],['font/game.ttf',outline]]));
 const scan=require('../core/engine-font-scan.cjs');let job=null;
 /* the matcher gets the sample and the game's outline font; it answers that font, close enough to count as the face */
 const r=scan.scan(dir,cache,{matcher:j=>{job=j;return [{family:gf.familyName(outline),style:'Regular',score:0.93,file:j.files[0]},{family:'MS Gothic',style:'Regular',score:0.81}];}});
 assert.equal(r.engine,'kirikiri');assert.ok(job&&job.chars.length>=20&&job.files.length===1,'sample and the game\'s outline font go to the matcher');
 assert.deepEqual(r.prerendered.sizes,[20,40]);assert.equal(r.prerendered.family,'テスト丸ゴ','named as the game\'s font list names it (not the UI family)');
 assert.equal(r.face,gf.familyName(outline));assert.equal(r.match.recognized,true);assert.match(r.reason,/main_40\.tft .* recognised as /);
 assert.ok(r.files.some(f=>r.labels[f]==='data.xp3 › font/game.ttf'),'the recognised game font is imported with its archive source');
 /* below the line: the closest one, said as such */
 const near=scan.scan(dir,cache,{matcher:()=>[{family:'Yu Gothic UI',style:'Bold',score:0.82}]});
 assert.equal(near.face,'Yu Gothic UI');assert.equal(near.match.recognized,false);assert.equal(near.bold,true);assert.match(near.reason,/closest Yu Gothic UI 0\.820/);
 assert.ok(scan.RECOGNISED>=0.88&&scan.RECOGNISED<=0.95);
 for(const d of [dir,cache])fs.rmSync(d,{recursive:true,force:true});
});
test('a font the game registered in memory is imported and labelled as memory; sources are noted without resending font data',{skip:!JA&&'no Japanese font on this PC'},async()=>{
 const dir=tmp(),cfg=tmp(),cache=tmp();fs.writeFileSync(path.join(dir,'game.exe'),'MZ');let light=null;
 const fonts=new gf.GameFonts({config:cfg,cache},(_,l)=>{light=l;},async()=>path.join(dir,'game.exe'));await fonts.detect(1);
 assert.equal(fonts.current.fonts.length,0);assert.deepEqual(fonts.current.sources.folder,{found:0});
 const mem=path.join(cache,'mem-0badf00d.ttf');fs.writeFileSync(mem,jaFace());
 const added=fonts.addFile(mem,'mem');assert.equal(added.length,1);assert.equal(added[0].lang,'ja');assert.match(added[0].source,/^内存 /);
 assert.equal(fonts.addFile(path.join(cache,'missing.ttf'),'archive','data.xp3 › font/x.ttf'),null,'a missing file adds nothing');
 const payload=fonts.payload(false);assert.equal(payload.fonts[0].loaded,'mem');assert.equal(payload.fonts[0].data,'');
 fonts.note('engine',{face:'ＭＳ ゴシック'});assert.equal(fonts.current.sources.engine.face,'ＭＳ ゴシック');assert.equal(light,true,'a note is a light update');
 for(const d of [dir,cfg,cache])fs.rmSync(d,{recursive:true,force:true});
});
test('only a face name: the reader uses the installed font of that name; a game font of the same family wins',()=>{
 const ef=require('../core/engine-font.cjs');
 assert.deepEqual(ef.pick({face:'ＭＳ 明朝'}),{key:'engine:ＭＳ 明朝',face:'ＭＳ 明朝',reason:'face'});
 assert.equal(ef.pick({face:'テスト丸ゴ',fonts:[{id:'abc',lang:'ja',family:'テスト丸ゴ'}]}).key,'game:abc');
});
test('three moments run every source and apply it unless the user picked a font by hand',()=>{
 const reader=read('services/reader.cjs');
 assert.match(reader,/this\.confirmGameFont\('bind'\)/,'when a game is bound');
 assert.match(reader,/case 'gameFontsRescan':if\(this\.gamePid\)await this\.confirmGameFont\('rescan',\{force:true\}\)/,'重新查找游戏字体 ignores the caches');
 assert.match(reader,/message\.type==='dialogCalibration'&&message\.success===true[^\n]*this\.confirmGameFont\('calibration'\)/,'after a calibration');
 const c=reader.slice(reader.indexOf('async confirmGameFont('),reader.indexOf(' probeFonts(){'));
 for(const step of ['this.fonts.detect(pid,force)','this.probeFonts()','this.engineFontScan(pid,{force})'])assert.ok(c.includes(step),step);
 assert.ok(c.indexOf("japaneseFontSource==='user'")<c.indexOf('this.followGameFont()'),'a hand-picked font is kept');
 assert.match(c,/no source gave a font/,'nothing found: no default face is forced');
});
test('the font panel names the font and its source, says when it is only the closest to pre-rendered glyphs, or lists what was tried',()=>{
 const ui=read('web/reader/modules/game-fonts-ui.js');
 for(const k of ['folder','archive','registered','engine'])assert.match(ui,new RegExp("parts\\.push\\(s\\('"+k+"'\\)"));
 assert.match(ui,/title:s\('using'\)\+hit\.family,detail:s\('from'\)\+sourceOf\(hit\)/);
 assert.match(ui,/closest:'游戏用的是预渲染字形，已选用最接近的字体：'/);
 assert.match(ui,/\(m\.recognized\?s\('recognised'\):s\('closest'\)\)\+m\.family/);
 assert.match(ui,/title:s\('none'\)[^}]*tried\(\)/);
});
test('game fonts never leave this PC: probe bundles skip every font kind, archives with font heads get their filter',()=>{
 const probe=require('../services/probe-full.cjs');
 for(const head of ['TVP pre-rendered font\x1a','ttcf\0\x02\0\0','\0\x01\0\0\0\x10','OTTO\0\x10','wOF2'])assert.ok(probe.isMediaBytes(Buffer.from(head,'latin1')),JSON.stringify(head));
 for(const n of ['font/font1_56.tft','a.otc','b.woff2','c.ttf'])assert.ok(probe.isMediaName(n),n);
 assert.match(read('services/original-engines/cx-filter.cjs'),/const HEAD=[^\n]*\\xfe\\xfe\[\\x00-\\x02\]\\xff\|TVP \|OTTO\|\\x00\\x01\\x00\\x00\|ttcf/);
 assert.match(read('services/font-match.ps1'),/PrivateFontCollection/,'the game\'s fonts are matched from the cache, never installed');
});
test('other engines: font entries of their archives come through GARbro, only when that pack is installed (a font scan never downloads it)',()=>{
 const scan=read('core/engine-font-scan.cjs'),g=read('services/original-engines/garbro.cjs');
 assert.match(scan,/function garbroArchives\(root\)\{try\{const g=require\('\.\.\/services\/original-engines\/garbro\.cjs'\);return g\.installed\(\)\?/);
 assert.match(scan,/if\(garbroArchives\(root\)\.length\)return 'archive';/);
 assert.match(g,/function extractMatchSync\(file,out,match,[^)]*\)\{if\(!installed\(\)\)return \[\];/);
});
