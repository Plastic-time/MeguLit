'use strict';
// E451 Capcom Unity Ace Attorney Trilogy (逆転裁判123 成歩堂セレクション): encrypted GS<n>/scenario/*.mdt, Japanese paired
// with the Simplified Chinese file message by message and text box by text box. Synthetic data first, then the real install.
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const scenes=require('../services/original-engines/scenes.cjs'),pwaat=require('../services/original-engines/pwaat.cjs');
const {messages,boxes,align,ARGS,PAGE}=pwaat._internal;
function encrypt(buf){const k=crypto.pbkdf2Sync('u8DurGE2','6BBGizHE',1000,32,'sha1'),c=crypto.createCipheriv('aes-128-cbc',k.subarray(0,16),k.subarray(16,32));return Buffer.concat([c.update(buf),c.final()]);}
// Text as the game stores it: each character's code point + 0x80.
const T=s=>[...s].map(ch=>ch.charCodeAt(0)+0x80);
// An .mdt: count, offsets, messages of u16 words. A slot given as null points past the end (unused).
function mdt(msgs){const n=msgs.length,head=Buffer.alloc(4+n*4);head.writeUInt32LE(n,0);let at=4+n*4;const bodies=[];
 msgs.forEach((m,i)=>{if(!m){head.writeUInt32LE(0x540002,4+i*4);return;}head.writeUInt32LE(at,4+i*4);const b=Buffer.alloc(m.length*2);m.forEach((w,k)=>b.writeUInt16LE(w,k*2));bodies.push(b);at+=b.length;});
 return Buffer.concat([head,...bodies]);}
function put(dir,files){for(const [rel,data] of Object.entries(files)){const f=path.join(dir,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,data);}}

test('command table: 129 entries, 0x69 takes two arguments as its handler reads them, page commands end a text box',()=>{
 assert.strictEqual(ARGS.length,129);assert.strictEqual(ARGS[0x69],2);assert.strictEqual(ARGS[0x1e],3);assert.strictEqual(ARGS[0x0e],1);
 for(const c of [0x02,0x0d,0x2d,0x2e])assert.ok(PAGE.has(c));
 // 0x69 with its two arguments, then 0x1e with three: no argument word may leak into the text.
 const w=[0x00,0x0e,0x200,...T('あ'),0x2d,0x69,0x62,0x243,0x1e,0x1a,0x63,0x62,0x0e,0x1a00,...T('い'),0x01,...T('う'),0x02,0x80,...T('え'),0x0d];
 assert.deepStrictEqual(boxes(w),['あ','い\nう','え']);
});

test('alignment: equal box counts pair one for one; a split translation gives each Japanese box the Chinese it covers',()=>{
 assert.deepStrictEqual(align(['一','二'],['1','2']),['1','2']);
 assert.deepStrictEqual(align(['ああああ','いいいい','うう'],['甲甲甲甲','乙乙','乙乙','丙丙']),['甲甲甲甲','乙乙\n乙乙','丙丙']);
 assert.deepStrictEqual(align(['ああ','いいい','うう'],['甲甲甲甲甲','丙丙']),['甲甲甲甲甲','甲甲甲甲甲','丙丙']);
});

test('a synthetic install is detected and every Japanese box gets its Chinese',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pwaat-'));const sc='Game_Data/StreamingAssets/GS1/scenario/';
 const ja=mdt([[0x0e,0x200,...T('はい'),0x02,...T('いいえ'),0x0d],null,[...T('終わり'),0x0d]]);
 const zh=mdt([[0x0e,0x200,...T('是'),0x02,...T('不是'),0x0d],null,[...T('结束'),0x0d]]);
 put(dir,{'Game.exe':'x',[sc+'sc0_text.mdt']:encrypt(ja),[sc+'sc0_text_s.mdt']:encrypt(zh),[sc+'sc0_text_u.mdt']:encrypt(zh),[sc+'sys_mes.mdt']:encrypt(ja)});
 assert.strictEqual(messages(ja).length,3);assert.strictEqual(messages(ja)[1],null);
 assert.strictEqual(scenes.detect(dir),'pwaat');
 const list=scenes.read('pwaat',dir);assert.deepStrictEqual(list.map(s=>s.name),['GS1/sc0_text']);
 assert.deepStrictEqual(list[0].lines,['はい','いいえ','終わり']);assert.deepStrictEqual(list[0].zh,['是','不是','结束']);
 fs.rmSync(dir,{recursive:true,force:true});
});

const PW=path.join('E:/','GAL','Phoenix.Wright.Ace.Attorney.Trilogy.Build.20282248');
test('real data: 逆転裁判123 (Steam) reads all three games, every Japanese line paired, no argument leaks',{skip:!fs.existsSync(path.join(PW,'PWAAT_Data','StreamingAssets','GS1','scenario'))&&'not installed'},()=>{
 assert.strictEqual(scenes.detect(PW),'pwaat');
 const list=scenes.read('pwaat',PW);const games=new Set(list.map(s=>s.name.split('/')[0]));assert.deepStrictEqual([...games].sort(),['GS1','GS2','GS3']);
 const lines=list.flatMap(s=>s.lines),zh=list.flatMap(s=>s.zh);assert.ok(lines.length>80000,String(lines.length));
 assert.strictEqual(zh.filter(Boolean).length,lines.length);
 assert.ok(!lines.some(t=>/[\x00-\x09\x0b-\x1f\x21-\x7e]/.test(t)),'command arguments leaked into the text');
});
