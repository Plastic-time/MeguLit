'use strict';
// E452 Steam VN group: minori PAZ (eden*), Naninovel voices by text id (魔法少女ノ魔女裁判, IL2CPP), DDLC Plus (Mono).
// Synthetic data first, then the real Steam installs when present (read only).
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const paz=require('../services/original-engines/paz.cjs'),{Blowfish}=require('../services/original-engines/blowfish.cjs');
const naninovel=require('../services/original-engines/naninovel.cjs'),nvoice=require('../services/original-engines/naninovel-voice.cjs');
const tmp=p=>fs.mkdtempSync(path.join(os.tmpdir(),p));
const enc=(key,buf)=>{const bf=new Blowfish(Buffer.from(key,'hex'));buf=Buffer.from(buf);for(let i=0;i+8<=buf.length;i+=8){const [l,r]=bf.encrypt(buf.readUInt32LE(i),buf.readUInt32LE(i+4));buf.writeUInt32LE(l,i);buf.writeUInt32LE(r,i+4);}return buf;};
const pad8=b=>Buffer.concat([b,Buffer.alloc((8-b.length%8)%8)]);
function rc4(key,buf){const S=[...Array(256).keys()];let j=0;for(let i=0;i<256;i++){j=(j+S[i]+key[i%key.length])&255;[S[i],S[j]]=[S[j],S[i]];}let a=0,b=0;const o=Buffer.from(buf);for(let i=0;i<o.length;i++){a=(a+1)&255;b=(b+S[a])&255;[S[a],S[b]]=[S[b],S[a]];o[i]^=S[(S[a]+S[b])&255];}return o;}
/* A version-1 PAZ: 32-byte header naming the build, index size, Blowfish index, entries (RC4 by type password, Blowfish). */
function pazFile(header,scheme,arc,files){
 const keys=scheme.arc[arc],names=Object.keys(files);let idxLen=4;for(const n of names)idxLen+=Buffer.byteLength(n,'latin1')+1+24;idxLen=(idxLen+7)&~7;
 let at=0x24+idxLen;const parts=[],idx=Buffer.alloc(idxLen);idx.writeUInt32LE(names.length,0);let p=4;
 for(const n of names){const plain=files[n],key=Buffer.from(n.toLowerCase()+' '+plain.length.toString(16).toUpperCase().padStart(8,'0')+' '+scheme.type.sc,'latin1');
  const body=enc(keys[1],pad8(rc4(key,plain)));p+=idx.write(n,p,'latin1');idx[p++]=0;idx.writeBigInt64LE(BigInt(at),p);idx.writeUInt32LE(plain.length,p+8);idx.writeUInt32LE(plain.length,p+12);idx.writeUInt32LE(body.length,p+16);idx.writeInt32LE(0,p+20);p+=24;parts.push(body);at+=body.length;}
 const head=Buffer.alloc(0x24);head.write(header,0,'latin1');head.writeUInt32LE(idxLen,0x20);
 return Buffer.concat([head,enc(keys[0],idx),...parts]);}
const schemes=require('../services/original-engines/paz-schemes.json');

test('PAZ: the scheme comes from GARbro\'s catalogue by which index key opens the archive (no title match needed)',()=>{
 assert.ok(Object.keys(schemes).length>=40,'paz-schemes.json holds GARbro\'s PazSchemes');
 const s=schemes['eden* [English Steam]'];assert.ok(s&&s.arc.scr&&s.type.sc);
 const dir=tmp('paz-');
 // ASCII lines stand in for the script body; Shift-JIS kana bytes mark it Japanese (ひ = 82 D0)
 const ja=Buffer.concat([Buffer.from('.message\t10\tryo-A001-0001\t\t','latin1'),Buffer.from([0x81,0x75,0x82,0xd0,0x82,0xc6,0x81,0x76]),Buffer.from('\r\n','latin1')]);
 fs.writeFileSync(path.join(dir,'scr.paz'),pazFile('some_build',s,'scr',{'A001.sc':ja}));
 const list=paz.list(path.join(dir,'scr.paz'));assert.deepStrictEqual(list.map(e=>e.name),['A001.sc']);
 assert.deepStrictEqual(paz.parse(list[0].read()).lines,['「ひと」']);
 assert.deepStrictEqual(paz.parse(list[0].read()).voices,['ryo-A001-0001']);
 const scenes=require('../services/original-engines/scenes.cjs');assert.strictEqual(scenes.detect(dir),'paz');assert.strictEqual(scenes.unsupportedReason(dir),null);
 fs.rmSync(dir,{recursive:true,force:true});
});

test('PAZ: a Chinese patch (GBK) or a long English script is not offered as Japanese; the game says why',()=>{
 const s=schemes['eden* [English Steam]'],dir=tmp('paz-zh-');
 const gbk=Buffer.concat([Buffer.from('.message\t10\t\t','latin1'),Buffer.from([0xce,0xd2,0xc3,0xc7,0xa1,0xa3]),Buffer.from('\r\n','latin1')]);/* 我们。 */
 fs.writeFileSync(path.join(dir,'scr.paz'),pazFile('eden_en',s,'scr',{'A001.sc':Buffer.concat(Array(5).fill(gbk))}));
 const scenes=require('../services/original-engines/scenes.cjs');assert.strictEqual(scenes.detect(dir),null);
 assert.strictEqual(scenes.unsupportedReason(dir).code,'PAZ_NO_JAPANESE');
 assert.deepStrictEqual(paz.parse(Buffer.from(Array(30).fill('.message\t1\t\t\tHello there.').join('\n'),'latin1')).lines,[]);
 assert.deepStrictEqual(paz.parse(Buffer.from('.message\t40\t\tA\tabc','latin1')).lines,['A','abc'],'short fixtures stay readable');
 fs.rmSync(dir,{recursive:true,force:true});
});

