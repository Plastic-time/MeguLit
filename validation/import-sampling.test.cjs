// SPDX-License-Identifier: GPL-3.0-or-later
// E496 import sampling: a Japanese original (or a Chinese patch) is accepted only when ~100 sampled lines really pair with
// their counterpart and the timeline holds; a drifted pairing is lined up again, a wrong version is refused with the reason.
// Synthetic scripts only (validation/helpers/align-sample-fixtures.cjs); no game files are read or written.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib');
const ot=require('../services/original-text.cjs'),sampler=require('../services/align-sample.cjs'),{cases,script}=require('./helpers/align-sample-fixtures.cjs');

/* minimal System4 AIN (AI2 container, MSG0 + FNAM) in Shift-JIS or GBK, as in original-text.test.cjs */
const TABLES={};
function encoder(enc){if(!TABLES[enc]){const t=new Map(),dec=new TextDecoder(enc);for(let hi=0x81;hi<=0xfe;hi++)for(let lo=0x40;lo<=0xfe;lo++){const ch=dec.decode(Buffer.from([hi,lo]));if(ch.length===1&&ch!=='�'&&!t.has(ch))t.set(ch,[hi,lo]);}TABLES[enc]=t;}
 const t=TABLES[enc];return s=>Buffer.from([...s].flatMap(c=>c.charCodeAt(0)<128?[c.charCodeAt(0)]:t.get(c)||[0x3f]));}
function ain(lines,enc){
 const encode=encoder(enc),table=(tag,items)=>{const n=Buffer.alloc(4);n.writeUInt32LE(items.length);return Buffer.concat([Buffer.from(tag,'latin1'),n,...items.flatMap(b=>[b,Buffer.from([0])])]);};
 const vers=Buffer.alloc(8);vers.write('VERS',0,'latin1');vers.writeUInt32LE(6,4);
 const body=Buffer.concat([vers,table('MSG0',lines.map(encode)),table('FNAM',['main','scene'].map(f=>Buffer.from(f,'latin1')))]),packed=zlib.deflateSync(body),head=Buffer.alloc(16);
 head.write('AI2\0',0,'latin1');head.writeUInt32LE(body.length,8);head.writeUInt32LE(packed.length,12);return Buffer.concat([head,packed]);
}
/* a Chinese build running, the Japanese original imported from another folder */
function importCase(chinese,japanese){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-samp-root-')),game=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-samp-zh-')),orig=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-samp-ja-'));
 fs.writeFileSync(path.join(game,'Game.ain'),ain(chinese,'gbk'));fs.writeFileSync(path.join(game,'Game.exe'),'x');fs.writeFileSync(path.join(orig,'Game.ain'),ain(japanese,'shift_jis'));
 const row={id:'g1',executable:path.join(game,'Game.exe')},db={prepare:()=>({get:id=>id==='g1'?row:undefined})};
 try{const r=ot.importOriginal(root,db,'g1',orig);return {r,status:ot.status(root,db,'g1'),provider:ot.provider(root,row.executable)};}
 finally{for(const d of [root,game,orig])fs.rmSync(d,{recursive:true,force:true});}
}
const {ja,zh,shifted,other}=cases(300);

test('fixtures: the shifted build is the right one with one line gone early and one extra late',()=>{
 assert.equal(zh.length,300);assert.equal(shifted.length,300);assert.equal(other.length,300);
 assert.equal(shifted[80],zh[81]);assert.equal(shifted[250],zh[250]);
});

test('a right pair passes the sample: total / paired / unpaired, no realignment',()=>{
 const v=sampler.verify(zh,ja);
 assert.equal(v.ok,true);assert.equal(v.reason,'');assert.equal(v.realigned,null);
 assert.equal(v.total,300);assert.equal(v.paired,300);assert.equal(v.unpaired,0);assert.deepEqual(v.reasons,{});
 assert.ok(v.sample.sampled>=90&&v.sample.sampled<=100,'about 100 samples spread over the script');assert.ok(v.sample.rate>=.9);
});

test('an offset-by-one pair is caught as drift, lined up again and accepted; the extra line is reported unpaired',()=>{
 const first=sampler.sample(shifted,ja);assert.equal(first.ok,false);assert.equal(first.reason,'offset-drift');assert.equal(first.driftShift,1);
 const v=sampler.verify(shifted,ja);
 assert.equal(v.ok,true);assert.ok(v.realigned?.accepted);assert.ok(v.lines,'the realigned Japanese lines are returned');
 assert.equal(v.lines[80],ja[81]);assert.equal(v.lines[200],ja[201]);assert.equal(v.lines[239],'');assert.equal(v.lines[260],ja[260]);
 assert.equal(v.total,300);assert.equal(v.paired,299);assert.equal(v.unpaired,1);assert.deepEqual(v.reasons,{'no-japanese-line':1});
});

