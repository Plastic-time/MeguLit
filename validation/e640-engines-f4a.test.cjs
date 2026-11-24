'use strict';
/* E640–E654 family F4a: Escude, PJADV, Luca System, Stuff (Propeller .msc), AI5WIN (full grammar), STCM2L, Willadv, and
   the archive + generic scan engines (ISM, GLib2, Cyberworks, Tanuki, Yaneurao, Rits, BlueGale, DxLib, SLG System),
   tested on synthetic game folders (validation/helpers/engine-fixtures-f4a.cjs): each builds a Japanese game and a
   Chinese (GBK / UTF-8 / UTF-16) patch and checks 1:1 pairing. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const F=require('./helpers/engine-fixtures-f4a.cjs');
const scenes=require('../services/original-engines/scenes.cjs'),library=require('../core/library.cjs');
const E=n=>require('../services/original-engines/'+n+'.cjs');
const escude=E('escude'),pjadv=E('pjadv'),luca=E('luca'),stuff=E('stuff'),silky=E('silky'),stcm2=E('stcm2'),scan=E('archive-scan');
const {sjis,gbk}=F,kit=E('kit');
const tmp=t=>{const r=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'e640-'));t.after(()=>fs.rmSync(r,{recursive:true,force:true}));return r;};
const put=(dir,rel,buf)=>{const f=path.join(dir,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,buf);return f;};
const pairs=(own,zh)=>{assert.equal(zh.length,own.length,'line counts differ');return own.map((o,i)=>[o,zh[i]]);};
const JA=['「おはよう」と彼女は言った。','今日はいい天気ですね。','ありがとう、また明日。'],ZH=['“早上好”她说道。','今天天气真好啊。','谢谢，明天见。'];

/* ---- Escude --------------------------------------------------------------------------------------------------------- */
const ESCUDE_PAIRS=[
 ['!','！'],['?','？'],['\uf8f0','　'],['｡','。'],['｢','「'],['｣','」'],['､','、'],['･','…'],
 ['ｦ','を'],['ｧ','ぁ'],['ｨ','ぃ'],['ｩ','ぅ'],['ｪ','ぇ'],['ｫ','ぉ'],['ｬ','ゃ'],['ｭ','ゅ'],['ｮ','ょ'],['ｯ','っ'],['ｰ','ー'],
 ['ｱ','あ'],['ｲ','い'],['ｳ','う'],['ｴ','え'],['ｵ','お'],['ｶ','か'],['ｷ','き'],['ｸ','く'],['ｹ','け'],['ｺ','こ'],
 ['ｻ','さ'],['ｼ','し'],['ｽ','す'],['ｾ','せ'],['ｿ','そ'],['ﾀ','た'],['ﾁ','ち'],['ﾂ','つ'],['ﾃ','て'],['ﾄ','と'],
 ['ﾅ','な'],['ﾆ','に'],['ﾇ','ぬ'],['ﾈ','ね'],['ﾉ','の'],['ﾊ','は'],['ﾋ','ひ'],['ﾌ','ふ'],['ﾍ','へ'],['ﾎ','ほ'],
 ['ﾏ','ま'],['ﾐ','み'],['ﾑ','む'],['ﾒ','め'],['ﾓ','も'],['ﾔ','や'],['ﾕ','ゆ'],['ﾖ','よ'],
 ['ﾗ','ら'],['ﾘ','り'],['ﾙ','る'],['ﾚ','れ'],['ﾛ','ろ'],['ﾜ','わ'],['ﾝ','ん'],['ﾞ','゛'],['ﾟ','゜'],
];
const ESCUDE_TO_INNER=new Map(ESCUDE_PAIRS.map(([i,o])=>[o,i]));
const escr1Bytes=s=>Buffer.concat([...s].map(c=>{const i=ESCUDE_TO_INNER.get(c);if(i==='\uf8f0')return Buffer.from([0xa0]);return kit.encodeSjis(i||c);}));
test('Escude: ESC-ARC2 / ESC-ARC1 index cipher, acp LZW, ESCR1_00 strings (half-width hiragana mapped back), ESCR_NEW .001',t=>{
 assert.equal(escude.lzw(F.acp(Buffer.from('hello acp')).subarray(8),9).toString(),'hello acp');
 const s1=F.escr1(['bg01',...JA,'se_02'],escr1Bytes),s2=F.escr1(['真琴','きょうもがんばろう。'],escr1Bytes);
 const game=tmp(t);put(game,'script.bin',F.escArc({'scr/0001.bin':s1,'scr/0002.bin':F.acp(s2)}));put(game,'gpr.bin',Buffer.alloc(32,1));
 assert.equal(library.engineOf(game)?.name,'Escude');assert.equal(scenes.detect(game),'escude');
 const v1=tmp(t);put(v1,'script.bin',F.escArc({'0001.bin':s1},{version:1}));assert.deepEqual(escude.list(path.join(v1,'script.bin')).map(e=>e.name),['0001.bin']);
 const own=scenes.read('escude',game).filter(s=>s.lines.length);assert.equal(own.length,2);
 assert.deepEqual(own[0].lines,JA);assert.deepEqual(own[0].anchors,['bg01','se_02']);assert.deepEqual(own[1].lines,['真琴','きょうもがんばろう。']);
 const patch=tmp(t);put(patch,'0001.bin',F.escr1(['bg01',...ZH,'se_02'],gbk));
 const zh=scenes.ENGINES.escude.archives(patch).map(s=>escude.parse(s.read())).filter(p=>p.lines.length);pairs(own[0].lines,zh[0].lines);assert.equal(zh[0].lines[0],ZH[0]);
 /* ESCR_NEW: the messages live in <name>.001 */
 const mess=escude.parse(F.escrMess(JA));assert.deepEqual(mess.lines,JA);pairs(mess.lines,escude.parse(F.escrMess(ZH,gbk)).lines);
 assert.deepEqual(escude.parse(Buffer.alloc(40,3)).lines,[]);
});
test('Escude: ESCR1_00 half-width kana, punctuation, voiced marks, and 0xA0 full-width space align 1:1',()=>{
 /* independent of PAIRS: raw ESCR1_00 bytes 0x21, 0x3F, 0xA0, 0xA1..0xDF must parse to acpx_script.py external literal */
 const rawAll=Buffer.from([0x21,0x3f,0xa0,...Array.from({length:0xdf-0xa1+1},(_,i)=>0xa1+i)]);
 const expectedExternal='！？　。「」、…をぁぃぅぇぉゃゅょっーあいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわん゛゜';
 assert.deepEqual(escude.parse(F.escr1([rawAll],b=>b)).lines,[expectedExternal]);
 /* single-byte 0xA0 becomes full-width space while Shift-JIS 2-byte pairs (82 A0, 9F A0, E0 A0, FC 4B) and a trailing dangling lead byte stay intact */
 const mixed=Buffer.from([0x82,0xa0,0x9f,0xa0,0xe0,0xa0,0xfc,0x4b,0xa0,0xa6,0xa7,0xb1,0xde,0xdf]);
 const dangling=Buffer.from([0xa0,0x90,0x5e,0x82]);
 assert.deepEqual(escude.parse(F.escr1([mixed,dangling],b=>b)).lines,['あ泛燿黑　をぁあ゛゜','真\ufffd']);
 assert.equal(escude.restring('!?｡｢｣､･ｦｧｱﾝﾞﾟ'),'！？。「」、…をぁあん゛゜');
});
test('Escude: ESCR1_00 ASCII-only !/? lines map to full-width dialogue and pair 1:1 with GBK patches while anchors stay anchors',t=>{
 const ja=F.escr1(['bg01','ev_!01','x!','?param','!0','  \\n ','！？','！','？','！ ？','！\t','！？\\n！！','「おはよう」','se_02'],escr1Bytes);
 const r=escude.parse(ja);
 assert.deepEqual(r.lines,['！？','！','？','！ ？','！','！？\n！！','「おはよう」']);
 assert.deepEqual(r.anchors,['bg01','ev_!01','x!','?param','!0','  \\n ','se_02']);
 /* standalone 0x21 0x3F script (no bytes >= 0x80 at all) still parses as full-width dialogue */
 assert.deepEqual(escude.parse(F.escr1([Buffer.from([0x21,0x3f])],b=>b)).lines,['！？']);
 /* GBK patch: both full-width !? and ACPXScriptTool-assembled ASCII !? count as lines and pair 1:1 via scenes.read overlay */
 const zhFull=escude.parse(F.escr1(['bg01','ev_!01','！？','！','？','！ ？','！\t','！？\\n！！','“早上好”','se_02'],gbk));
 assert.equal(zhFull.lines.length,r.lines.length);
 assert.deepEqual(escude.parse(F.escr1(['今天天气真好。','!?'],gbk)).lines,['今天天气真好。','!?']);
 const game=tmp(t);put(game,'script.bin',F.escArc({'scr/0001.bin':F.escr1(['bg01','!?',...JA,'se_02'],escr1Bytes)}));
 const zhAscii=F.escr1(['bg01','!?',...ZH,'se_02'],gbk);
 const over=scenes.read('escude',game,new Map([['0001.bin',zhAscii]]));
 assert.equal(over[0].patched,true);assert.deepEqual(over[0].lines,['!?',...ZH]);
 assert.deepEqual(scenes.read('escude',game)[0].lines,['！？',...JA]);
 /* ESCR_NEW keeps ASCII !? as an anchor */
 assert.deepEqual(escude.parse(F.escrMess(['こんにちは','!?'])).anchors,['!?']);
});
test('Escude: ESCR1_00 half-width kana + voiced/semi-voiced marks compose into precomposed hiragana',t=>{
 const dakuBytes=Buffer.from([
  0xb3,0xde,
  0xb6,0xde,0xb7,0xde,0xb8,0xde,0xb9,0xde,0xba,0xde,
  0xbb,0xde,0xbc,0xde,0xbd,0xde,0xbe,0xde,0xbf,0xde,
  0xc0,0xde,0xc1,0xde,0xc2,0xde,0xc3,0xde,0xc4,0xde,
  0xca,0xde,0xcb,0xde,0xcc,0xde,0xcd,0xde,0xce,0xde,
  0xca,0xdf,0xcb,0xdf,0xcc,0xdf,0xcd,0xdf,0xce,0xdf,
 ]);
 assert.deepEqual(escude.parse(F.escr1([dakuBytes],b=>b)).lines,['ゔがぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ']);
 /* non-voicable kana, invalid handakuten base, double marks, and full-width kana/marks stay separate */
 assert.equal(escude.restring('ｱﾞﾝﾞｶﾟｶﾞﾞかﾞｶ゛か゛'),'あ゛ん゛か゜が゛か゛か゛か゛');
 /* end-to-end scenes.read on ESCR1_00 lines with decomposed voiced/semi-voiced half-width kana */
 const encodeDecomposed=s=>{
  const d={'が':'ｶﾞ','ぎ':'ｷﾞ','ぐ':'ｸﾞ','げ':'ｹﾞ','ご':'ｺﾞ','ざ':'ｻﾞ','じ':'ｼﾞ','ず':'ｽﾞ','ぜ':'ｾﾞ','ぞ':'ｿﾞ',
   'だ':'ﾀﾞ','ぢ':'ﾁﾞ','づ':'ﾂﾞ','で':'ﾃﾞ','ど':'ﾄﾞ','ば':'ﾊﾞ','び':'ﾋﾞ','ぶ':'ﾌﾞ','べ':'ﾍﾞ','ぼ':'ﾎﾞ',
   'ぱ':'ﾊﾟ','ぴ':'ﾋﾟ','ぷ':'ﾌﾟ','ぺ':'ﾍﾟ','ぽ':'ﾎﾟ','ゔ':'ｳﾞ'};
  return Buffer.concat([...s].map(c=>d[c]?kit.encodeSjis(d[c]):escr1Bytes(c)));
 };
 const lines=['ありがとう、また明日。','今日はいい天気ですね。','がんばろう！ぱちぱち！'];
 const game=tmp(t);put(game,'script.bin',F.escArc({'scr/0001.bin':F.escr1(lines,encodeDecomposed)}));
 assert.deepEqual(scenes.read('escude',game)[0].lines,lines);
 /* short natural Japanese scripts with half-width kana, punctuation, voiced kana and JIS level-2 kanji stay Shift-JIS */
 for(const sample of [
  ['「おはよう。あしたまたね。」','「うん。ありがとう。」'],
  ['すごい。あついね。'],
  ['またあしたね。」'],
  ['頷いてくれたのさ。'],
 ]){
  assert.deepEqual(escude.parse(F.escr1(sample,encodeDecomposed)).lines,sample);
 }
});

