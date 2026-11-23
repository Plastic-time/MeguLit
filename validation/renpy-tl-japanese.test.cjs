// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const {DatabaseSync}=require('node:sqlite');
const ot=require('../services/original-text.cjs'),scenes=require('../services/original-engines/scenes.cjs'),{probeGame}=require('../services/adapter-probe-core.cjs');

/* Minimal Ren'Py .rpyc builder (protocol-2 pickle of (data, stmts)) */
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const pStr=s=>{const b=Buffer.from(s,'utf8');return Buffer.concat([Buffer.from([0x58]),u32(b.length),b]);};
const pGlobal=(mod,name)=>Buffer.from('c'+mod+'\n'+name+'\n','latin1');
const pDict=entries=>Buffer.concat([Buffer.from([0x28]),...entries.flatMap(([k,v])=>[pStr(k),v]),Buffer.from([0x64])]);
const pList=items=>Buffer.concat([Buffer.from([0x28]),...items,Buffer.from([0x6c])]);
const pObj=(mod,name,state)=>Buffer.concat([pGlobal(mod,name),Buffer.from([0x29,0x81]),pDict(state),Buffer.from([0x62])]);
function makeRpyc(stmts,restructured){
 const payloads=(restructured?[stmts,restructured]:[stmts]).map(nodes=>zlib.deflateSync(Buffer.concat([
  Buffer.from([0x80,0x02,0x28,0x7d]),pList(nodes),Buffer.from([0x74,0x2e]),
 ])));
 const header=Buffer.alloc(10+12*(payloads.length+1));
 header.write('RENPY RPC2',0,'latin1');
 let offset=header.length;
 for(let i=0;i<payloads.length;i++){
  const entry=10+12*i;
  header.writeUInt32LE(i+1,entry);
  header.writeUInt32LE(offset,entry+4);
  header.writeUInt32LE(payloads[i].length,entry+8);
  offset+=payloads[i].length;
 }
 return Buffer.concat([header,...payloads]);
}
function makeRpa(entries){
 const key=0x42424242,hdr=Buffer.from(`RPA-3.0 0000000000000000 ${key.toString(16).padStart(8,'0')}\n`,'latin1');
 const datas=[],idxEntries=[];let offset=hdr.length;
 for(const [name,buf] of entries){
  datas.push(buf);
  const tup=Buffer.concat([Buffer.from([0x28]),Buffer.from([0x4a]),u32((offset^key)>>>0),Buffer.from([0x4a]),u32((buf.length^key)>>>0),pStr(''),Buffer.from([0x74])]);
  idxEntries.push([name,pList([tup])]);offset+=buf.length;
 }
 const idxPickle=Buffer.concat([Buffer.from([0x80,0x02]),pDict(idxEntries),Buffer.from([0x2e])]);
 const idxZlib=zlib.deflateSync(idxPickle);
 const finalHdr=Buffer.from(`RPA-3.0 ${offset.toString(16).padStart(16,'0')} ${key.toString(16).padStart(8,'0')}\n`,'latin1');
 return Buffer.concat([finalHdr,...datas,idxZlib]);
}
const sayNode=(what,who=null)=>pObj('renpy.ast','Say',[['what',pStr(what)],...(who?[['who',pStr(who)]]:[])]);
const translateNode=(id,lang,block)=>pObj('renpy.ast','Translate',[['identifier',pStr(id)],['language',lang===null?Buffer.from([0x4e]):pStr(lang)],['block',pList(block)]]);
const menuChoice=text=>pObj('renpy.ast','Menu',[['items',pList([pList([pStr(text)])])]]);

function archivedScripts(t,entries){
 const game=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-renpy-rpyc-slots-'));
 t.after(()=>fs.rmSync(game,{recursive:true,force:true}));
 const g=path.join(game,'game');
 fs.mkdirSync(g);
 fs.writeFileSync(path.join(g,'archive.rpa'),makeRpa(entries));
 return {game,g};
}

