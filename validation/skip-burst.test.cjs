// SPDX-License-Identifier: GPL-3.0-or-later
// E215.4: fast-forward / held Ctrl sends lines a few ms apart. Only the line the game stops on is shown.
const test=require('node:test'),assert=require('node:assert/strict');const {HookNative}=require('../core/hook-native.cjs');
function fixture(t){t.mock.timers.enable({apis:['setTimeout']});let now=1000;const events=[];
 const hook=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},m=>events.push(m),()=>{},()=>now);hook.trace=()=>{};t.after(()=>hook.stop());
 return {line(text){hook.source({text,sourceName:'EmbedTest',origin:'live'},'');},tick(ms){now+=ms;t.mock.timers.tick(ms);},
  skip(held){hook.skipHeld(held);},
  read:()=>events.filter(m=>typeof m.hookSource==='string'&&m.hookSource).map(m=>m.hookSource)};}
test('a skip burst shows only the line the game stops on',t=>{
 const f=fixture(t);f.line('普通に読んだ台詞。');f.tick(2000);
 f.skip(true);
 for(let i=1;i<=20;i++){f.line('飛ばした台詞その'+i+'。');f.tick(20);}
 f.skip(false);f.line('止まった台詞。');f.tick(399);
 assert.deepEqual(f.read(),['普通に読んだ台詞。','飛ばした台詞その1。']);
 f.tick(2);assert.deepEqual(f.read(),['普通に読んだ台詞。','飛ばした台詞その1。','止まった台詞。']);
 f.tick(1000);f.line('次の台詞。');assert.equal(f.read().at(-1),'次の台詞。');
});
test('normal reading pace is delivered line by line',t=>{
 const f=fixture(t);for(const s of ['一つ目の台詞。','二つ目の台詞。','三つ目の台詞。']){f.line(s);f.tick(600);}
 assert.deepEqual(f.read(),['一つ目の台詞。','二つ目の台詞。','三つ目の台詞。']);
});
test('a normal click ends a pending skip burst at the 300 ms boundary',t=>{
 const f=fixture(t);f.line('最初に読んだ台詞。');
 f.tick(20);f.line('読み飛ばした台詞。');
 f.tick(300);f.line('普通の速度に戻った台詞。');
 assert.deepEqual(f.read(),['最初に読んだ台詞。','普通の速度に戻った台詞。']);
 f.tick(350);f.line('次に読み進めた台詞。');
 assert.equal(f.read().at(-1),'次に読み進めた台詞。');
 f.tick(500);
 assert.deepEqual(f.read(),['最初に読んだ台詞。','普通の速度に戻った台詞。','次に読み進めた台詞。']);
});
test('continuous skipping shows the latest line at each hold deadline',t=>{
 const f=fixture(t);f.line('最初に表示した台詞。');
 const skipped=i=>'早送り中の台詞その'+i+'。';
 for(let i=1;i<=8;i++){f.tick(100);f.line(skipped(i));}
 f.tick(99);assert.deepEqual(f.read(),['最初に表示した台詞。']);
 f.tick(1);assert.deepEqual(f.read(),['最初に表示した台詞。',skipped(8)]);
 f.line(skipped(9));
 for(let i=10;i<=16;i++){f.tick(100);f.line(skipped(i));}
 f.tick(99);assert.equal(f.read().at(-1),skipped(8));
 f.tick(1);assert.deepEqual(f.read(),['最初に表示した台詞。',skipped(8),skipped(16)]);
 f.tick(100);f.line('早送りを止めた台詞。');
 f.tick(399);assert.equal(f.read().at(-1),skipped(16));
 f.tick(1);assert.deepEqual(f.read(),['最初に表示した台詞。',skipped(8),skipped(16),'早送りを止めた台詞。']);
});
