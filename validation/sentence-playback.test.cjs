'use strict';
const test=require('node:test'),assert=require('node:assert/strict');

test('the latest sentence click owns playback and releases its audio URL',async t=>{
 const {playSentence}=await import('../web/sentence-voice.js');
 const clips=[],revoked=[];
 let nextURL=0,play=async()=>{};
 const audio=class extends EventTarget{
  constructor(src){super();this.src=src;clips.push(this);}
  async play(){this.played=true;await play();}
  pause(){this.paused=true;}
 };
 const previous=Object.getOwnPropertyDescriptor(globalThis,'Audio');
 Object.defineProperty(globalThis,'Audio',{value:audio,configurable:true});
 t.after(()=>{if(previous)Object.defineProperty(globalThis,'Audio',previous);else delete globalThis.Audio;});
 t.mock.method(URL,'createObjectURL',()=>`blob:clip-${nextURL++}`);
 t.mock.method(URL,'revokeObjectURL',url=>revoked.push(url));
 const response={data:'AA==',source:'game'};
 let finish;
 const first=playSentence(()=>new Promise(resolve=>{finish=resolve;}),'first');
 await playSentence(async()=>response,'second');
 finish(response);await first;
 assert.equal(clips.length,1);
 assert.equal(clips[0].src,'blob:clip-0');
 assert.ok(clips[0].played);
 assert.ok(!clips[0].paused);
 await playSentence(async()=>response,'third');
 assert.ok(clips[0].paused);
 assert.deepEqual(revoked,['blob:clip-0']);
 clips[1].dispatchEvent(new Event('ended'));
 assert.deepEqual(revoked,['blob:clip-0','blob:clip-1']);
 let rejectPlay;
 play=()=>new Promise((_,reject)=>{rejectPlay=reject;});
 const interrupted=playSentence(async()=>response,'fourth');
 await new Promise(resolve=>setImmediate(resolve));
 play=async()=>{};
 await playSentence(async()=>response,'fifth');
 rejectPlay(Error('interrupted'));
 await interrupted;
 clips[2].dispatchEvent(new Event('error'));
 assert.deepEqual(revoked,['blob:clip-0','blob:clip-1','blob:clip-2']);
 clips[3].dispatchEvent(new Event('error'));
 assert.deepEqual(revoked,['blob:clip-0','blob:clip-1','blob:clip-2','blob:clip-3']);
 play=async()=>{throw Error('cannot play');};
 await assert.rejects(playSentence(async()=>response,'sixth'),/cannot play/);
 assert.deepEqual(revoked,['blob:clip-0','blob:clip-1','blob:clip-2','blob:clip-3','blob:clip-4']);
});
