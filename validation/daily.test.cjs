process.env.MEGULIT_RELAY_BASE??='off';/* tests never reach the real relay */
// SPDX-License-Identifier: GPL-3.0-or-later
/* E415 日报 page: relay RSS parsing + D1 cache + routes, the bridge's cleaning and link gate, and the page markup. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),{DatabaseSync}=require('node:sqlite');
const relayDir=path.join(__dirname,'..','relay');
const load=name=>import(pathToFileURL(path.join(relayDir,'src',name)).href);
const MIGRATIONS=fs.readdirSync(path.join(relayDir,'migrations')).filter(f=>f.endsWith('.sql')).sort().map(f=>fs.readFileSync(path.join(relayDir,'migrations',f),'utf8')).join('');
function d1(){const db=new DatabaseSync(':memory:');db.exec(MIGRATIONS);const stmt=(sql,args=[])=>({bind:(...a)=>stmt(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{db.prepare(sql).run(...args);return {success:true};}});return {prepare:sql=>stmt(sql)};}
const MOE=`<rss><channel><item><title>2027年1月発売タイトル新規登録</title><link>https://moepedia.net/news/2026/1030/793/</link><pubDate>Fri, 30 Oct 2026 04:07:50 +0000</pubDate><description><![CDATA[1月29日発売予定。『逆転支配』ほか。続きはこちら。]]></description><content:encoded><![CDATA[<p><img src="https://moepedia.net/a.jpg">本文はコピーしない</p>]]></content:encoded></item></channel></rss>`;
const G4=`<rdf:RDF><item rdf:about="https://www.4gamer.net/games/1/"><title>PS3 20周年</title><link>https://www.4gamer.net/games/1/</link><dc:date>2026-11-11T07:00:00+09:00</dc:date><description>ゲーム機の話</description></item><item rdf:about="https://www.4gamer.net/games/2/"><title>恋愛ADV「星の歌」Steam版が発売</title><link>https://www.4gamer.net/games/2/</link><dc:date>2026-11-10T07:00:00+09:00</dc:date><description>ノベルゲームの新作です。</description></item></rdf:RDF>`;
const DEN=`<rss><item><title>美少女ゲーム特集 &amp; 対談</title><link>https://news.denfaminicogamer.jp/news/1</link><pubDate>Tue, 10 Nov 2026 15:52:28 +0000</pubDate><description><![CDATA[一文目。二文目。三文目は要らない。]]></description><enclosure url="https://news.denfaminicogamer.jp/x.jpg" type="image/jpeg" length="1"/></item></rss>`;
const TRENDS=`<rss><channel><item><title>チキンマックナゲット</title><ht:approx_traffic>200+</ht:approx_traffic><ht:news_item><ht:news_item_title>ナゲット値下げ</ht:news_item_title><ht:news_item_url>https://news.yahoo.co.jp/a</ht:news_item_url><ht:news_item_source>Yahoo!ニュース</ht:news_item_source></ht:news_item></item><item><title>arsenal</title></item><item><title>文化祭</title></item></channel></rss>`;
const NHK=`<rss><item><title>「線状降水帯」に警戒 「文化祭」も中止</title><link>https://www3.nhk.or.jp/news/1</link></item></rss>`;
const fetcher=map=>async url=>{for(const[k,v]of Object.entries(map))if(url.startsWith(k))return {ok:true,text:async()=>v};return {ok:false,text:async()=>''};};
const FEEDS={'https://moepedia.net':MOE,'https://www.4gamer.net':G4,'https://news.denfaminicogamer.jp':DEN,'https://trends.google.com':TRENDS,'https://www3.nhk.or.jp':NHK};

test('news: galgame filter on general sites, summary capped at two sentences, no article body, thumbnails',async()=>{
 const d=await load('daily.js');
 const moe=d.parseNews(MOE,d.NEWS_FEEDS[0]);assert.equal(moe.length,1);assert.equal(moe[0].image,'https://moepedia.net/a.jpg');assert.doesNotMatch(JSON.stringify(moe),/本文はコピーしない/);
 assert.equal(moe[0].summary,'1月29日発売予定。『逆転支配』ほか。');
 const g4=d.parseNews(G4,d.NEWS_FEEDS[1]);assert.deepEqual(g4.map(n=>n.title),['恋愛ADV「星の歌」Steam版が発売']);
 const den=d.parseNews(DEN,d.NEWS_FEEDS[2]);assert.equal(den[0].title,'美少女ゲーム特集 & 対談');assert.equal(den[0].image,'https://news.denfaminicogamer.jp/x.jpg');assert.equal(den[0].summary,'一文目。二文目。');
});
test('hot words: Japanese terms only, kana readings, NHK fills up to ten',async()=>{
 const d=await load('daily.js');const t=d.parseTrends(TRENDS);
 assert.deepEqual(t.map(w=>w.term),['チキンマックナゲット','文化祭']);assert.equal(t[0].reading,'チキンマックナゲット');assert.equal(t[1].reading,'');assert.equal(t[0].url,'https://news.yahoo.co.jp/a');
 const e={DB:d1()};await d.refreshWords(e,new Date('2026-11-11T00:00:00Z'),fetcher(FEEDS));
 const r=await d.hotWordsDailyGet(e,new URL('https://x/api/hotwords/daily'),{json:v=>v,fail:c=>c},new Date('2026-11-11T00:10:00Z'));
 assert.deepEqual(r.words.map(w=>w.term),['チキンマックナゲット','文化祭','線状降水帯']);assert.equal(r.day,'2026-11-11');assert.match(r.source,/NHK/);
});
test('relay routes: /api/news and /api/hotwords/daily fetch once when empty, cron refreshes, bad day rejected',async()=>{
 const {handle,scheduled}=await load('worker.js');
 const e={DB:d1(),HASH_SALT:'s',LINK_SECRET:'l'};const real=globalThis.fetch;globalThis.fetch=fetcher(FEEDS);
 try{
  const req=p=>new Request('https://relay.test'+p,{headers:{'cf-connecting-ip':'10.9.0.1'}});
  const news=await (await handle(req('/api/news'),e)).json();assert.equal(news.items.length,3);assert.ok(news.updatedAt);assert.equal(news.items[0].source,'電ファミニコゲーマー');
  const words=await (await handle(req('/api/hotwords/daily'),e)).json();assert.equal(words.words.length,3);
  assert.equal((await handle(req('/api/hotwords/daily?day=bad'),e)).status,400);
  assert.deepEqual(await scheduled({cron:'20 */2 * * *',scheduledTime:Date.now()},e,null),{news:3,words:3});
  assert.match(fs.readFileSync(path.join(relayDir,'wrangler.toml'),'utf8'),/"20 \*\/2 \* \* \*"/);
 }finally{globalThis.fetch=real;}
});
test('bridge: not-configured without relay, cleans data, dictionary readings only for exact headwords, link gate',async()=>{
 const daily=require('../services/daily.cjs');
 assert.equal((await daily.view('',null,{env:{MEGULIT_RELAY_BASE:'off'}})).state,'not-configured');
 const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE dictionary_entries(spelling TEXT,reading TEXT,frequency INTEGER);INSERT INTO dictionary_entries VALUES('文化祭','ぶんかさい',1)");
 const f=async url=>({ok:true,json:async()=>url.endsWith('/api/news')?{items:[{title:'t',link:'https://moepedia.net/n',image:'javascript:alert(1)'},{title:'x',link:'javascript:alert(1)'}]}:{day:'2026-11-11',words:[{term:'文化祭'},{term:'線状降水帯',url:'https://www3.nhk.or.jp/news/1'}]}});
 const v=await daily.view('',db,{env:{MEGULIT_RELAY_BASE:'https://relay.test'},fetch:f});
 assert.equal(v.state,'ok');assert.equal(v.news.items.length,1);assert.equal(v.news.items[0].image,'');
 assert.equal(v.words.words[0].reading,'ぶんかさい');assert.equal(v.words.words[1].reading,'');
 assert.ok(daily.canOpen('https://moepedia.net/n'));assert.ok(daily.canOpen('https://www3.nhk.or.jp/news/1'));assert.ok(!daily.canOpen('https://evil.example/'));
 const fail=await daily.view('',db,{env:{MEGULIT_RELAY_BASE:'https://relay.test'},fetch:async()=>{throw Error('x');}});assert.equal(fail.state,'error');
});
test('page: tab label, empty state, lookup on word click, ruby only with a reading, escaped text',async()=>{
 const view=await import(pathToFileURL(path.join(__dirname,'..','web','daily-view.js')).href);
 assert.deepEqual(view.dailyLabel,{zh:'日报',ja:'日報',en:'Daily'});
 const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 for(const locale of ['zh','ja','en']){const empty=view.pageHTML({state:'not-configured'},{locale,esc});assert.match(empty,/dl-empty/);assert.match(empty,/data-dl-refresh/);}
 const html=view.pageHTML({state:'ok',news:{items:[{title:'<b>見出し</b>',link:'https://moepedia.net/n',source:'Moepedia',summary:'s',date:''}]},words:{words:[{term:'文化祭',reading:'ぶんかさい'},{term:'ナゲット',reading:'ナゲット'}]}},{locale:'zh',esc});
 assert.match(html,/data-dl-lookup="文化祭"/);assert.match(html,/<ruby>文化祭<rt>ぶんかさい<\/rt><\/ruby>/);assert.doesNotMatch(html,/<ruby>ナゲット/);assert.doesNotMatch(html,/<b>見出し/);
 const app=fs.readFileSync(path.join(__dirname,'..','web','app.js'),'utf8');assert.match(app,/navigate\('learning','dictionary'\)/);assert.match(app,/if\(pendingLookup\)/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','web','index.html'),'utf8'),/daily\.css/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','services','bridge.cjs'),'utf8'),/case 'daily_open':\{const url=String\(request\.url\|\|''\);if\(!require\('\.\/daily\.cjs'\)\.canOpen\(url\)\)/);
});
