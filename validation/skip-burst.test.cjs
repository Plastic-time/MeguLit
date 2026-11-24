// SPDX-License-Identifier: GPL-3.0-or-later
// Fast-forward collapses intermediate lines. Only a settled line is sent for translation.
const test=require('node:test'),assert=require('node:assert/strict');const {HookNative}=require('../core/hook-native.cjs');
function fixture(t,onEvent=()=>{}){t.mock.timers.enable({apis:['setTimeout']});let now=1000;const events=[];
 const hook=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},m=>{events.push(m);onEvent(m);},()=>{},()=>now);hook.trace=()=>{};t.after(()=>hook.stop());
 return {line(text){hook.source({text,sourceName:'EmbedTest',origin:'live'},'');},tick(ms){now+=ms;t.mock.timers.tick(ms);},
  skip(held){hook.skipHeld(held);}, moveClock(ms){now+=ms;},
  placed(text){hook.deliverSource(text,'placement');},
  previews:()=>events.filter(m=>typeof m.hookSourcePreview==='boolean').map(m=>m.hookSourcePreview),
  read:()=>events.filter(m=>typeof m.hookSource==='string'&&m.hookSource).map(m=>m.hookSource)};}
test('a skip burst shows only the line the game stops on',t=>{
 const f=fixture(t);f.line('普通に読んだ台詞。');f.tick(2000);
 f.skip(true);
 for(let i=1;i<=20;i++){f.line('飛ばした台詞その'+i+'。');f.tick(20);}
 f.skip(false);f.line('止まった台詞。');f.tick(399);
 assert.deepEqual(f.read(),['普通に読んだ台詞。']);
 f.tick(2);assert.deepEqual(f.read(),['普通に読んだ台詞。','止まった台詞。']);
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
 assert.deepEqual(f.previews(),[true,true,false]);
});
test('held Ctrl collapses even when callbacks arrive 300 to 350 ms apart',t=>{
 const f=fixture(t);f.line('最初に読んだ台詞。');f.tick(20);f.skip(true);f.line('読み飛ばした最初の台詞。');
 f.tick(300);f.line('読み飛ばした次の台詞。');
 f.tick(350);f.line('画面に残った最後の台詞。');
 f.tick(149);assert.deepEqual(f.read(),['最初に読んだ台詞。']);
 f.tick(1);assert.deepEqual(f.read(),['最初に読んだ台詞。','画面に残った最後の台詞。']);
 assert.deepEqual(f.previews(),[true]);
 f.tick(500);assert.deepEqual(f.previews(),[true]);
 f.skip(false);f.tick(400);assert.deepEqual(f.previews(),[true,false]);
 assert.equal(f.read().length,2);
});
test('a newer placed line invalidates an older held line',t=>{
 const f=fixture(t);f.line('最初に読んだ台詞。');
 for(let i=1;i<=8;i++){f.tick(100);f.line('その途中で飛ばした台詞'+i+'。');}
 f.tick(80);f.placed('新しく配置済みの台詞。');
 f.tick(20);f.tick(400);
 assert.deepEqual(f.read(),['最初に読んだ台詞。','新しく配置済みの台詞。']);
});
test('the cap still expires when the system clock goes back during a burst',t=>{
 const f=fixture(t);f.line('最初に読んだ台詞。');
 for(let i=1;i<=8;i++){f.tick(100);if(i===4)f.moveClock(-2000);f.line('読み飛ばした台詞番号'+i+'。');}
 f.tick(100);assert.deepEqual(f.read(),['最初に読んだ台詞。','読み飛ばした台詞番号8。']);
});
test('skip previews update the source without asking for translation until the final line settles',t=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),requests=[];
 const f=fixture(t,m=>{
  if(typeof m.hookSourcePreview==='boolean')window.__tomoyoChinese.setHookSourcePreview?.(m.hookSourcePreview);
  if(typeof m.hookSource==='string'&&m.hookSource){sentence.textContent=m.hookSource;watch([{target:sentence}]);}
 });
 const parent={classList:{add(){},remove(){}}};
 const sentence={nodeType:1,textContent:'',closest:()=>parent,querySelectorAll:()=>[],insertAdjacentElement(){}};
 const el=()=>({dataset:{},style:{},textContent:'',isConnected:true,setAttribute(){},append(){},replaceChildren(){},getBoundingClientRect:()=>({height:24})});
 const document={documentElement:{},head:{appendChild(){}},createElement:el,querySelector:()=>sentence,querySelectorAll:()=>[]};
 const window={__tomoyoTranslateRequest:value=>requests.push(JSON.parse(value))};
 let watch;
 const inject=fs.readFileSync(path.join(__dirname,'../web/reader/modules/inject.js'),'utf8');
 vm.runInNewContext(inject,{document,window,localStorage:{getItem:()=>null},setTimeout,clearTimeout,setInterval(){},
  getComputedStyle:()=>({fontSize:'20',lineHeight:'24'}),MutationObserver:class{constructor(fn){watch=fn;}observe(){}}});
 const reads=()=>requests.filter(r=>r.text&&(r.id||r.type==='translateGuard'));
 f.line('最初に翻訳する台詞。');f.tick(220);
 assert.equal(reads().length,1);
 f.skip(true);
 for(let i=1;i<=24;i++){f.tick(100);f.line('連続で読み飛ばす台詞番号'+i+'。');}
 assert.ok(f.read().length>=3,'the reader sends Japanese previews during the burst');
 assert.equal(reads().filter(r=>r.text.startsWith('連続')).length,0);
 f.skip(false);f.tick(400);f.tick(220);
 assert.equal(reads().filter(r=>r.text.startsWith('連続')).length,1);
 assert.equal(reads().at(-1).text,'連続で読み飛ばす台詞番号24。');
});
