'use strict';
/* 2026-11-14 (user, beta.36, ダストマニア・グロテスク with a Chinese patch): Shift-JIS read as GBK went to the translator,
   whose reply 「这句话看起来是乱码…请提供完整的游戏台词原文」 was drawn as the translation, over MeguLit's own window. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {repairShiftJisAsGbk,garbledSource,metaReply}=require('../core/text-sanity.cjs');
const {createTranslationService}=require('../core/providers.cjs');
const {artNoTranslation}=require('../core/art-filter.cjs');
const MOJI='偙偺儊僢僙乕僕偼弶夞婲摦帪偺傒昞帵偝傟傑偡丅';
const MOJI_LONG='娐嫬愝掕偺乽僇乕僜儖堏摦惂尷乿傪乽偡傞乿偵愝掕偟偰偍偔偲丄僇乕僜儖偑';
const REFUSAL='这句话看起来是乱码或识别错误，请提供完整的游戏台词原文。';

test('Shift-JIS read as GBK comes back as the Japanese line',()=>{
 assert.equal(repairShiftJisAsGbk(MOJI),'このメッセージは初回起動時のみ表示されます。');
 assert.equal(repairShiftJisAsGbk(MOJI_LONG),'環境設定の「カーソル移動制限」を「する」に設定しておくと、カーソルが');
});
test('real Japanese, Chinese and kanji-only lines are never "repaired"',()=>{
 for(const t of['余計な不安を煽るかのように、鳥の鳴き声が響いていた。','这是一个测试，我们走吧。','东京大学的学生们','東京大学','漢字だけ','「……」','Hello world'])assert.equal(repairShiftJisAsGbk(t),null,t);
});
test('garbage is recognised, real text is not',()=>{
 for(const t of[MOJI,MOJI_LONG,'寳懐ｯｹ莠・ｯｹ莠・ｼ瑚ｿ呎ｬ｡諸槫−口謌ｦ','ã‚ã‚ŠãŒã¨ã†','���あ�','abc\u0001\u0002def'])assert.equal(garbledSource(t),true,t);
 for(const t of['余計な不安を煽るかのように、鳥の鳴き声が響いていた。','这是一个测试，我们走吧。','東京大学','「……」','Café au lait','I love you.','……！？'])assert.equal(garbledSource(t),false,t);
});
test('meta replies are recognised in Chinese, Japanese and English',()=>{
 for(const t of[REFUSAL,'抱歉，我无法识别这段文本，请提供原文。','这段文字似乎不是有效的日文。','请提供完整的日文台词，我来帮你翻译。','I cannot translate this text because it appears to be garbled.','Please provide the original Japanese text.','This does not look like Japanese text.','As an AI language model, I…','申し訳ありませんが、翻訳できません。','原文を提供してください。'])assert.equal(metaReply(t,'あいう'),true,t);
});
test('ordinary translations are never taken for meta replies',()=>{
 for(const [t,s] of[['对不起，我来晚了。','ごめん、遅れた。'],['我不能原谅你。','許せない。'],['请给我看看你的作业。','宿題を見せて。'],['这件事看起来不简单。','簡単じゃなさそうだ。'],['你不是日本人吧？','日本人じゃないでしょ？'],['I can\'t believe it.','信じられない。'],['Please give me the key.','鍵をちょうだい。']])assert.equal(metaReply(t,s),false,t);
});
test('a line that talks about translation itself may translate into those words',()=>{
 assert.equal(metaReply('这句我翻译不了啦，是乱码。','これ、文字化けしてて翻訳できないよ。'),false);
});

function service(reply){const calls=[];const fetcher=async(url,init)=>{calls.push(JSON.parse(init.body));return {ok:true,status:200,json:async()=>({choices:[{message:{content:typeof reply==='function'?reply(calls.length):reply}}]})};};
 const s=createTranslationService(fetcher);s.setKey('https://api.example.com/v1','k');return {s,calls};}
const opts={provider:'gpt',baseUrl:'https://api.example.com/v1',model:'m'};
test('garbage is never sent to the translator',async()=>{
 const {s,calls}=service('X');
 assert.equal(await s.translate(MOJI,opts),'');assert.equal(await s.translate('��あ�',opts),'');assert.equal(calls.length,0);
});
test('a translator\'s meta reply is dropped, not shown, not cached, not used as context',async()=>{
 const {s,calls}=service(n=>n===1?REFUSAL:'好的。');
 assert.equal(await s.translate('はい。',opts),'');
 assert.equal(await s.translate('はい。',opts),'好的。');assert.equal(calls.length,2);
 await s.translate('いいえ。',opts);const ctx=JSON.parse(calls[2].messages[1].content);assert.equal(ctx.previous.some(p=>p.translation===REFUSAL),false);
});
test('a normal translation passes through',async()=>{const {s}=service('早上好。');assert.equal(await s.translate('おはよう。',opts),'早上好。');});
test('the art layer drops meta replies too',()=>{assert.equal(artNoTranslation('ミき=ミミミ',REFUSAL),true);assert.equal(artNoTranslation('おはよう',REFUSAL),true);assert.equal(artNoTranslation('おはよう','早上好'),false);});
test('the hook repairs Shift-JIS read as GBK before anything else sees the line',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../core/hook-native.cjs'),'utf8');
 const i=src.indexOf("StreamCodepage)())).fix(stream,m.text)"),j=src.indexOf("this.languageCheck(m.text)");assert.ok(i>0&&j>i);
});
test('with a MeguLit window in front the reading layer stays directly above the game, never above MeguLit',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../native/GalWindowBridge.cs'),'utf8');
 assert.doesNotMatch(src,/SetWindowPos\(Overlay,fg,/);assert.doesNotMatch(src,/homeOwned\?fg:/);
 assert.match(src,/bool ownFront=GetAncestor\(fgWindow,2\)==Overlay;/);
 assert.match(src,/bool settingsFromHome=!bound&&PreferredOverlay!=IntPtr\.Zero/);
 assert.match(src,/if\(!front\)\{TopmostGuard\.Sink\(Overlay,gameTop\);return;\}/);
});

/* 2026-11-14 02:50 (same game, user screenshot): the game drew 「遠くで引きさく、モーター音が響いているのに気がついた。」 itself,
   MeguLit drew 「墦偔偱堷偒偝偔丄儌乕僞乕壒偑…」 over it. Bytes: the Shift-JIS of the line, read with code page 936. */
