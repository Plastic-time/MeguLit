'use strict';
// E452 (#108 小红帽与迷失森林): a package whose script text was replaced by Chinese is not used as Japanese, for every
// engine: kana under 5 % of kana + Han (speaker-name lines left out) marks it Chinese only, and the Tools dialog says
// the Japanese original has to be added by hand.
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const ot=require('../services/original-text.cjs');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-zhonly-'));
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));

const ZH='狐狸先生要去哪里我马上就明白了他要去那个花圃决不会有错为了得到苹果的魔力为了用它的力量对抗山猫先生';
const JA='余計な不安を煽るかのように、鳥の鳴き声が響いていた。彼女はそっと窓を開けて、遠くの森を見つめていた。';

test('the rule: Chinese with Japanese speaker tags and menus is Chinese only; Japanese prose never is',()=>{
 const zhScript=[];for(let i=0;i<20;i++)zhScript.push('【ティアナ】','「'+ZH.slice(0,20)+'」',ZH);zhScript.push('マルチモニタ環境では自動で選択されます。');
 assert.strictEqual(ot.chineseOnly(zhScript),true);
 const jaScript=[];for(let i=0;i<20;i++)jaScript.push('【ティアナ】',JA,'「大丈夫、心配しないで」');
 assert.strictEqual(ot.chineseOnly(jaScript),false);
 // Kanji-heavy Japanese (a legal drama, a period piece) keeps its okurigana and particles.
 assert.strictEqual(ot.chineseOnly(Array(30).fill('被告人ハ当日午後九時頃、現場ニ居タ事ヲ認メテ居ル。証拠品ノ提出ヲ求メル。')),false);
 // Too little Han to judge: no verdict.
 assert.strictEqual(ot.chineseOnly(['你好','谢谢']),false);
});

// A synthetic install of the Unity Ace Attorney Trilogy engine (pwaat.cjs), whose "Japanese" file holds Chinese.
function encrypt(buf){const k=crypto.pbkdf2Sync('u8DurGE2','6BBGizHE',1000,32,'sha1'),c=crypto.createCipheriv('aes-128-cbc',k.subarray(0,16),k.subarray(16,32));return Buffer.concat([c.update(buf),c.final()]);}
const T=s=>[...s].map(ch=>ch.charCodeAt(0)+0x80);
function mdt(msgs){const n=msgs.length,head=Buffer.alloc(4+n*4);head.writeUInt32LE(n,0);let at=4+n*4;const bodies=[];
 msgs.forEach((m,i)=>{head.writeUInt32LE(at,4+i*4);const b=Buffer.alloc(m.length*2);m.forEach((w,k)=>b.writeUInt16LE(w,k*2));bodies.push(b);at+=b.length;});return Buffer.concat([head,...bodies]);}
function install(name,text){const dir=path.join(tmp,name),sc=path.join(dir,'Game_Data','StreamingAssets','GS1','scenario');fs.mkdirSync(sc,{recursive:true});
 fs.writeFileSync(path.join(dir,'Game.exe'),'x');const msgs=[];for(let i=0;i<12;i++)msgs.push([...T(text),0x02,...T(text.slice(5)),0x0d]);
 fs.writeFileSync(path.join(sc,'sc0_text.mdt'),encrypt(mdt(msgs)));return path.join(dir,'Game.exe');}

test('scanRunning: a Chinese-only script is "chinese-only", a Japanese one stays native Japanese',()=>{
 const root=path.join(tmp,'root');fs.mkdirSync(path.join(root,'data','config'),{recursive:true});
 assert.strictEqual(ot.scanRunning(root,'zh',install('zh',ZH)).status,'chinese-only');
 assert.strictEqual(ot.scanRunning(root,'ja',install('ja',JA)).status,'native-japanese');
});

test('the Tools dialog explains a Chinese-only script and offers adding the Japanese original',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../web/game-language.js'),'utf8');
 assert.match(src,/s\.status==='chinese-only'\)\{status\.textContent=w\.chineseOnly[^}]*originalBtn\.hidden=false/);
 assert.match(src,/chineseOnly:'这个版本只有中文剧本，没找到日文原文。零延迟翻译需要日文原版/);
});
