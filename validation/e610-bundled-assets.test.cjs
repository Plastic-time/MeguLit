'use strict';
/* E610 F1 bundled-asset family (webbundle.cjs): Twine, WebGAL, Monogatari, RenJS, Narrat, ink, Bitsy, GB Studio, GDevelop,
   Construct, Decker, Cocos2d, LÖVE, Corona / Solar2D, Defold, Visual Novel Maker and the generic HTML5 / Electron / NW.js
   reader, on synthetic folders (validation/helpers/engine-fixtures-bundled.cjs). Each builds a Japanese game and a Chinese
   patch with the same entries and checks the lines pair 1:1, loose and packed (app.asar / package.nw / .love). */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const F=require('./helpers/engine-fixtures-bundled.cjs');
const scenes=require('../services/original-engines/scenes.cjs'),library=require('../core/library.cjs'),wb=require('../services/original-engines/webbundle.cjs');
const tmp=t=>{const r=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'e610-'));t.after(()=>fs.rmSync(r,{recursive:true,force:true}));return r;};
const linesOf=(id,dir)=>scenes.read(id,dir).flatMap(s=>s.lines);
const J=F.T.ja;
/* the Japanese lines each engine must give, in scene order then line order */
const WANT={twine:[J[0],J[1],J[2],J[3]],webgal:[J[2],J[1],J[0],J[3],J[2],J[0],J[2]],monogatari:[J[1],J[0],J[2],J[3]],renjs:[J[1],J[0],J[3]],narrat:[J[1],J[0],J[3]],ink:[J[0],J[1]],
 bitsy:[J[0]+'\n'+J[1],J[2]],gbstudio:[J[0],J[1],J[2]],gdevelop:[J[0],J[1]],construct:[J[0],J[1]],decker:[J[0]+'\n'+J[1]],cocos:[J[0],J[1],J[2]],solar2d:[J[0],J[1]],html5:[J[0],J[1],J[2]]};

