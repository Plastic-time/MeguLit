// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E450 The game's own voice for a line: voice references in scripts, the catalog of a game folder, scan, runtime clips.
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const ref=require('../services/original-engines/voice-ref.cjs'),scenes=require('../services/original-engines/scenes.cjs'),paz=require('../services/original-engines/paz.cjs');
const gv=require('../services/game-voice.cjs');
const OGG=Buffer.concat([Buffer.from('OggS','latin1'),Buffer.alloc(40,1)]);
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'megulit-voice-'));
test('voice-ref: KAG voice tags and name macros give the voice name',()=>{
 assert.equal(ref.fromTag('@voice storage=a001'),'a001');assert.equal(ref.fromTag('[vo s="voice/b02.ogg"]'),'b02');
 assert.equal(ref.fromTag('[playvoice file=MENO_00001.ogg]'),'MENO_00001');assert.equal(ref.fromTag('[nm t="名" s=c03]'),'c03');
 assert.equal(ref.fromTag('[bg storage=room]'),null);assert.equal(ref.fromTag('@playse storage=door'),null);});
test('KAG: the voice goes to the speech after it, through a speaker label line',()=>{
 const p=scenes.parseKs(Buffer.from('@voice storage=a001\n【ティアナ】\n「あい」\nおか\n[vo s=b02]「うえ」[p]\n'));
 assert.deepEqual(p.lines,['【ティアナ】','「あい」','おか','「うえ」']);assert.deepEqual(p.voices,[null,'a001',null,'b02']);
 assert.equal(scenes.parseKs(Buffer.from('あいう\n')).voices,undefined);});
test('paz: the voice column goes with its text',()=>{
 const p=paz.parse(Buffer.from('.message\t40\tsk\\sk1042.ogg\tA\tabc\n.message\t50\t\t\tdef','latin1'));
 assert.deepEqual(p.lines,['A','abc','def']);assert.deepEqual(p.voices,[null,'sk1042',null]);});
test('norm: speaker names, quotes, spaces and end marks do not change the key',()=>{
 assert.equal(gv.keyOf('桜乃「兄さんと過ごす時間」'),gv.keyOf('「兄さんと 過ごす時間。」'));assert.equal(gv.keyOf('「……」'),null);});
test('scan and find: a voice in a folder is copied out once, a runtime clip never replaces it',()=>{
 const root=tmp(),dir=tmp();gv._reset();fs.mkdirSync(path.join(dir,'voice'));fs.writeFileSync(path.join(dir,'voice','A001.ogg'),OGG);
 const list=[{name:'s.ks',lines:['「こんにちは、','元気？」','ひとり言'],voices:['a001',null,'zz9']}];
 const r=gv.scan(root,dir,{engine:'kirikiri',scenes:list});assert.deepEqual([r.lines,r.voiced,r.found],[3,2,1]);
 const hit=gv.find(root,'「こんにちは、元気？」');assert.ok(hit);assert.equal(hit.source,'scan');assert.equal(hit.mime,'audio/ogg');
 assert.ok(gv.find(root,'こんにちは、'));fs.rmSync(path.join(dir,'voice'),{recursive:true});gv._reset();
 assert.equal(gv.find(root,'こんにちは、').source,'scan');
 assert.equal(gv.remember(root,'こんにちは、',OGG),false);
 const wav=Buffer.concat([Buffer.from('RIFF\0\0\0\0WAVE','latin1'),Buffer.alloc(32)]);assert.equal(gv.remember(root,'ひとり言です',wav.toString('base64')),true);
 const rt=gv.find(root,'ひとり言です');assert.equal(rt.source,'runtime');assert.equal(rt.mime,'audio/wav');assert.equal(gv.find(root,'知らない台詞'),null);});
test('catalog: RealLive/Siglus .ovk clips are numbered file*100000+id',()=>{
 const dir=tmp();const h=Buffer.alloc(4+16);h.writeUInt32LE(1,0);h.writeUInt32LE(OGG.length,4);h.writeUInt32LE(20,8);h.writeUInt32LE(7,12);
 fs.writeFileSync(path.join(dir,'z0414.ovk'),Buffer.concat([h,OGG]));const c=gv.catalog(dir);assert.deepEqual(c.get('koe:41400007')(),OGG);assert.equal(c.get('koe:1'),null);});
test('kind: only clips a browser plays',()=>{assert.equal(gv.kind(OGG).ext,'.ogg');assert.equal(gv.kind(Buffer.alloc(20)),null);});
test('npk: <voice src> goes with the spoken line',()=>{const npk=require('../services/original-engines/npk.cjs');
 const s="\r\n//【女】\r\n<voice name='a' src='voice/a00/2000010c16'>\r\n「起立」\r\n",b=Buffer.alloc(8+Buffer.byteLength(s));b.writeUInt32LE(0x08000010,0);b.writeUInt32LE(Buffer.byteLength(s),4);b.write(s,8);
 assert.deepEqual(npk.engine.parse(b).voices,[null,'2000010c16']);});
test('fvp: the number pushed before a spoken line names its clip in nine digits',()=>{const fvp=require('../services/original-engines/fvp.cjs');
 const sj=Buffer.from([0x82,0xa0,0x82,0xa2,0x82,0xa4]);const code=Buffer.concat([Buffer.from([0x0a]),Buffer.from([0x5c,0xf6,0x98,0x00]),Buffer.from([8,8,8,2,0x8d,1,0,0]),Buffer.from([0x0e,sj.length+1]),sj,Buffer.from([0])]);
 const b=Buffer.concat([Buffer.alloc(4),code]);b.writeUInt32LE(b.length,0);assert.deepEqual(fvp.parse(b).voices,['010024540']);});
