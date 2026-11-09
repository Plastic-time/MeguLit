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
 assert.match(ot,/find\(s=>s\?\.runtime\?\.file&&runningDirOf\(s\.runtime\)/,'folder engines are looked up by the game folder');assert.match(ot,/bgi:\{folder:true,/);
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
 im.configure({immersion:true,dialogDetection:'marker'});im.bind('g');im.source('「テスト」','krkr');t=500;im.marker(true);t=900;im.marker(false);
 for(t=1000;t<=2000;t+=100){im.source('「テスト」','krkr');im.tick();}
 assert.strictEqual(shown.at(-1),false);
});

test('calibration drops a read colour that inverts the text colour',()=>{
 const {combine}=require('../core/game-style-sync.cjs');const mk=(c,read)=>({width:100,height:50,read,style:{x:1,y:2,width:50,height:10,textColor:c,japaneseSize:20}});
 assert.strictEqual(combine([mk('#f7fcfe',false),mk('#030304',true)]).style.readTextColor,'');
 assert.strictEqual(combine([mk('#ffffff',false),mk('#4080ff',true)]).style.readTextColor,'#4080ff');
});