test("Ren'Py: non-Japanese base script reads Japanese tl/*.rpy and pairs Chinese tl/*.rpy",async t=>{
 const top=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-renpy-tl-rpy-'));
 t.after(()=>fs.rmSync(top,{recursive:true,force:true}));
 const game=path.join(top,'game-root'),g=path.join(game,'game'),data=path.join(top,'data');
 fs.mkdirSync(path.join(g,'tl','japanese'),{recursive:true});
 fs.mkdirSync(path.join(g,'tl','schinese'),{recursive:true});
 const exe=path.join(game,'game.exe');fs.writeFileSync(exe,'MZ');
 const enLines=['Help me buy some milk.','I am going to the store now.','It is very dark outside today.','I just need to say one word.'];
 const jaLines=['牛乳を買うのを手伝って。','今すぐお店に行くよ。','今日は外がとても暗い。','簡単な言葉を言う必要がある。'];
 const zhLines=['帮我买瓶牛奶。','我现在就去商店。','今天外面非常黑。','我只需要说一个词。'];
 fs.writeFileSync(path.join(g,'script.rpy'),'label start:\n'+enLines.map(s=>`    p "${s}"`).join('\n')+'\n    return\n');
 fs.writeFileSync(path.join(g,'tl','japanese','script.rpy'),enLines.map((en,i)=>`translate japanese line_${i}:\n    # p "${en}"\n    p "${jaLines[i]}"\n`).join('\n'));
 fs.writeFileSync(path.join(g,'tl','schinese','script.rpy'),enLines.map((en,i)=>`translate schinese line_${i}:\n    # p "${en}"\n    p "${zhLines[i]}"\n`).join('\n'));

 const probe=probeGame({dir:game,executable:exe,title:'Milk test'});
 assert.equal(probe.step,'ok');
 assert.equal(probe.detected,'renpy');
 assert.equal(probe.japaneseLines,4);

 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec('CREATE TABLE games(id TEXT,executable TEXT,removed_at TEXT)');
 db.prepare('INSERT INTO games VALUES(?,?,NULL)').run('1',exe);
 assert.equal(ot.scanRunning(data,'1',exe).runtime.engine,'renpy');
 const r=await ot.autoPatch(data,db,'1',{drives:false,force:true});
 assert.ok(r.found,JSON.stringify(r));
 assert.equal(ot.provider(data,exe).resolve('牛乳を買うのを手伝って。').translation,'帮我买瓶牛奶。');
});

test("Ren'Py: compiled RPA base script reads Japanese tl/*.rpyc inside RPA and pairs Chinese tl/*.rpyc",async t=>{
 const top=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-renpy-tl-rpa-'));
 t.after(()=>fs.rmSync(top,{recursive:true,force:true}));
 const game=path.join(top,'game-root'),g=path.join(game,'game'),data=path.join(top,'data');
 fs.mkdirSync(g,{recursive:true});
 const exe=path.join(game,'game.exe');fs.writeFileSync(exe,'MZ');
 const baseRpyc=makeRpyc([
  translateNode('s_1',null,[sayNode('Help me buy some milk.','p')]),
  translateNode('s_2',null,[sayNode('I am going to the store now.','p')]),
 ]);
 const jaRpyc=makeRpyc([
  translateNode('s_1','japanese',[sayNode('牛乳を買うのを手伝って。','p')]),
  translateNode('s_2','japanese',[sayNode('今すぐお店に行くよ。','p')]),
 ]);
 const zhRpyc=makeRpyc([
  translateNode('s_1','schinese',[sayNode('帮我买瓶牛奶。','p')]),
  translateNode('s_2','schinese',[sayNode('我现在就去商店。','p')]),
 ]);
 fs.writeFileSync(path.join(g,'archive.rpa'),makeRpa([
  ['script.rpyc',baseRpyc],
  ['tl/japanese/script.rpyc',jaRpyc],
  ['tl/schinese/script.rpyc',zhRpyc],
 ]));

 const probe=probeGame({dir:game,executable:exe,title:'Milk RPA test'});
 assert.equal(probe.step,'ok');
 assert.equal(probe.detected,'renpy');
 assert.equal(probe.japaneseLines,2);

 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec('CREATE TABLE games(id TEXT,executable TEXT,removed_at TEXT)');
 db.prepare('INSERT INTO games VALUES(?,?,NULL)').run('1',exe);
 assert.equal(ot.scanRunning(data,'1',exe).runtime.engine,'renpy');
 const r=await ot.autoPatch(data,db,'1',{drives:false,force:true});
 assert.ok(r.found,JSON.stringify(r));
 assert.equal(ot.provider(data,exe).resolve('今すぐお店に行くよ。').translation,'我现在就去商店。');
});

