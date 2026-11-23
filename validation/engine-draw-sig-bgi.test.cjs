// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* engine-draw static signature test, BGI / Ethornell (after the YU-RIS template; docs/engine-draw-native.md).
   1. the reference matcher (tools/engine-sigs/bgi-draw.cjs) on the fixture snippets: one glyph link site, its node register,
      character / previous-node slots, colour argument and advance call, and the glyph chain release at the snippet's start
      (native/megulithook/selftest/bgidraw.cpp runs the same bytes through the C++ matcher);
   2. near misses match nothing: the x store gone, a second push before the call, no 0x8140 compare in reach;
   3. on the owner's exes when they are on this PC (matched by SHA-256, read only): exactly one link site and one release in
      the whole code section, at the places the fixture says. Skipped per exe when it is not here.
   穢翼のユースティア's BGI.exe is packed (docs/engine-draw-native.md): its code exists only at run time, so it has no entry here. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const B=require('../tools/engine-sigs/bgi-draw.cjs');
const fx=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','engine-sigs','bgi-draw.json'),'utf8'));
const DIR='E:/GAL/素晴日/素晴らしき日々HD版/';
const EXES={'subahibi-hd-1.647':[DIR+'BGI.exe',DIR+'BGI_patch.exe',DIR+'BGI-CHS.exe']};

test('fixture snippets: one glyph link site, its slots, the chain release',()=>{
 assert.ok(Object.keys(fx.snippets).length>=1);
 for(const [name,s] of Object.entries(fx.snippets)){
  const va=parseInt(s.va,16),r=B.find(Buffer.from(s.hex,'hex'),va);
  assert.equal(r.links.length,1,name);
  const l=r.links[0];
  assert.deepEqual([l.call-va,l.node,l.ch,l.prev,l.color,'0x'+l.advance.toString(16)],[s.expect.callOffset,s.expect.node,s.expect.ch,s.expect.prev,s.expect.color,s.expect.advance],name);
  const f=B.find(Buffer.from(s.freeHex,'hex'),parseInt(s.freeVa,16));
  assert.deepEqual(f.frees,[parseInt(s.freeVa,16)],name+': release');
 }
 const hd=fx.snippets['subahibi-hd-1.647'];
 assert.deepEqual([hd.va,hd.expect.node,hd.expect.ch,hd.expect.prev,hd.expect.color],['0x43cb0d','ebx',0x30,0xa0,0x2c],'素晴らしき日々 HD: call 0x43d40d, node ebx, char [esp+30], previous node [esp+a0], colour [ebp+2c]');
});

test('near misses never match',()=>{
 const s=fx.snippets['subahibi-hd-1.647'],b=Buffer.from(s.hex,'hex'),va=parseInt(s.va,16),at=s.expect.callOffset;
 const noX=Buffer.from(b);for(let i=at-0x30;i<at;i++)if(noX[i]===0x89&&noX[i+2]===0x10&&(noX[i+1]&7)===3)noX[i+2]=0x11;
 assert.equal(B.find(noX,va).links.length,0,'x never stored');
 const twoPush=Buffer.from(b);const p=twoPush.indexOf(Buffer.from('8b4c241c','hex'),at-0x10);twoPush[p]=0x53;twoPush[p+1]=0x90;twoPush[p+2]=0x90;twoPush[p+3]=0x90;
 assert.equal(B.find(twoPush,va).links.length,0,'two pushes before the call: another argument layout');
 const noCmp=Buffer.from(b);for(let i=0;i+8<at;i++)if(noCmp[i]===0x81&&noCmp[i+1]===0x7c&&noCmp[i+4]===0x40&&noCmp[i+5]===0x81)noCmp[i+5]=0x82;
 assert.equal(B.find(noCmp,va).links.length,0,'no full-width space compare: not the layout');
 const noLink=Buffer.from(b);for(let i=at+5;i<at+0x40;i++)if(noLink[i]===0x89&&noLink[i+2]===0x44)noLink[i+2]=0x48;
 assert.equal(B.find(noLink,va).links.length,0,'no link after the call');
});

test('character codes: one byte below 0x100, else the SJIS pair',()=>{
 assert.deepEqual([...B.charBytes(0x41)],[0x41]);assert.deepEqual([...B.charBytes(0x82a0)],[0x82,0xa0]);
 assert.equal(new TextDecoder('shift_jis').decode(Buffer.concat([0x8366,0x8362,0x834e].map(B.charBytes))),'デック');
});

for(const [name,exes] of Object.entries(EXES))for(const exe of exes){
 const here=fs.existsSync(exe);
 test('owner\'s exe '+path.basename(exe)+' ('+name+'): exactly one link site and one release',{skip:!here&&'not on this PC'},()=>{
  const buf=fs.readFileSync(exe),sha=crypto.createHash('sha256').update(buf).digest('hex'),s=fx.snippets[name];
  const t=B.textOf(buf),r=B.find(t.code,t.va);
  assert.equal(r.links.length,1);assert.equal(r.frees.length,1);
  if(!s.sha256.includes(sha))return; /* another build of the same game: the count still must hold */
  assert.equal(r.links[0].call,parseInt(s.va,16)+s.expect.callOffset);assert.equal(r.frees[0],parseInt(s.freeVa,16));
 });
}

test('draw.viaRoles (version layer) becomes "#role" lines of the control file; nothing when empty',()=>{
 const E=require('../core/engine-draw.cjs'),D=require('../core/profiles/domains.cjs');
 assert.equal(D.layerOf('draw.viaRoles'),'version');
 assert.deepEqual(D.clean({draw:{viaRoles:['3d412,31e49=name']}}).value,{draw:{viaRoles:['3d412,31e49=name']}});
 const on=E.settings({draw:{roles:true,viaRoles:['3d412,31e49=name','43acd0=evil','x\r\n#cfg=line']}});
 assert.deepEqual(on.viaRoles,['3d412,31e49=name'],'only "<hex rva>,...=<role>" entries');
 assert.equal(E.krkrControlText(on,new Map()),'#cfg roles=1 embed=0 zh=1\r\n#role 3d412,31e49=name\r\n');
 assert.equal('viaRoles' in E.settings({draw:{roles:true}}),false,'no entries: the settings as before');
});
