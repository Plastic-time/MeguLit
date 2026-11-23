// 2026-11-15 (死に逝く君、館に芽吹く憎悪, KiriKiri, 1.4.10): lines were read twice. Replay of the live hook log:
// Krkr2wcs draws many lines twice in one frame (「X　X　」), repeat-normalizer collapsed some of them first, so DoubleLine lost its
// "this stream draws twice" evidence and 「そこには普段と変わらない日常の姿があった。」 was shown and translated twice; the side stream's
// doubled frame reached the art path before the dialogue line; tTVPNativeBaseBitmap::DrawText's typewriter dump
// (「公公園公園で公園での…」) became a choice.
const hookBridgeChild=require('./helpers/hook-bridge-child.cjs');
const test=require('node:test'),assert=require('node:assert');
const {HookNative}=require('../core/hook-native.cjs');
const {DoubleLine}=require('../core/double-line.cjs');
const {ChoiceCapture}=require('../core/choice-capture.cjs');
const {typedOut}=require('../core/language-tracks.cjs');
const twice=s=>s+'　'+s+'　';

function fixture(t){
 let now=1e6;const art=[];
 const hook=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},()=>{},()=>{},()=>now);hook.trace=()=>{};t.after(()=>hook.stop());
 hook.artLocate=text=>art.push(text);hook.process=hookBridgeChild();
 const line=text=>{hook.source({text,sourceName:'Krkr2wcs',sourceCode:'EXHQXN8@17527C:bug02_yakata.exe',origin:'live'},'');now+=1500;return String(hook.lastSource||'').trim();};
 return {hook,art,line,tick:ms=>{now+=ms;}};
}

test('a stream that draws lines twice keeps its evidence after repeat-normalizer collapsed some lines itself',t=>{
 const f=fixture(t);
 f.line(twice('　特に何かの説明があったわけでもなく、それは起こった。'));
 assert.equal(f.line(twice('『彼ら』は突然現れて、世界を蹂躙し始めた。')),'『彼ら』は突然現れて、世界を蹂躙し始めた。');
 for(const s of ['窃盗。','器物破損。','強姦。'])f.line(twice(s));
 assert.equal(f.line('そして――殺人――――。'),'そして――殺人――――。','a line with its own repeated dashes is kept as it is');
 f.line('人間の側の法律を当てはめれば、ほとんどの罪に該当するだろう。');
 f.line(twice('当時、街には多くの人々が溢れていた。'));
 f.line('デパートで買い物をしたり、レストランで食事をしたり、公園でのんびりと過ごしたり……。');
 assert.equal(f.line(twice('そこには普段と変わらない日常の姿があった。')),'そこには普段と変わらない日常の姿があった。');
 assert.equal(f.line(twice('きっと今日も平和な一日。')),'きっと今日も平和な一日。');
});

test('a line said twice from a stream that never drew twice stays (E408)',()=>{
 const d=new DoubleLine(()=>0);
 for(const s of ['今日は晴れ。','明日も晴れ。','その次も晴れ。'])d.fix('s',s,'',s);
 assert.equal(d.fix('s','はい。はい。','x').text,'はい。はい。');
 /* the evidence is taken from the frame as drawn, before another normalizer collapsed it */
 const e=new DoubleLine(()=>0);e.fix('k','窃盗。','',twice('窃盗。'));
 assert.equal(e.fix('k','そうだ。そうだ。','x').text,'そうだ。');
});

test("the side stream's doubled frame of the coming line is not art text",async t=>{
 const f=fixture(t);f.line('デパートで買い物をしたり、レストランで食事をしたり。');
 const text=twice('きっと今日も平和な一日。');
 f.hook.auxText({text,sourceName:'KiriKiri2',role:0});
 f.line(text);
 await new Promise(r=>setTimeout(r,250));
 assert.deepEqual(f.art,[]);
});

test('typewriter dumps (growing prefixes glued) are no choice and no art text',async t=>{
 const dumps=['公公園公園で公園での公園でのん','公公公園公園公園で公園で公園での公園での公園でのん公園でのん','窃窃窃窃窃窃盗盗窃窃盗盗。。窃窃盗盗。。','強強強強強姦強姦強姦。強姦。強姦。強姦。'];
 for(const s of dumps)assert.equal(typedOut(s),true,s);
 for(const s of ['そして――殺人――――。','わ、わた、わたし','ままま待って','さささささ寒い','なななななんで','ああああああああ！','ドキドキドキドキ','はいはいはい',twice('そこには普段と変わらない日常の姿があった。'),'上書きで何か吹き込む'])assert.equal(typedOut(s),false,s);
 const c=new ChoiceCapture(()=>0);for(const s of dumps)assert.deepEqual(c.add(s,'デパートで買い物をしたり。'),[],s);
 assert.equal(c.options(),null);
 const f=fixture(t);f.line('デパートで買い物をしたり。');
 for(const s of dumps)f.hook.auxText({text:s,sourceName:'tTVPNativeBaseBitmap::DrawText',role:0});
 await new Promise(r=>setTimeout(r,250));
 assert.deepEqual(f.art,[]);
});

test('real choices still pass',()=>{
 const c=new ChoiceCapture(()=>0);c.add('館を探索する\n部屋に戻る','前の台詞。');
 assert.deepEqual(c.options(),['館を探索する','部屋に戻る']);
});