for(const [id,spec] of Object.entries(F.SPEC)){
 test(`${spec.name}: detected, read loose and in app.asar, a Chinese patch pairs 1:1`,t=>{
  const game=tmp(t),patch=tmp(t),packed=tmp(t);
  F.writeTree(game,spec.files('ja'));F.writeTree(patch,spec.files('zh'));
  assert.equal(library.engineOf(game)?.name,spec.name,'engine name');
  assert.equal(scenes.detect(game),id,'reader');
  const flat=linesOf(id,game);
  assert.deepEqual([...flat].sort(),[...WANT[id]].sort(),spec.name+' lines');
  const zh=scenes.ENGINES[id].archives(patch).map(s=>scenes.ENGINES[id].parse(s.read()));
  assert.equal(zh.flatMap(s=>s.lines).length,flat.length,'patch line count');
  assert.ok(zh.flatMap(s=>s.lines).some(l=>l.includes('早上好')||l.includes('晨光')),'patch has the Chinese');
  F.writeTree(packed,{'resources/app.asar':F.asar(spec.files('ja')),'Game.exe':'MZ','package.json':'{}'});
  assert.deepEqual(linesOf(id,packed),flat,'asar lines');
 });
}
test('LÖVE: .love zip beside love.dll / appended to the exe, a GBK Lua patch pairs',t=>{
 const game=tmp(t),exe=tmp(t),patch=tmp(t),enc=s=>Buffer.from(s,'utf8');
 F.writeTree(game,{'game.love':F.zip(F.love('ja',enc)),'love.dll':'x','Game.exe':'MZ'});
 F.writeTree(patch,{'text.lua':F.love('zh',F.gbk)['text.lua']});
 F.writeTree(exe,{'Game.exe':F.zip(F.love('ja',enc),{prefix:Buffer.from('MZ'.repeat(40))}),'love.dll':'x'});
 for(const d of [game,exe]){assert.equal(library.engineOf(d)?.name,'LÖVE');assert.equal(scenes.detect(d),'love');assert.deepEqual(linesOf('love',d),J.slice(0,3));}
 const zh=scenes.ENGINES.love.archives(patch).map(s=>scenes.ENGINES.love.parse(s.read()));assert.deepEqual(zh[0].lines,F.T.zh.slice(0,3));
});
test('Visual Novel Maker: package.nw with MZ-format data, speaker from Actors, patch pairs',t=>{
 const game=tmp(t),patch=tmp(t);
 F.writeTree(game,{'package.nw':F.zip(F.vnmaker('ja')),'Game.exe':'MZ','nw.dll':'x'});F.writeTree(patch,{'data/Map001.json':F.vnmaker('zh')['data/Map001.json']});
 assert.equal(library.engineOf(game)?.name,'Visual Novel Maker');assert.equal(scenes.detect(game),'vnmaker');
 const map=scenes.read('vnmaker',game).find(s=>/map001/i.test(s.name));
 assert.deepEqual(map.lines,[J[0]+'\n'+J[1],J[2],J[3]]);assert.equal(map.speakers[0],'恵');
 const zh=scenes.ENGINES.vnmaker.archives(patch).map(s=>scenes.ENGINES.vnmaker.parse(s.read()));assert.equal(zh[0].lines.length,3);assert.equal(zh[0].lines[1],'去教室');
});
test('Defold / Corona .car: detected, UTF-8 runs read; a GB Studio web export with only a ROM is detected, not read',t=>{
 const d=tmp(t);F.writeTree(d,{'game.arcd':Buffer.concat([Buffer.alloc(32),Buffer.from('\0'+J[0]+'\0\0'+J[1]+'\0','utf8')]),'Game.exe':'MZ'});
 assert.equal(library.engineOf(d)?.name,'Defold');assert.equal(scenes.detect(d),'defold');assert.deepEqual(linesOf('defold',d),J.slice(0,2));
 const c=tmp(t);F.writeTree(c,{'resource.car':Buffer.from('rcar\0'+J[0]+'\0','utf8'),'Game.exe':'MZ'});assert.equal(library.engineOf(c)?.name,'Corona / Solar2D');
 const g=tmp(t);F.writeTree(g,{'index.html':'<html>','game.gb':Buffer.alloc(0x200),'gbs.js':'//'});assert.equal(library.engineOf(g)?.name,'GB Studio');assert.equal(scenes.detect(g),null);
});
test('Twine macros and links are cut; the HTML5 reader ignores vendor libraries',t=>{
 const r=wb.KINDS.twine(('<tw-storydata><tw-passagedata name="a" tags="">&lt;&lt;link "進む" "b"&gt;&gt;&lt;&lt;if $x &gt; 1&gt;&gt;ある&lt;&lt;endif&gt;&gt;\n(set: $a to 1)[[図書館->lib]]\nplain ascii</tw-passagedata></tw-storydata>'));
 assert.deepEqual(r.lines,['進むある','図書館']);assert.deepEqual(r.anchors,['a']);
 const d=tmp(t);F.writeTree(d,F.SPEC.html5.files('ja'));assert.ok(!scenes.ENGINES.html5.scenes(d).some(s=>/jquery/i.test(s.name)));
});
test('a plain game folder is not mistaken for a web bundle',t=>{
 const d=tmp(t);F.writeTree(d,{'Game.exe':'MZ','readme.txt':'日本語のテキスト','data.dat':'x'});
 assert.equal(wb.probe(d,'html5'),false);assert.equal(scenes.ENGINES.html5.scenes(d).length,0);
});

test('WebGAL: full-width colons and escaped \\: stay in dialogue text while unescaped ASCII : splits speaker/command',t=>{
 const d=tmp(t);
 F.writeTree(d,{
  'game/config.txt':'Game_name:x;',
  'game/scene/start.txt':[
   'changeBg:bg.jpg -next;',
   '時刻：午後三時、雨が降り始めた。;',
   '掲示板：本日休館;',
   'そして表示された文字は：;',
   '時刻\\:午後三時、雨が降り始めた。;',
   'そして表示された文字は\\:;',
   '主人公:「おはよう」 -v1.ogg;',
   '主人公:時刻\\:12\\:30だよ。;',
   ':朝の光が差し込む。;',
   '名前\\\\:台詞。;',
   'intro:時刻\\:12\\:00|教室へ行く;',
   'choose:時刻\\:12\\:00:a.txt|行く:b.txt;',
  ].join('\n'),
 });
 const read=scenes.read('webgal',d);
 assert.equal(read.length,1);
 assert.deepEqual(read[0].lines,[
  '時刻：午後三時、雨が降り始めた。',
  '掲示板：本日休館',
  'そして表示された文字は：',
  '時刻:午後三時、雨が降り始めた。',
  'そして表示された文字は:',
  '「おはよう」',
  '時刻:12:30だよ。',
  '朝の光が差し込む。',
  '台詞。',
  '時刻:12:00',
  '教室へ行く',
  '時刻:12:00',
  '行く',
 ]);
 assert.deepEqual(read[0].speakers,['','','','','','主人公','主人公','','名前\\\\','','','','']);
 assert.deepEqual(read[0].anchors,['changeBg:bg.jpg -next']);
});

