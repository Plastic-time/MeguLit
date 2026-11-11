// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-reader-class-'));process.env.MEGULIT_ROOT=root;
const {dispatch}=require('../services/bridge.cjs');
test.after(()=>{try{fs.rmSync(root,{recursive:true,force:true});}catch{}});
test('转职: the school is empty at first, can be set, changed again and cleared, and rejects unknown ones',async()=>{
 assert.deepEqual(await dispatch({action:'reader_class_get'}),{school:'',at:0});
 assert.equal((await dispatch({action:'reader_class_set',school:'explosion'})).school,'explosion');
 assert.equal((await dispatch({action:'reader_class_get'})).school,'explosion');
 await dispatch({action:'reader_class_set',school:'frost'});
 assert.equal((await dispatch({action:'reader_class_get'})).school,'frost');
 await assert.rejects(dispatch({action:'reader_class_set',school:'necromancy'}),/READER_CLASS_INVALID/);
 assert.equal((await dispatch({action:'reader_class_get'})).school,'frost');
 await dispatch({action:'reader_class_set',school:''});
 assert.equal((await dispatch({action:'reader_class_get'})).school,'');
});
