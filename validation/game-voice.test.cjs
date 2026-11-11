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
test('aquaplus: the voice call (char,256,0,0,n) before message k names <scene>_<n>_<char> for the k-th non-name text',()=>{const a=require('../services/original-engines/aquaplus.cjs');
 const w=[];const push=v=>w.push(5,3,v),call=id=>w.push(4,id);w.push(0,0,0);
 push(0);push(256);push(0);push(0);push(0);call(138);push(0);push(1);call(131);push(1);push(1);call(131);push(5);push(256);push(0);push(0);push(1);call(138);push(2);push(1);call(131);
 const bnr=Buffer.alloc(w.length*4);w.forEach((v,i)=>bnr.writeInt32LE(v,i*4));
 const sj=s=>Buffer.from(new TextEncoder().encode(s));const txt=Buffer.concat([Buffer.from(',x.tga,,'),Buffer.from('\x8f\x74\x8a\xf3,\x81\x75\x82\xa0\x81\x76,\x82\xa2\x82\xa4\k,\x96\x83\x97\x9d,\x81\x75\x82\xa6\x81\x76','latin1')]);
 assert.deepEqual(a._internal.sceneVoices('2021_010',txt,bnr),[{text:'「あ」',ref:'2021_0000_00'},{text:'「え」',ref:'2021_0001_05'}]);});
test('xp3: Yuzusoft "sen:" archives get their real names back from the name table',()=>{const xp3=require('../services/original-engines/xp3.cjs'),zlib=require('node:zlib'),crypto=require('node:crypto');
 const real='uts001_001.ogg',md5=crypto.createHash('md5').update(Buffer.from(real,'utf16le')).digest('hex'),data=Buffer.from('OggS-data');
 const u64=v=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(v));return b;},u32=v=>{const b=Buffer.alloc(4);b.writeUInt32LE(v>>>0);return b;},u16=v=>{const b=Buffer.alloc(2);b.writeUInt16LE(v);return b;};
 const chunk=(tag,body)=>Buffer.concat([Buffer.from(tag,'latin1'),u64(body.length),body]);
 const nameEntry=Buffer.concat([u32(0x12345678),Buffer.from([real.length,0]),Buffer.from(real,'utf16le')]);
 const table=zlib.deflateSync(Buffer.concat([Buffer.from('hnfn','latin1'),u64(nameEntry.length),nameEntry]));
 const head=11+8,dataAt=head,tableAt=dataAt+data.length,indexAt=tableAt+table.length;
 const info=chunk('info',Buffer.concat([u32(0),u64(data.length),u64(data.length),u16(md5.length),Buffer.from(md5,'utf16le')]));
 const segm=chunk('segm',Buffer.concat([u32(0),u64(dataAt),u64(data.length),u64(data.length)]));
 const file=chunk('File',Buffer.concat([info,segm,chunk('adlr',u32(0x12345678))]));
 const sen=chunk('sen:',Buffer.concat([u64(tableAt),u32(0),u32(table.length),Buffer.alloc(24)]));
 const index=Buffer.concat([file,sen]);
 const xp=Buffer.concat([xp3.MAGIC,u64(indexAt),data,table,Buffer.from([0]),u64(index.length),index]);const p=path.join(tmp(),'voice.xp3');fs.writeFileSync(p,xp);
 const l=xp3.list(p);assert.equal(l.files[0].name,real);assert.equal(l.files[0].hashedName,md5);assert.deepEqual(xp3.read(p,l.files[0]),data);});
test('fvp: a voice number whose low byte is 0x0A is read from the first 0x0A; a 0x0A that is a call address is not a push',()=>{const fvp=require('../services/original-engines/fvp.cjs');
 const sj=Buffer.from([0x82,0xa0,0x82,0xa2]),text=Buffer.concat([Buffer.from([0x0e,sj.length+1]),sj,Buffer.from([0])]);
 const mk=code=>{const b=Buffer.concat([Buffer.alloc(4),code,text]);b.writeUInt32LE(b.length,0);return fvp.parse(b).voices;};
 assert.deepEqual(mk(Buffer.from([0x02,0x62,0x03,0x02,0x00,0x0a,0x0a,0x2d,0x31,0x01,0x08,0x08,0x02,0xbb,0x03,0x00,0x00])),['020000010']);
 assert.equal(mk(Buffer.from([0x08,0x08,0x02,0x0a,0x0b,0x02,0x00,0x08,0x08,0x08,0x02,0x69,0x1d,0x00,0x00])),undefined);});
