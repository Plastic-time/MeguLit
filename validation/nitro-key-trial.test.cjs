// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* #464 / #463: Nitro+ archive keys are picked by trial (the key that turns the index into sane entries wins), never by
   game name. Tokyo Necro's Steam build (#464) uses an NPK2 key not in GARbro's table; STEINS;GATE PC (#463) uses the
   ~BUCKTICK headerless .npa that PR #448 reads. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const npk=require('../core/nitroplus-npk.cjs'),npa=require('../core/nitroplus-npa.cjs');
const {probeGame}=require('../services/adapter-probe-core.cjs');
const NEW_KEY=Buffer.from('aae616fb7db7ee84ed424c474aaddad69a8372799ad576629601ef9b8938e20f','hex');
const BS=String.fromCharCode(92);
const nps=lines=>Buffer.from(['<MARKER NAME="#01">',...lines.map((l,i)=>`<voice NAME="S0" SRC="1${BS}${String(i).padStart(6,'0')}">${l}<k>`)].join('\r\n'),'utf8');

test('NPK2 with the Tokyo Necro Steam key opens by trial, no title involved',()=>{
 assert.ok(npk.ALL_KEYS.some(k=>k.equals(NEW_KEY)));
 const buf=npk.createNpk({'media/script/nps/a.nps':nps(['「テストです。」'])},{key:NEW_KEY});
 const arc=npk.readNpkAny(buf);assert.ok(arc.key.equals(NEW_KEY));assert.equal(arc.entries.length,1);
 assert.match(npk.npkData(arc,arc.entries[0]).toString('utf8'),/テストです/);
});

test('NPK2 with a key nobody knows still reports NPK_KEY',()=>{
 const buf=npk.createNpk({'a.nps':nps(['x'])},{key:Buffer.alloc(32,7)});
 assert.throws(()=>npk.readNpkAny(buf),/NPK_KEY/);
});

test('probe: a game folder whose script.npk uses the new key reads Japanese lines',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'necro-npk2-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.writeFileSync(path.join(dir,'game.exe'),'exe');
 fs.writeFileSync(path.join(dir,'script.npk'),npk.createNpk({'media/script/nps/sy010.nps':nps(Array.from({length:120},(_,i)=>`「日本語の台詞その${i}です。」`))},{key:NEW_KEY}));
 const res=probeGame({dir,executable:path.join(dir,'game.exe'),title:'x'});
 assert.equal(res.step,'ok',`${res.step} ${res.detail}`);assert.equal(res.lines,120);
});

test('#463 STEINS;GATE nss.npa head (from the probe) is the ~BUCKTICK layout #448 reads',()=>{
 const head=Buffer.from('1633000021abbcb4','hex'),n=head.readUInt32LE(0),count=npa.sgXor(Buffer.from(head.subarray(4))).readUInt32LE(0);
 assert.equal(n,13078);assert.equal(count,412);assert.ok(!npa.isNpa(head));
});