/* ---- PJADV ---------------------------------------------------------------------------------------------------------- */
const PJ=(L,N)=>[{name:N,say:L[0]},{say:L[1]},{prompt:L[2]},{choice:L[0].slice(0,3)},{choice:L[1].slice(0,3)}];
test('PJADV: GAMEDAT PAC2 / PACK, encrypted textdata.bin, scenario.dat names / lines / choices in code order',t=>{
 const ja=F.pjadvPair(PJ(JA,'ひなた'));const game=tmp(t);put(game,'archive.dat',F.gamedat({'scenario.dat':ja.scenario,'textdata.bin':ja.textdata}));
 assert.equal(F.gamedat({'a.bin':Buffer.alloc(4)},{version:1}).toString('latin1',0,12),'GAMEDAT PACK');assert.equal(pjadv.list(put(tmp(t),'a.dat',F.gamedat({'a.bin':Buffer.alloc(4)},{version:1})))[0].name,'a.bin');
 assert.equal(library.engineOf(game)?.name,'PJADV');assert.equal(scenes.detect(game),'pjadv');
 const own=scenes.read('pjadv',game);assert.equal(own.length,1);
 assert.deepEqual(own[0].lines,['ひなた',JA[0],JA[1],JA[2],JA[0].slice(0,3),JA[1].slice(0,3)]);
 const patch=tmp(t),zh=F.pjadvPair(PJ(ZH,'向日葵'),gbk,{encrypt:false});put(patch,'scenario.dat',zh.scenario);put(patch,'textdata.bin',zh.textdata);
 const z=scenes.ENGINES.pjadv.archives(patch).map(s=>pjadv.parse(s.read()));pairs(own[0].lines,z[0].lines);assert.equal(z[0].lines[0],'向日葵');
});