test('fsb5: every setup header in the table parses to a mode list; a Vorbis sample becomes Ogg pages with the right granule end; PCM16 becomes WAV',()=>{const f=require('../services/original-engines/fsb5.cjs'),zlib=require('node:zlib');
 const b=zlib.inflateRawSync(fs.readFileSync(path.join(__dirname,'..','services','original-engines','fsb-vorbis-setups.bin')));let n=0;
 for(let p=0;p+8<=b.length;){const c=b.readUInt32LE(p),len=b.readUInt32LE(p+4),setup=b.subarray(p+8,p+8+len);assert.equal(zlib.crc32(setup)>>>0,c);const flags=f.modeFlags(setup,2);assert.ok(flags.length>=1&&flags.every(x=>x===0||x===1));p+=8+len;n++;}
 assert.equal(n,161);
 const crc=b.readUInt32LE(0),setup=f.setupFor(crc),flags=f.modeFlags(setup,2),mb=Math.max(0,Math.ceil(Math.log2(flags.length)));
 const pk=mode=>Buffer.from([(mode<<1)&0xff,1,2,3]),data=Buffer.concat([0,0,0].map(()=>{const p=pk(flags.indexOf(1)>=0?flags.indexOf(1):0),h=Buffer.alloc(2);h.writeUInt16LE(p.length);return Buffer.concat([h,p]);}));
 const ogg=f.toOgg({channels:2,rate:44100,samples:100000,crc,data});assert.equal(ogg.toString('latin1',0,4),'OggS');
 const pages=[];for(let i=0;i<ogg.length;){assert.equal(ogg.toString('latin1',i,i+4),'OggS');const segs=ogg[i+26];let len=27+segs;for(let k=0;k<segs;k++)len+=ogg[i+27+k];pages.push({flags:ogg[i+5],granule:Number(ogg.readBigInt64LE(i+6))});i+=len;}
 assert.equal(pages[0].flags,2);assert.equal(pages.at(-1).flags,4);const bs=flags[(pk(0)[0]>>1)&((1<<mb)-1)]?2048:256;assert.ok(pages.at(-1).granule>0);
 const wav=f.toWav({channels:1,rate:22050,data:Buffer.alloc(100)});assert.equal(wav.toString('latin1',0,4),'RIFF');assert.equal(wav.readUInt32LE(24),22050);});
test('naninovel voices: clips align in order to lines with a speaker, never against the line-number order, and only when the length fits',()=>{const nv=require('../services/original-engines/naninovel-voice.cjs');
 const L=[{text:'地の文。',author:'',idx:0},{text:'「おはよう、今日はいい天気だね」',author:'Kasumi',idx:1},{text:'「うん」',author:'',idx:2},{text:'「行こうか、みんなで一緒に海まで」',author:'Ayano',idx:3}];
 const V=[{name:'S/10.0',n:10,d:5.0},{name:'S/14.0',n:14,d:5.6}];
 const pairs=nv.align(L,V).map(([l,v])=>[l.author,v.name]);assert.deepEqual(pairs,[['Kasumi','S/10.0'],['Ayano','S/14.0']]);
 const V2=[{name:'S/10.0',n:10,d:5.0},{name:'S/10.5',n:10.5,d:5.6}];assert.ok(nv.align(L,V2).length<2,'a later line cannot take a clip numbered too close to an earlier match');});
test('naninovel voices exact: in-order matching never lets a repeated short line take a later entry; untranslated entries give nothing',()=>{const nv=require('../services/original-engines/naninovel-voice.cjs');
 const a=['「…………」','「行こう」','「…………」','「はい」'],b=['「…………」','「別の行」','「行こう」','「…………」','「はい」'];
 assert.deepEqual(nv.lcs(a,b),[0,2,3,4]);assert.deepEqual(nv.lcs(['x'],['y']),[-1]);
 assert.equal(nv.light('Kasumi: 「我剛剛發現 了一件事。」'),'「我剛剛發現了一件事。」');assert.equal(nv.light('{Me}: 「怎麼了？」'),'「怎麼了？」');});
test('naninovel reader: Japanese and Chinese meet by source line, an untranslated entry shifts nothing, a blank Chinese falls back to the source',()=>{const n=require('../services/original-engines/naninovel.cjs');
 const E=(source,text)=>({source,key:require('../services/original-engines/naninovel-voice.cjs').light(source),text});
 const ja={script:true,name:'k.nani',src:'zh-tw',dst:'ja-jp',text:'',entries:[E('K: 「一」','「いち」'),E('K: 「二」',''),E('K: 「三」','「さん」'),E('K: 「四」','「よん」')]};
 const zh={script:true,name:'k.nani',src:'zh-tw',dst:'zh-cn',text:'',entries:[E('K: 「一」','「一简」'),E('K: 「二」','「二简」'),E('K: 「三」','「三简」'),E('K: 「四」','')]};
 const docs=n._internal.combine([ja,zh]);const p=n.parse(Buffer.from(docs[0].text));
 assert.deepEqual(p.lines,['「いち」','「さん」','「よん」']);assert.deepEqual(p.zh,['「一简」','「三简」','「四」']);});
