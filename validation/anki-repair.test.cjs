'use strict';
// "Reconnect" must really reconnect (user, 2026-11-09): when another program holds AnkiConnect's port, close it;
// when AnkiConnect still does not answer, close Anki and start it cold. Anki and MeguLit are never treated as blockers.
const test=require('node:test'),assert=require('node:assert/strict');
const {AnkiProcess,isAnki,portOf}=require('../core/anki-process.cjs');

function rig({owners,onlineAfterKill=true,ankiRunning=false}){
 const killed=[],calls=[];let online=false;
 const runner=new AnkiProcess({
  config:()=>({ankiUrl:'http://127.0.0.1:8765'}),
  anki:{call:async()=>{if(!online)throw Error('ANKI_PORT_TAKEN');return 6;}},
  windowControl:async mode=>{calls.push(mode);return 1;},
  portOwners:async()=>owners.filter(o=>!killed.includes(o.pid)),
  killer:pid=>{killed.push(pid);if(onlineAfterKill&&!owners.some(o=>!killed.includes(o.pid)&&!isAnki(o)))online=true;return true;},
  running:()=>ankiRunning,ankiPids:()=>[],wait:async()=>{}
 });
 runner.start=async()=>{calls.push('start');online=true;return {running:true,started:true};};
 return {runner,killed,calls};
}

test('a program squatting on the port is closed and Anki answers without a restart',async()=>{
 const {runner,killed,calls}=rig({owners:[{pid:30456,name:'python',path:'F:\\Python\\python.exe'},{pid:35056,name:'pythonw',path:'C:\\Users\\u\\AppData\\Local\\AnkiProgramFiles\\.venv\\Scripts\\pythonw.exe'}]});
 const r=await runner.repair();
 assert.deepEqual(killed,[30456]);assert.equal(r.running,true);assert.deepEqual(r.killed,['python']);assert.ok(!calls.includes('start'));
});

test('when AnkiConnect still does not answer, Anki is closed normally and cold-started',async()=>{
 const {runner,killed,calls}=rig({owners:[{pid:35056,name:'pythonw',path:'C:\\Users\\u\\AppData\\Local\\AnkiProgramFiles\\python\\pythonw.exe'}],onlineAfterKill:false});
 const r=await runner.repair();
 assert.deepEqual(killed,[]);assert.deepEqual(calls,['close','start']);assert.equal(r.restarted,true);assert.equal(r.running,true);
});

test('an already connected Anki is left alone',async()=>{
 const {runner,killed,calls}=rig({owners:[]});runner.anki={call:async()=>6};
 assert.deepEqual(await runner.repair(),{running:true,repaired:false});assert.deepEqual(killed,[]);assert.deepEqual(calls,[]);
});

test('Anki processes are recognised by name or by Anki 25 venv path; the port comes from the configured URL',()=>{
 assert.ok(isAnki({name:'anki',path:''}));assert.ok(isAnki({name:'ankiw',path:''}));
 assert.ok(isAnki({name:'pythonw',path:'C:\\Users\\u\\AppData\\Local\\AnkiProgramFiles\\.venv\\Scripts\\pythonw.exe'}));
 assert.ok(!isAnki({name:'python',path:'F:\\Python.etc\\Python\\python.exe'}));
 assert.equal(portOf('http://127.0.0.1:8765'),8765);assert.equal(portOf('http://localhost:9000/'),9000);assert.equal(portOf('bad url'),8765);
});