test('a wrong-version pair is refused, also after trying to line it up again',()=>{
 const v=sampler.verify(other,ja);
 assert.equal(v.ok,false);assert.ok(['different-version','unrelated-text'].includes(v.reason),v.reason);assert.equal(v.lines,undefined);
});

test('realignment into the Japanese order (a patch for the Japanese build) keeps lines it cannot place untranslated',()=>{
 const v=sampler.verify(shifted,ja,{into:'ja'});
 assert.equal(v.ok,true);assert.equal(v.lines.length,300);assert.equal(v.lines[81],zh[81]);assert.equal(v.lines[80],ja[80],'the Japanese line with no translation stays Japanese');
});

test('import of a right Japanese original: ready, with the pairing report in the status',()=>{
 const {r,status}=importCase(zh,ja);
 assert.equal(r.status,'ready');const p=status.alignment.pairing;
 assert.equal(p.ok,true);assert.equal(p.total,300);assert.equal(p.paired,300);assert.equal(p.unpaired,0);assert.ok(p.sample.sampled>=90);
});

test('import of an original whose lines drifted against the Chinese build: realigned, then ready and matching',()=>{
 /* same line count and functions: the structure check alone would have taken it with every line one off */
 const {r,status,provider}=importCase(shifted,ja);
 assert.equal(r.status,'ready');const p=status.alignment.pairing;
 assert.equal(p.ok,true);assert.ok(p.realigned.accepted);assert.equal(p.unpaired,1);assert.deepEqual(p.reasons,{'no-japanese-line':1});
 const m=provider.resolve(shifted[100]);assert.equal(m.japanese,ja[101],'the captured Chinese line restores its own Japanese line');
});

test('import of another version: unreliable, with the reason in the status',()=>{
 const {r,status}=importCase(other,ja);
 assert.equal(r.status,'unreliable');assert.equal(status.alignment.reliable,false);
 const p=status.alignment.pairing;assert.equal(p.ok,false);assert.ok(['different-version','unrelated-text'].includes(p.reason));assert.equal(p.total,300);
});

test('few translated lines: nothing to judge on, the structure check decides',()=>{
 const s=script(6,3),v=sampler.verify(s.map(x=>x.zh),s.map(x=>x.ja));assert.equal(v.ok,true);assert.equal(v.sample.sampled,6);
});

test('ruby, engine tags and voice ids: folded before scoring, voice ids decide when both sides have them',()=>{
 assert.equal(sampler.plain('≪何処／どこ≫へ%p-1;%fＭＳ ゴシック;――%p;'),'何処へ――');assert.equal(sampler.plain('|東雲《しののめ》'),'東雲');
 const z=sampler.features('「好」','v001'),j=sampler.features('「はい」','v001'),k=sampler.features('「はい」','v002');
 assert.ok(sampler.score(z,j)>sampler.score(z,k));
});

test('Chinese patch import: a drifted patch is lined up again with the Japanese build; another script is refused',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-samp-proot-')),game=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-samp-pja-')),pack=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-samp-pzh-'));
 try{
  fs.writeFileSync(path.join(game,'Game.ain'),ain(ja,'shift_jis'));fs.writeFileSync(path.join(game,'Game.exe'),'x');
  const row={id:'g1',executable:path.join(game,'Game.exe')},db={prepare:()=>({get:id=>id==='g1'?row:undefined})};
  fs.writeFileSync(path.join(pack,'Game.ain'),ain(shifted,'gbk'));
  const r=ot.importPatch(root,db,'g1',pack);assert.equal(r.patchStatus,'ready');assert.ok(r.patchAlignment.pairing.realigned.accepted);
  const p=ot.provider(root,row.executable).resolve(ja[150]);assert.equal(p.translation,zh[150],'the Japanese line gets its own translation, not the neighbour\'s');
  fs.writeFileSync(path.join(pack,'Game.ain'),ain(other,'gbk'));
  const bad=ot.importPatch(root,db,'g1',pack);assert.equal(bad.patchStatus,'unreliable');assert.equal(bad.patchAlignment.pairing.ok,false);
 }finally{for(const d of [root,game,pack])fs.rmSync(d,{recursive:true,force:true});}
});
