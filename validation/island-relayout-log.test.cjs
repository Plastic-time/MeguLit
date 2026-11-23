'use strict';
/* 2026-11-19 (ISLAND with its own CatSystem2 hook, rig5 live: 96 "native log detected; reading paused", 14 of 20 hidden lines
   never shown, the same in v1.4.16): a page relayout sends the page's earlier lines again right after the newest one, and
   the game's LOG detection (E215.2) took that for the LOG. The LOG is now told by evidence: earlier lines read lately arriving
   while the story has not moved on for 2 s. Recorded frames: helpers/island-relayout/rig5-isl.jsonl (every hook frame of that
   session, in time order). */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {HookNative}=require('../core/hook-native.cjs');
function fixture(t){t.mock.timers.enable({apis:['setTimeout']});let now=1000;const events=[],traces=[];
 const hook=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-relayout-log'},m=>events.push(m),()=>{},()=>now);hook.trace=s=>traces.push(String(s));t.after(()=>hook.stop());
 return {hook,traces,line(text,name='EmbedTest'){hook.source({text,sourceName:name,origin:'live'},'');},tick(ms){now+=ms;t.mock.timers.tick(ms);},
  read:()=>events.filter(m=>typeof m.hookSource==='string'&&m.hookSource).map(m=>m.hookSource),log:()=>events.filter(m=>typeof m.hookNativeLog==='boolean').map(m=>m.hookNativeLog)};}

test('recorded ISLAND session: page relayouts are no LOG (v1.4.16 saw 67 there)',t=>{
 const f=fixture(t);let at=0;
 for(const l of fs.readFileSync(path.join(__dirname,'helpers','island-relayout','rig5-isl.jsonl'),'utf8').split('\n').filter(Boolean)){const fr=JSON.parse(l);if(fr.t>at){f.tick(fr.t-at);at=fr.t;}f.line(fr.text,'CatSystem2');}
 const n=f.traces.filter(s=>s.includes('native log detected')).length;
 assert.ok(n<=2,'false LOGs: '+n+' (the two left are a new game started again from the title: two prologue lines passing within 0.4 s)');
});

test('an NVL page laid out again after its newest line: the earlier lines are no LOG and the next line is read',t=>{
 const f=fixture(t);const page=['繰り返される単調な音。','無機質で、だけど優しい、ゆりかごの音。','それは何万、何億の年を越えて紡がれてきたこの星の息吹だ。'];
 for(const s of page){f.line(s);f.tick(3000);}
 f.line('まだこの世界の広さと深さを知らなかったあの頃――。');for(const s of page){f.tick(60);f.line(s);}
 f.tick(3000);f.line('二人で並んで歩いた白い砂浜。');
 assert.deepEqual(f.log(),[]);assert.equal(f.read().at(-1),'二人で並んで歩いた白い砂浜。');assert.ok(f.read().includes('まだこの世界の広さと深さを知らなかったあの頃――。'));
});

test('the previous line sent again with the new one (「わお…」 after 「いやっほう…」) is no LOG',t=>{
 const f=fixture(t);for(const s of ['わお、水平線まで続くマリンブルー。']){f.line(s);f.tick(3000);}
 f.line('いやっほう、世界はなんて美しいんだッ！！');f.tick(150);f.line('わお、水平線まで続くマリンブルー。');f.tick(110);f.line('……つーか………。');f.tick(190);f.line('……つーか………。');f.tick(2000);
 assert.deepEqual(f.log(),[]);assert.equal(f.read().at(-1),'……つーか………。');
});

test('a new game or a skip through text read before plays it forward: read as usual',t=>{
 const f=fixture(t);const lines=['一行目のせりふ。','二行目のせりふ。','三行目のせりふ。','四行目のせりふ。'];
 for(const s of lines){f.line(s);f.tick(2500);}
 f.line('新しい章のせりふ。');f.tick(5000);
 for(const s of lines.slice(1)){f.line(s);f.tick(300);}
 assert.deepEqual(f.log().filter(Boolean).length<=1,true);
});

test('a new game started again from the title: its first lines are not lost even while they look like a LOG',t=>{
 const f=fixture(t);const pro=['繰り返される単調な音。','無機質で、だけど優しい、ゆりかごの音。','それは何万、何億の年を越えて紡がれてきたこの星の息吹だ。','まだこの世界の広さと深さを知らなかったあの頃――。','二人で並んで歩いた白い砂浜。'];
 for(const s of pro){f.line(s);f.tick(3000);}
 f.tick(20000);f.line(pro[0]);f.tick(150);f.line(pro[1]);f.tick(3000);f.line(pro[2]);f.tick(2000);
 const read=f.read();const second=read.slice(pro.length);
 assert.deepEqual(second.filter(x=>pro.slice(0,3).includes(x)),pro.slice(0,3),'all three lines of the restarted run are read, in order: '+JSON.stringify(second));
});

test('a line arriving while the text window is hidden only for a moment (a sprite change) is dialogue, not art text',t=>{
 const f=fixture(t);const art=[];f.hook.artCandidate=x=>art.push(x);
 f.line('「あー待て待て、使用時にはもっと大きくなるはずだ、心配には及ばない」','CatSystem2');f.tick(3000);
 f.hook.dialogState(false);f.tick(7);f.line('「…………はぁ」','CatSystem2');f.tick(340);f.hook.dialogState(true);f.tick(1000);
 assert.equal(f.read().at(-1),'「…………はぁ」');assert.deepEqual(art,[]);
});
test('a line arriving while the text window stays hidden is art text as before (ファタモルガーナの館 opening)',t=>{
 const f=fixture(t);const art=[];f.hook.artCandidate=x=>art.push(x);
 f.line('前の行です。','CatSystem2');f.tick(3000);
 f.hook.dialogState(false);f.tick(50);f.line('……けれど……','CatSystem2');f.tick(1000);
 assert.deepEqual(art,['……けれど……']);assert.notEqual(f.read().at(-1),'……けれど……');
 f.hook.dialogState(false);f.tick(2000);f.line('……それでも……','CatSystem2');assert.deepEqual(art,['……けれど……','……それでも……'],'a window hidden for long: at once');
});
