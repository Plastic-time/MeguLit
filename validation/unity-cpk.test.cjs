'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const S='../services/original-engines/';
const lzma=require(S+'lzma.cjs'),ufs=require(S+'unityfs.cjs'),ser=require(S+'unity-serialized.cjs'),ua=require(S+'unity-assets.cjs'),cpk=require(S+'cri-cpk.cjs'),drv3=require(S+'drv3.cjs'),scenes=require(S+'scenes.cjs');
// E700 LZMA-alone stream (props + payload) of "Hello Unity bundle. " x20 + こんにちは
const LZ_PROPS=Buffer.from('5d00008000','hex'),LZ_BODY=Buffer.from('00241949986f1011485d43e4f7fef537c86a8b365b6f7de817db8b815190faaa8830d404dbd0dbf2b2d33fffffe7944000','hex');
test('LZMA decoder',()=>{const out=lzma.decode(LZ_BODY,415,LZ_PROPS);assert.equal(out.toString('utf8'),'Hello Unity bundle. '.repeat(20)+'こんにちは');});
test('UnityFS prefix scan finds a bundle behind padding',()=>{const sig=Buffer.from('UnityFS\0','latin1');assert.equal(ufs.start(Buffer.concat([Buffer.alloc(37),sig])),37);assert.equal(ufs.start(Buffer.alloc(64)),-1);});
test('Fungus command list: Say lines with speaker',()=>{
 const json=JSON.stringify([{Command:'Block',arg0:'开始'},{Command:'Say',arg0:'01_Krosa',arg1:'这里是港口。'},{Command:'Say',arg0:'',arg1:'船来了。'},{Command:'Menu',arg0:'去',arg1:'去'}]);
 const r=ua.parse(Buffer.from(json));assert.deepEqual(r.lines,['Krosa：这里是港口。','船来了。','去']);});
test('CSV script: text column and speaker column',()=>{
 const csv='Name,Text\n'+['真白,「おはよう、今日もいい天気だね」','悠,「そうだね、散歩に行こう」','真白,「うん、行こうよ」'].join('\n');
 assert.deepEqual(ua.parse(Buffer.from(csv)).lines,['真白：「おはよう、今日もいい天気だね」','悠：「そうだね、散歩に行こう」','真白：「うん、行こうよ」']);});
test('DRV3 SPC compression and STX tags',()=>{
 /* flag 0xB0 = 1,0,1,1: literal 'a', ref (count 2, off 0x3ff = distance 1) , literals 'b' 'c' */
 const out=drv3.spcLz(Buffer.from([0xb0,0x61,0xff,0x03,0x62,0x63]),5);assert.equal(out.toString(),'aaabc');
 const s=['<CLT=cltMIND>やあ<CLT>'],hdr=Buffer.alloc(0x28);hdr.write('STXTJPLL',0,'latin1');hdr.writeUInt32LE(1,8);hdr.writeUInt32LE(0x20,12);hdr.writeUInt32LE(8,16);hdr.writeUInt32LE(1,20);
 const b=Buffer.alloc(0x20+8);b.write('STXTJPLL',0,'latin1');b.writeUInt32LE(1,8);b.writeUInt32LE(0x20,0x0c);b.writeUInt32LE(8,0x10);b.writeUInt32LE(1,0x14);b.writeUInt32LE(0,0x20);b.writeUInt32LE(0x28,0x24);
 assert.deepEqual(drv3.parse(Buffer.concat([b,Buffer.from(s[0]+'\0','utf16le')])).lines,['やあ']);});
test('CRI @UTF cipher round-trips',()=>{const t=Buffer.from('@UTF....');assert.equal(cpk.unmask(cpk.unmask(t)).toString(),t.toString());});
const dr='e:/steam/steamapps/common/Danganronpa V3 Killing Harmony';

