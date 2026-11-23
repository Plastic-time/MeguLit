// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-anki-recovery-'));
process.env.MEGULIT_ROOT=root;
const {dispatch}=require('../services/bridge.cjs');
const {openStore}=require('../services/store.cjs');
test.after(()=>fs.rmSync(root,{recursive:true,force:true}));

test('the refresh service releases legacy pending actions and requires showing the answer again',async t=>{
 const oldFetch=globalThis.fetch;
 t.after(()=>{globalThis.fetch=oldFetch;});
 let answers=0;
 globalThis.fetch=async(url,options)=>{
  const {action}=JSON.parse(options.body);
  let result;
  if(action==='guiCurrentCard')result={cardId:101,deckName:'Fixture',question:'front',answer:'back',buttons:[1,2,3,4]};
  else if(action==='guiShowAnswer')result=true;
  else if(action==='guiAnswerCard'){answers++;result=true;}
  else throw Error('Unexpected '+action);
  return {ok:true,json:async()=>({result,error:null})};
 };
 await dispatch({action:'anki_current'});
 await dispatch({action:'anki_show_answer',cardId:101});
 const db=openStore(root);
 db.prepare('INSERT INTO anki_actions VALUES(?,?,?,?,?,?)').run('legacy-pending-101',101,3,'pending',null,1);
 db.close();
 assert.equal((await dispatch({action:'anki_current'})).answerShown,false);
 await assert.rejects(dispatch({action:'anki_grade',cardId:101,ease:3,operationId:'legacy-pending-101'}),/ANKI_ACTION_PENDING/);
 await assert.rejects(dispatch({action:'anki_grade',cardId:101,ease:3,operationId:'fresh-101'}),/ANKI_ANSWER_REQUIRED/);
 await dispatch({action:'anki_show_answer',cardId:101});
 await dispatch({action:'anki_grade',cardId:101,ease:3,operationId:'fresh-101'});
 assert.equal(answers,1);
});
