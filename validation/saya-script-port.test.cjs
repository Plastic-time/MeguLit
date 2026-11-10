// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E409 Steam "The Song of Saya" + the 2003 Japanese script.pak: the Japanese script is ported into script.npk.
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const npk=require('../core/nitroplus-npk.cjs'),port=require('../core/saya-script-port.cjs'),jio=require('../core/japanese-import-original.cjs');

// Shift-JIS encoder for the fixture, built from the decoder.
const SJ=(()=>{const dec=new TextDecoder('shift_jis'),map=new Map();
 for(let a=0x81;a<=0xfc;a++){if(a>0x9f&&a<0xe0)continue;for(let b=0x40;b<=0xfc;b++){if(b===0x7f)continue;const ch=dec.decode(Buffer.from([a,b]));if(ch.length===1&&!map.has(ch))map.set(ch,[a,b]);}}
 return s=>Buffer.from([...s].flatMap(ch=>ch.charCodeAt(0)<0x80?[ch.charCodeAt(0)]:map.get(ch)||[0x81,0x48]));})();
const BOM=String.fromCharCode(0xfeff),BS=String.fromCharCode(92);

const STEAM=[BOM+'//コメント','<MARKER NAME="#1">','<clear>','<BACKGROUND SRC="bg01">//','<box type="9">',
 '<voice NAME="A" SRC="2'+BS+'000104">“中文一”<k>','　','　中文叙述一。<k>',
 '<voice NAME="B" SRC="2'+BS+'000205">“中文二”<k>','　中文叙述二。','','<A HREF="sy020.nps">'].join('\r\n');
const JAPANESE=['','<MARKER NAME="#1">','<clear>','<BACKGROUND SRC="bg01">','<box type="9">',
 '<VOICE NAME="A" SRC="2'+BS+'000104">「日本語一」<k>','　','　日本語の地の文です。<k>',
 '<VOICE NAME="B" SRC="2'+BS+'000205">「前半」<k><VOICE NAME="B" SRC="2'+BS+'000205_2">後半の<R TEXT="かんじ">漢字</R>」<k>',
 '　日本語の地の文二。','','<clear>','<BACKGROUND SRC="hscene">','　カットされた文。','<A HREF="sy020.nps">'].join('\r');

function fixture(){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'saya-')),game=path.join(base,'The Song of Saya'),jp=path.join(base,'沙耶の唄');
 fs.mkdirSync(game);fs.mkdirSync(jp);
 fs.writeFileSync(path.join(game,'Saya_Steam.exe'),'exe');
 fs.writeFileSync(path.join(game,'script.npk'),npk.createNpk({'media/script/main.nut':Buffer.from('main'),'media/script/nps/sy010.nps':Buffer.from(STEAM,'utf8')}));
 fs.writeFileSync(path.join(jp,'saya.exe'),'exe');
 fs.writeFileSync(path.join(jp,'script.pak'),npk.createPak({'script/cg.nps':SJ('<CG>'),'script/saya.txt':SJ(JAPANESE)}));
 return {base,game,jp};}
const scene=file=>{const a=npk.readNpk(fs.readFileSync(file));return npk.npkData(a,a.entries.find(e=>/sy010/.test(e.name))).toString('utf8');};

test('NPK2 round trip: index, segments over 64 KiB, SHA-256',()=>{
 const big=Buffer.alloc(150000);for(let i=0;i<big.length;i++)big[i]=(i*7)&255;
 const a=npk.readNpk(npk.createNpk({'x/a.bin':big,'b.txt':Buffer.from('b')}));
 assert.deepStrictEqual(a.entries.map(e=>e.name),['x/a.bin','b.txt']);
 assert.equal(a.entries[0].segments.length,3);assert.ok(npk.npkData(a,a.entries[0]).equals(big));
 const re=npk.readNpk(npk.writeNpk(a,new Map([['b.txt',Buffer.from('new')]])));
 assert.ok(npk.npkData(re,re.entries[0]).equals(big),'untouched entry copied as is');assert.equal(npk.npkData(re,re.entries[1]).toString(),'new');
 assert.throws(()=>npk.readNpk(npk.createNpk({a:Buffer.from('a')},{key:Buffer.alloc(32,1)})),/NPK_KEY|NPK_INDEX/);
});

test('port: every Steam text line gets its Japanese line, commands and layout stay',()=>{
 const {scenes,report}=port.port({'media/script/nps/sy010.nps':STEAM},{'script/saya.txt':JAPANESE});
 const out=scenes['media/script/nps/sy010.nps'],lines=out.split('\r\n');
 assert.equal(report.rate,1);assert.equal(report.joined,1);assert.equal(report.originalUnused.length,1,'the cut scene is reported');
 assert.ok(out.startsWith(BOM+'//コメント'));assert.equal(lines.length,STEAM.split('\r\n').length);
 assert.equal(lines[3],'<BACKGROUND SRC="bg01">//');
 assert.equal(lines[5],'<voice NAME="A" SRC="2'+BS+'000104">「日本語一」<k>');
 assert.equal(lines[7],'　日本語の地の文です。<k>');
 assert.equal(lines[8],'<voice NAME="B" SRC="2'+BS+'000205">「前半」<k>後半の<R TEXT="かんじ">漢字</R>」<k>');
 assert.equal(lines[9],'　日本語の地の文二。');
});