const {StreamCodepage}=require('../core/text-sanity.cjs');
const {HookNative}=require('../core/hook-native.cjs');
const LINE='遠くで引きさく、モーター音が響いているのに気がついた。',LINE_GBK='墦偔偱堷偒偝偔丄儌乕僞乕壒偑嬁偄偰偄傞偺偵婥偑偮偄偨丅';
test('the screenshot line comes back from its GBK reading',()=>{assert.equal(repairShiftJisAsGbk(LINE_GBK),LINE);assert.equal(garbledSource(LINE_GBK),true);assert.equal(garbledSource(LINE),false);});
test('a stream locks as Shift-JIS-as-GBK after two clear lines, then also kanji-only lines and 「……」 come back',()=>{
 const c=new StreamCodepage();
 assert.deepEqual(c.fix('s','搶嫗戝妛'),{text:'搶嫗戝妛',repaired:false,locked:false,unreadable:false});
 assert.equal(c.fix('s',LINE_GBK).text,LINE);const second=c.fix('s',MOJI);assert.equal(second.locked,true);assert.equal(c.mode('s'),'shift_jis read as gbk');
 assert.equal(c.fix('s','搶嫗戝妛').text,'東京大学');assert.equal(c.fix('s','乽乧乧乿').text,'「……」');assert.equal(c.fix('s','僟僗僩儅僯傾丒僌儘僥僗僋').text,'ダストマニア・グロテスク');
});
test('a stream with real kana is never read back loosely, and other streams are judged on their own',()=>{
 const c=new StreamCodepage();c.fix('jp','おはよう。');c.fix('jp','こんにちは。');assert.equal(c.mode('jp'),'native');
 assert.equal(c.fix('jp','東京大学').text,'東京大学');c.fix('jp',LINE_GBK);c.fix('jp',MOJI);assert.equal(c.mode('jp'),'native');
 assert.equal(c.fix('cn','这是一个测试，我们走吧。').text,'这是一个测试，我们走吧。');assert.equal(c.fix('cn','东京大学').text,'东京大学');assert.equal(c.mode('cn'),'');
});
test('the hook delivers the repaired Japanese and never an unreadable line',t=>{
 const ev=[],traces=[];let now=100000;const hook=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},e=>ev.push(e),()=>{},()=>now);hook.trace=m=>traces.push(m);hook.enabled=true;t.after(()=>hook.stop());
 const line=text=>{hook.source({text,sourceName:'BRUNS',origin:'live'},'');now+=5000;};
 line(LINE_GBK);line(MOJI);line('搶嫗戝妛');line('寳懐ｯｹ莠・ｯｹ莠・ｼ瑚ｿ呎ｬ｡諸槫−口謌ｦ');
 const shown=ev.filter(e=>e.hookSource).map(e=>e.hookSource);
 assert.deepEqual(shown,[LINE,'このメッセージは初回起動時のみ表示されます。','東京大学']);
 assert.ok(traces.some(m=>/^stream locked as shift_jis read as gbk/.test(m)));assert.ok(traces.some(m=>/^source dropped unreadable/.test(m)));
});
test('the embed path translates the repaired line and leaves unreadable text to the game',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../services/reader.cjs'),'utf8');
 assert.match(src,/const fixed=sanity\.repairMojibake\(text\);if\(fixed\)text=fixed\.text;else if\(sanity\.garbledSource\(text,\{controls:false\}\)\)\{this\.gal\?\.hooks\?\.embedReply\(id,'',/);
});

/* the same lines as a game shows them on other systems: Shift-JIS or UTF-8 bytes read with another code page
   (the platform decoders, as Windows does for these code pages) */
const {repairMojibake}=require('../core/text-sanity.cjs');
const LINES=['このメッセージは初回起動時のみ表示されます。','「お兄ちゃん、早く起きてよ！」',LINE];
const SJIS=['82b182cc83818362835a815b835782cd8f8989f18b4e93ae8e9e82cc82dd955c8ea682b382ea82dc82b78142','817582a88c5a82bf82e182f18141918182ad8b4e82ab82c482e681498176','899382ad82c588f882ab82b382ad81418382815b835e815b89b982aa8bbf82a282c482a282e982cc82c98b4382aa82c282a282bd8142'],UTF8=['e38193e381aee383a1e38383e382bbe383bce382b8e381afe5889de59b9ee8b5b7e58b95e69982e381aee381bfe8a1a8e7a4bae38195e3828ce381bee38199e38082','e3808ce3818ae58584e381a1e38283e38293e38081e697a9e3818fe8b5b7e3818de381a6e38288efbc81e3808d','e981a0e3818fe381a7e5bc95e3818de38195e3818fe38081e383a2e383bce382bfe383bce99fb3e3818ce99fbfe38184e381a6e38184e3828be381aee381abe6b097e3818ce381a4e38184e3819fe38082'];
const seen=(hex,codec)=>new TextDecoder(codec).decode(Buffer.from(hex,'hex'));
for(const [bytes,codec,pair] of [[SJIS,'gbk','shift_jis read as gbk'],[SJIS,'windows-1252','shift_jis read as windows-1252'],[UTF8,'windows-1252','utf-8 read as windows-1252']])
 test('Japanese stored as '+pair+' comes back',()=>{let n=0;bytes.forEach((hex,i)=>{const r=repairMojibake(seen(hex,codec));if(r){assert.deepEqual(r,{text:LINES[i],pair});n++;}});assert.ok(n>=2,pair+' '+n);});
test('code pages that drop bytes give nothing back, and that text is still never drawn as is',()=>{
 for(const [bytes,codec] of [[SJIS,'big5'],[SJIS,'euc-kr'],[UTF8,'gbk'],[UTF8,'shift_jis']])for(const hex of bytes){const t=seen(hex,codec);assert.equal(repairMojibake(t),null,codec+' '+t);assert.equal(garbledSource(t),true,codec+' '+t);}
});
test('real Chinese, Korean and Western text is never read back',()=>{
 for(const t of['这是一个测试，我们走吧。','這是一個測試，我們走吧。','안녕하세요, 오늘 날씨가 좋네요.','Café au lait, s’il vous plaît — merci™','Ünïcödé façade','東京大学'])assert.equal(repairMojibake(t),null,t);
});
test('a stream locked to a code page drops a line whose bytes were lost',()=>{
 const c=new StreamCodepage();c.fix('w',seen(SJIS[0],'windows-1252'));c.fix('w',seen(SJIS[1],'windows-1252'));assert.equal(c.mode('w'),'shift_jis read as windows-1252');
 assert.equal(c.fix('w','‚±一').unreadable,true);assert.equal(c.fix('w','OK').unreadable,false);
});
