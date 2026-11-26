// SPDX-License-Identifier: GPL-3.0-or-later
/* E427 Lookup card: choosing another homograph in the styled dropdown (rendered on <body>) keeps the card open and swaps the entry.
   #1111 Per-entry variant spellings (e.g. よみがえる -> 蘇る / 甦る / 蘇える / 甦える, ひきちぎる -> 引きちぎる / 引き千切る) get their
   own dropdown without merging distinct homophone entries (e.g. きく: 聞く / 効く / 訊く / 菊 stay separate). */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {startEdge}=require('./library-views-perf.cjs');
const src=require('./flat-source.cjs')(path.join(__dirname,'..','web','reader','modules','selection.js'));
test('the dropdown list counts as part of the lookup card',()=>{
 const m=src.match(/const inOwn=node=>node\?\.closest\?\.\('([^']+)'\)/);assert.ok(m,'inOwn found');
 const own=m[1].split(',');assert.ok(own.includes('.mg-select-pop'),'mg-select-pop is own');assert.ok(own.includes('.tomoyo-selection-card'));
 assert.match(src,/document\.addEventListener\('pointerdown',e=>\{if\(inOwn\(e\.target\)\)return;/,'outside-click close is guarded by inOwn');
 const poll=fs.readFileSync(path.join(__dirname,'..','web','reader','modules','polish.js'),'utf8');assert.match(poll,/pop\.className='mg-select-pop'/);
});
test('switching homographs re-renders the card from the chosen entry',()=>{
 const body=src.slice(src.indexOf('其他同形词条'));assert.match(body,/select\.onchange=\(\)=>\{const replacement=\{\.\.\.result,entries:\[result\.entries\[Number\(select\.value\)\]\]\}/);
 assert.match(body,/wordHeader\(replacement,replacement\.entries\[0\],sub\);senses\(replacement\.entries\[0\],sub\)/);
});

const ROOT=path.join(__dirname,'..'),WEB=path.join(ROOT,'web'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const hasEdge=[process.env.MEGULIT_EDGE,'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].some(p=>p&&fs.existsSync(p));
const STUB=`<script>window.__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(cmd,args)=>{const r=args&&args.request||{};
 if(cmd==='service'){if(r.action==='home')return {preferences:{language:'zh',themeMode:'dark'},games:[]};if(r.action==='ui_state')return {};
  if(r.action==='reader_bootstrap')return {engines:[],native:{}};if(r.action==='reader_message'){const m=r.message||{};
   if(m.type==='v4'&&m.action==='word')return {replies:[{method:'v4Deliver',args:[m.id,{reading:'きく',surface:'きく',pitch:window.__TEST_PITCH__||[0],pitchSource:'UniDic',pronunciationForm:'surface'},'']}]};
   return {replies:[]};}return {};}return null;}};</script>`;
const TYPES={'.js':'text/javascript','.css':'text/css','.html':'text/html; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json'};
function serve(){
 const server=http.createServer((req,res)=>{
  const rel=decodeURIComponent(new URL(req.url,'http://x').pathname),file=path.join(WEB,rel);
  if(!file.startsWith(WEB)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
   if(/^\/reader\/modules\/[a-z0-9-]+\.js$/.test(rel)){res.writeHead(200,{'content-type':'text/javascript'});return res.end('');}
   res.writeHead(404);return res.end();
  }
  let data=fs.readFileSync(file);if(rel==='/reader/index.html')data=Buffer.from(String(data).replace('<head>','<head>'+STUB));
  res.writeHead(200,{'content-type':TYPES[path.extname(file)]||'application/octet-stream'});res.end(data);
 });
 return new Promise(r=>server.listen(0,'127.0.0.1',()=>r(server)));
}

const CASES={
 yomigaeruKana:{surface:'よみがえる',morphology:{base:'よみがえる',reading:'よみがえる',wordClass:'五段动词'},entries:[{id:1606020,spellings:['蘇る','甦る','蘇える','甦える'],readings:['よみがえる'],pos:['五段动词'],definitions:['复活；苏醒','恢复；重现','恢复精神','得到恢复']}]},
 yomigaeruKanji:{surface:'蘇る',morphology:{base:'蘇る',reading:'よみがえる',wordClass:'五段动词'},entries:[{id:1606020,spellings:['蘇る','甦る','蘇える','甦える'],readings:['よみがえる'],pos:['五段动词'],definitions:['复活；苏醒；恢复；重现']}]},
 hikichigiru:{surface:'ひきちぎる',morphology:{base:'ひきちぎる',reading:'ひきちぎる',wordClass:'五段动词'},entries:[{id:1168810,spellings:['引きちぎる','引き千切る'],readings:['ひきちぎる'],pos:['五段动词'],definitions:['撕掉；扯断']}]},
 suruVerb:{surface:'検分して',morphology:{base:'検分する',surface:'検分して',forms:['て形'],rules:['する→し＋て'],reading:'けんぶんする',wordClass:'サ变动词（三类动词）'},entries:[{id:1258120,spellings:['検分','見分'],readings:['けんぶん'],pos:['名词／サ变动词'],definitions:['查验；检查']}]},
 kikuHomophones:{surface:'きく',morphology:{base:'きく',reading:'きく',wordClass:'五段动词'},entries:[
  {id:1591110,spellings:['聞く','聴く'],readings:['きく'],pos:['五段动词'],definitions:['听到；听见','听从；接受','打听；询问','闻；嗅']},
  {id:1591100,spellings:['効く','利く'],readings:['きく'],pos:['五段动词'],definitions:['有效；起效']},
  {id:2843441,spellings:['訊く'],readings:['きく'],pos:['五段动词'],definitions:['询问；打听']},
  {id:1226210,spellings:['菊'],readings:['きく','キク'],pos:['名词'],definitions:['菊花']},
 ]},
 singleSpellingKanji:{surface:'菊',morphology:{base:'菊',reading:'きく',wordClass:'名词'},entries:[{id:1226210,spellings:['菊'],readings:['きく','キク'],pos:['名词'],definitions:['菊花']}]},
 singleSpellingKana:{surface:'ねこ',morphology:{base:'ねこ',reading:'ねこ',wordClass:'名词'},entries:[{id:1467640,spellings:['猫'],readings:['ねこ','ネコ'],pos:['名词'],definitions:['猫']}]},
 kanaOnly:{surface:'ゆっくり',morphology:{base:'ゆっくり',reading:'ゆっくり',wordClass:'副词'},entries:[{id:1013000,spellings:[],readings:['ゆっくり'],pos:['副词'],definitions:['慢慢地']}]},
 phrase:{surface:'記憶がよみがえる',entries:[],selection_analysis:{surface:'記憶がよみがえる',exact:false,parts:[
  {surface:'記憶',morphology:{base:'記憶',reading:'きおく',wordClass:'名词'},entries:[{id:1221460,spellings:['記憶'],readings:['きおく'],pos:['名词'],definitions:['记忆']}]},
  {surface:'が',morphology:{base:'が',reading:'が',wordClass:'助詞'},entries:[{id:2028930,spellings:[],readings:['が'],pos:['助词'],definitions:['主格助词']}]},
  {surface:'よみがえる',morphology:{base:'よみがえる',reading:'よみがえる',wordClass:'五段动词'},entries:[{id:1606020,spellings:['蘇る','甦る','蘇える','甦える'],readings:['よみがえる'],pos:['五段动词'],definitions:['复活；苏醒']}]},
 ]}},
};

const OPEN_AND_READ=(data,extraArgs={})=>`(async()=>{
 const w=ms=>new Promise(r=>setTimeout(r,ms)),b=window.__tomoyoChinese;
 b.closeLocalSelection?.();await w(120);
 b.localLookup=async()=>(${JSON.stringify(data)});
 b.openLocalSelection({text:${JSON.stringify(data.surface)},start:0,end:${[...data.surface].length},...${JSON.stringify(extraArgs)}},document.getElementById('w'));
 await w(350);
 const c=document.querySelector('.tomoyo-selection-card'),varSel=c.querySelector('.tomoyo-variants select'),homSel=c.querySelector('.tomoyo-alternative:not(.tomoyo-variants) select');
 return {open:c.isConnected,head:c.querySelector('.tomoyo-word-heading strong')?.textContent||'',hasVariant:!!varSel,variantValue:varSel?.value||'',
  variantOptions:varSel?[...varSel.options].map(o=>o.value):[],hasHomograph:!!homSel,homographCount:homSel?homSel.options.length:0};
})()`;

test('lookup card shows per-entry variant spellings without merging homophones',{skip:!hasEdge&&'Edge not installed',timeout:120000},async()=>{
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-dict-variants-'));let server,cdp;
 try{
  server=await serve();cdp=await startEdge(path.join(temp,'edge'));
  await cdp.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/reader/index.html`});
  let ready=false;for(let i=0;i<120&&!ready;i++){await sleep(250);ready=await cdp.evaluate('!!window.__TOME_READER_READY__').catch(()=>false);}
  assert.ok(ready,'reader page loaded');
  await cdp.evaluate(`(()=>{window.__tomoyoMode.set('translation');document.body.classList.add('tomoyo-gal-bound');
   const s=document.createElement('div');s.className='sentence-text';s.innerHTML='<span id=w class=char-token>よみがえる</span>';
   s.style.cssText='position:fixed;left:200px;top:520px;font:32px/1.5 Meiryo;color:#fff';document.body.append(s);
   window.__tomoyoChinese.gameArea=()=>({left:100,top:60,width:1280,height:720});return 1})()`);

  // 1. よみがえる (kana) with multi-pitch + sentenceMark + expanded senses: switching variant updates headword without resetting card state
  await cdp.evaluate(`(()=>{localStorage.removeItem('megulit-autospeak-hint');window.__TEST_PITCH__=[0,2,3];return 1;})()`);
  const yKana=await cdp.evaluate(OPEN_AND_READ(CASES.yomigaeruKana,{sentenceMark:{episode:'ep1',text:'よみがえる'}}));
  assert.equal(yKana.hasVariant,true,'よみがえる shows variant spellings dropdown');
  assert.deepEqual(yKana.variantOptions,['よみがえる','蘇る','甦る','蘇える','甦える']);
  assert.equal(yKana.variantValue,'よみがえる');
  assert.equal(yKana.hasHomograph,false,'single entry has no homograph switcher');

  const picked=await cdp.evaluate(`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));
   const c=document.querySelector('.tomoyo-selection-card');
   const more=c.querySelector('.tomoyo-senses details');if(more)more.open=true;
   const pitchBtns=[...c.querySelectorAll('.tomoyo-pitch-choices button')];if(pitchBtns[1])pitchBtns[1].click();
   const mark=c.querySelector('.tomoyo-mark-sentence');if(mark)mark.disabled=true;
   const hintsBefore=c.querySelectorAll('.megulit-autospeak-hint').length;
   const sel=c.querySelector('.tomoyo-variants select');
   sel.dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true,cancelable:true}));await w(100);
   const pop=document.querySelector('.mg-select-pop'),target=pop?[...pop.querySelectorAll('.mg-opt')].find(n=>n.textContent.trim()==='甦る'):null;
   if(target){target.dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true,cancelable:true}));target.click();}
   await w(150);
   return {popOpened:!!pop,cardStillOpen:c.isConnected,head:c.querySelector('.tomoyo-word-heading strong')?.textContent||'',selected:sel.value,
    hintsBefore,hintsAfter:c.querySelectorAll('.megulit-autospeak-hint').length,
    pitchChecked:[...c.querySelectorAll('.tomoyo-pitch-choices button')].map(b=>b.getAttribute('aria-checked')),
    markDisabled:!!c.querySelector('.tomoyo-mark-sentence')?.disabled,
    moreStillOpen:!!c.querySelector('.tomoyo-senses details')?.open,
    speakPresent:!!c.querySelector('.tomoyo-word-heading .tomoyo-speak-button')};})()`);
  assert.equal(picked.popOpened,true,'styled dropdown opens');
  assert.equal(picked.cardStillOpen,true,'picking a variant keeps the card open');
  assert.equal(picked.head,'甦る','headword updates to selected variant');
  assert.equal(picked.selected,'甦る');
  assert.equal(picked.hintsAfter,picked.hintsBefore,'switching variant does not duplicate autospeak hint');
  assert.deepEqual(picked.pitchChecked,['false','true','false'],'switching variant preserves selected pitch');
  assert.equal(picked.markDisabled,true,'switching variant preserves disabled mark button');
  assert.equal(picked.moreStillOpen,true,'switching variant preserves expanded senses');
  assert.equal(picked.speakPresent,true,'switching variant keeps speaker button intact');

  // 2. 蘇る (kanji) & ひきちぎる (compound)
  await cdp.evaluate('window.__TEST_PITCH__=[0]');
  const yKanji=await cdp.evaluate(OPEN_AND_READ(CASES.yomigaeruKanji));
  assert.equal(yKanji.hasVariant,true);
  assert.deepEqual(yKanji.variantOptions,['蘇る','甦る','蘇える','甦える']);
  assert.equal(yKanji.variantValue,'蘇る');

  const hiki=await cdp.evaluate(OPEN_AND_READ(CASES.hikichigiru));
  assert.equal(hiki.hasVariant,true);
  assert.deepEqual(hiki.variantOptions,['ひきちぎる','引きちぎる','引き千切る']);

  // 3. Suru noun+する keeps する on headword and variant choices
  const suru=await cdp.evaluate(OPEN_AND_READ(CASES.suruVerb));
  assert.equal(suru.head,'検分する','suru verb headword retains する');
  assert.equal(suru.hasVariant,true);
  assert.deepEqual(suru.variantOptions,['検分する','見分する']);
  assert.equal(suru.variantValue,'検分する');

  // 4. きく (homophones): variant spellings stay scoped to the selected entry and stay consistent across round-trip switches
  const kiku=await cdp.evaluate(OPEN_AND_READ(CASES.kikuHomophones));
  assert.equal(kiku.hasHomograph,true,'homophones keep the homograph switcher');
  assert.equal(kiku.homographCount,4);
  assert.equal(kiku.hasVariant,true,'first entry 聞く has variant 聴く');
  assert.deepEqual(kiku.variantOptions,['きく','聞く','聴く']);
  for(const forbidden of ['効く','利く','訊く','菊'])assert.equal(kiku.variantOptions.includes(forbidden),false,`homophone ${forbidden} must not merge into 聞く variants`);

  const kikuRoundTrip=await cdp.evaluate(`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));
   const hom=document.querySelector('.tomoyo-selection-card .tomoyo-alternative:not(.tomoyo-variants) select');
   const snap=()=>{const c=document.querySelector('.tomoyo-selection-card'),v=c.querySelector('.tomoyo-variants select');
    return {head:c.querySelector('.tomoyo-word-heading strong')?.textContent||'',hasVariant:!!v,variantValue:v?.value||'',variantOptions:v?[...v.options].map(o=>o.value):[]};};
   hom.value='1';hom.dispatchEvent(new Event('change',{bubbles:true}));await w(120);const s1=snap();
   hom.value='3';hom.dispatchEvent(new Event('change',{bubbles:true}));await w(120);const s3=snap();
   hom.value='0';hom.dispatchEvent(new Event('change',{bubbles:true}));await w(120);const s0=snap();
   return {s1,s3,s0};})()`);
  assert.equal(kikuRoundTrip.s1.head,'効く');
  assert.deepEqual(kikuRoundTrip.s1.variantOptions,['きく','効く','利く']);
  assert.equal(kikuRoundTrip.s1.variantValue,'効く');
  assert.equal(kikuRoundTrip.s3.head,'菊');
  assert.equal(kikuRoundTrip.s3.hasVariant,false,'single-spelling homograph has no variant dropdown');
  assert.equal(kikuRoundTrip.s0.head,'聞く');
  assert.deepEqual(kikuRoundTrip.s0.variantOptions,['きく','聞く','聴く'],'round-trip back to first homograph keeps consistent variant list');
  assert.equal(kikuRoundTrip.s0.variantValue,'聞く');

  // 5. Single-spelling entries (both kanji and kana lookup) and kana-only entries have no variant dropdown
  assert.equal((await cdp.evaluate(OPEN_AND_READ(CASES.singleSpellingKanji))).hasVariant,false,'single-spelling kanji word has no variant dropdown');
  assert.equal((await cdp.evaluate(OPEN_AND_READ(CASES.singleSpellingKana))).hasVariant,false,'single-spelling kana lookup has no variant dropdown');
  assert.equal((await cdp.evaluate(OPEN_AND_READ(CASES.kanaOnly))).hasVariant,false,'kana-only word has no variant dropdown');

  // 6. Phrase breakdown detail row shows variant dropdown and switches headword cleanly
  const phraseRes=await cdp.evaluate(`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms)),b=window.__tomoyoChinese;
   b.closeLocalSelection?.();await w(120);b.localLookup=async()=>(${JSON.stringify(CASES.phrase)});
   b.openLocalSelection({text:'記憶がよみがえる',start:0,end:8},document.getElementById('w'));await w(300);
   const rows=[...document.querySelectorAll('.tomoyo-selection-card .tomoyo-word-row')];
   const target=rows.find(r=>r.querySelector('summary strong')?.textContent==='よみがえる');
   target.open=true;await w(150);
   const sel=target.querySelector('.tomoyo-variants select');
   const before={head:target.querySelector('.tomoyo-row-detail .tomoyo-word-heading strong')?.textContent||'',opts:sel?[...sel.options].map(o=>o.value):[]};
   sel.value='甦る';sel.dispatchEvent(new Event('change',{bubbles:true}));await w(100);
   const after=target.querySelector('.tomoyo-row-detail .tomoyo-word-heading strong')?.textContent||'';
   return {before,after};})()`);
  assert.deepEqual(phraseRes.before.opts,['よみがえる','蘇る','甦る','蘇える','甦える']);
  assert.equal(phraseRes.before.head,'よみがえる');
  assert.equal(phraseRes.after,'甦る');
 }finally{await cdp?.stop();server?.close();await sleep(400);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
});
