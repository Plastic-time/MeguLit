// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 info source setting (services/info-source.cjs): auto = Moegirlpedia first only in the Chinese UI, or forced either way by the switch. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const src=require('../services/info-source.cjs');
const tmp=()=>fs.mkdtempSync(path.join(process.env.MEGULIT_TMP||os.tmpdir(),'infosrc-'));
const put=(root,v)=>{const f=path.join(root,'data','config','library.json');fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(v));};
test('default auto: Moegirlpedia first in the Chinese UI only',()=>{const r=tmp();assert.equal(src.get(r),'auto');assert.equal(src.forRoot(r,'zh'),true);assert.equal(src.forRoot(r,'en'),false);assert.equal(src.forRoot(r,'ja'),false);});
test('the switch decides whatever the UI language is; a bad value is auto',()=>{const r=tmp();put(r,{infoSource:'moegirl'});assert.equal(src.forRoot(r,'en'),true);put(r,{infoSource:'vndb'});assert.equal(src.forRoot(r,'zh'),false);put(r,{infoSource:'nope'});assert.equal(src.get(r),'auto');});
test('settings: the library scope reads and writes infoSource',()=>{const {Settings}=require('../services/settings.cjs');const r=tmp();const s=new Settings(r);assert.equal(s.read('library').infoSource,'auto');
 const cur=s.read('library');s.save({scope:'library',values:{...cur,infoSource:'vndb'}});assert.equal(new Settings(r).read('library').infoSource,'vndb');assert.equal(src.get(r),'vndb');});