test('Unity message blocks keep a screen of dialogue together with its speaker and ruby',()=>{
 const script=[
  '#L(準備)', 'これは制御用の文です。', '#MesName(%rbs旅{たび}%rbe@s人)',
  '#MesSta(00001_01,1)', '「%co2明日%coeは', '#SoundEffect(bell)',
  '%dot(%rbs晴(は)%rbeれ)だよ！」', '#MesEnd()', '#MesName()', '#MesSta()',
  '%hosよかった%hoe。', '#MesEnd()', '#MesName(案内人)', '#MesSta()',
  'English text only.', '#MesEnd()',
 ].join('\r\n');
 const result=ua.parse(Buffer.from('\uFEFF'+script));
 assert.deepEqual(result.lines,['「明日は\n晴れだよ！」','よかった。']);
 assert.deepEqual(result.speakers,['旅 人','']);
 assert.deepEqual(result.ruby,[[['晴','は']],null]);
});

test('Unity message blocks flush at a new message and leave other Unity scripts alone',()=>{
 const script='#MesSta()\n一つ目です。\n#MesName(葵)\n#MesSta()\n次です。\n#MesEnd()\n#MesSta()\n終わりです。';
 const result=ua.parse(Buffer.from(script));
 assert.deepEqual(result.lines,['一つ目です。','次です。','終わりです。']);
 assert.deepEqual(result.speakers,['','葵','葵']);
 assert.equal(result.ruby,undefined);
 for(const marker of ['#MesSta()', '#MesEnd()', '#MesEnd()\n#MesSta()', '#MesSta()\n#MesEnd()', '#MesSta() is a comment\n#MesEnd()']){
  assert.deepEqual(ua.parse(Buffer.from('普通の台詞です。\n'+marker)).lines,['普通の台詞です。']);
 }
});

test('Unity messages keep unmarked narration after a message and pauses in the CJK script',()=>{
 const script=['#MesSta()', '「%dot(長い','文章)」','#MesEnd()', '続きの台詞です。','//表示しない注釈',';この行も注釈',
  '#MesEnd()','#MesSta()','「……」','#MesEnd()'].join('\n');
 assert.deepEqual(ua.parse(Buffer.from(script)).lines,['「長い\n文章」','続きの台詞です。','「……」']);
 const english=['#MesSta()', 'Good morning.','#MesEnd()','#MesSta()','「……」','#MesEnd()'].join('\n');
 assert.deepEqual(ua.parse(Buffer.from(english)).lines,[]);
});
test('Danganronpa V3 (Steam): CPK → SPC → STX text',{skip:!fs.existsSync(dr+'/Dangan3Win.exe')&&'no local copy'},()=>{
 assert.equal(scenes.detect(dr),'drv3');const l=scenes.read('drv3',dr);assert.ok(l.length>5000);assert.ok(l.some(s=>s.lines.some(x=>/\w{4,}/.test(x))));});
const hs='e:/steam/steamapps/common/海沙风云';
test('海沙风云 (Unity + Fungus JSON in TextAssets)',{skip:!fs.existsSync(hs)&&'no local copy'},()=>{
 assert.equal(scenes.detect(hs),'unity-assets');const l=scenes.read('unity-assets',hs);const big=l.find(s=>s.name==='脑死部分');assert.ok(big&&big.lines.length>1000);assert.equal(big.lines[0],'这里是贝让旧城区的港口。');});
// ゆのはな: MAGES SC3 scripts in script.cpk (user contribution 36de7c9b, first 2 MB of the CPK only)
/* the contribution folder is on the maintainer's machine only: elsewhere (CI) the test is skipped, not the whole file failed */
let yuno=null;try{yuno=fs.readdirSync('h:/MeguLit-Work/contrib').find(n=>n.startsWith('36de7c9b'));}catch{}
const yunoCpk=yuno&&'h:/MeguLit-Work/contrib/'+yuno+'/files/data/script.cpk.section.head';
test('ゆのはな: SC3 scenes inside a CRI CPK read as Japanese',{skip:!(yunoCpk&&fs.existsSync(yunoCpk))&&'no contribution copy'},()=>{
 const tmp=fs.mkdtempSync(require('node:os').tmpdir()+'/yuno-');try{fs.mkdirSync(tmp+'/data');fs.copyFileSync(yunoCpk,tmp+'/data/script.cpk');
  assert.equal(scenes.detect(tmp),'mages-cpk');const l=scenes.read('mages-cpk',tmp);const s=l.find(x=>x.name==='yns_01_01.scx');assert.ok(s);assert.equal(s.lines[1],'俺の部屋だぜ‥‥。');
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}});