test('xp3 encrypted name tables (dls:, Riddle yuz:): a table under a known YuzKey is opened, a plain one stays plain',()=>{const y=require('../services/original-engines/yuz-names.cjs'),zlib=require('node:zlib');
 const plain=zlib.deflateSync(Buffer.from('hnfn'.repeat(200),'latin1')),schemes=require('../services/original-engines/cx-schemes.json').schemes.filter(s=>s.yuz);assert.equal(schemes.length,5);
 const nanaKey=schemes.find(s=>s.type==='NanaCxCrypt'),riddle=schemes.find(s=>s.type==='RiddleCxCrypt'),cbBuf=Buffer.from(riddle.cb,'base64'),cb=Array.from({length:cbBuf.length>>2},(_,i)=>cbBuf.readUInt32LE(i*4));
 const n=y.nana(nanaKey.yuz,Buffer.from(plain));assert.notDeepEqual(n,plain);assert.deepEqual(y.inflateNames(n,'dls:'),zlib.inflateSync(plain));
 const r=y.yuzc(cb,riddle.yuz,Buffer.from(plain));assert.notDeepEqual(r,plain);assert.deepEqual(y.inflateNames(r,'yuz:'),zlib.inflateSync(plain));
 assert.deepEqual(y.inflateNames(plain,'sen:'),zlib.inflateSync(plain));assert.equal(y.inflateNames(Buffer.from('nope'),'dls:'),null);});
test('xp3 name-table ciphers give the same bytes as GARbro (YuzCrypt.cs NanaDecryptor / YuzDecryptor, compiled and run on these inputs) for all five schemes',()=>{const y=require('../services/original-engines/yuz-names.cjs');
 const schemes=require('../services/original-engines/cx-schemes.json').schemes.filter(s=>s.yuz),cbOf=s=>{const b=Buffer.from(s.cb,'base64');return Array.from({length:b.length>>2},(_,i)=>b.readUInt32LE(i*4));};
 const V=[["Café Stella to Shinigami no Chou","yuz","396c2e88220e0b6ec7fbad0b8204812b3a1bc236bb553b157092343f724673decff3733f37a3849677d87cc9720eb21ba64a2a0bcd8e04c862faabefa90c75a904","a2e0a489c803c2d5787ea323be6e687d64f8ea5fab18ad44efe7dfcae371caf1c8d2645f2c5c32f93bbcb010baa16addc6221fe0eb8c175bcb4a9e62be9f3cb189"],["Grisaia: Phantom Trigger Vol.3","nana","08ffc9091aa9d2a1b073e8691378e9334bf50a774e68e4c5a05ae89e17d143f9bf92ff16d4087c68ea8daf35ac7e1e610f0e85c1917517065994f17b2b93df7f67","05024108f7d6d4d1d8bb2c0426ca1e9a9067d8dd3e1f6386a263df3a38a12a11c652a97a9d7ed5c4d98aa1293f070d6183d62c2b71f3eba11e0d30e45e0cf29b40"],["Haruoto Alice＊Gram","nana","37426ce42b182467f2a1d81aceea2dc95e43aadb5245f103aac9bb094d7dd2b54d77352420a277f42e45dd06b78f10411f0681a4697b54d3eff0157ff5a3f4bdc7","5364d41bdeecd91b1debec7e7a0630f5d7f6d8899454688952f10e7ad0676d2ef29041e63532989d1e801ac342a7eca59b28598a710d2ffe43354125dca71d69d4"],["Momoiro Closet","nana","b072e3384499eb480c5271b22b60040f3cca4ee69d2eeb7d0ced009e31649252b860d0195c61315d5455976aa907f08afe237c7d6e9da0c6405fb900bbca326476","0da1e3766fbbc09e900636f95caf17aae5e0b414c49fa4cbb5812022773aa7f75346cf69f53daea04a0137a96925062f0d70ecd3d0dc09f594a38d25985c5c497c"],["Riddle Joker","yuz","d407a6e7a2338484409f5dbc16dcf6073f8782f5efc449fbb3786a0457729cc6a49f078174962597473f3a22c2f2c43c1207c779aaa351b40524ccc01b35144bcb","f88ae9eedeb82153e0185d9c36bcd5a0ed781f928e5f3cfc4aecef9d51e0ce5d6af93e73e25f20886e49febb55a64a461c14527d3b0848e33d8620888ad1a69eda"]];
 assert.equal(V.length,5);for(const [title,kind,data,want] of V){const s=schemes.find(s=>s.titles.includes(title));const got=kind==='nana'?y.nana(s.yuz,Buffer.from(data,'hex')):y.yuzc(cbOf(s),s.yuz,Buffer.from(data,'hex'));assert.equal(got.toString('hex'),want,title);}});
