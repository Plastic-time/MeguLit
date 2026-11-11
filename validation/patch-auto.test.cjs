// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E280: Chinese patches are found and read without a manual import (packed programs, remapped fonts, per-scene BGI).
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const evb=require('../services/original-engines/evb.cjs');
const root=path.join(__dirname,'..');

test('aPLib literal stream with end marker',()=>{
 assert.strictEqual(evb.aplib(Buffer.from([0x41,0x30,0x42,0x43,0x00]),16).toString(),'ABC');
});

test('Enigma Virtual Box table: folder, plain file and compressed file',()=>{
 const u16=s=>Buffer.concat([Buffer.from(s,'utf16le'),Buffer.alloc(2)]);
 const header=(objects)=>{const b=Buffer.alloc(16);b.writeUInt32LE(objects,12);return b;};
 const fileNode=(name,original,stored)=>{const opt=Buffer.alloc(53);opt.writeUInt32LE(original,2);opt.writeUInt32LE(stored,49);return Buffer.concat([header(0),u16(name),Buffer.from([2]),opt]);};
 const folder=Buffer.concat([header(2),u16('%DEFAULT FOLDER%'),Buffer.from([3]),Buffer.alloc(25)]);
 const packed=Buffer.from([0x41,0x30,0x42,0x43,0x00]),chunk=Buffer.alloc(12);chunk.writeUInt32LE(12,0);chunk.writeUInt32LE(packed.length,8);
 const compressed=Buffer.concat([chunk,packed]);
 const table=Buffer.concat([folder,fileNode('a.txt',5,5),fileNode('b.txt',3,compressed.length)]);
 // The tree starts one byte before the main node ends (evbunpack's seek(-1)); data follows main size - 12 bytes later.
 const mainSize=table.length+12-1+4;
 const main=Buffer.alloc(16);main.writeUInt32LE(mainSize,0);main.writeUInt32LE(1,12);
 const head=Buffer.concat([Buffer.from('MZ'),Buffer.alloc(30),Buffer.from('EVB\0','latin1'),Buffer.alloc(60),main.subarray(0,15)]);
 const magic=32,base=magic+64+16+mainSize-12;
 const body=Buffer.concat([head,table]);const pad=Buffer.alloc(Math.max(0,base-body.length));
 const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'evb-')),'p.exe');
 fs.writeFileSync(file,Buffer.concat([body,pad,Buffer.from('hello'),compressed]));
 const t=evb.list(file);
 assert.deepStrictEqual(t.files.map(f=>f.name),['a.txt','b.txt']);
 assert.strictEqual(evb.read(file,t.files[0]).toString(),'hello');
 assert.strictEqual(evb.read(file,t.files[1]).toString(),'ABC');
});