test('jsStrings skips regex literals containing quotes while keeping division expressions and strings intact',t=>{
 // End-to-end Monogatari reader with regex literals containing " and `
 const d=tmp(t);
 F.writeTree(d,{
  'js/monogatari.js':'//engine',
  'js/options.js':'//',
  'js/storage.js':'//',
  'js/script.js':[
   'const a = s.replace(/"/g, ""), line1 = "y 「同行の台詞が消える」";',
   'const g = /`/;',
   'monogatari.script({ Start: ["y 「次の台詞」"] });',
  ].join('\n'),
 });
 const read=scenes.read('monogatari',d);
 assert.equal(read.length,1);
 assert.deepEqual(read[0].lines,['「同行の台詞が消える」','「次の台詞」']);
 assert.deepEqual(read[0].speakers,['y','y']);

 // Direct lexical cases: regex escapes, char classes, keywords, if(...), division, postfix ++/--, .return/.if,
 // spread, Unicode identifiers, string division, unclosed regex/class/string, and nested HTML template </tag>
 const src=[
  'const r1 = /\\/"/g, s1 = "「エスケープ」";',
  'const r2 = /[/"]/g, r2b = /[a]"/g, s2 = "「文字クラス」";',
  'function f(x){ return /"/.test(x) ? "「戻り値」" : "「別」"; }',
  'if (cond) /"/.test(x); const s3 = "「条件後」";',
  'const d1 = a / 2; const s4 = "「変数除算」"; const d2 = b / 2;',
  'const d3 = 10 / 2; const s5 = "「数値除算」"; const d4 = 20 / 2;',
  'const d5 = (a + b) / 2; const s6 = "「括弧除算」"; const d6 = (c) / 2;',
  'const d7 = arr[0] / 2; const s7 = "「添字除算」"; const d8 = arr[1] / 2;',
  'const d9 = a++ / 2; const s8 = "「後置除算」"; const d10 = b-- / 2;',
  'const d11 = obj.return / 2; const s9 = "「属性除算」"; const d12 = b / 2;',
  'const d13 = a /* c */ / 2; const s10 = "「コメント後除算」"; const d14 = b / 2;',
  'const d15 = obj.if(x) / 2; const s11 = "「属性条件除算」"; const d16 = b / 2;',
  'const sp = [.../"/.exec(x)]; const s12 = "「展開正規表現」";',
  'const u1 = 変数 / 2; const s13 = "「日本語変数除算」"; const u2 = 変数 / 2;',
  'const st1 = "10" / 2; const s14 = "「文字列除算」"; const st2 = "20" / 2;',
  'const bad = /unclosed "「未閉正規表現」";',
  'const bad2 = /[unclosed "「未閉文字クラス」";',
  'const u = "unclosed\n/"/g; const s15 = "「未閉文字列後」";',
  'const html = `<div>${xs.map(x => `<p>${x}</p>`).join(\'\')}</div>`; const s16 = "「入れ子テンプレート後」";',
 ].join('\n');
 assert.deepEqual(wb.jsStrings(src),[
  '「エスケープ」','「文字クラス」','「戻り値」','「別」','「条件後」',
  '「変数除算」','「数値除算」','「括弧除算」','「添字除算」','「後置除算」',
  '「属性除算」','「コメント後除算」','「属性条件除算」','「展開正規表現」',
  '「日本語変数除算」','10','「文字列除算」','20','「未閉正規表現」','「未閉文字クラス」',
  'unclosed','「未閉文字列後」',
  '<div>${xs.map(x => ',').join(\'\')}</div>','「入れ子テンプレート後」',
 ]);

 // Linear-time guards: 50,000 unclosed /[ or (/\ on one line must stay O(N) and still read the trailing string
 const t0=Date.now();
 const hostileBracket='/['.repeat(50000)+' "「線形括弧」"';
 assert.deepEqual(wb.jsStrings(hostileBracket),['「線形括弧」']);
 const hostileSlash='/\\'.repeat(50000)+' "「線形斜線」"';
 assert.deepEqual(wb.jsStrings(hostileSlash),['「線形斜線」']);
 assert.ok(Date.now()-t0<500,'hostile unclosed regex patterns should stay linear');
});
