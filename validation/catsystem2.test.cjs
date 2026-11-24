'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const cs2=require('../services/original-engines/catsystem2.cjs');
// E356: CatSystem2 text cleanup and the CatSystem2 Mersenne Twister seeding (old sgenrand, 69069).
test('CatSystem2 text codes and ruby',()=>{
 assert.equal(cs2._internal.clean(String.raw`[冷凍睡眠装置/コールドスリープ]に入る\n[た/・]だの\@`),'冷凍睡眠装置に入る\nただの');
 const r=cs2.parse(Buffer.from(JSON.stringify({ja:['[凛音/リンネ]が来た'],zh:['凛音来了']})));
 assert.deepEqual(r.lines,['凛音が来た']);assert.deepEqual(r.zh,['凛音来了']);assert.deepEqual(r.ruby,[[['凛音','リンネ']]]);
 const t=cs2._internal.twister(1);assert.equal(typeof t(),'number');
});
const island='E:/GAL/ISLAND/ISLAND';
test('ISLAND: encrypted scene.int and the Chinese cnscene.int pair line by line',{skip:!fs.existsSync(island+'/cnscene.int')&&'no local copy'},()=>{
 const sc=cs2.scenes(island);assert.equal(sc.length,499);
 const r=cs2.parse(sc[2].read());const k=r.lines.indexOf('胸元を見下ろす。');assert.ok(k>=0);assert.equal(r.zh[k],'低头，向胸口看去。');
});