for(const sameOrder of [true,false]){
 test(`Ren'Py: restructured RPA dialogue IDs ${sameOrder?'recover compiled Japanese lines':'require matching source lines'}`,t=>{
  const game=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-renpy-rpyc-slots-'));
  t.after(()=>fs.rmSync(game,{recursive:true,force:true}));
  const g=path.join(game,'game');
  fs.mkdirSync(g);
  const exe=path.join(game,'game.exe');
  fs.writeFileSync(exe,'MZ');
  const source=['Сейчас начинается новый урок.','Пожалуйста, откройте свою книгу.'];
  const japanese=['授業が始まります。','本を開いてください。'];
  const blocks=source.map((text,i)=>translateNode(`lesson_${i}`,null,[sayNode(text)]));
  fs.writeFileSync(path.join(g,'archive.rpa'),makeRpa([
   ['script.rpyc',makeRpyc(source.map(text=>sayNode(text)),sameOrder?blocks:blocks.reverse())],
   ['tl/japanese/script.rpyc',makeRpyc(japanese.map((text,i)=>translateNode(`lesson_${i}`,'japanese',[sayNode(text)])))],
  ]));
  const probe=probeGame({dir:game,executable:exe,title:'Compiled lesson'});
  assert.equal(probe.japaneseLines,sameOrder?2:0);
  if(sameOrder)assert.equal(probe.step,'ok');
  const [scene]=scenes.read('renpy',game);
  assert.deepEqual(scene.lines,sameOrder?japanese:source);
  if(sameOrder)assert.deepEqual(scene.ids,['lesson_0','lesson_1']);
 });
}

test('Ren\'Py: recovered IDs pair the compiled Chinese patch even without a Japanese match for that scene',t=>{
 const raw='Are you coming with me?';
 const {game,g}=archivedScripts(t,[
  ['check.rpyc',makeRpyc([sayNode(raw)],[translateNode('check',null,[sayNode(raw)])])],
  ['start.rpyc',makeRpyc([translateNode('start',null,[sayNode('The lesson is starting.')])])],
  ['tl/japanese/start.rpyc',makeRpyc([translateNode('start','japanese',[sayNode('授業が始まります。')])])],
  ['tl/schinese/check.rpyc',makeRpyc([translateNode('check','schinese',[sayNode('你要跟我一起去吗？')])])],
 ]);
 const base=scenes.read('renpy',game);
 assert.deepEqual(base[0].lines,[raw]);
 assert.deepEqual(base[0].ids,['check']);
 const [paired]=scenes.ENGINES.renpy.patchLines(base,{dirs:[g]});
 assert.equal(paired.patched,true);
 assert.deepEqual(paired.lines,['你要跟我一起去吗？']);
});

test('Ren\'Py: matching line text with different dialogue and choice roles cannot supply IDs',t=>{
 const first='The lesson is starting.',second='Go to class.';
 const {game}=archivedScripts(t,[
  ['script.rpyc',makeRpyc([sayNode(first),menuChoice(second)],[menuChoice(first),translateNode('choice',null,[sayNode(second)])])],
  ['tl/japanese/script.rpyc',makeRpyc([translateNode('choice','japanese',[sayNode('授業に行きます。')])])],
 ]);
 const [scene]=scenes.read('renpy',game);
 assert.deepEqual(scene.lines,[first,second]);
 assert.equal(scene.roles,'bc');
 assert.equal(scene.ids,undefined);
});

test('Ren\'Py: restructured IDs only fill missing entries in the first slot',t=>{
 const first=sayNode('The lesson is starting.'),second=sayNode('Please open your book.');
 const {game}=archivedScripts(t,[
  ['script.rpyc',makeRpyc([translateNode('existing',null,[first]),second],
    [translateNode('other',null,[first]),translateNode('recovered',null,[second])])],
  ['tl/japanese/script.rpyc',makeRpyc([
   translateNode('existing','japanese',[sayNode('授業が始まります。')]),
   translateNode('other','japanese',[sayNode('別の授業です。')]),
   translateNode('recovered','japanese',[sayNode('本を開いてください。')]),
  ])],
 ]);
 const [scene]=scenes.read('renpy',game);
 assert.deepEqual(scene.ids,['existing','recovered']);
 assert.deepEqual(scene.lines,['授業が始まります。','本を開いてください。']);
});

