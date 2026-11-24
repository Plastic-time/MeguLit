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
 // S04: Japanese-source parsed asset without hashes/byLine -> never guesses positional pairing even when counts match
 const s04Zh=Buffer.concat([
  Buffer.alloc(8),
  str('Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `S04` naninovel script'),
  comment(2,null,'一行目。'),
  comment(4,null,'二行目。'),
  print('S04',5,0,'第一行。'),
  print('S04',6,0,'第二行。'),
 ]);
 // S05: hashless parsed asset with > voice meta + byLine + non-Chinese dst check (S05En)
 const s05Zh=Buffer.concat([
  Buffer.alloc(8),
  str('Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `S05` naninovel script'),
  comment(1,null,'> Ema: |#S05_Ema001|'),
  comment(2,null,'声を聞く。'),
  generic(3,'',1),
  print('S05',3,0,'听到声音。'),
 ]);
 const s05En=Buffer.concat([
  Buffer.alloc(8),
  str('Japanese <ja-JP> to English <en> localization document for `S05En` naninovel script'),
  comment(2,null,'英語のみ。'),
  generic(3,'',1),
  print('S05En',3,0,'English only.'),
 ]);
 // S06: strip author prefix (ASCII ": " only), inline commands [i] & escapes, empty-after-strip, and > with text not poisoning meta
 const s06Zh=Buffer.concat([
  Buffer.alloc(8),
  str('Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `S06` naninovel script'),
  comment(2,'60000001','Ema.Happy: 「待って[i]……\\[注意\\]」'),
  print('S06',3,0,'「等等……[注意]」'),
  comment(5,'60000002','時刻：午後三時。'),
  print('S06',6,0,'时刻：下午三点。'),
  comment(8,'60000003','12:30に駅前で待ち合わせ。'),
  print('S06',9,0,'12:30在站前碰头。'),
  comment(11,'60000004','http://example.jp を開いた。'),
  print('S06',12,0,'打开了 http://example.jp。'),
  comment(14,'60000005','えっと、つまり: こういうこと？'),
  print('S06',15,0,'呃，也就是说：这么回事？'),
  comment(17,'60000006','エマ：「おはよう」'),
  print('S06',18,0,'艾玛：「早上好」'),
  comment(20,'60000007','Ema: '),
  print('S06',21,0,'(空)'),
  comment(23,'60000008','> Ema: |#S06_Fake|'),
  print('S06',24,0,'非元注释'),
  comment(26,'60000009','地の文。'),
  print('S06',27,0,'第一行<br>\n# 注释'),
 ]);
 // S07: entries path with a 2-line translation (L+1 and L+2)
 const s07Zh=Buffer.concat([
  Buffer.alloc(8),
  str('Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `S07` naninovel script'),
  comment(2,'70000001','Aの台詞。'),
  print('S07',3,0,'A的第一行'),
  print('S07',4,0,'A的第二行'),
  comment(6,'70000002','Bの台詞。'),
  print('S07',7,0,'B的翻译'),
 ]);
 // S08 (2): hashless 2-line translation + untranslated gap (counts would match positionally and misalign without line bounds)
 const s08Zh=Buffer.concat([
  Buffer.alloc(8),
  str('Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `S08` naninovel script'),
  comment(2,null,'Aの台詞。'),generic(3,'',1),generic(4,'',1),
  comment(6,null,'Bの台詞（未翻訳）。'),
  comment(8,null,'Cの台詞。'),generic(9,'',1),
  print('S08',3,0,'A的第一行'),print('S08',4,0,'A的第二行'),print('S08',9,0,'C的翻译'),
 ]);
 // S09 (2b): hashless inline double-PrintText + untranslated gap
 const s09Zh=Buffer.concat([
  Buffer.alloc(8),
  str('Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `S09` naninovel script'),
  comment(2,null,'Aの台詞。'),generic(3,'',2),
  comment(5,null,'Bの台詞（未翻訳）。'),
  comment(7,null,'Cの台詞。'),generic(8,'',1),
  print('S09',3,0,'A前半'),print('S09',3,1,'A後半'),print('S09',8,0,'C的翻译'),
 ]);
 // S10 (2c): hashless 2-line translation with no gap
 const s10Zh=Buffer.concat([
  Buffer.alloc(8),
  str('Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `S10` naninovel script'),
  comment(2,null,'Aの台詞。'),generic(3,'',1),generic(4,'',1),
  comment(6,null,'Cの台詞。'),generic(7,'',1),
  print('S10',3,0,'A的第一行'),print('S10',4,0,'A的第二行'),print('S10',7,0,'C的翻译'),
 ]);
 // S11 (2d): hashless single untranslated gap, remaining lines keep their Chinese
 const s11Zh=Buffer.concat([
  Buffer.alloc(8),
  str('Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `S11` naninovel script'),
  comment(2,null,'Aの台詞。'),generic(3,'',1),
  comment(5,null,'Bの台詞（未翻訳）。'),
  comment(7,null,'Cの台詞。'),generic(8,'',1),
  print('S11',3,0,'A的翻译'),print('S11',8,0,'C的翻译'),
 ]);
 fs.writeFileSync(path.join(data,'resources.assets'),Buffer.concat([s01En,s01Zh,s02En,s03Zh,s04Zh,s05Zh,s05En,s06Zh,s07Zh,s08Zh,s09Zh,s10Zh,s11Zh,Buffer.alloc(8)]));
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
 const s5e=byName.get('S05En.nani');assert.ok(s5e);
 assert.deepEqual(s5e.lines,['英語のみ。']);
 assert.deepEqual(s5e.zh,['']);
 const s6=byName.get('S06.nani');assert.ok(s6);
 assert.deepEqual(s6.lines,['「待って……[注意]」','時刻：午後三時。','12:30に駅前で待ち合わせ。','http://example.jp を開いた。','えっと、つまり: こういうこと？','エマ：「おはよう」','地の文。']);
 assert.deepEqual(s6.zh,['「等等……[注意]」','时刻：下午三点。','12:30在站前碰头。','打开了 http://example.jp。','呃，也就是说：这么回事？','艾玛：「早上好」','第一行\n# 注释']);
 assert.equal(s6.voices,undefined);
 const s7=byName.get('S07.nani');assert.ok(s7);
 assert.deepEqual(s7.lines,['Aの台詞。','Bの台詞。']);
 assert.deepEqual(s7.zh,['A的第一行\nA的第二行','B的翻译']);
 const s8=byName.get('S08.nani');assert.ok(s8);
 assert.deepEqual(s8.lines,['Aの台詞。','Bの台詞（未翻訳）。','Cの台詞。']);
 assert.deepEqual(s8.zh,['A的第一行\nA的第二行','','C的翻译']);
 const s9=byName.get('S09.nani');assert.ok(s9);
 assert.deepEqual(s9.lines,['Aの台詞。','Bの台詞（未翻訳）。','Cの台詞。']);
 assert.deepEqual(s9.zh,['A前半A後半','','C的翻译']);
 const s10=byName.get('S10.nani');assert.ok(s10);
 assert.deepEqual(s10.lines,['Aの台詞。','Cの台詞。']);
 assert.deepEqual(s10.zh,['A的第一行\nA的第二行','C的翻译']);
 const s11=byName.get('S11.nani');assert.ok(s11);
 assert.deepEqual(s11.lines,['Aの台詞。','Bの台詞（未翻訳）。','Cの台詞。']);
 assert.deepEqual(s11.zh,['A的翻译','','C的翻译']);
 // Positional prints fallback is used only when no line numbers (commentLines) exist at all
 const mkNoLine=(dst,comments,prints)=>{const p=Object.assign([...prints],{comments});return {script:true,name:'NL.nani',src:'ja-jp',dst,text:'',prints:p};};
 const nlZh=nani.parse(Buffer.from(nani._internal.combine([mkNoLine('zh-hans',['> Ema: |#NL_1|','一。'],['一中'])])[0].text));
 assert.deepEqual(nlZh.lines,['一。']);assert.deepEqual(nlZh.zh,['一中']);assert.deepEqual(nlZh.voices,['NL_1']);
 const nlEn=nani.parse(Buffer.from(nani._internal.combine([mkNoLine('en',['一。'],['One'])])[0].text));
 assert.deepEqual(nlEn.lines,['一。']);assert.deepEqual(nlEn.zh,['']);
 const nlGap=nani.parse(Buffer.from(nani._internal.combine([mkNoLine('zh-hans',['一。','二。'],['二中'])])[0].text));
 assert.deepEqual(nlGap.lines,['一。','二。']);assert.deepEqual(nlGap.zh,['','']);
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
 // Hyphenated/mixed-case Chinese tags (zh-CN, zh-TW, zhHans) beat English and zh-cn beats zh-tw
 const mkPick=langs=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'nani-ord-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
  const b=path.join(d,'Game_Data','StreamingAssets','aa','StandaloneWindows64');fs.mkdirSync(b,{recursive:true});
  for(const l of langs)fs.writeFileSync(path.join(b,`game-localization-${l}-scripts-01.bundle`),'x');
  return nani.sources(d).map(f=>path.basename(f).replace(/^game-localization-|-scripts-01\.bundle$/g,''));};
 assert.deepEqual(mkPick(['en','zh-CN']),['zh-CN']);
 assert.deepEqual(mkPick(['en','zhHans']),['zhHans']);
 assert.deepEqual(mkPick(['zh-tw','zh-cn']),['zh-cn']);
 assert.deepEqual(mkPick(['en','zh-tw']),['zh-tw']);
 // Japanese-source game that also ships a ja->ja bundle still prefers the Chinese translation
 const rootJa=fs.mkdtempSync(path.join(os.tmpdir(),'nani-ja-dup-'));
 t.after(()=>fs.rmSync(rootJa,{recursive:true,force:true}));
 const aaJa=path.join(rootJa,'Game_Data','StreamingAssets','aa','StandaloneWindows64');
 fs.mkdirSync(aaJa,{recursive:true});
 fs.writeFileSync(path.join(aaJa,'game-localization-zhhans-scripts-01.bundle'),packBundle('CAB-z',string('; Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `S` naninovel script\n\n# a\n; 原文。\n中文。\n'),'2020.3.7f1'));
 fs.writeFileSync(path.join(aaJa,'game-localization-ja-scripts-01.bundle'),packBundle('CAB-j',string('; Japanese <ja-JP> to Japanese <ja-JP> localization document for `S` naninovel script\n\n# a\n; 原文。\n校正後。\n'),'2020.3.7f1'));
 const readJa=scenes.read('naninovel',rootJa);
 assert.deepEqual(readJa[0].lines,['原文。']);
 assert.deepEqual(readJa[0].zh,['中文。']);
});