/* ---- Luca System ---------------------------------------------------------------------------------------------------- */
const LU=L=>[{say:L[0],voice:12},{op:1},{say:L[1]},{choice:L[2]}];
test('Luca System: SCRIPT.PAK (block offsets, name table), code lines; UTF-16 counted strings and UTF-8 C strings, opcode-agnostic',t=>{
 const game=tmp(t);put(game,'files/SCRIPT.PAK',F.lucaPak({_VARSTR:Buffer.alloc(8),SEEN0001:F.lucaScriptSP(LU(JA)),SEEN0002:F.lucaScriptEN([{say:JA[0],en:'Good morning'},{x:1},{say:JA[1],en:'Nice day'}])}));
 assert.equal(library.engineOf(game)?.name,'Luca System');assert.equal(scenes.detect(game),'luca');
 const own=scenes.read('luca',game);assert.deepEqual(own.map(s=>s.name),['SEEN0001','SEEN0002']);
 assert.deepEqual(own[0].lines,JA);assert.deepEqual(own[1].lines,[JA[0],JA[1]]);
 const patch=tmp(t);put(patch,'files/script/SEEN0001',F.lucaScriptSP(LU(ZH)));put(patch,'files/script/SEEN0002',F.lucaScriptEN([{say:ZH[0],en:'x'},{x:1},{say:ZH[1],en:'y'}]));
 const zh=scenes.ENGINES.luca.archives(patch).map(s=>luca.parse(s.read()));pairs(own[0].lines,zh[0].lines);pairs(own[1].lines,zh[1].lines);assert.equal(zh[0].lines[2],ZH[2]);
 /* a Shift-JIS C string (older titles) */
 assert.deepEqual(luca.parse(F.lucaScriptEN([{say:JA[2]}],sjis)).lines,[JA[2]]);
});