test('Ren\'Py: a matching second slot without translated dialogue IDs preserves the scene',t=>{
 const text='The lesson is starting.',raw=[sayNode(text)];
 const {game}=archivedScripts(t,[
  ['script.rpyc',makeRpyc(raw,raw)],
  ['tl/japanese/script.rpyc',makeRpyc([translateNode('start','japanese',[sayNode('授業が始まります。')])])],
 ]);
 const [scene]=scenes.read('renpy',game);
 assert.deepEqual(scene.lines,[text]);
 assert.equal(scene.ids,undefined);
});

test('Ren\'Py: legacy compiled scripts expose only the unframed first slot',()=>{
 const rpyc=require('../services/original-engines/renpy-rpyc.cjs');
 const framed=makeRpyc([sayNode('古い形式でも読めます。')]);
 const legacy=framed.subarray(framed.readUInt32LE(14));
 assert.deepEqual(rpyc.parse(legacy).lines,['古い形式でも読めます。']);
 assert.equal(rpyc.data(legacy,{slot:2}),null);
 assert.deepEqual(rpyc.data(legacy,{all:true}),zlib.inflateSync(legacy));
});

test("Ren'Py: overlay replacement still parses the overlay buffer instead of s.parse()",t=>{
 const top=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-renpy-tl-overlay-'));
 t.after(()=>fs.rmSync(top,{recursive:true,force:true}));
 const g=path.join(top,'game');
 fs.mkdirSync(path.join(g,'tl','japanese'),{recursive:true});
 fs.writeFileSync(path.join(g,'script.rpy'),'label start:\n    p "Hello world."\n    p "Second line."\n    return\n');
 fs.writeFileSync(path.join(g,'tl','japanese','script.rpy'),
  'translate japanese l1:\n    # p "Hello world."\n    p "こんにちは。"\n\n'+
  'translate japanese l2:\n    # p "Second line."\n    p "二行目です。"\n');
 const withoutOverlay=scenes.read('renpy',top);
 assert.deepEqual(withoutOverlay[0].lines,['こんにちは。','二行目です。']);
 const overlay=new Map([['script.rpy',Buffer.from('label start:\n    p "上書きテキスト。"\n    return\n')]]);
 const withOverlay=scenes.read('renpy',top,overlay);
 assert.deepEqual(withOverlay[0].lines,['上書きテキスト。']);
 assert.equal(withOverlay[0].patched,true);
});

test("Ren'Py: expired deadline falls back to base scenes without throwing",t=>{
 const top=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-renpy-tl-deadline-'));
 t.after(()=>fs.rmSync(top,{recursive:true,force:true}));
 const g=path.join(top,'game');
 fs.mkdirSync(path.join(g,'tl','japanese'),{recursive:true});
 fs.writeFileSync(path.join(g,'script.rpy'),'label start:\n    p "Hello world."\n    return\n');
 fs.writeFileSync(path.join(g,'tl','japanese','script.rpy'),'translate japanese l1:\n    # p "Hello world."\n    p "こんにちは。"\n');
 const list=scenes.ENGINES.renpy.scenes(top,{deadline:Date.now()-1});
 assert.equal(list.length,1);
 assert.equal(list[0].parse,undefined);
 assert.deepEqual(scenes.ENGINES.renpy.parse(list[0].read()).lines,['Hello world.']);
});

