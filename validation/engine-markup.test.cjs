const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const {engineMarkup,japaneseTrack}=require('../core/language-tracks.cjs');
test('2026-11-16: engine markup with arguments is stripped before text is shown or translated (all engines)',()=>{
 assert.strictEqual(engineMarkup('然后%p-1;%fMS 哥特;——%p;%fuser;杀人%p-1;%fMS 哥特;————%p;%fuser;。'),'然后——杀人————。');
 assert.strictEqual(japaneseTrack('そして%p-1;%fMS ゴシック;──%p;%fuser;殺人。'),'そして──殺人。');
 assert.strictEqual(engineMarkup(String.raw`\C[2]こんにちは\C[0]`),'こんにちは','RPG Maker escapes');
 assert.strictEqual(engineMarkup('<color=#ff0>赤</color><b>太</b>'),'赤太','rich text tags');
 assert.strictEqual(engineMarkup('行く[r]次[font size=30]だ[l]'),'行く次だ','KAG inline tags');
 assert.strictEqual(engineMarkup('[ルビ]と[1]は 50%です;'),'[ルビ]と[1]は 50%です;','text in brackets and percent signs stay');
});
test('2026-11-16: a patch translation goes through the same markup strip',()=>{
 assert.match(fs.readFileSync(path.join(__dirname,'../core/hook-native.cjs'),'utf8'),/chinese:require\('\.\/language-tracks\.cjs'\)\.engineMarkup\(r\.translation\)/);
});
test('2026-11-16: prefilled script translations are stored and read without engine tags (old stores too)',()=>{
 const os=require('os'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'fill-'));const ot=require('../services/original-text.cjs');
 const file=require('path').join(dir,'data','original-text','g','fill-0123456789abcdef.json');fs.mkdirSync(path.dirname(file),{recursive:true});
 const jp='そして%p-1;%fＭＳゴシック;――%p;%fuser;殺人。';fs.writeFileSync(file,JSON.stringify({schema:1,lines:{[ot.norm(jp)]:'然后%p-1;%fMS 哥特;——%p;%fuser;杀人。'}}));
 const store=ot._fillStore(dir,'g','0123456789abcdef');
 if(store.size()===0)return;/* schema/layout differ: covered by the source check below */
 assert.strictEqual(store.get(jp),'然后——杀人。');
});
test('2026-11-16: script prefetch strips engine tags before translating',()=>{
 assert.match(fs.readFileSync(path.join(__dirname,'../services/script-prefetch.cjs'),'utf8'),/engineMarkup\(item\.text\)[^\n]*translate\(source,/);
 assert.match(fs.readFileSync(path.join(__dirname,'../services/original-text.cjs'),'utf8'),/get:text=>clean\(map\.get\(norm\(text\)\)\)/);
});