/* ---- Stuff (Propeller .msc) ----------------------------------------------------------------------------------------- */
test('Stuff Script: .mpk index XOR, .msc XOR 0x88, version 0 (u16 strings) and 1 (u32), MESSAGE and choices',t=>{
 const items=L=>[{say:L[0]},{say:L[1]},{choice:L[2]}];
 const game=tmp(t);put(game,'scr.mpk',F.mpk({'s01.msc':F.msc(items(JA)),'s02.msc':F.msc(items(JA),{version:1}),'bg.png':Buffer.from('\x89PNG')}));
 assert.equal(library.engineOf(game)?.name,'Stuff Script (Propeller)');assert.equal(scenes.detect(game),'stuff');
 const own=scenes.read('stuff',game);assert.deepEqual(own.map(s=>s.name),['s01.msc','s02.msc']);assert.deepEqual(own[0].lines,JA);assert.deepEqual(own[1].lines,JA);
 const patch=tmp(t);put(patch,'s01.msc',F.msc(items(ZH),{enc:gbk}));
 const zh=scenes.ENGINES.stuff.archives(patch).map(s=>stuff.parse(s.read()));pairs(own[0].lines,zh[0].lines);assert.equal(zh[0].lines[2],ZH[2]);
});

/* ---- AI5WIN --------------------------------------------------------------------------------------------------------- */
const ai5Ops=(L,enc)=>[[0x0e,{v:[{c:[0x80,5,0xe0]},{s:'face'}]}],[0x01,{s:L[0]}],[0x0b,{c:[0xf2,1,2,3,4,0xef]},{i:12}],[0x01,{s:L[1]}],[0x08,{c:[0xa0,1]},{f:0},{c:[3]},{g:[[0xf1,0xff,0xff],[4]]}],[0x02,{s:L[2]}],[0x13,{b:1}],[0x00]];
test('AI5WIN: v2 / v1 / v0 grammars (expressions, variable lists, groups, F flag), markers dropped, .dat archive',t=>{
 for(const v of [2,1]){const r=silky.parse(F.ai5Mes(F.ai5Code(ai5Ops(JA)),v));assert.deepEqual(r.lines,JA,'version '+v);assert.deepEqual(r.anchors,[]);}
 const v0=F.ai5Mes(F.ai5Code([[0x01,{s:JA[0]}],[0x03,{b:1},{c:[0xc0,2]},{g:[[1]]}],[0x09,{c:[0x80,1]},{i:0}],[0x01,{s:JA[1]}],[0x00]]),0);assert.deepEqual(silky.ai5Parse(v0).lines,[JA[0],JA[1]]);assert.equal(silky.ai5Parse(v0).version,0);
 const marked=Buffer.concat([sjis('前'),Buffer.from([0xeb,0xa1]),sjis('後です')]);assert.deepEqual(silky.parse(F.ai5Mes(Buffer.concat([Buffer.from([1]),marked,Buffer.from([0,0])]),2)).lines,['前後です']);
 const game=tmp(t);put(game,'AI5WIN.exe',Buffer.from('MZ'));const ja=F.ai5Mes(F.ai5Code(ai5Ops(JA)),2);put(game,'mes.dat',F.ai5Dat({'start.mes':F.lzLit(ja),'logo.gcc':Buffer.alloc(16,1)}));
 assert.equal(library.engineOf(game)?.name,"Silky's");assert.equal(scenes.detect(game),'silky');
 const own=scenes.read('silky',game);assert.equal(own.length,1);assert.deepEqual(own[0].lines,JA);
 const patch=tmp(t);put(patch,'start.mes',F.ai5Mes(F.ai5Code(ai5Ops(ZH),gbk),2));
 const zh=scenes.ENGINES.silky.archives(patch).map(s=>silky.parse(s.read()));pairs(own[0].lines,zh[0].lines);assert.equal(zh[0].lines[1],ZH[1]);
});