test('import: Steam Saya + Japanese script.pak previews a port, applies with a backup, restores byte for byte',async()=>{
 const {base,game,jp}=fixture(),before=fs.readFileSync(path.join(game,'script.npk'));
 const p=await jio.preview(game,jp);
 assert.equal(p.state,'port');assert.equal(p.rate,1);assert.equal(p.cut,1);
 assert.ok(fs.readFileSync(path.join(game,'script.npk')).equals(before),'preview writes nothing');
 const r=await jio.apply(game,path.join(jp,'saya.exe'),path.join(game,'Saya_Steam.exe'));
 assert.ok(r.port);assert.equal(r.exe,'','the Steam program stays');
 assert.match(scene(path.join(game,'script.npk')),/日本語の地の文です/);
 assert.ok(fs.readFileSync(path.join(game,'.megulit-japanese-import','files','script.npk')).equals(before));
 assert.ok(fs.existsSync(path.join(game,'.megulit-japanese-import','saya-port-report.json')));
 assert.equal(jio.readManifest(game).kind,'saya-port');
 await assert.rejects(jio.preview(game,jp),/ALREADY_IMPORTED/);
 const u=jio.restore(game);assert.deepStrictEqual(u.skipped,[]);
 assert.ok(fs.readFileSync(path.join(game,'script.npk')).equals(before));assert.ok(!fs.existsSync(path.join(game,'.megulit-japanese-import')));
 fs.rmSync(base,{recursive:true,force:true});
});

test('a different NPK2 game or a source without the SAYA pak is not ported',async()=>{
 const {base,game,jp}=fixture();
 fs.rmSync(path.join(jp,'script.pak'));fs.writeFileSync(path.join(jp,'script.pak'),npk.createPak({'script/x.txt':SJ('x')},'XXXX'));
 assert.equal(port.detect(game,jp),null);
 fs.writeFileSync(path.join(game,'script.npk'),npk.createNpk({a:Buffer.from('a')},{key:Buffer.alloc(32,7)}));
 assert.equal(port.steamArchive(game),'');
 fs.rmSync(base,{recursive:true,force:true});
});

test('zero-latency translation: the ported script reads as Japanese and the backup lines up as the Chinese patch',async()=>{
 const {base,game,jp}=fixture();await jio.apply(game,jp,'');
 const scenes=require('../services/original-engines/scenes.cjs');
 assert.equal(scenes.detect(game),'nitroplus-n4');
 const [s]=scenes.read('nitroplus-n4',game);assert.ok(s.lines.includes('日本語の地の文です。'));
 assert.deepStrictEqual(s.ruby[s.lines.findIndex(t=>t.includes('漢字'))],[['漢字','かんじ']]);
 const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(':memory:');db.exec('CREATE TABLE games(id TEXT,executable TEXT,removed_at TEXT)');
 const exe=path.join(game,'Saya_Steam.exe');db.prepare('INSERT INTO games VALUES(?,?,NULL)').run('1',exe);
 const ot=require('../services/original-text.cjs'),data=fs.mkdtempSync(path.join(os.tmpdir(),'ot-'));
 const r=await ot.autoPatch(data,db,'1',{drives:false,force:true});assert.ok(r.found,JSON.stringify(r));
 assert.strictEqual(ot.provider(data,exe).resolve('　日本語の地の文です。').translation.trim(),'中文叙述一。');
 fs.rmSync(base,{recursive:true,force:true});fs.rmSync(data,{recursive:true,force:true});
});

// Real files when this machine has them (never written: the result stays in memory).
const STEAM_DIR='E:\\steam\\steamapps\\common\\The Song of Saya',JP_DIR='E:\\GAL\\[031226][Nitro+] 沙耶の唄';
test('real Steam Saya + 2003 script.pak: full alignment and a valid archive',{skip:!(fs.existsSync(path.join(STEAM_DIR,'script.npk'))&&fs.existsSync(path.join(JP_DIR,'script.pak')))&&'no local copy'},()=>{
 const found=port.detect(STEAM_DIR,JP_DIR);if(!found)return;
 const {buffer,report}=port.build(fs.readFileSync(found.steam),fs.readFileSync(found.pak));
 assert.ok(report.rate>=.99,String(report.rate));assert.ok(npk.readNpk(buffer).entries.length>100);
});
