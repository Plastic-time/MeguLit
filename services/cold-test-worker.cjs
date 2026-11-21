// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 the cold-test run in its own process (services/cold-test.cjs forks it): the hook state of this run never mixes
   with the game the user plays. One message in ({root, exe, runDir, budgetMs, profile}), one result out, then exit. */
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
let child=null,started=false;
const send=m=>{try{process.send(m,e=>{if(e)process.exit(1);});}catch{process.exit(1);}};
function nativeProxy(){
 child=new EventEmitter();child.stdout=new PassThrough();child.exitCode=null;
 child.stdin={write:data=>send({type:'cold-native-write',data:String(data)})};
 child.kill=()=>send({type:'cold-native-stop'});
 send({type:'cold-native-spawn'});return child;
}
process.on('message',async m=>{
 if(m?.type==='cold-native-data'){child?.stdout.write(m.data);return;}
 if(m?.type==='cold-native-error'){child?.emit('error',Error(m.error));return;}
 if(m?.type==='cold-native-close'){if(child){child.exitCode=m.code??1;child.stdout.end();child.emit('exit',child.exitCode,m.signal);child.emit('close',child.exitCode,m.signal);}return;}
 if(m?.stop){require('./cold-test-run.cjs').stopActive();return;}
 if(started)return;started=true;let r;try{r=await require('./cold-test-run.cjs').runOne(m||{},{spawn:nativeProxy});}catch(e){r={end:'worker '+String(e?.message||e).slice(0,120),lines:0,shots:[]};}
 try{process.send({type:'cold-result',result:r},()=>process.exit(0));}catch{process.exit(1);}
});
process.on('disconnect',()=>process.exit(0));