/* ---- STCM2L --------------------------------------------------------------------------------------------------------- */
test('STCM2L: actions, local string parameters in action order (opcode-agnostic), ASCII strings as anchors',t=>{
 const acts=L=>[{op:0x50,strs:['bgm01']},{op:0xd4,strs:['ひなた']},{op:0xd2,strs:[L[0]]},{op:0x01},{op:0xd2,strs:[L[1]]},{op:0xe7,strs:[L[2]]}];
 const game=tmp(t);put(game,'script.dat',F.stcm2(acts(JA)));
 assert.equal(library.engineOf(game)?.name,'STCM2');assert.equal(scenes.detect(game),'stcm2');
 const own=scenes.read('stcm2',game);assert.deepEqual(own[0].lines,['ひなた',...JA]);assert.deepEqual(own[0].anchors,['bgm01']);
 const patch=tmp(t);put(patch,'script.dat',F.stcm2(acts(ZH).map(a=>a.op===0xd4?{...a,strs:['向日葵']}:a),gbk));
 const zh=scenes.ENGINES.stcm2.archives(patch).map(s=>stcm2.parse(s.read()));pairs(own[0].lines,zh[0].lines);assert.equal(zh[0].lines[0],'向日葵');
});

/* ---- Willadv -------------------------------------------------------------------------------------------------------- */
test('Willadv: a Will ARC whose scripts are not the first extension is recognised and read by the AdvHD reader',t=>{
 const game=tmp(t);put(game,'data.arc',F.willArc({OGG:{bgm01:Buffer.from('OggS')},WSC:{s01:F.wsc('ひなた',JA[0],JA[1])}}));
 assert.equal(library.engineOf(game)?.name,'Willadv');assert.equal(scenes.detect(game),'advhd');
 const own=scenes.read('advhd',game);assert.deepEqual(own[0].lines,['ひなた',JA[0],JA[1]]);
});
test('Willadv: legacy Will ARC discovery supports 16..255 extension records matching list()',t=>{
 const script=F.wsc('ひなた',JA[0],JA[1]);
 const makeArc=(total,extName)=>{const groups={};for(let i=0;i<total-1;i++)groups['E'+String(i).padStart(2,'0')]={a:Buffer.alloc(4,1)};
  groups[extName]={s01:script};return F.willArc(groups);};
 /* exactly 16 extension records (previously rejected by n < 16) */
 const g16=tmp(t);put(g16,'data.arc',makeArc(16,'WSC'));
 assert.equal(library.engineOf(g16)?.name,'Willadv');assert.equal(scenes.detect(g16),'advhd');
 assert.deepEqual(scenes.read('advhd',g16)[0].lines,['ひなた',JA[0],JA[1]]);
 /* upper bound 255 extension records (matching list()'s 0xff cap) with SCR */
 const g255=tmp(t),groups255={};
 for(let i=0;i<254;i++)groups255['A'+i.toString(36).toUpperCase().padStart(2,'0')]={a:Buffer.alloc(4,1)};
 groups255.SCR={s01:Buffer.from(script.map(c=>((c<<2)|(c>>>6))&255))};
 put(g255,'data.arc',F.willArc(groups255));
 assert.deepEqual(scenes.read('advhd',g255)[0].lines,['ひなた',JA[0],JA[1]]);
 /* invalid extension name before WSC or n = 256 must not be accepted as a legacy Will ARC */
 const bad=tmp(t),raw=makeArc(16,'WSC');raw.write('\x01\x02\x03\x04',4,'latin1');put(bad,'bad.arc',raw);
 assert.deepEqual(scenes.ENGINES.advhd.sources(bad),[]);
 const over=tmp(t),rawOver=Buffer.alloc(4+256*12+32);rawOver.writeInt32LE(256,0);rawOver.write('WSC\0',4,'latin1');put(over,'over.arc',rawOver);
 assert.deepEqual(scenes.ENGINES.advhd.sources(over),[]);
});
test('Willadv: 13-byte name Will ARC with short (<=9 byte) names is not misread as 9-byte layout',t=>{
 const advhd=E('advhd'),u32=F.u32,fixed=(s,n)=>{const b=Buffer.alloc(n);Buffer.from(s,'latin1').copy(b);return b;};
 const script=F.wsc('ひなた',JA[0],JA[1]);
 const single=tmp(t),arc13=F.willArc({WSC:{s01:script}},{nameSize:13});put(single,'Rio.arc',arc13);
 assert.deepEqual(scenes.read('advhd',single)[0].lines,['ひなた',JA[0],JA[1]]);
 const multi=tmp(t);put(multi,'data.arc',F.willArc({OGG:{bgm01:Buffer.alloc(80,1)},WSC:{s01:script,s02:F.wsc('真琴',JA[1],JA[2])}},{nameSize:13}));
 const own=scenes.read('advhd',multi);assert.equal(own.length,2);
 assert.deepEqual(own[0].lines,['ひなた',JA[0],JA[1]]);assert.deepEqual(own[1].lines,['真琴',JA[1],JA[2]]);
 /* listFile and head-sliced list() on a 13-byte short-name archive */
 assert.deepEqual(advhd.listFile(path.join(single,'Rio.arc')),[{name:'s01.wsc',size:script.length,offset:37}]);
 assert.deepEqual(advhd.list(arc13.subarray(0,48),arc13.length),[{name:'s01.wsc',size:script.length,offset:37}]);
 /* strict-mode scoring pins */
 const mkSingle=(nameSize,name,size,off,total)=>{const b=Buffer.alloc(total);b.writeInt32LE(1,0);b.write('WSC',4,'latin1');b.writeUInt32LE(1,8);b.writeUInt32LE(16,12);
  fixed(name,nameSize).copy(b,16);b.writeUInt32LE(size,16+nameSize);b.writeUInt32LE(off,16+nameSize+4);return b;};
 /* pins o >= dirEnd: 9-byte size=0 entry with 16B pre-gap and 16B trailing bytes stays 9-byte */
 assert.deepEqual(advhd.list(mkSingle(9,'s01',0,49,65)),[{name:'s01.wsc',size:0,offset:49}]);
 /* pins bytes > 0: 13-byte 6-byte name, 5000B payload, pre-gap and trailing bytes */
 assert.deepEqual(advhd.list(mkSingle(13,'s00001',5000,53,5069)),[{name:'s00001.wsc',size:5000,offset:53}]);
 /* pins maxEnd === fileSize: 13-byte 10-byte name (non-zero byte 9), 5000B payload, pre-gap, exact EOF */
 assert.deepEqual(advhd.list(mkSingle(13,'abcdefghij',5000,165,5165)),[{name:'abcdefghij.wsc',size:5000,offset:165}]);
 /* pins minOff === dirEnd: 13-byte 11-byte name, 200B payload starting right at dirEnd, large fileSize so maxEnd !== fileSize */
 const minOffPin=mkSingle(13,'R22GKQ9OZ22',200,37,237);
 assert.deepEqual(advhd.list(minOffPin,minOffPin.length+1.5e9),[{name:'R22GKQ9OZ22.wsc',size:200,offset:37}]);
 /* loose fallback preserves legacy shapes base could read: (1) 9-byte size=0 offset=0, (2) directory placed after data (+16B tail pins 9-before-13 order) */
 assert.deepEqual(advhd.list(mkSingle(9,'s01',0,0,33)),[{name:'s01.wsc',size:0,offset:0}]);
 const dirAfter=Buffer.alloc(16+16+17+16);dirAfter.writeInt32LE(1,0);dirAfter.write('WSC',4,'latin1');dirAfter.writeUInt32LE(1,8);dirAfter.writeUInt32LE(32,12);
 fixed('s01',9).copy(dirAfter,32);dirAfter.writeUInt32LE(16,41);dirAfter.writeUInt32LE(16,45);
 assert.deepEqual(advhd.list(dirAfter),[{name:'s01.wsc',size:16,offset:16}]);
});