test('Naninovel: "> Name: |#id|" gives the line its voice by text id; @choice and narration take none',()=>{
 const doc=['; 日本語 <ja> to 简体中文 <zh-Hans> localization document for \'A/B\' Naninovel scenario script','',
  '# 0101Adv31_Narrative001','; エマたちは食堂の調査にやってきた。','艾玛她们来到了食堂。','',
  '# 0101Adv31_Hanna001','; > Hanna: |#0101Adv31_Hanna001|','; さすがに食欲はないですわ。','实在是没食欲。','',
  '# 0101Adv05_Choice002','; > @choice |#0101Adv05_Choice002|','; ただ見守った','选择了旁观'].join('\n');
 const p=naninovel.parse(Buffer.from(doc,'utf8'));
 assert.deepStrictEqual(p.lines,['エマたちは食堂の調査にやってきた。','さすがに食欲はないですわ。','ただ見守った']);
 assert.deepStrictEqual(p.zh,['艾玛她们来到了食堂。','实在是没食欲。','选择了旁观']);
 assert.deepStrictEqual(p.voices,[null,'0101Adv31_Hanna001',null]);
});

test('Unity AudioClips named by text id are found in a serialized file with their .resource range',()=>{
 const str=s=>{const b=Buffer.from(s,'utf8'),o=Buffer.alloc(4+((b.length+3)&~3));o.writeUInt32LE(b.length,0);b.copy(o,4);return o;};
 const clip=(name,off,size)=>{const fields=Buffer.alloc(32);fields.writeInt32LE(1,4);fields.writeInt32LE(48000,8);const tail=Buffer.alloc(20);tail.writeBigUInt64LE(BigInt(off),0);tail.writeBigUInt64LE(BigInt(size),8);
  return Buffer.concat([str(name),fields,str('archive:/CAB-0123/CAB-0123.resource'),tail]);};
 const buf=Buffer.concat([Buffer.alloc(64),clip('0101Adv31_Sherry001',0,5000),clip('0101Adv31_Ema002',5008,7000),Buffer.alloc(16)]);
 assert.deepStrictEqual(nvoice.namedClips(buf),[{name:'0101Adv31_Sherry001',off:0,size:5000},{name:'0101Adv31_Ema002',off:5008,size:7000}]);
});

const STEAM='E:/Steam/steamapps/common';
const has=g=>fs.existsSync(path.join(STEAM,g));
test('real: 魔法少女ノ魔女裁判 (Naninovel, IL2CPP) reads Japanese with Simplified Chinese on every line and plays its voices',{skip:!has('manosaba_game')},()=>{
 const scenes=require('../services/original-engines/scenes.cjs'),dir=path.join(STEAM,'manosaba_game');assert.strictEqual(scenes.detect(dir),'naninovel');
 const list=scenes.read('naninovel',dir);let n=0,paired=0,voiced=0;for(const s of list){s.lines.forEach((t,i)=>{n++;if((s.zh||[])[i])paired++;});voiced+=(s.voices||[]).filter(Boolean).length;}
 assert.ok(n>30000);assert.strictEqual(paired,n);assert.ok(voiced>20000);
 const cat=require('../services/game-voice.cjs').catalog(dir);let found=0;for(const s of list)for(const v of s.voices||[])if(v&&cat.get(v))found++;
 assert.ok(found/voiced>0.95,found+'/'+voiced);
 const read=cat.get('0101adv31_sherry001');assert.ok(read);assert.strictEqual(read().toString('latin1',0,4),'OggS');
});
test('real: DDLC Plus (Unity Mono) reads Japanese with Chinese on every line',{skip:!has('Doki Doki Literature Club Plus')},()=>{
 const scenes=require('../services/original-engines/scenes.cjs'),dir=path.join(STEAM,'Doki Doki Literature Club Plus');assert.strictEqual(scenes.detect(dir),'vgprompter');
 let n=0,paired=0;for(const s of scenes.read('vgprompter',dir))s.lines.forEach((t,i)=>{n++;if((s.zh||[])[i])paired++;});assert.ok(n>15000);assert.strictEqual(paired,n);
});
test('real: eden* (minori PAZ) opens with GARbro\'s Steam keys; voice.paz clips are Ogg; a Chinese-patched scr.paz is reported',{skip:!has('eden')},()=>{
 const dir=path.join(STEAM,'eden');assert.strictEqual(paz.list(path.join(dir,'scr.paz')).filter(e=>/\.sc$/.test(e.name)).length>20,true);
 const v=paz.audio(path.join(dir,'voice.paz'));assert.ok(v.length>5000);assert.strictEqual(v[0].read().toString('latin1',0,4),'OggS');
 const scenes=require('../services/original-engines/scenes.cjs');if(scenes.detect(dir)===null)assert.strictEqual(scenes.unsupportedReason(dir).code,'PAZ_NO_JAPANESE');
});
