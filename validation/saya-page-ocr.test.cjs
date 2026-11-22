// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const {HookNative} = require('../core/hook-native.cjs');
const {scriptLookup} = require('../core/saya-page-ocr.cjs');
const {Reader} = require('../services/reader.cjs');
const line = 'もちろん、否定したいのは山々だが――僕はもう、とうに抵抗を諦めていた。';
const partial = 'もろん、日定したいのは山々だが一僕はもう、とうに抵抗を諦';
const corrupt = 'もみん、常ーナ-いの仕山々がゐヾ';

test('18:32 legacy Saya OCR selects the script page and clears it on an unreadable page', () => {
 const events = [];
 const hook = new HookNative({}, event => events.push(event), () => {}, () => 10000);
 hook.trace = () => {};
 hook.target = {name:'saya.exe', pid:1, started:'1'};
 hook.windowState = {bound:true};
 hook.originalText = {sayaPageLine:scriptLookup([line]), resolve:() => null};
 const group = (id, text, extra = {}) => hook.sayaOcrGroup({source:'ocr', id, text, visible:true, ...extra});
 try {
  group(1, corrupt);
  group(2, '仕ららに訣');
  hook.sayaOcr.flush();
  assert.equal(events.filter(e => e.hookSource).length, 0);
  group(3, partial, {once:true});
  hook.sayaOcr.flush();
  assert.equal(events.filter(e => e.hookSource).length, 0);
  const provider = hook.originalText;
  hook.originalText = null;
  group(4, partial);
  hook.sayaOcr.flush();
  assert.equal(events.filter(e => e.hookSource).length, 0);
  hook.originalText = provider;
  hook.artScanState();
  assert.equal(hook.state.hookSource,line);
  group(4, partial);
  hook.sayaOcr.flush();
  const sources = events.filter(e => e.hookSource);
  assert.deepEqual(sources.map(e => e.hookSource), [line]);
  assert.equal(sources[0].hookSourceOrigin, 'ocr');
  assert.equal(sources[0].hookSourceEngine, 'saya-page-ocr');
  assert.equal(sources[0].hookSourceContinues, 0);
  assert.equal(hook.state.processAttached,false);
  assert.equal(hook.state.streamSelected,false);
  group(4, '', {visible:false});
  hook.sayaOcr.flush();
  assert.equal(hook.state.hookSource, '');
  group(6, partial);
  hook.sayaOcr.flush();
  hook.emitSource(line,'live');
  assert.equal(hook.state.hookSourceOrigin,'live');
  group(6, '', {visible:false});
  hook.sayaOcr.flush();
  assert.equal(hook.state.hookSource,line);
  hook.target.name = 'Saya_Steam.exe';
  assert.equal(group(5, partial), false);
 } finally { clearInterval(hook.timer); hook.sayaOcr?.stop(); }
});

test('two script lines sharing the observed fragment cannot identify the page', () => {
 const lookup = scriptLookup([line, '僕はもう、とうに抵抗を諦めている。']);
 assert.equal(lookup('僕はもう、とうに抵抗を諦'), '');
 assert.equal(lookup(line), line);
});

test('the bottom row with an extra OCR digit must identify a unique script ending', () => {
 const row = 'のまま3そこにあった。';
 const line = '世界は昨日と同じように醜く歪んだ姿のまま、そこにあった。';
 assert.equal(scriptLookup([line])(row,'bottom'),line);
 assert.equal(scriptLookup([line,'昨日の風景のまま、そこにあった。'])(row,'bottom'),'');
 assert.equal(scriptLookup([line])(row,true),'');
});

test('cumulative Saya pages select the last visible sentence across OCR groups and wrapped rows', () => {
 const previous = '昨日と同じように醜く歪んだ姿のまま、そこにあった。';
 const next = 'これが悪夢であってくれればと、どれほど願ったことだろうか。';
 const hook = new HookNative({}, () => {}, () => {}, () => 10000);
 hook.trace = () => {};
 hook.target = {name:'saya.exe'};
 hook.windowState = {bound:true};
 hook.originalText = {sayaPageLine:scriptLookup([previous,next]), resolve:() => null};
 const row = (text,y,x=64) => ({text,y,x,h:24});
 const group = (id,rows) => hook.sayaOcrGroup({id,source:'ocr',visible:true,sh:600,text:rows.map(r=>r.text).join(''),rows});
 try {
  group(1,[row(previous,94),row('カ悪夢であてくればと、',130)]);
  group(2,[row('どれほど願ったことだろうか。',131,355)]);
  group(4,[{text:'イアノ',x:260,y:549,w:135,h:51}]);
  hook.sayaOcr.flush();
  assert.equal(hook.state.hookSource,next);
  group(3,[row('歪テ語ヱ断ト別ラ字読セ',167)]);
  hook.sayaOcr.flush();
  assert.equal(hook.state.hookSource,'');
  hook.emitSource('ＭＳ Ｐゴシック','live');
  hook.emitSource(previous+next,'live');
  assert.equal(hook.state.hookSource,'');
  hook.emitSource(previous,'live');
  assert.equal(hook.state.hookSource,previous);
 } finally { clearInterval(hook.timer); hook.sayaOcr?.stop(); }
});

test('legacy Saya never translates a page using a cached fragment of another line', () => {
 const r = Object.create(Reader.prototype);
 r.gal = {hooks:{target:{name:'saya.exe'}}};
 r.embedCache = new Map([[Reader.normKey(line.slice(0,-4)), 'previous translation']]);
 assert.equal(r.embedNear(Reader.normKey(line)), null);
 r.gal.hooks.target.name = 'Saya_Steam.exe';
 assert.equal(r.embedNear(Reader.normKey(line)).value, 'previous translation');
});

test('the reviewed Saya line precedes keyless MT and keeps its provenance', async () => {
 const r = Object.create(Reader.prototype);
 r.runtime = {};
 r.gal = {preferences:{display:'bilingual'},hooks:{originalText:{sayaPageLine:scriptLookup([line])}}};
 r.prefs = () => ({provider:'google',learnerLanguage:'zh'});
 r.loadKeys = () => {};
 r.translator = () => ({hasKey:() => false,translate:() => {throw Error('unexpected MT call');}});
 const result = await r.chainTranslate(line,{provider:'google',learnerLanguage:'zh'});
 assert.equal(result.text,'我当然很想否认这一点——可我早就放弃抵抗了。');
 assert.equal(result.source,'filled');
 assert.equal(result.provider,'');
 r.translator = () => ({hasKey:() => true, translate:async () => '自定义 API 的译文'});
 const api = await r.chainTranslate(line,{provider:'deepseek',learnerLanguage:'zh'});
 assert.equal(api.text,'自定义 API 的译文');
 assert.equal(api.source,'api');
});