test('BGI lines follow code order; patch scenes are checked on shared identifiers',()=>{
 const src=fs.readFileSync(path.join(root,'services/original-engines/bgi.cjs'),'utf8'),ot=fs.readFileSync(path.join(root,'services/original-text.cjs'),'utf8');
 assert.match(src,/refs\.push\(off\)/);
 assert.match(ot,/skipped:'operands'/);
 assert.match(ot,/'bgi-code-order\\n'/,'old BGI indexes are rebuilt');
 assert.match(ot,/runningDirOf\(s\.runtime\)\.toLowerCase\(\)===path\.dirname\(String\(executable\)\)/,'folder engines are looked up by the game folder');assert.match(ot,/bgi:\{folder:true,/);
});

test('search runs on its own: dialog status, game start, and a picker that names the file',()=>{
 const bridge=fs.readFileSync(path.join(root,'services/bridge.cjs'),'utf8'),reader=fs.readFileSync(path.join(root,'services/reader.cjs'),'utf8'),ui=fs.readFileSync(path.join(root,'web/game-language.js'),'utf8'),rs=fs.readFileSync(path.join(root,'desktop/src/main.rs'),'utf8');
 assert.match(bridge,/case 'text_source_status':\{const ot=require\('\.\/original-text\.cjs'\),id=String\(request\.id\);ot\.autoPatchLater/);
 assert.match(reader,/this\.findTextSource\(this\.gameId\)/);
 assert.match(ui,/invoke\('pick_patch_file',\{title:w\.pickTitle/);
 assert.match(rs,/fn pick_patch_file/);assert.match(rs,/pick_executable, pick_patch_file,/);
});

// Real data when this machine has it: 素晴らしき日々 HD with the 汉化移植 patch packed into BGI-CHS.exe and a remapped SimHei.
const sub='E:\\GAL\\素晴日\\素晴らしき日々HD版';
test('素晴らしき日々: patch found next to the game and decoded through its font',{skip:!fs.existsSync(path.join(sub,'BGI-CHS.exe'))&&'no local copy'},async()=>{
 const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(':memory:');db.exec('CREATE TABLE games(id TEXT,executable TEXT,removed_at TEXT)');
 const exe=path.join(sub,'BGI.exe');db.prepare('INSERT INTO games VALUES(?,?,NULL)').run('1',exe);
 const ot=require('../services/original-text.cjs'),data=fs.mkdtempSync(path.join(os.tmpdir(),'ot-'));
 const r=await ot.autoPatch(data,db,'1',{drives:false,force:true});assert.ok(r.found,JSON.stringify(r));
 const provider=ot.provider(data,exe);
 assert.strictEqual(provider.resolve('　俺は道を歩いていた。').translation.trim(),'我走在路上。');
});

// E282 (爱上火车): repeated redraws of one line do not keep the reading layer up.
test('immersion: the same line handed over again does not restart the hide timers',()=>{
 const {Immersion}=require('../core/immersion.cjs');let t=0;const shown=[];const im=new Immersion(e=>shown.push(e.dialogVisible),()=>t);
 im.configure({immersion:true,dialogDetection:'marker'});im.bind('g');im.source('「テスト」','krkr');t=500;im.marker(true);t=900;im.input();im.marker(false);
 for(t=1000;t<=2000;t+=100){im.source('「テスト」','krkr');im.tick();}
 assert.strictEqual(shown.at(-1),false);
});

test('calibration drops a read colour that inverts the text colour',()=>{
 const {combine}=require('../core/game-style-sync.cjs');const mk=(c,read)=>({width:100,height:50,read,style:{x:1,y:2,width:50,height:10,textColor:c,japaneseSize:20}});
 assert.strictEqual(combine([mk('#f7fcfe',false),mk('#030304',true)]).style.readTextColor,'');
 assert.strictEqual(combine([mk('#ffffff',false),mk('#4080ff',true)]).style.readTextColor,'#4080ff');
});

// E283: immersion is on by default, turned on once for settings saved before, and a later choice is kept.
test('immersion default on with a one-time switch',()=>{
 const {cleanV4}=require('../core/v4-config.cjs');
 assert.strictEqual(cleanV4({}).immersion,true);
 assert.strictEqual(cleanV4({immersion:false}).immersion,true);
 assert.strictEqual(cleanV4({immersion:false,immersionV:2}).immersion,false);
});

// E285 (CLANNAD write-back report): script first, Chinese font, Alt+H leaves write-back on, English and "none" display.
test('write-back uses the script, a Chinese font, survives Alt+H; display offers English and none',()=>{
 const read=f=>fs.readFileSync(path.join(root,f),'utf8');
 assert.match(read('services/reader.cjs'),/scriptTranslation\?\.\(text\)/);
 assert.match(read('native/HookBridge.cs'),/TranslateMode\?TranslateFont\(\):""/);
 assert.match(read('core/hook-native.cjs'),/coverEnabled!==false\|\|preferences\.embedTranslation===true/);
 assert.match(read('core/hook-control.cjs'),/m\.matched&&h\.preferences\?\.embedTranslation===true/);
 const style=require('../core/game-style.js');
 for(const d of ['bilingual-en','english','none'])assert.match(read('core/game-style.js'),new RegExp("'"+d+"'"));
 const {HookNative}=require('../core/hook-native.cjs'),hook=Object.create(HookNative.prototype);hook.trace=()=>{};
 hook.originalText={kind:'patch',resolve:t=>t==='「やあ」'?{status:'exact',translation:'「嗨」',indices:[0]}:{status:'none'}};
 assert.strictEqual(hook.scriptTranslation('「やあ」'),'「嗨」');assert.strictEqual(hook.scriptTranslation('別'),'');
});

// E288: polling the dialog status must not report a search that is not actually scanning.
test('status says searching only while a scan is recorded and recent',()=>{
 const ot=require('../services/original-text.cjs'),data=fs.mkdtempSync(path.join(os.tmpdir(),'ot-s-')),game=fs.mkdtempSync(path.join(os.tmpdir(),'ot-g-'));
 const exe=path.join(game,'Game.exe');fs.writeFileSync(exe,'MZ');const row={id:'g',executable:exe},db={prepare:()=>({get:id=>id==='g'?row:undefined})};
 const write=ps=>{fs.mkdirSync(path.join(data,'data/config'),{recursive:true});fs.writeFileSync(path.join(data,'data/config/original-text.json'),JSON.stringify({g:{patchSearch:ps}}));};
 write({running:false,declined:true,at:Date.now()});assert.strictEqual(ot.status(data,db,'g').patchSearch.running,false);
 write({running:true,at:Date.now()-10*60*1000});assert.strictEqual(ot.status(data,db,'g').patchSearch.running,false,'a scan left over from a closed app');
 write({running:true,at:Date.now()});assert.strictEqual(ot.status(data,db,'g').patchSearch.running,true);
});

// E290 / E291: covers for Chinese-tagged folder titles, Steam reviews for folder games, review language filter.
test('cover search cleans release tags and spells kanji the Japanese way; Steam found through VNDB',async()=>{
 const e=require('../services/game-enrichment.cjs');
 const c=e.candidates({row:{title:'[001229][TYPE-MOON] 月姬 v1.6',executable:'E:/x/Tsukihime.exe'},original:{library:{}}});
 assert.strictEqual(c[0],'月姫');assert.ok(c.includes('Tsukihime'));
 assert.ok(!e.candidates({row:{title:'eden*',executable:'E:/x/eden_en.exe'},original:{library:{}}}).includes('eden_en'));
 const {GameReviews}=require('../services/game-reviews.cjs'),r=Object.create(GameReviews.prototype),seen=[];
 r.identity=async(g,k)=>k==='vndb'?{id:'v4'}:null;
 r.request=async(url,opt)=>{seen.push(url);return {results:[{extlinks:[{url:'https://vndb.org/x'}]},{extlinks:[{url:'https://store.steampowered.com/app/324160/'}]}]};};
 assert.deepStrictEqual(await r.find_steam({appid:''}),{id:'324160'});
 const src=fs.readFileSync(path.join(root,'services/game-reviews.cjs'),'utf8');assert.match(src,/filterLanguage=\$\{lang\}/);
});

// E292: a Chinese-named translated launcher next to the kana-named original: "find" picks the original.
test('find original exe: kana-named launcher with engine companion files wins over a Chinese-named one',()=>{
 const gl=require('../services/game-language.cjs'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'mhy-')),data=fs.mkdtempSync(path.join(os.tmpdir(),'mhyd-'));
 const zh=path.join(dir,'魔法使之夜.exe'),ja=path.join(dir,'魔法使いの夜.exe');
 for(const f of [zh,ja,path.join(dir,'ファイル破損チェックツール.exe')])fs.writeFileSync(f,Buffer.concat([Buffer.from('MZ'),Buffer.alloc(300000)]));
 fs.writeFileSync(path.join(dir,'魔法使いの夜.cf'),'x');
 let row={id:'m',executable:zh,original:JSON.stringify({library:{dir}})};
 const db={prepare:sql=>({get:()=>row,run:(exe,orig)=>{row={...row,executable:exe,original:orig};}})};
 const r=gl.originalExecutable(db,'m',data,'find');
 assert.strictEqual(r.executable,ja);
});

// E294: a Chinese script read by the hook is flagged, Japanese lines (even all-kanji ones) are not.
test('hook flags a run of Simplified Chinese lines, never Japanese ones',()=>{
 const {HookNative}=require('../core/hook-native.cjs');
 const run=lines=>{const h=Object.create(HookNative.prototype);h.state={};h.trace=()=>{};h.notify=v=>{h.state={...h.state,...v};};for(const t of lines)h.languageCheck(t);return !!h.state.sourceChinese;};
 assert.strictEqual(run(['一望无际的白色世界…','无尽的白色世界……','这条路是通往学校的主干道']),true);
 assert.strictEqual(run(['学校に続く大通り','本来生徒賑','計算歩行','天気予報','東京都庁舎前']),false);
 assert.match(fs.readFileSync(path.join(root,'core/japanese-restore.cjs'),'utf8'),/reason:'NO_JAPANESE_TEXT'/);
});

// E295: a folder named as an English or Chinese edition keeps its own program in the library.
test('library lists a translated-edition folder with its main program',()=>{
 const src=fs.readFileSync(path.join(root,'core/library.cjs'),'utf8');
 assert.match(src,/function mainExe\(dir,translatedDir=false\)\{\r?\n if\(!translatedDir&&isTranslated\(dir\)\)return ''/);
 assert.match(src,/if\(g&&g\.engine&&!g\.exe&&isTranslated\(g\.dir\)\)\{const own=mainExe\(g\.dir,true\)/);
});

// E296: KiriKiri inline commands (%n;) leak no more, and a line handed over twice is shown once.
test('KiriKiri %n; codes are removed and doubled lines kept once',()=>{
 const lt=require('../core/language-tracks.cjs');
 assert.strictEqual(lt.japaneseTrack('%n;あの瞬間のことは、あやふやにしか思い出せない。あの瞬間のことは、あやふやにしか思い出せない。V'),'あの瞬間のことは、あやふやにしか思い出せない。');
 assert.strictEqual(lt.japaneseTrack('%n;汗は垂れ流して、息が切れて苦しい。\n左の指は痺れて。汗は垂れ流して、息が切れて苦しい。左の指は痺れて。'),'汗は垂れ流して、息が切れて苦しい。\n左の指は痺れて。');
 assert.strictEqual(lt.japaneseTrack('はい。はい。'),'はい。はい。');assert.strictEqual(lt.japaneseTrack('100%の力'),'100%の力');
});

// E297: release notes are bilingual collapsible blocks; the update card still shows the reader's language.
test('release body uses language blocks; update card reads them',()=>{
 const rel=fs.readFileSync(path.join(root,'Release.ps1'),'utf8');
 assert.match(rel,/function LangBlocks/);assert.match(rel,/Hotfix \$stamp/);
 const src=fs.readFileSync(path.join(root,'web/update-notice.js'),'utf8').replace(/\r\n/g,'\n'),a=src.indexOf('function blockText'),b=src.indexOf('let card=null');
 const notesFor=new Function(src.slice(a,b)+';return notesFor;')();
 const body='## MeguLit v9\n\n<details open>\n<summary><b>中文</b></summary>\n\n- 修复A\n\n</details>\n\n---\n\n<details>\n<summary><b>English</b></summary>\n\n- Fixed A\n\n</details>';
 assert.deepStrictEqual(notesFor(body,'zh').map(n=>n.text),['MeguLit v9','修复A']);
 assert.deepStrictEqual(notesFor(body,'en').map(n=>n.text),['MeguLit v9','Fixed A']);
 assert.deepStrictEqual(notesFor('- 旧\n---\n- old','en').map(n=>n.text),['old']);
});
