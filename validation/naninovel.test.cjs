'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const nani=require('../services/original-engines/naninovel.cjs');
// E355: a Naninovel localization document gives the Japanese source and the release's own translation per line.
test('Naninovel localization document',()=>{
 const doc="; 日本語 <ja> to 简体中文 <zh-Hans> localization document for 'A/B' Naninovel scenario script\n\n# B_Ema001\n; > Ema: |#B_Ema001|\n; （このあたりを歩くの苦手なんだよな）\n（我还是有点害怕在这附近走动）\n\n# B_Narrative001\n; 見張りのためか、<br>いつのっそりと。\n看守经常会来。<br>\n它什么时候。\n";
 const r=nani.parse(Buffer.from(doc));
 assert.deepEqual(r.lines,['（このあたりを歩くの苦手なんだよな）','見張りのためか、\nいつのっそりと。']);
 assert.deepEqual(r.zh,['（我还是有点害怕在这附近走动）','看守经常会来。\n它什么时候。']);
 assert.deepEqual(r.anchors,['B_Ema001','B_Narrative001']);
});
const game='e:/steam/steamapps/common/manosaba_game';
test('a Unity shadow reads the same localization and voice directory as its source player',t=>{
 const os=require('node:os'),path=require('node:path');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nani-shadow-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const source=path.join(root,'source'),shadow=path.join(root,'shadow'),exe='Player.exe';
 const data=path.join(source,'Player_Data'),relative=path.join('StreamingAssets','aa','StandaloneWindows64');
 fs.mkdirSync(path.join(data,relative),{recursive:true});fs.mkdirSync(shadow);
 for(const dir of [source,shadow])fs.writeFileSync(path.join(dir,exe),'fixture');
 fs.writeFileSync(path.join(data,relative,'game-localization-zhhans-scripts-route.bundle'),'fixture');
 const linked=path.join(shadow,'Player_Data'),manifest=path.join(shadow,'megulit-shadow.json');
 fs.symlinkSync(data,linked,'junction');
 assert.deepEqual(nani.sources(shadow),[]);
 fs.writeFileSync(manifest,JSON.stringify({game:source,exe}));
 assert.deepEqual(nani.sources(shadow),nani.sources(source));
 assert.equal(require('../services/original-engines/naninovel-voice.cjs').bundleDir(shadow),path.join(fs.realpathSync(data),relative));
 const other=path.join(root,'other');fs.mkdirSync(path.join(other,'Player_Data'),{recursive:true});
 fs.writeFileSync(path.join(other,exe),'fixture');fs.writeFileSync(manifest,JSON.stringify({game:other,exe}));
 assert.deepEqual(nani.sources(shadow),[]);
});
test('魔法少女ノ魔女裁判 (Steam): localization bundles are read',{skip:!fs.existsSync(game)&&'no local copy'},()=>{
 const sc=nani.scenes(game);assert.ok(sc.length>100);const r=nani.parse(sc.find(s=>/Adv29/.test(s.name)).read());
 assert.equal(r.lines[0],'（このあたりを歩くの苦手なんだよな）');assert.equal(r.zh[0],'（我还是有点害怕在这附近走动）');
});

