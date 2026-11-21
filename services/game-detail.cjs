// SPDX-License-Identifier: GPL-3.0-or-later
const path=require('node:path'),store=require('./store.cjs');
function workIdentity(row,original){
 const library=original.library||{};
 const appid=String(library.appid||'')||require('../core/library.cjs').steamAppidFor(row.executable);
 const vndbId=original.vndbManual||(!appid||library.vndbSteamAppid===appid?library.vndbId:'');
 return {appid,vndbId:String(vndbId||'')};
}
function record(db,id){const row=db.prepare('SELECT * FROM games WHERE id=? AND removed_at IS NULL').get(id);if(!row)throw Error('GAME_NOT_FOUND');let original={};try{original=JSON.parse(row.original||'{}');}catch{}return{row,original};}
function synopsis(root,row,original,locale){const identity=workIdentity(row,original),saved=store.readJSON(path.join(root,'data/config/synopsis.json'))[String(row.legacy_id??row.id)]||{};const cached=!identity.appid||saved.steamIdentity===identity.appid+':'+identity.vndbId?saved:{},media=original.media||{},library=original.library||{};const lang=['zh','ja','en'].includes(locale)?locale:'zh';if(cached.moegirl?.text&&require('./info-source.cjs').forRoot(root,locale)&&require('../core/synopsis-policy.cjs').approved(cached.moegirl.src))return {text:String(cached.moegirl.text).replace(/<[^>]+>/g,'').trim(),source:String(cached.moegirl.src),lang:'zh'};const source=cached.src?.[lang],approved=!cached[lang]||require('../core/synopsis-policy.cjs').approved(source);return {text:String(approved?cached[lang]||media.description||library.description||'':'').replace(/<[^>]+>/g,'').trim(),source:approved&&cached[lang]?String(source||''):'',lang};}
/* 2026-11-13 关联单词 / 收录句子 tabs. One pass over this game's examples feeds both: per word how many lines met it here (×N), the first and latest
   line with its highlight, and the times it was met (for the small "met over time" strip); per saved sentence the words collected from that very
   line (their highlight ranges). JLPT level from the open JLPT list, "in Anki" from anki_links when that table exists. No per-chapter data exists. */
/* 2026-11-15 (user: 例句要附带翻译) each first / latest line carries its translation: the one kept with the example, else the saved
   sentence's, else the translation recorded when the line was read (reading_events.original). One query per source over the needed texts. */
function translate(db,lines){const need=new Map();for(const l of lines)if(l?.text&&!l.translation)(need.get(l.text)||need.set(l.text,[]).get(l.text)).push(l);if(!need.size)return;
 const texts=[...need.keys()],found=new Map();
 const take=(sql,col='t')=>{for(let i=0;i<texts.length;i+=400){const part=texts.slice(i,i+400).filter(t=>!found.has(t));if(!part.length)continue;
  try{for(const r of db.prepare(sql.replace('?L',part.map(()=>'?').join(','))).all(...part))if(r[col]&&!found.has(r.text))found.set(r.text,String(r[col]));}catch{}}};
 take("SELECT text,translation t FROM saved_sentences WHERE text IN(?L) AND COALESCE(translation,'')<>'' ORDER BY id DESC");
 take("SELECT text,json_extract(original,'$.translation') t FROM reading_events WHERE text IN(?L) AND COALESCE(json_extract(original,'$.translation'),'')<>'' ORDER BY id DESC");
 for(const [text,ls] of need){const t=found.get(text);if(t)for(const l of ls)l.translation=t;}}
