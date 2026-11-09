// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E296 (魔法使いの夜): KiriKiri 2 scripts XORed with two bytes split at a per-file boundary are decrypted from their own
// text; the packed Chinese build's scripts, read from the running game by MeguLitScn32.dll into run-<program>/, line up
// with them file by file, and each Chinese line the game shows gets its Japanese original at once.
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-ks-'));
process.env.MEGULIT_SCN_CAPTURE=path.join(tmp,'capture');
const {decryptText}=require('../services/original-engines/ks-cx.cjs'),scenes=require('../services/original-engines/scenes.cjs'),ot=require('../services/original-text.cjs'),xp3=require('../services/original-engines/xp3.cjs');
const eng=scenes.ENGINES['kirikiri-ks'];
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));

const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;},u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;},u16=n=>{const b=Buffer.alloc(2);b.writeUInt16LE(n);return b;};
const chunk=(tag,body)=>Buffer.concat([Buffer.from(tag,'latin1'),u64(body.length),body]);
// Every entry flagged as encrypted, as in the game's archives.
function writeXp3(file,entries){
 const datas=[],index=[];let at=11+8;
 for(const [name,data] of entries){const n=Buffer.from(name,'utf16le');
  index.push(chunk('File',Buffer.concat([chunk('info',Buffer.concat([u32(0x80000000),u64(data.length),u64(data.length),u16(name.length),n])),chunk('segm',Buffer.concat([u32(0),u64(at),u64(data.length),u64(data.length)])),chunk('adlr',u32(0))])));
  datas.push(data);at+=data.length;}
 const idx=Buffer.concat(index);
 fs.writeFileSync(file,Buffer.concat([xp3.MAGIC,u64(at),...datas,Buffer.from([0]),u64(idx.length),idx]));
}
const xor=(buf,k1,k2,at)=>{const out=Buffer.from(buf);for(let i=0;i<out.length;i++)out[i]^=i<at?k1:k2;return out;};
const utf16=text=>Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(text,'utf16le')]);
const commands=n=>Array.from({length:n},(_,i)=>`@fg storage=ch${i} center=512 vcenter=288 index=${1000+i}`).join('\r\n');
const ja1='*page0|\r\n'+commands(12)+'\r\n　夜の坂道を、ひとりで歩いていた。[l][r]\r\n「[ruby text=あおこ]青子、遅いわよ」[p]\r\n@wait time=600\r\n　有珠はそう言って笑った。[p]\r\n';
const zh1='*page0|\r\n'+commands(12)+'\r\n　我独自走在夜晚的坡道上。[l][r]\r\n「青子，你太慢了」[p]\r\n@wait time=600\r\n　有珠这么说着笑了。[p]\r\n';
const ja2='*page0|\r\n'+commands(12)+'\r\n　ここから先は別の話だ。[p]\r\n';
const zh2='*page0|\r\n'+commands(12)+'\r\n　从这里开始是另一个故事。[p]\r\n　（汉化组多加了一行）[p]\r\n';

test('two-key XOR: UTF-16 and Shift_JIS scripts come back exactly, other data is refused',()=>{
 const plain=utf16(ja1+commands(40));
 for(const at of [1001,1000,7]){const r=decryptText(xor(plain,0x28,0x4f,at));assert.ok(r,'decrypted at '+at);assert.strictEqual(r.text,ja1+commands(40));assert.strictEqual(r.encoding,'utf16le');}
 const sjis=Buffer.concat(['*start\r\n',commands(20),'\r\n','@call storage=macro.ks\r\n',commands(20),'\r\n'].map(s=>Buffer.from(s,'latin1')));
 const r=decryptText(xor(sjis,0xda,0x21,333));assert.ok(r);assert.strictEqual(r.encoding,'shift_jis');assert.strictEqual(r.text,sjis.toString('latin1'));
 assert.strictEqual(decryptText(require('node:crypto').randomBytes(4000)),null);
});