test("Ren'Py: empty tl placeholder preserves source line; fingerprint tracks only selected Japanese tl",t=>{
 const top=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-renpy-tl-fp-'));
 t.after(()=>fs.rmSync(top,{recursive:true,force:true}));
 const g=path.join(top,'game');fs.mkdirSync(g,{recursive:true});
 fs.writeFileSync(path.join(g,'script.rpy'),'label start:\n    p "First line here."\n    p "Second line here."\n    p "Third line here."\n    return\n');
 const fpBase=scenes.fingerprint('renpy',top);
 fs.mkdirSync(path.join(g,'tl','schinese'),{recursive:true});
 fs.writeFileSync(path.join(g,'tl','schinese','script.rpy'),'translate schinese l1:\n    # p "First line here."\n    p "第一行。"\n');
 assert.equal(scenes.fingerprint('renpy',top),fpBase,'unselected Chinese tl must not invalidate fingerprint');
 fs.mkdirSync(path.join(g,'tl','japanese'),{recursive:true});
 fs.writeFileSync(path.join(g,'tl','japanese','script.rpy'),
  'translate japanese l1:\n    # p "First line here."\n    p "一行目です。"\n\n'+
  'translate japanese l2:\n    # p "Second line here."\n    p ""\n\n'+
  'translate japanese l3:\n    # p "Third line here."\n    p "三行目です。"\n');
 const fpWithJa=scenes.fingerprint('renpy',top);
 assert.notEqual(fpWithJa,fpBase,'selected Japanese tl must update fingerprint');
 fs.writeFileSync(path.join(g,'tl','schinese','script.rpy'),'translate schinese l1:\n    # p "First line here."\n    p "修改后的第一行。"\n');
 assert.equal(scenes.fingerprint('renpy',top),fpWithJa,'changing unselected Chinese tl must not invalidate fingerprint');
 const list=scenes.read('renpy',top);
 assert.deepEqual(list[0].lines,['一行目です。','Second line here.','三行目です。']);
});

test("Ren'Py: Japanese base script stays preferred over tl/ folders and leaves fingerprint unchanged",t=>{
 const top=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-renpy-jp-base-'));
 t.after(()=>fs.rmSync(top,{recursive:true,force:true}));
 const g=path.join(top,'game');fs.mkdirSync(g,{recursive:true});
 fs.writeFileSync(path.join(g,'script.rpy'),'label start:\n    h "あ"\n    h "い"\n    h "う"\n    h "え"\n    h "お"\n    return\n');
 const fpBefore=scenes.fingerprint('renpy',top);
 fs.mkdirSync(path.join(g,'tl','english'),{recursive:true});
 fs.writeFileSync(path.join(g,'tl','english','script.rpy'),'translate english l_1:\n    # h "あ"\n    h "Good morning."\n');
 assert.equal(scenes.fingerprint('renpy',top),fpBefore);
 const list=scenes.read('renpy',top);
 assert.deepEqual(list[0].lines,['あ','い','う','え','お']);
});

test("Ren'Py: stray kana in Chinese tl is not mistaken for Japanese; code-only leading files do not hide Japanese base",t=>{
 const top=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-renpy-tl-guard-'));
 t.after(()=>fs.rmSync(top,{recursive:true,force:true}));
 // Case 1: English base + Chinese tl with one stray kana ('の') must NOT select Chinese tl as Japanese
 const g1=path.join(top,'en','game');fs.mkdirSync(path.join(g1,'tl','schinese'),{recursive:true});
 const lines=['Line one here.','Line two here.','Line three here.','Line four here.','Line five here.'];
 fs.writeFileSync(path.join(g1,'script.rpy'),'label start:\n'+lines.map(s=>`    p "${s}"`).join('\n')+'\n    return\n');
 const zh=['第一行。','第二行。','第三行。','第四行。','第五行の。'];
 fs.writeFileSync(path.join(g1,'tl','schinese','script.rpy'),lines.map((en,i)=>`translate schinese l_${i}:\n    # p "${en}"\n    p "${zh[i]}"\n`).join('\n'));
 assert.deepEqual(scenes.read('renpy',path.join(top,'en'))[0].lines,lines);

 // Case 2: 10 code-only files sorting before script.rpy must not hide Japanese base
 const g2=path.join(top,'jp','game');fs.mkdirSync(path.join(g2,'tl','japanese'),{recursive:true});
 for(let i=0;i<10;i++)fs.writeFileSync(path.join(g2,`00_init_${String(i).padStart(2,'0')}.rpy`),'init python:\n    pass\n');
 fs.writeFileSync(path.join(g2,'script.rpy'),'label start:\n    h "あ"\n    h "い"\n    h "う"\n    h "え"\n    h "お"\n    return\n');
 fs.writeFileSync(path.join(g2,'tl','japanese','script.rpy'),'translate japanese l_0:\n    # h "あ"\n    h "別の文"\n');
 const jpScenes=scenes.read('renpy',path.join(top,'jp'));
 const mainScene=jpScenes.find(s=>s.name==='script.rpy');
 assert.deepEqual(mainScene.lines,['あ','い','う','え','お']);
});