test('catsystem2: KIF entry names decipher with the passphrase key',()=>{const c=require('../services/original-engines/catsystem2.cjs')._internal;
 const plain='KUO_kar04_001.ogg',key=0x12345678,ALPHA='zyxwvutsrqponmlkjihgfedcbaZYXWVUTSRQPONMLKJIHGFEDCBA';let k=((key>>>24)+(key>>>16)+(key>>>8)+key)&255;
 const enc=Buffer.alloc(0x40);for(let i=0;i<plain.length;i++,k++){const ch=plain[i],j=ALPHA.indexOf(ch);enc[i]=j<0?ch.charCodeAt(0):ALPHA.charCodeAt((0x33-j+k%0x34)%0x34);}
 assert.equal(c.decipherName(enc,key),plain);});
test('iga: the clip name before a line is its voice, music is not',()=>{const iga=require('../services/original-engines/iga.cjs');
 const t=Buffer.from([0x82,0xa0,0x82,0xa2,0x82,0xa4,0]);const b=Buffer.concat([Buffer.from('\x05bgm03\x07aok0003','latin1'),Buffer.from([0x04,0x00,t.length+1]),t,Buffer.from([0])]);
 assert.deepEqual(iga.parse(b).voices,['aok0003']);});
test('voice-cold: a KiriKiri game with voices the scan could not open is started once with the names to read',async()=>{
 const vc=require('../services/voice-cold.cjs'),root=tmp(),dir=tmp();const exe=path.join(dir,'game.exe');
 const pe=Buffer.alloc(4096);pe.writeUInt32LE(0x80,0x3c);pe.writeUInt16LE(0x14c,0x84);fs.writeFileSync(exe,pe);
 const out=path.join(tmp(),'cap');const hook=vc.HOOKS.kirikiri,saved={...hook};hook.wantFile=()=>path.join(out,'want.txt');hook.outDir=()=>path.join(out,'voice');hook.report=()=>path.join(out,'cold-done.txt');
 vc.consider.anyPlatform=true;const calls=[];
 vc._setRunner((job,seconds,done)=>{calls.push({job,seconds,want:fs.readFileSync(path.join(out,'want.txt'),'utf8')});fs.mkdirSync(path.join(out,'voice'),{recursive:true});fs.writeFileSync(path.join(out,'voice','uts001_001.ogg'),OGG);done('done');},()=>false);
 const finished=new Promise(r=>{const off=vc.onDone((job,result)=>{off();r(result);});});
 assert.equal(vc.consider(root,{executable:exe,dir,engine:'kirikiri-cx'},['uts001_001','uts001_002']),true);
 assert.equal(await finished,'done');assert.equal(calls.length,1);assert.match(calls[0].want,/uts001_001\.ogg\n/);assert.ok(calls[0].seconds>=60);
 assert.equal(vc.consider(root,{executable:exe,dir,engine:'kirikiri-cx'},['uts001_001','uts001_002']),false,'not again for the same gap');
 assert.equal(vc.consider(root,{executable:exe,dir,engine:'yuris'},['a']),false,'an engine without a hook is never started');
 assert.deepEqual(vc.outDirs(dir),[path.join(out,'voice')]);
 const c=gv.catalog(dir);assert.deepEqual(c.get('uts001_001')(),OGG,'clips a cold run read join the catalog');
 Object.assign(hook,saved);vc.consider.anyPlatform=false;});
test('voice-cold: a game the player has open is not started again',async()=>{
 const vc=require('../services/voice-cold.cjs'),root=tmp(),dir=tmp();const exe=path.join(dir,'g.exe');const pe=Buffer.alloc(4096);pe.writeUInt32LE(0x80,0x3c);pe.writeUInt16LE(0x8664,0x84);fs.writeFileSync(exe,pe);
 const out=path.join(tmp(),'cap'),hook=vc.HOOKS.kirikiri,saved={...hook};hook.wantFile=()=>path.join(out,'want.txt');hook.outDir=()=>path.join(out,'voice');vc.consider.anyPlatform=true;
 let started=0;vc._setRunner((j,s,done)=>{started++;done('done');},()=>true);
 const finished=new Promise(r=>{const off=vc.onDone((job,result)=>{off();r(result);});});
 vc.consider(root,{executable:exe,dir,engine:'kirikiri'},['x1']);assert.equal(await finished,'running');assert.equal(started,0);assert.ok(fs.existsSync(path.join(out,'want.txt')),'the DLL in the open game reads the names');
 Object.assign(hook,saved);vc.consider.anyPlatform=false;});
test('siglus: KOE calls go with the next message, branches give one line several voices, wrapped @mes is found',()=>{const s=require('../services/original-engines/siglus-source.cjs');
 const src=['@KOE(000100000,008)','@mes(16000020,【美佐枝】,「おのれはっ…」)@RET','@mes(16000030, ,怒りに任せて。)@RET','if(a){','@KOE(100600060,000)','}else{','@KOE(100600080,000)','}','		@SIZE(20)@mes(00060630,【杏】,（勝てば官軍）)@SIZE@RET','//@KOE(1,0)','「地の文の台詞」'].join('\n');
 assert.deepEqual(s.voiced(src),[{text:'「おのれはっ…」',koe:100000},{text:'怒りに任せて。',koe:null},{text:'（勝てば官軍）',koe:100600060},{text:'（勝てば官軍）',koe:100600080},{text:'「地の文の台詞」',koe:null}]);
 assert.equal(s._internal.smd5(Buffer.from('abc')).toString('hex'),'900150983cd24fb0d6963f7d28e17f72');});