function makeGame(name){const dir=path.join(tmp,name);fs.mkdirSync(dir,{recursive:true});
 writeXp3(path.join(dir,'data.xp3'),[['scenario/1-1.ks',xor(utf16(ja1+commands(30)),0x5a,0xc3,901)],['scenario/1-2.ks',xor(utf16(ja2+commands(30)),0x11,0x77,1203)],['others/a.tlg',Buffer.alloc(64,7)]]);
 fs.writeFileSync(path.join(dir,'魔法使之夜.exe'),'');return dir;}
const run=(dir,program)=>{const d=path.join(scenes.ENGINES['kirikiri-dump'].captureDir(dir),'run-'+program);fs.mkdirSync(d,{recursive:true});return d;};
let tick=0;
const save=(d,file,text)=>{fs.writeFileSync(path.join(d,file),utf16(text));const t=new Date(Date.now()+(++tick)*60000);fs.utimesSync(d,t,t);};

test('before the Chinese build has run: the folder is eligible and every scenario file is asked for',()=>{
 const dir=makeGame('ask');
 assert.strictEqual(eng.eligible(dir),true);
 assert.deepStrictEqual(eng.scenes(dir),[]);
 assert.strictEqual(fs.readFileSync(path.join(scenes.ENGINES['kirikiri-dump'].captureDir(dir),'want.txt'),'utf8'),'1-1.ks\r\n1-2.ks');
 assert.strictEqual(eng.japaneseKs(eng.encryptedKs(dir).get('1-1.ks')),ja1+commands(30));
});

test('Chinese build running: each Chinese line resolves to its Japanese original, files that differ are left alone',()=>{
 const root=path.join(tmp,'root'),dir=makeGame('live'),exe=path.join(dir,'魔法使之夜.exe'),id='mh';
 fs.mkdirSync(path.join(root,'data','config'),{recursive:true});
 assert.ok(['unsupported','preparing'].includes(ot.scanRunning(root,id,exe).status));
 const p=ot.provider(root,exe);assert.ok(p&&p.live);
 assert.strictEqual(p.resolve('有珠这么说着笑了。').status,'none');
 // A Japanese run (the original program) is not taken for the Chinese script.
 const jaRun=run(dir,'魔法使いの夜.exe');save(jaRun,'1-1.ks',ja1);
 const zhRun=run(dir,'魔法使之夜.exe');save(zhRun,'1-1.ks',zh1);save(zhRun,'1-2.ks',zh2);
 const r=p.resolve('有珠这么说着笑了。');
 assert.strictEqual(p.kind,'original');
 assert.strictEqual(r.japanese,'有珠はそう言って笑った。');
 assert.strictEqual(p.resolve('「青子，你太慢了」').japanese,'「青子、遅いわよ」');
 // 1-2.ks gained a line in the Chinese build: no confident original for it.
 assert.notStrictEqual(p.resolve('从这里开始是另一个故事。').status,'exact');
 const state=JSON.parse(fs.readFileSync(path.join(root,'data','config','original-text.json'),'utf8'))[id];
 assert.strictEqual(state.engine,'kirikiri-ks');assert.strictEqual(state.status,'ready');assert.strictEqual(state.mode,'original');
});

test('a Japanese-only folder (no Chinese run yet) never becomes the running script',()=>{
 const dir=makeGame('jaonly');const jaRun=run(dir,'魔法使いの夜.exe');save(jaRun,'1-1.ks',ja1);
 assert.deepStrictEqual(eng.scenes(dir),[]);
});

test('the capture DLL reads non-scene names as text into run-<program>',()=>{
 const dll=fs.readFileSync(path.join(__dirname,'..','native','scncapture','ScnCapture.cpp'),'utf8');
 assert.match(dll,/"iTJSTextReadStream \* ::TVPCreateTextStreamForRead\(const ttstr &,const ttstr &\)"/);
 assert.match(dll,/L"run-" \+ Lower\(/);
 assert.match(dll,/if \(IsScene\(next\.c_str\(\)\)\) AskOne\(next\); else AskText\(next\);/);
});