test('Naninovel: Japanese-source parsed-script assets reconstruct source dialogue and Chinese translations',t=>{
 const os=require('node:os'),path=require('node:path');
 const scenes=require('../services/original-engines/scenes.cjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nani-ja-parsed-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const data=path.join(root,'Game_Data');fs.mkdirSync(data,{recursive:true});
 const u32=v=>{const b=Buffer.alloc(4);b.writeUInt32LE(v);return b;};
 const i32=v=>{const b=Buffer.alloc(4);b.writeInt32LE(v);return b;};
 const str=s=>{const b=Buffer.from(s,'utf8');return Buffer.concat([u32(b.length),b,Buffer.alloc((4-b.length%4)%4)]);};
 const comment=(line,hash,text)=>Buffer.concat([str('CommentScriptLine'),str('Naninovel'),str('Elringus.Naninovel.Runtime'),i32(line),...(hash?[str(hash)]:[]),str(text)]);
 const generic=(line,hash,count)=>Buffer.concat([str('GenericTextScriptLine'),str('Naninovel'),str('Elringus.Naninovel.Runtime'),i32(line),str(hash),u32(count),Buffer.alloc(count*8)]);
 const print=(script,line,inl,text)=>Buffer.concat([str('PrintText'),str('Naninovel.Commands'),str('Elringus.Naninovel.Runtime'),str(script),i32(line),i32(inl),str(text)]);
 // S01: Japanese-source parsed asset with zh-Hans (entries path: speaker prefix, untranslated gap, voice meta) + competing en asset
 const s01Zh=Buffer.concat([
  Buffer.alloc(8),
  str('Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `S01` naninovel script'),
  comment(2,'11111111','Ema: 「おはよう」'),
  print('S01',3,0,'「早上好」'),
  comment(5,'22222222','未翻訳の地の文。'),
  comment(7,'33333333','> Ema: |#S01_Ema001|'),
  comment(8,'44444444','元気ですか？'),
  print('S01',9,0,'你还好吗？'),
 ]);
 const s01En=Buffer.concat([
  Buffer.alloc(8),
  str('Japanese <ja-JP> to English <en> localization document for `S01` naninovel script'),
  comment(2,'11111111','Ema: 「おはよう」'),
  print('S01',3,0,'Good morning'),
 ]);
 // S02: Japanese-source parsed asset with English only -> Japanese kept, zh stays empty
 const s02En=Buffer.concat([
  Buffer.alloc(8),
  str('Japanese <ja-JP> to English <en> localization document for `S02` naninovel script'),
  comment(2,'55555555','一人きりの部屋。'),
  print('S02',3,0,'An empty room.'),
 ]);
 // S03: Japanese-source parsed asset without 8-hex hashes -> prints/byLine fallback path
 const s03Zh=Buffer.concat([
  Buffer.alloc(8),
  str('Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `S03` naninovel script'),
  comment(2,null,'Kasumi: 「行こう」'),
  generic(3,'',1),
  comment(5,null,'静かな夜。'),
  generic(6,'',1),
  print('S03',3,0,'「走吧」'),
  print('S03',6,0,'安静的夜晚。'),
 ]);
 // S04: Japanese-source parsed asset without hashes/byLine and with an untranslated gap -> keeps all Japanese without shifting zh
 const s04Zh=Buffer.concat([
  Buffer.alloc(8),
  str('Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `S04` naninovel script'),
  comment(2,null,'一行目。'),
  comment(4,null,'二行目。'),
  print('S04',5,0,'第二行。'),
 ]);
 // S05: Japanese-source parsed asset without byLine where filtered comments match prints count (including > voice meta)
 const s05Zh=Buffer.concat([
  Buffer.alloc(8),
  str('Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `S05` naninovel script'),
  comment(1,null,'> Ema: |#S05_Ema001|'),
  comment(2,null,'声を聞く。'),
  print('S05',3,0,'听到声音。'),
 ]);
 fs.writeFileSync(path.join(data,'resources.assets'),Buffer.concat([s01En,s01Zh,s02En,s03Zh,s04Zh,s05Zh,Buffer.alloc(8)]));
 const read=scenes.read('naninovel',root);
 const byName=new Map(read.map(s=>[s.name,s]));
 const s1=byName.get('S01.nani');assert.ok(s1);
 assert.deepEqual(s1.lines,['「おはよう」','未翻訳の地の文。','元気ですか？']);
 assert.deepEqual(s1.zh,['「早上好」','','你还好吗？']);
 assert.deepEqual(s1.voices,[null,null,'S01_Ema001']);
 const s2=byName.get('S02.nani');assert.ok(s2);
 assert.deepEqual(s2.lines,['一人きりの部屋。']);
 assert.deepEqual(s2.zh,['']);
 const s3=byName.get('S03.nani');assert.ok(s3);
 assert.deepEqual(s3.lines,['「行こう」','静かな夜。']);
 assert.deepEqual(s3.zh,['「走吧」','安静的夜晚。']);
 const s4=byName.get('S04.nani');assert.ok(s4);
 assert.deepEqual(s4.lines,['一行目。','二行目。']);
 assert.deepEqual(s4.zh,['','']);
 const s5=byName.get('S05.nani');assert.ok(s5);
 assert.deepEqual(s5.lines,['声を聞く。']);
 assert.deepEqual(s5.zh,['听到声音。']);
 assert.deepEqual(s5.voices,['S05_Ema001']);
 const patched=nani.patchLines([s2]);
 assert.equal(patched,null,'non-Chinese translation must not become a Chinese patch');
});

test('Naninovel: Addressables localization bundles keep Japanese alongside preferred Chinese for non-Japanese-source games',t=>{
 const os=require('node:os'),path=require('node:path');
 const scenes=require('../services/original-engines/scenes.cjs');
 const {packBundle}=require('../services/original-engines/utage-embedded.cjs')._internal;
 const {string}=require('./helpers/utage-embedded-fixture.cjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nani-bundles-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const aa=path.join(root,'Game_Data','StreamingAssets','aa','StandaloneWindows64');
 fs.mkdirSync(aa,{recursive:true});
 const zhDoc='; English <en> to Chinese (S) <zh-Hans> localization document for `Intro` naninovel script\n\n# L1\n; Hello world.\n你好，世界。\n\n# L2\n; Goodbye.\n再见。\n';
 const jaDoc='; English <en> to Japanese <ja-JP> localization document for `Intro` naninovel script\n\n# L1\n; Hello world.\nこんにちは、世界。\n\n# L2\n; Goodbye.\nさようなら。\n';
 const enDoc='; English <en> to Korean <ko> localization document for `Intro` naninovel script\n\n# L1\n; Hello world.\n안녕.\n';
 fs.writeFileSync(path.join(aa,'game-localization-zhhans-scripts-01.bundle'),packBundle('CAB-zh',string(zhDoc),'2020.3.7f1'));
 fs.writeFileSync(path.join(aa,'game-localization-ja-scripts-01.bundle'),packBundle('CAB-ja',string(jaDoc),'2020.3.7f1'));
 fs.writeFileSync(path.join(aa,'game-localization-ko-scripts-01.bundle'),packBundle('CAB-ko',string(enDoc),'2020.3.7f1'));
 const read=scenes.read('naninovel',root);
 assert.equal(read.length,1);
 assert.equal(read[0].name,'Intro.nani');
 assert.deepEqual(read[0].lines,['こんにちは、世界。','さようなら。']);
 assert.deepEqual(read[0].zh,['你好，世界。','再见。']);
 const picked=nani.sources(root).map(f=>path.basename(f));
 assert.deepEqual(picked,['game-localization-ja-scripts-01.bundle','game-localization-zhhans-scripts-01.bundle']);
 // Mixed-case and region-suffixed tags (zhHans + JA-JP / jajp) are also kept
 const rootCase=fs.mkdtempSync(path.join(os.tmpdir(),'nani-case-'));
 t.after(()=>fs.rmSync(rootCase,{recursive:true,force:true}));
 const aaCase=path.join(rootCase,'Game_Data','StreamingAssets','aa','StandaloneWindows64');
 fs.mkdirSync(aaCase,{recursive:true});
 fs.writeFileSync(path.join(aaCase,'game-localization-zhHans-scripts-01.bundle'),packBundle('CAB-zh',string(zhDoc),'2020.3.7f1'));
 fs.writeFileSync(path.join(aaCase,'game-localization-JA-JP-scripts-01.bundle'),packBundle('CAB-ja',string(jaDoc),'2020.3.7f1'));
 fs.writeFileSync(path.join(aaCase,'game-localization-en-scripts-01.bundle'),packBundle('CAB-en',string(enDoc),'2020.3.7f1'));
 const readCase=scenes.read('naninovel',rootCase);
 assert.equal(readCase.length,1);
 assert.deepEqual(readCase[0].lines,['こんにちは、世界。','さようなら。']);
 assert.deepEqual(readCase[0].zh,['你好，世界。','再见。']);
 // Japanese-source game without a ja bundle still reads only the preferred Chinese bundle
 const root2=fs.mkdtempSync(path.join(os.tmpdir(),'nani-ja-src-'));
 t.after(()=>fs.rmSync(root2,{recursive:true,force:true}));
 const aa2=path.join(root2,'Game_Data','StreamingAssets','aa','StandaloneWindows64');
 fs.mkdirSync(aa2,{recursive:true});
 fs.writeFileSync(path.join(aa2,'game-localization-zhhans-scripts-01.bundle'),'x');
 fs.writeFileSync(path.join(aa2,'game-localization-en-scripts-01.bundle'),'x');
 fs.writeFileSync(path.join(aa2,'game-localization-jav-scripts-01.bundle'),'x');
 assert.deepEqual(nani.sources(root2).map(f=>path.basename(f)),['game-localization-zhhans-scripts-01.bundle']);
});