/* ---- archive + generic scan ----------------------------------------------------------------------------------------- */
const TXT=enc=>F.textScript(JA,enc),TXZ=()=>F.textScript(ZH,gbk);
const SLG_KEY=0xbf8766f5,slgSd=body=>F.slgEncrypt(Buffer.concat([Buffer.from([2,0,0,2,0]),body,Buffer.from([0])]),SLG_KEY);
const CASES=[
 {engine:'ISM',id:'ism',make:(d,b)=>put(d,'data.isa',F.isa({'SCENE01.ISF':b,'BGM.OG':Buffer.from('OggS....')}))},
 {engine:'GLib2',id:'glib2',make:(d,b)=>{put(d,'data.g2',F.glib2({'s01.txt':b}));put(d,'scr.stx',F.glib2({'s02.txt':Buffer.from('OggS')}));}},
 {engine:'Cyberworks (C,system)',id:'cyberworks',make:(d,b)=>{const c=F.cyberworks({a:b});put(d,'Arc01.dat',c.index);put(d,'Arc04.dat',c.body);put(d,'Arc06.dat',Buffer.alloc(8));}},
 {engine:'Tanuki Engine',id:'tanuki',make:(d,b)=>put(d,'data.tac',F.tac({a:b,b:Buffer.from(b)}))},
 {engine:'Yaneurao',id:'yaneurao',make:(d,b)=>put(d,'script.dat',F.yanepk({'scenario/s01.txt':b}))},
 {engine:'Rits',id:'rits',make:(d,b)=>put(d,'script.saf',F.saf({'s01.str':b,'bg.png':Buffer.from('\x89PNG')}))},
 {engine:'BlueGale',id:'bluegale',make:(d,b)=>{const s=F.snn({'s01.scr':b});put(d,'data.snn',s.snn);put(d,'data.inx',s.inx);}},
 {engine:'DxLib',id:'dxlib',make:(d,b)=>put(d,'data.dxa',F.dxa({'scenario/s01.txt':b,'bgm/a.ogg':Buffer.from('OggS')}))},
 {engine:'SLG System',id:'slg',make:(d,b,zh)=>put(d,'data.szs',F.szs({'scr;main.sd':zh?F.slgEncrypt(Buffer.concat([Buffer.from([2,0,0,2,0]),b,Buffer.from([0])]),SLG_KEY):slgSd(b)}))}];
