'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {find,candidates,AnkiProcess}=require('../core/anki-process.cjs'),{cleanV4}=require('../core/v4-config.cjs');
const env={LOCALAPPDATA:'C:\\Users\\u\\AppData\\Local',ProgramFiles:'C:\\Program Files'};
// configured path first, then classic installs, then the Anki 25 venv
assert.equal(candidates('D:\\Anki\\anki.exe',env)[0],'D:\\Anki\\anki.exe');
const venv=path.join(env.LOCALAPPDATA,'AnkiProgramFiles','.venv','Scripts','ankiw.exe');
assert.equal(find('',env,file=>file===venv),venv);
assert.equal(find('',env,()=>false),'');
// settings: new switches default off/on/off and accept ankiw.exe
const c=cleanV4({});assert.equal(c.ankiAutoStart,true);assert.equal(c.ankiAutoClose,true);assert.equal(c.ankiHidden,true);
assert.equal(cleanV4({ankiPath:'C:\\x\\ankiw.exe'}).ankiPath,'C:\\x\\ankiw.exe');
assert.equal(cleanV4({ankiPath:'C:\\x\\evil.exe'}).ankiPath,'');
(async()=>{
 // only an Anki that MeguLit started is closed (WM_CLOSE to its window, never killed); a kept Anki is shown again
 let online=true;const calls=[],win=[];const anki={call:async(_c,action)=>{calls.push(action);if(!online)throw Error('ANKI_OFFLINE');return 6;}};
 const windowControl=async mode=>{win.push(mode);if(mode==='close')online=false;return 1;};
 const p=new AnkiProcess({config:()=>cleanV4({ankiAutoStart:true,ankiHidden:false}),anki,windowControl});
 assert.deepEqual(await p.stop(),{closed:false});assert.deepEqual(win,[]);
 assert.deepEqual(await p.start(),{running:true,started:false});assert.equal(p.started,false);
 p.started=true;assert.deepEqual(await p.stop(),{closed:true});assert.deepEqual(win,['close']);
 online=true;win.length=0;const h=new AnkiProcess({config:()=>cleanV4({ankiHidden:true}),anki,windowControl});assert.deepEqual(await h.stop(),{closed:false});assert.deepEqual(win,['show']);
 win.length=0;const q=new AnkiProcess({config:()=>cleanV4({ankiAutoClose:false,ankiHidden:true}),anki,windowControl});q.started=true;assert.deepEqual(await q.stop(),{closed:false});assert.deepEqual(win,['show']);
 assert.deepEqual(await new AnkiProcess({config:()=>cleanV4({ankiAutoStart:false}),anki,windowControl}).auto(),{skipped:true});
 console.log('anki-process ok');
})().catch(e=>{console.error(e);process.exit(1);});
