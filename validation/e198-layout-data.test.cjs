const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {openStore}=require('../services/store.cjs'),{HistoryTranslations}=require('../services/history-view.cjs');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-e198-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const db=openStore(root);db.prepare('INSERT INTO games(id,title) VALUES(?,?)').run('a','Game A');db.prepare('INSERT INTO reading_events(id,game_id,text,read_at) VALUES(?,?,?,?)').run(1,'a','日本語です',Math.floor(Date.now()/1000));db.close();return root;}
test('cover fitting reserves caption space and never exceeds either measured row bound',async()=>{const {coverHeight}=await import('../web/home-fit.js');for(const width of [400,620,900,1400])for(const height of [40,90,180,400]){const h=coverHeight({width,height});assert(h>=0);assert(h+40<=height);assert((h*.75+10)*5+14*4<=width+.1);}assert.equal(coverHeight({width:900,height:35}),0);});
test('history backfill coalesces duplicate requests, uses cached output and preserves reading data',async t=>{const root=fixture(t);let calls=0,release;const translator=new HistoryTranslations(root,async text=>{calls++;await new Promise(r=>release=r);return 'Translated '+text;});const first=translator.ensure(1),second=translator.ensure(1);assert.equal(first,second);await new Promise(r=>setImmediate(r));release();assert.equal((await first).cached,false);assert.equal((await translator.ensure(1)).cached,true);assert.equal(calls,1);const db=openStore(root);try{assert.equal(db.prepare('SELECT COUNT(*) n FROM reading_events').get().n,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM reading_sessions').get().n,0);assert.equal(db.prepare('SELECT text FROM reading_events').get().text,'日本語です');}finally{db.close();}});
test('failed history backfill remains retryable and stores no false translation',async t=>{const root=fixture(t);let calls=0;const translator=new HistoryTranslations(root,async()=>{if(++calls===1)throw Error('NETWORK');return 'Retry result';});await assert.rejects(translator.ensure(1),/NETWORK/);assert.equal((await translator.ensure(1)).text,'Retry result');await assert.rejects(translator.ensure(-1),/INVALID_HISTORY_ID/);});
test('activity comes from real reading and lookup records without adding events',t=>{const root=fixture(t),db=openStore(root);try{const at=Math.floor(Date.now()/1000);db.prepare('INSERT INTO reading_sessions(game_id,started_at,active_seconds,characters,sentences) VALUES(?,?,?,?,?)').run('a',at,120,300,4);db.prepare('INSERT INTO lookup_events(game_id,surface,occurred_at) VALUES(?,?,?)').run('a','日本語',at);const rows=require('../services/learning-activity.cjs').activity(db);assert.equal(rows.length,1);assert.equal(rows[0].seconds,120);assert.equal(rows[0].characters,300);assert.equal(rows[0].lookups,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM reading_sessions').get().n,1);}finally{db.close();}});
test('chart models aggregate calendar periods and fill empty buckets',async t=>{
 const {statisticsModel,statisticsHTML}=await import('../web/statistics-view.js'),{activityCells,activityHTML}=await import('../web/learning-activity.js');
 const {statistics}=require('../services/statistics.cjs'),{activity}=require('../services/learning-activity.cjs');
 const db=openStore(fixture(t));try{
 const at=(day,hour)=>Math.floor(new Date(2026,10,day,hour)/1000),insert=db.prepare('INSERT INTO reading_sessions(game_id,started_at,active_seconds,characters,sentences) VALUES(?,?,?,?,?)');
 insert.run('a',at(1,12),180,300,4);insert.run('a',at(5,14),120,150,2);
 db.prepare('INSERT INTO lookup_events(game_id,surface,occurred_at) VALUES(?,?,?)').run('a','word',at(5,14));
 const date='2026-11-05',get=range=>statistics(db,{range,date}),year=get('year'),month=get('month'),week=get('week'),day=get('day');
 assert.equal(year.buckets.length,12);assert.equal(year.buckets[10].seconds,300);assert.equal(year.buckets[11].seconds,0);
 assert.equal(month.buckets.length,30);assert.equal(month.buckets[3].characters,0);assert.equal(month.buckets[4].characters,150);
 assert.equal(week.period.start,'2026-11-02');assert.equal(week.buckets.length,7);
 assert.equal(day.buckets.length,24);assert.equal(day.buckets[14].lookups,1);assert.equal(day.buckets[14].seconds,120);
 assert.equal(statisticsModel(month).seconds,300);
 for(const range of ['month','week'])assert.equal(activity(db,{date:'2026-11-02',range}).find(row=>row.day===date).seconds,120);
 const today=new Date(2026,10,5,12),daily=activity(db,{date}),cells=activityCells(daily,today);
 assert.equal(cells[0].weekday,0);assert.equal(cells.at(-1).day,date);
 for(const locale of ['zh','ja','en']){const env={locale,today,text:{statistics:'Statistics'},esc:String,icon:()=>'',duration:s=>s+'s',number:String,heading:t=>t};assert(!statisticsHTML(month,env).includes('NaN'));assert(activityHTML(daily,env).includes('data-activity-label'));}
 }finally{db.close();}
});
