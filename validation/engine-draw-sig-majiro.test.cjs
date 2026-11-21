// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const M=require('../tools/engine-sigs/majiro-draw.cjs'),PE=require('../tools/engine-sigs/draw-sites.cjs');
const fx=require('./fixtures/engine-sigs/majiro-draw.json'),snippet=Buffer.from(fx.hex,'hex');
test('real Majiro draw entry matches once with agreeing argument and output-box offsets',()=>{
 const hits=M.find(snippet);assert.equal(hits.length,1);assert.equal(hits[0].offset,0);assert.equal(hits[0].locals,fx.locals);
 assert.deepEqual([hits[0].fontArg,hits[0].textArg,hits[0].outArg],[1,3,4]);
 assert.deepEqual([hits[0].x,hits[0].y,hits[0].size,hits[0].paint],[0x48,0x4c,0x28,0x38]);
 for(const offset of [10,24,33,48]){const bad=Buffer.from(snippet);bad[offset]^=4;assert.deepEqual(M.find(bad),[],String(offset));}
 const bad=Buffer.from(snippet),anchor=bad.indexOf(Buffer.from('8b53488b8424','hex'));assert.ok(anchor>=0);bad[anchor+14]=0x50;assert.deepEqual(M.find(bad),[],'wrong y field');
 assert.equal(M.find(Buffer.concat([snippet,snippet])).length,2,'ambiguity remains visible to the runtime unique-match guard');
 for(let n=0;n<0xd0;n++)assert.deepEqual(M.find(snippet.subarray(0,n)),[],'truncated input '+n);
});
const file=process.env.MEGULIT_MAJIRO_SAMPLE||'H:/MeguLit-Work/samples/majiro-himeko/narci_himeko/Narci_himeko.exe';
test('original Himeko executable: correct SHA and one draw function, not six cache-miss sites',{skip:!fs.existsSync(file)&&'sample absent on this machine'},()=>{
 const bytes=fs.readFileSync(file);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),fx.sha256);
 const sites=M.scanFile(file).sites;assert.equal(sites.length,1);assert.equal(sites[0].va,Number(fx.functionVa));
});
test('other engines and their true draw-site snippets do not match Majiro',()=>{
 const others=require('./fixtures/engine-sigs/draw-sites.json');for(const [name,s]of Object.entries(others.snippets))assert.deepEqual(M.find(Buffer.from(s.hex,'hex')),[],name);
 const files=require('./fixtures/engine-sigs/draw-sites-files.json');let inspected=0;
 for(const f of files){if(!fs.existsSync(f.path))continue;const p=PE.pe(fs.readFileSync(f.path));for(const c of p.code)assert.deepEqual(M.find(c.bytes),[],path.basename(f.path));inspected++;}
 console.log('# unrelated engine binaries inspected: '+inspected);
});
test('integration is observer-only, needs a unique match and keeps x64 unhooked',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','native','megulithook','MajiroDraw.h'),'utf8');
 assert.match(src,/if\(total!=1\)return false/);assert.match(src,/if\(RolesAsked\(\)\)\{if\(Install\(\)\)/);
 assert.match(src,/if\(!InterlockedCompareExchange\(&Observing,0,0\)\)return Original/);
 assert.match(src,/else InterlockedExchange\(&Observing,0\)/);
 assert.match(src,/for\(;;\)\{RefreshControl\(\)/);
 assert.match(src,/#else\s+namespace MajiroDraw \{ static void Arm\(\) \{\} \}/);
 for(const f of ['build-x86.cmd','build-x64.cmd'])assert.match(fs.readFileSync(path.join(__dirname,'..','native','megulithook',f),'utf8'),/for %%F in \(MajiroDraw\.h MajiroDrawSig\.h\)/);
});
