// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 developer logos (services/seed-logo.cjs): the icon of the producer's own site named by VNDB, checked, kept, cached;
   no site / no icon / a local address = no logo (the page draws a letter badge). No network. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const L=require('../services/seed-logo.cjs');
const tmp=()=>fs.mkdtempSync(path.join(process.env.MEGULIT_TMP||os.tmpdir(),'logo-'));
const PNG=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),Buffer.alloc(40)]);
const ICO=Buffer.from([0,0,1,0,1,0,16,16,0,0,1,0,32,0,0,0,0,0,22,0,0,0]);
const res=(body,{ok=true,url='https://x/'}={})=>({ok,url,headers:{get:()=>null},json:async()=>body,arrayBuffer:async()=>Uint8Array.from(Buffer.isBuffer(body)?body:Buffer.from(String(body))).buffer});
const site=(web,files)=>{const seen=[];const f=async(url,init)=>{seen.push(url);if(url==='https://api.vndb.org/kana/producer')return res({results:[{extlinks:web?[{name:'twitter',url:'https://x.com/a'},{name:'website',url:web}]:[]}]});return files[url]?res(files[url],{url}):res('',{ok:false});};f.seen=seen;return f;};
test('iconFromHtml: shortcut icon first, then icon, then apple-touch; relative to the page',()=>{assert.equal(L.iconFromHtml('<link rel="apple-touch-icon" href="/a.png"><link rel="shortcut icon" href="img/f.ico?x=1&amp;y=2">','https://studio.example.jp/top/'),'https://studio.example.jp/top/img/f.ico?x=1&y=2');assert.equal(L.iconFromHtml('<p>nothing</p>','https://a.jp/'),'');});
test('a logo: the page icon is taken, saved once, then served from the cache without asking again',async()=>{const root=tmp();
 const f=site('http://studio.example.jp/',{'http://studio.example.jp/':'<html><link rel="icon" href="/logo.png"></html>','http://studio.example.jp/logo.png':PNG});
 let u=await L.logo(root,'p24',{fetch:f});assert.match(u,/^data:image\/png;base64,/);assert.ok(fs.readdirSync(path.join(root,'data','assets','logos')).some(n=>n.startsWith('p24-')));
 const n=f.seen.length;u=await L.logo(root,'p24',{fetch:async()=>{throw Error('no network');}});assert.match(u,/^data:image\/png/);assert.equal(f.seen.length,n);});
test('no icon link: /favicon.ico; an ICO is accepted',async()=>{const root=tmp();const f=site('https://s.example.jp/',{'https://s.example.jp/':'<html></html>','https://s.example.jp/favicon.ico':ICO});assert.match(await L.logo(root,'p5',{fetch:f}),/^data:image\/x-icon/);});
test('no site, no icon, not an image, too big, a local address: null (and the miss is cached)',async()=>{
 assert.equal(await L.logo(tmp(),'p1',{fetch:site('',{})}),null);
 const r=tmp();assert.equal(await L.logo(r,'p2',{fetch:site('https://s.example.jp/',{'https://s.example.jp/':'<html></html>'})}),null);const n=0;assert.equal(await L.logo(r,'p2',{fetch:async()=>{throw Error('cached miss');}}),null);
 assert.equal(await L.logo(tmp(),'p3',{fetch:site('https://s.example.jp/',{'https://s.example.jp/favicon.ico':'<html>not an image</html>','https://s.example.jp/':'x'})}),null);
 assert.equal(await L.logo(tmp(),'p4',{fetch:site('https://s.example.jp/',{'https://s.example.jp/favicon.ico':Buffer.concat([PNG,Buffer.alloc(70*1024)]),'https://s.example.jp/':'x'})}),null);
 const f=site('http://192.168.1.5/',{});assert.equal(await L.logo(tmp(),'p6',{fetch:f}),null);assert.ok(!f.seen.some(u=>u.includes('192.168')),'a local address is never visited');
 assert.equal(L.publicUrl('http://localhost/'),null);assert.equal(L.publicUrl('https://[::1]/'),null);assert.equal(L.publicUrl('ftp://a.jp/'),null);assert.equal(L.publicUrl('https://u:p@a.jp/'),null);assert.ok(L.publicUrl('https://a.jp/'));});
test('a bad producer id is refused; a failed VNDB ask keeps the old logo and is not repeated at once',async()=>{const root=tmp();assert.equal(await L.logo(root,'x1',{fetch:site('',{})}),null);let n=0;const bad=async()=>{n++;throw Error('x');};assert.equal(await L.logo(root,'p7',{fetch:bad}),null);assert.equal(await L.logo(root,'p7',{fetch:bad}),null);assert.equal(n,1);});
