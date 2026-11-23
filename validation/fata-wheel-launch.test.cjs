// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {launchPlan}=require('../services/fata-wheel.cjs');
const {activeGameForProgram}=require('../services/library.cjs');

test('the Fata wheel launch can retain a verified wrapper language and resolve the running engine',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fata-wheel-'));
 t.after(()=>{
  assert.equal(path.dirname(fs.realpathSync(dir)),fs.realpathSync(os.tmpdir()));
  fs.rmSync(dir,{recursive:true,force:true});
 });
 const executable=path.join(dir,'fata.exe'),launcher=path.join(dir,'fata_jp.exe');
 for(const file of [executable,path.join(dir,'data.xp3'),path.join(dir,'data_jp.xp3')])fs.writeFileSync(file,'fixture');
 const wrapper=(text)=>Buffer.concat([Buffer.from('MZ'),Buffer.from(text,'utf16le')]);
 fs.writeFileSync(launcher,wrapper('fata.exe\0-language=jp\0'));
 assert.deepEqual(launchPlan(launcher),{executable,args:['-language=jp','-wheel=message']});
 const row={id:'fata',executable:launcher};
 const db={prepare:()=>({all:()=>[row]})};
 assert.equal(activeGameForProgram(db,executable),row);
 fs.writeFileSync(launcher,wrapper('fata.exe\0'));
 assert.equal(launchPlan(launcher),null);
 fs.writeFileSync(launcher,wrapper('fata.exe\0-language=jp\0-language=ru\0'));
 assert.equal(launchPlan(launcher),null);
 fs.writeFileSync(launcher,wrapper('another.exe\0-language=jp\0'));
 assert.equal(launchPlan(launcher),null);
});