function collected(db,id){
 const words=db.prepare('SELECT v.id,v.spelling,v.reading,v.definitions,v.status,v.created_at,COUNT(*) met,MIN(e.created_at) first_at,MAX(e.created_at) last_at FROM examples e JOIN vocabulary v ON v.id=e.word_id WHERE e.game_id=? GROUP BY v.id ORDER BY last_at DESC,v.id DESC LIMIT 250').all(id);
 const groups=db.prepare('SELECT v.status,COUNT(DISTINCT v.id) n FROM examples e JOIN vocabulary v ON v.id=e.word_id WHERE e.game_id=? GROUP BY v.status').all(id);
 const wordCounts={total:groups.reduce((a,g)=>a+g.n,0),byStatus:Object.fromEntries(groups.map(g=>[g.status,g.n]))};
 const byWord=new Map(words.map(w=>[w.id,w])),byText=new Map();
 const line=e=>({text:e.text,translation:e.translation||'',start:Number(e.highlight_start)||0,end:Number(e.highlight_end)||0,at:e.created_at});
 for(const e of db.prepare('SELECT e.word_id,e.text,e.translation,e.highlight_start,e.highlight_end,e.created_at,v.spelling FROM examples e JOIN vocabulary v ON v.id=e.word_id WHERE e.game_id=? ORDER BY e.created_at,e.id').iterate(id)){
  const w=byWord.get(e.word_id);if(w){w.first??=line(e);w.latest=line(e);(w.times??=[]).push(e.created_at);if(w.times.length>200)w.times.shift();}
  if(e.text){const list=byText.get(e.text)||[];if(list.length<12)list.push({spelling:e.spelling,start:Number(e.highlight_start)||0,end:Number(e.highlight_end)||0});byText.set(e.text,list);}
 }
 translate(db,words.flatMap(w=>[w.first,w.latest]));
 let jlpt=null;try{jlpt=require('./learning-insights.cjs').loadJlpt();}catch{}
 let anki=new Set();try{if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='anki_links'").get())anki=new Set(db.prepare('SELECT word_id FROM anki_links').all().map(r=>r.word_id));}catch{}
 for(const w of words){w.jlpt=jlpt?(jlpt.byForm.get(w.spelling)||jlpt.byForm.get(w.reading)||null)?.level||null:null;w.inAnki=anki.has(w.id);w.times??=[];}
 /* 2026-11-13 scene: the clean game picture kept with the sentence (sentence-scenes.cjs; read through bridge sentence_scene) or null */
 const {sceneOf}=require('./sentence-scenes.cjs');
 const sentences=db.prepare('SELECT id,text,translation,created_at,source,original FROM saved_sentences WHERE game_id=? ORDER BY created_at DESC,id DESC LIMIT 250').all(id).map(({original,...s})=>({...s,source:s.source||'manual',scene:sceneOf(original),words:byText.get(s.text)||[]}));
 return {words,sentences,wordCounts};
}
/* 2026-11-15 学习 › 单词 uses the 关联单词 layout over every game: the same word rows, but ×N sums the lines met in all games, the first / latest
   line names its game, words saved with no line yet are kept (met 0, ordered by when they were saved), and 常查单词 (unknown_words) marks each
   word with its lookup count; looked-up surfaces that were never saved come back as lookup-only rows for that filter. */
function studyWords(db,root){
 const words=db.prepare(`SELECT v.id,v.spelling,v.reading,v.definitions,v.status,v.created_at,COUNT(e.id) met,MIN(e.created_at) first_at,MAX(e.created_at) last_at
  FROM vocabulary v LEFT JOIN examples e ON e.word_id=v.id GROUP BY v.id ORDER BY COALESCE(MAX(e.created_at),v.created_at) DESC,v.id DESC LIMIT 5000`).all();
 const groups=db.prepare('SELECT status,COUNT(*) n FROM vocabulary GROUP BY status').all();
 const counts={total:groups.reduce((a,g)=>a+g.n,0),byStatus:Object.fromEntries(groups.map(g=>[g.status,g.n]))};
 const byWord=new Map(words.map(w=>[w.id,w])),titles=new Map(db.prepare('SELECT id,title FROM games').all().map(g=>[g.id,g.title]));
 const line=e=>({text:e.text,translation:e.translation||'',start:Number(e.highlight_start)||0,end:Number(e.highlight_end)||0,at:e.created_at,gameId:e.game_id||'',game:titles.get(e.game_id)||''});
 for(const e of db.prepare('SELECT word_id,text,translation,highlight_start,highlight_end,created_at,game_id FROM examples ORDER BY created_at,id').iterate()){
  const w=byWord.get(e.word_id);if(!w)continue;w.first??=line(e);w.latest=line(e);(w.times??=[]).push(e.created_at);if(w.times.length>200)w.times.shift();}
 translate(db,words.flatMap(w=>[w.first,w.latest]));
 let jlpt=null;try{jlpt=require('./learning-insights.cjs').loadJlpt();}catch{}
 let anki=new Set();try{if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='anki_links'").get())anki=new Set(db.prepare('SELECT word_id FROM anki_links').all().map(r=>r.word_id));}catch{}
 for(const w of words){w.jlpt=jlpt?(jlpt.byForm.get(w.spelling)||jlpt.byForm.get(w.reading)||null)?.level||null:null;w.inAnki=anki.has(w.id);w.times??=[];}
 let often=[];try{often=require('./unknown-words.cjs').unknownWords(root);}catch{}
 const bySpelling=new Map();for(const w of words)if(!bySpelling.has(w.spelling))bySpelling.set(w.spelling,w);
 const lookupOnly=[];for(const o of often){const w=bySpelling.get(o.surface);if(w)w.lookups=Number(o.lookups)||0;
  else{let jl=null;try{jl=jlpt?.byForm.get(o.surface)?.level||null;}catch{}lookupOnly.push({id:'q:'+o.surface,spelling:o.surface,reading:'',definitions:'[]',status:0,met:0,lookups:Number(o.lookups)||0,lookupOnly:true,jlpt:jl,times:[],last_at:o.lastLookup});}}
 return {words,lookupOnly,counts,often:often.length};
}
function detail(db,root,id,locale){const {row,original}=record(db,id),game=store.games(db,root).find(game=>game.id===id),library=original.library||{},media=original.media||{};
 const sessions=db.prepare('SELECT id,started_at,ended_at,active_seconds,characters,sentences FROM reading_sessions WHERE game_id=? ORDER BY started_at DESC LIMIT 60').all(id);
 const {words,sentences,wordCounts}=collected(db,id);
 const recentLines=db.prepare("SELECT text,read_at FROM reading_events WHERE game_id=? AND length(trim(text))>=6 ORDER BY read_at DESC,id DESC LIMIT 12").all(id).reverse();
 const count=db.prepare('SELECT COUNT(*) sessions FROM reading_sessions WHERE game_id=?').get(id);
 const launchIssue=require('./game-language.cjs').originalExecutable(db,id,root).blocked?'JAPANESE_EXECUTABLE_REQUIRED':require('./locale-launch.cjs').requiresAdministrator(row.executable)?'GAME_ELEVATION_REQUIRED':'';
 const identity=workIdentity(row,original);game.vndbId=identity.vndbId;let reception=store.readJSON(path.join(root,'data/config/game-reception.json'))[id];if(reception&&identity.appid&&reception.vndb?.url!=='https://vndb.org/'+identity.vndbId)reception={...reception,vndb:null};return {game,launchIssue,reception:reception?{...reception,reviews:reception.reviews?.[locale]||[]}:null,synopsis:synopsis(root,row,original,locale),info:{zeroLatency:(()=>{try{return require('./original-text.cjs').brief(root,id);}catch{return 'unknown';}})(),names:Array.isArray(library.names)?library.names:[],source:row.source,executable:row.executable,status:row.status,appid:library.appid||'',vndbId:identity.vndbId,developer:media.developer||library.developer||'',released:media.release_date||library.release_date||''},sessions,words,sentences,recentLines,homeLines:(()=>{try{return require('./home-lines.cjs').chosen(root,id);}catch{return [];}})(),homeAuto:(()=>{try{return require('./home-lines.cjs').auto(db,id);}catch{return null;}})(),counts:{sessions:count.sessions,sentences:db.prepare('SELECT COUNT(*) n FROM saved_sentences WHERE game_id=?').get(id).n,words:wordCounts}};
}
async function refreshSynopsis(db,root,id,locale){const {row,original}=record(db,id),library=original.library||{},identity=workIdentity(row,original);const {Synopses}=require('../core/library.cjs');return new Synopses({config:path.join(root,'data/config')}).get({mediaId:row.legacy_id??row.id,titles:library.names||[row.title],vndbId:identity.vndbId,appid:identity.appid,lang:locale,refresh:true});}
module.exports={detail,refreshSynopsis,studyWords};