for(const c of CASES)test(c.engine+': archive opened, scripts read with the generic scan, a GBK patch packed the same way pairs 1:1',t=>{
 const game=tmp(t);c.make(game,TXT(sjis));
 assert.equal(library.engineOf(game)?.name,c.engine);assert.equal(scenes.detect(game),c.id);
 const own=scenes.read(c.id,game).filter(s=>s.lines.length);assert.equal(own.length,c.id==='tanuki'?2:1,'scripts with lines');assert.deepEqual(own[0].lines,JA);
 const patch=tmp(t);c.make(patch,TXZ(),true);
 const zh=scenes.ENGINES[c.id].archives(patch).map(s=>scenes.ENGINES[c.id].parse(s.read())).filter(p=>p.lines.length);pairs(own[0].lines,zh[0].lines);assert.deepEqual(zh[0].lines,ZH);
});
test('archive + scan helpers: GLib2 schemes invert, SLG keys, media skipped, unknown data reads nothing',()=>{
 const sc=scan.g2Scheme(scan.G2_HEADER_KEY),b=Buffer.from('GLibArchiveData2.0 and some more bytes');assert.deepEqual(scan.g2Decrypt(sc,scan.g2Encrypt(sc,b)),b);
 assert.deepEqual(scan.slgDecrypt(slgSd(sjis('テスト'))).subarray(0,5),Buffer.from([2,0,0,2,0]));assert.equal(scan.slgDecrypt(Buffer.alloc(16,0x55)),null);
 assert.deepEqual(scan.parse(Buffer.concat([Buffer.from('OggS'),sjis('おはようございます')])).lines,[]);
 assert.deepEqual(scan.parse(Buffer.alloc(64,7)).lines,[]);
});
test('Cyberworks: legacy Arc05.dat falls back to Arc04.dat text TOC when Arc02.dat is a data archive, while modern Arc02.dat binary TOC still wins',t=>{
 const num=(v,d)=>Buffer.from(String(v).padStart(d,'0').split('').map(c=>(+c)^0x7f));
 const packToc=(raw,d)=>{const packed=F.lzLit(raw);return Buffer.concat([num(raw.length,d),num(packed.length,d),packed]);};
 const legacyToc=text=>packToc(Buffer.from(text,'latin1'),4);
 const script=TXT(sjis),packedScript=F.lzLit(script);
 /* legacy layout: Arc02.dat is a data archive (indexed by Arc00.dat), Arc05.dat holds scripts (indexed by Arc04.dat) */
 const legacy=tmp(t);
 put(legacy,'Arc00.dat',legacyToc('img01,16,16,0,b\r\n'));
 put(legacy,'Arc02.dat',Buffer.alloc(16,0x22));
 put(legacy,'Arc04.dat',legacyToc(`s001,${script.length},${packedScript.length},0,s\r\n`));
 put(legacy,'Arc05.dat',packedScript);
 const own=scenes.read('cyberworks',legacy).filter(s=>s.lines.length);
 assert.equal(own.length,1);assert.equal(own[0].name,'s001.s');assert.deepEqual(own[0].lines,JA);
 /* modern layout: Arc02.dat binary TOC wins even when Arc04.dat is also a valid 4-digit text TOC */
 const modern=tmp(t),cw=F.cyberworks({a:script});
 put(modern,'Arc02.dat',cw.index);
 put(modern,'Arc04.dat',legacyToc(`legacy01,${script.length},${cw.body.length},0,s\r\n`));
 put(modern,'Arc05.dat',cw.body);
 const mod=scenes.read('cyberworks',modern).filter(s=>s.lines.length);
 assert.equal(mod.length,1);assert.equal(mod[0].name,'000001.s0');assert.deepEqual(mod[0].lines,JA);
 /* fallback when Arc02.dat unpacks as 8-digit LZSS but first entry size es < 0x11 */
 const badBin=tmp(t),shortEntry=Buffer.alloc(16);shortEntry.writeInt32LE(0x10,0);
 put(badBin,'Arc02.dat',packToc(shortEntry,8));
 put(badBin,'Arc04.dat',legacyToc(`s001,${script.length},${packedScript.length},0,s\r\n`));
 put(badBin,'Arc05.dat',packedScript);
 const fb=scenes.read('cyberworks',badBin).filter(s=>s.lines.length);
 assert.equal(fb.length,1);assert.equal(fb[0].name,'s001.s');assert.deepEqual(fb[0].lines,JA);
});
test('archive-scan: truncated SQDARC and SAF 0x600 indexes return null without throwing while valid and tight archives stay readable',t=>{
 const dir=tmp(t);
 /* 1. SQDARC truncated top directory table and truncated file block */
 const badTop=Buffer.alloc(0x20);badTop.write('SQDARC\0\0',0,'latin1');badTop.writeInt32LE(10,0x10);
 const badTopFile=path.join(dir,'a_bad_top.sda');fs.writeFileSync(badTopFile,badTop);
 assert.equal(scan.yaneList(badTopFile),null);
 const badBlk=Buffer.alloc(0x30);badBlk.write('SQDARC\0\0',0,'latin1');badBlk.writeInt32LE(1,0x10);
 badBlk.writeUInt32LE(0x2c,0x14);badBlk.writeInt32LE(5,0x18);
 const badBlkFile=path.join(dir,'b_bad_blk.sda');fs.writeFileSync(badBlkFile,badBlk);
 assert.equal(scan.yaneList(badBlkFile),null);
 /* Valid SQDARC archive stays readable */
 const sqdBody=TXT(sjis),sqdBlkAt=0x14+0x18,sqdDataAt=sqdBlkAt+0x30;
 const goodSqd=Buffer.alloc(sqdDataAt+sqdBody.length);
 goodSqd.write('SQDARC\0\0',0,'latin1');goodSqd.writeInt32LE(1,0x10);
 goodSqd.writeUInt32LE(sqdBlkAt,0x14);goodSqd.writeInt32LE(1,0x18);goodSqd.write('txt',0x14+0x12,'latin1');
 goodSqd.write('s01',sqdBlkAt,'latin1');goodSqd.writeUInt32LE(sqdDataAt,sqdBlkAt+0x28);goodSqd.writeUInt32LE(sqdBody.length,sqdBlkAt+0x2c);
 sqdBody.copy(goodSqd,sqdDataAt);
 const goodSqdFile=path.join(dir,'z_good.sda');fs.writeFileSync(goodSqdFile,goodSqd);
 assert.deepEqual(scan.yaneList(goodSqdFile).map(e=>e.name),['s01.txt']);
 assert.deepEqual(scenes.read('yaneurao',dir).filter(s=>s.lines.length)[0].lines,JA);

 /* 2. SAF 0x600 truncated 10-byte index returns null without throwing */
 const safDir=tmp(t);
 const badSaf=Buffer.alloc(10);badSaf.writeUInt16LE(0x600,0);badSaf.writeInt16LE(1,2);badSaf.writeInt32LE(1,4);
 const badSafFile=path.join(safDir,'a_bad.saf');fs.writeFileSync(badSafFile,badSaf);
 assert.equal(scan.safList(badSafFile),null);
 /* Valid SAF 0x600 (including slightly over-declared trailing nlen) stays readable alongside bad sibling */
 const safBody=TXT(sjis),safName=Buffer.from('s01.str\0','latin1');
 const goodSaf=Buffer.alloc(2048+safBody.length);
 goodSaf.writeUInt16LE(0x600,0);goodSaf.writeInt16LE(1,2);goodSaf.writeInt32LE(200,4);
 goodSaf.writeUInt32LE(0,8);goodSaf.writeUInt32LE(1,12);goodSaf.writeUInt32LE(safBody.length,16);goodSaf.writeUInt32LE(0,20);
 safName.copy(goodSaf,24);safBody.copy(goodSaf,2048);
 const goodSafFile=path.join(safDir,'z_good.saf');fs.writeFileSync(goodSafFile,goodSaf);
 assert.deepEqual(scan.safList(goodSafFile).map(e=>e.name),['s01.str']);
 assert.equal(library.engineOf(safDir)?.name,'Rits');
 assert.deepEqual(scenes.read('rits',safDir).filter(s=>s.lines.length)[0].lines,JA);
});