test('CatSystem2: empty or malformed .exe files in the folder do not abort gameKey() or audio() discovery',t=>{
 const os=require('node:os'),path=require('node:path');
 const {pe}=require('./helpers/engine-fixtures-c.cjs');
 const {Blowfish}=require('../services/original-engines/blowfish.cjs');
 const {twister,peResource}=cs2._internal;
 const bfEncrypt=(bf,buf)=>{const o=Buffer.from(buf);for(let i=0;i+8<=o.length;i+=8){const [l,r]=bf.encrypt(o.readUInt32LE(i),o.readUInt32LE(i+4));o.writeUInt32LE(l,i);o.writeUInt32LE(r,i+4);}return o;};
 const encName=(plain,key)=>{const ALPHA='zyxwvutsrqponmlkjihgfedcbaZYXWVUTSRQPONMLKJIHGFEDCBA';let k=((key>>>24)+(key>>>16)+(key>>>8)+key)&255;
  const out=Buffer.alloc(0x40);for(let i=0;i<plain.length;i++,k++){const ch=plain.charCodeAt(i),j=ALPHA.indexOf(plain[i]);out[i]=j<0?ch:ALPHA.charCodeAt((0x33-j+k%0x34)%0x34);}return out;};
 const makeEncryptedKif=(entryName,payload,passKey)=>{
  const seed=0x13572468,kb=Buffer.alloc(4);kb.writeUInt32LE(twister(seed)());const bf=new Blowfish(kb);
  const head=Buffer.alloc(8);head.write('KIF\0',0,'latin1');head.writeUInt32LE(2,4);
  const dir=Buffer.alloc(2*0x48);
  dir.write('__key__.dat',0,'latin1');dir.writeUInt32LE(seed,0x44);
  const dataOff=8+dir.length,encPayload=bfEncrypt(bf,payload);
  encName(entryName,twister((passKey+1)>>>0)()).copy(dir,0x48);
  const [eo,es]=bf.encrypt(dataOff,encPayload.length);
  dir.writeUInt32LE((eo-1)>>>0,0x48+0x40);dir.writeUInt32LE(es,0x48+0x44);
  return Buffer.concat([head,dir,encPayload]);
 };
 const pass='MYPASS01',keyPlain=Buffer.from('SECRETKEY'),codePlain=Buffer.alloc(16);Buffer.from(pass,'latin1').copy(codePlain);
 const codeEnc=bfEncrypt(new Blowfish(keyPlain),codePlain);
 const keyRes=Buffer.from(keyPlain.map(v=>v^0xcd));
 const goodExe=pe([{type:'V_CODE2',name:'DATA',data:codeEnc},{type:'KEY_CODE',name:'KEY',data:keyRes}]);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cs2-badexe-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 // Bad/truncated .exe files sorted before zz_game.exe
 const badPeOff=Buffer.alloc(0x40);badPeOff.write('MZ',0,'latin1');badPeOff.writeUInt32LE(0x100000,0x3c);
 const badMagic=Buffer.from(goodExe);badMagic.writeUInt16LE(0x9999,0x40+24);
 // Truncate the PE right after V_CODE2/DATA starts so data+size > b.length
 const vcodeOff=goodExe.indexOf(codeEnc);assert.ok(vcodeOff>0);
 const truncLeaf=goodExe.subarray(0,vcodeOff+4);
 // Truncated resource label at EOF: declares length 8 when only 7 UTF-16 chars ('V_CODE2') remain
 const truncLabel=Buffer.concat([goodExe,Buffer.from([8,0]),Buffer.from('V_CODE2','utf16le')]);
 truncLabel.writeUInt32LE((0x80000000|(goodExe.length-0x200))>>>0,0x200+16);
 const bads={
  '00_empty.exe':Buffer.alloc(0),
  '01_mz_short.exe':Buffer.from('MZ','latin1'),
  '02_bad_pe_off.exe':badPeOff,
  '03_bad_magic.exe':badMagic,
  '04_trunc_leaf.exe':truncLeaf,
  '05_trunc_label.exe':truncLabel,
 };
 for(const [n,b] of Object.entries(bads))fs.writeFileSync(path.join(dir,n),b);
 fs.writeFileSync(path.join(dir,'zz_game.exe'),goodExe);
 // Every malformed exe returns null without throwing
 for(const n of Object.keys(bads))assert.equal(peResource(path.join(dir,n),'V_CODE2','DATA'),null,n);
 // Compute expected passKey via clean folder with only zz_game.exe, then test audio() in the dirty folder
 const cleanDir=fs.mkdtempSync(path.join(os.tmpdir(),'cs2-clean-'));
 t.after(()=>fs.rmSync(cleanDir,{recursive:true,force:true}));
 fs.writeFileSync(path.join(cleanDir,'zz_game.exe'),goodExe);
 const key=cs2._internal.gameKey(cleanDir);assert.equal(typeof key,'number');
 const ogg=Buffer.from('OggS_TEST_PAYLOAD_123456','latin1');
 const pcm=path.join(dir,'pcm_a.int');
 fs.writeFileSync(pcm,makeEncryptedKif('voice_001.ogg',ogg,key));
 const clips=cs2.audio(pcm);
 assert.ok(Array.isArray(clips)&&clips.length===1);
 assert.equal(clips[0].name,'voice_001.ogg');
 assert.deepEqual(clips[0].read(),ogg);
 // Empty KEY_CODE/KEY resource (0 bytes) falls back cleanly to default "windmill" key
 const wmDir=fs.mkdtempSync(path.join(os.tmpdir(),'cs2-wm-'));
 t.after(()=>fs.rmSync(wmDir,{recursive:true,force:true}));
 const wmCode=bfEncrypt(new Blowfish(Buffer.from('windmill')),codePlain);
 fs.writeFileSync(path.join(wmDir,'game.exe'),pe([{type:'V_CODE2',name:'DATA',data:wmCode},{type:'KEY_CODE',name:'KEY',data:Buffer.alloc(0)}]));
 const wmPcm=path.join(wmDir,'pcm_a.int');
 fs.writeFileSync(wmPcm,makeEncryptedKif('voice_002.ogg',ogg,key));
 const wmClips=cs2.audio(wmPcm);
 assert.ok(Array.isArray(wmClips)&&wmClips.length===1);
 assert.equal(wmClips[0].name,'voice_002.ogg');
 assert.deepEqual(wmClips[0].read(),ogg);
});
