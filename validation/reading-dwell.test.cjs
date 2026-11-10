// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ReadingStatistics}=require('../services/reading-statistics.cjs'),{openStore}=require('../services/store.cjs');
function chars(root){const db=openStore(root);try{return db.prepare('SELECT SUM(characters) n FROM reading_sessions').get().n;}finally{db.close();}}
test('skipped lines are not credited as read characters (#79)',t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-dwell-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const db=openStore(root);db.prepare('INSERT INTO games(id,title) VALUES(?,?)').run('a','A');db.close();let now=1e12;const stats=new ReadingStatistics(root,()=>now);
 const line='あいうえおかきくけこ';for(let i=1;i<=20;i++){stats.line({gameId:'a',text:line+i,sequence:i});now+=80;}
 assert.equal(chars(root),0);
 stats.line({gameId:'a',text:'ゆっくり読む文です',sequence:100});now+=10000;stats.line({gameId:'a',text:'次の文',sequence:101});
 assert.equal(chars(root),9);now+=5000;stats.reset();assert.equal(chars(root),12);});
