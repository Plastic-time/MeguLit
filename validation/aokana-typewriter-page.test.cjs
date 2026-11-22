'use strict';
/* 2026-11-21 (user, Aokana: 「文字到处乱跳」). Aokana sends the current line alone on several streams: its typewriter sets the
   whole line once per frame (LunaHook buffers the frames into one multi-line output, every row the line again), and its script
   streams carry the line with its English and Chinese, one of them with the speaker's name. Taken as a page, each line was drawn
   under the one before it until the page reset came, and the reader's fit kept the line moved up. A page that holds other
   Japanese (higurashi-page.jsonl, issue-468 test) still pages from its first page on. The fixture is built by hand from the live hook log. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {replay}=require('./helpers/hook-replay.cjs');
const dir=path.join(__dirname,'helpers','unity-replay');

test('streams that hold only the current line (typewriter frames, script text with its translations) are not a page',()=>{
 const r=replay(path.join(dir,'aokana-typewriter.jsonl'),{name:'Aokana.exe'});
 const pages=r.events.filter(e=>e&&e.type==='hookPage');
 assert.equal(pages.filter(p=>p.same===true||p.reset===true).length,0,'no page joins or resets: '+JSON.stringify(pages));
 assert.ok(!r.traces.some(t=>/page turned before this line/.test(t)),'no page turn traced');
 const shown=r.events.filter(e=>typeof e?.hookSource==='string'&&e.hookSource).map(e=>e.hookSource);
 for(const l of ['「ああ、じゃあ元気で」','……','「……ぐすっ」','「おい、泣くなよ。さっき言ったろ、そういうのはナシだって」','「でも……」'])assert.ok(shown.includes(l),l+' reaches the reader: '+JSON.stringify(shown));
});

test('a retained kanji-only hook line proves an NVL page',()=>{
 const {HookNative}=require('../core/hook-native.cjs');
 const h=Object.create(HookNative.prototype);
 h.pageText={};
 h.now=()=>123;
 h.hookRecent=[{key:'\u6628\u65e5\u3002'},{key:'\u660e\u65e5\u306f\u6674\u308c\u308b\u304b\u306a\u3002'}];
 h.auxPage({type:'hookPageText',text:h.hookRecent.map(line=>line.key).join('\n')});
 assert.equal(h.pageText.paging,true);
 assert.equal(h.pageText.auxPageAt,123);
});

test('a kanji-only name or part of the redrawn sentence does not establish paging',()=>{
 const {HookNative}=require('../core/hook-native.cjs');
 const h=Object.create(HookNative.prototype);
 h.pageText={};
 h.now=()=>123;
 const prev='\u6628\u65e5',cur='\u6628\u65e5\u306f\u6674\u308c\u3066\u3044\u305f\u3002';
 h.hookRecent=[{key:prev},{key:cur}];
 h.auxPage({type:'hookPageText',text:['\u3010'+prev+'\u3011',cur,cur].join('\n')});
 assert.equal(h.pageText.paging,undefined);
});

const repeatedKanji='\u7121\u7406\u3002';
for(const [label,rows,pages] of [
 ['separate older line beside a repeated sentence',[repeatedKanji,repeatedKanji+repeatedKanji],true],
 ['one repeated sentence wrapped across rows',[repeatedKanji,repeatedKanji],false],
]){
 test('NVL row evidence: '+label,()=>{
  const {HookNative}=require('../core/hook-native.cjs');
  const h=Object.create(HookNative.prototype);
  Object.assign(h,{pageText:{},now:()=>123,hookRecent:[{key:repeatedKanji},{key:repeatedKanji+repeatedKanji}]});
  h.auxPage({type:'hookPageText',text:rows.join('\n')});
  assert.equal(h.pageText.paging===true,pages);
 });
}
