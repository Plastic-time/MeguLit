// SPDX-License-Identifier: GPL-3.0-or-later
/* (user 2026-11-12) the five vertical lines on the home page can be chosen per game: list the lines the player read in a
   game (saved sentences and reading history, newest first, one row per distinct text, filtered by a search) and keep the
   choice in data/config/home-lines.json as {gameId:[text,...]} (at most five; an empty list means "automatic") */
const fs=require('node:fs'),path=require('node:path'),store=require('./store.cjs');
const MAX=5,file=root=>path.join(root,'data','config','home-lines.json');
const clean=t=>String(t||'').replace(/\s+/g,' ').trim();
function cleanList(list){const out=[];for(const t of Array.isArray(list)?list:[]){const s=clean(t).slice(0,400);if(s&&!out.includes(s))out.push(s);if(out.length>=MAX)break;}return out;}
/* (user 2026-11-12: ATRI's home lines were "全てのデータを削除しますか？" and other menu prompts) the home shows story
   lines only. A line is dropped when it has no kana (a translation or a code string), is a system confirmation
   (save, load, data, title, quick, skip, scene jump, config... ending in a yes/no question), is several prompts the hook
   glued together, is mojibake or untranslated Chinese, is a lone menu word or button, or is a short question seen in three or more sessions. A line said in
   many sessions is not dropped by itself: replayed openings are story too. */
const SYSTEM=/セーブ|ロード|データ|削除|消去|タイトル|初期化|スキップ|クイック|コンフィグ|設定|環境|シーン|選択肢|終了|上書き|コピー|移動|バックログ|オート|ゲームを|保存|読み込|音量|画面|ウィンドウ|ボイス|既読|未読/;
const ASK=/(します|ます|です|ません|でしょう|よろしい)か[？?]?$|よろしいですか|[？?]$/;
const bareLine=t=>clean(t).replace(/^[「『（(](.*)[」』）)]$/s,'$1').trim();
function systemLine(text){const t=bareLine(text);
 if(t.length<3||!/[\u3041-\u309f\u30a1-\u30fa]/.test(t))return true;
 /* file names and paths the hook caught (sound\\voice.ogg, E:\\GAL\\script.pac) */
 if(/[\\/][^\s]*\.[a-z0-9]{1,4}$|^[a-z]:\\|\.(ogg|wav|mp3|png|bmp|ks|txt|pac|xp3)\b|^[a-z_]+[\\/]/i.test(t))return true;
 /* mojibake (Shift-JIS read as another code page) shows half-width kana or almost no kana among the letters */
 const letters=t.replace(/[\s\p{P}\p{S}0-9\uff10-\uff19]/gu,''),kana=(letters.match(/[\u3041-\u309f\u30a1-\u30fa\u30fc]/g)||[]).length;if(/[\uff66-\uff9f]{2}/.test(t)||!letters.length||kana/letters.length<(letters.length<10?.1:.15))return true;
 if(/^(はい|いいえ|OK|キャンセル|戻る|閉じる|決定|YES|NO)$/i.test(t)||(/^[\u30a1-\u30fa\u30fc\u30fb\s]{2,8}$/.test(t)&&SYSTEM.test(t)))return true;
 const asks=(t.match(/か[？?]/g)||[]).length;if(asks>=2&&!/^[「『]/.test(clean(text)))return true;
 if(!/^[「『]/.test(clean(text))&&t.length<=40&&ASK.test(t)&&SYSTEM.test(t))return true;
 return false;}
function repeatedQuestions(db,id){return new Set(db.prepare("SELECT text FROM reading_events WHERE game_id=? AND length(text)<=26 AND (text LIKE '%？' OR text LIKE '%?') GROUP BY text HAVING COUNT(DISTINCT session_id)>=3").all(id).map(r=>clean(r.text)));}
const storyOnly=(db,id)=>{const rq=repeatedQuestions(db,id);return t=>!systemLine(t)&&!rq.has(clean(t));};
/* the automatic home lines: saved sentences, else the latest read, story lines only */
function auto(db,id){id=String(id||'');const ok=storyOnly(db,id);
 const saved=db.prepare('SELECT text FROM saved_sentences WHERE game_id=? ORDER BY created_at DESC LIMIT 120').all(id).map(r=>clean(r.text)).filter(ok);
 if(saved.length)return [...new Set(saved)].slice(0,8);
 const read=db.prepare("SELECT text FROM reading_events WHERE game_id=? AND length(trim(text))>=6 ORDER BY read_at DESC,id DESC LIMIT 200").all(id).map(r=>clean(r.text)).filter(ok);
 return [...new Set(read)].slice(0,6).reverse();}
function chosen(root,id){const all=store.readJSON(file(root),{});return cleanList(all&&typeof all==='object'?all[String(id)]:[]);}
function save(root,id,lines){id=String(id||'');if(!id)throw Error('GAME_NOT_FOUND');const f=file(root),all=store.readJSON(f,{}),next=all&&typeof all==='object'&&!Array.isArray(all)?all:{},list=cleanList(lines);
 if(list.length)next[id]=list;else delete next[id];fs.mkdirSync(path.dirname(f),{recursive:true});const tmp=f+'.tmp';fs.writeFileSync(tmp,JSON.stringify(next,null,1));fs.renameSync(tmp,f);return list;}
function list(db,root,id,{query='',limit=400}={}){id=String(id||'');const q=clean(query),lim=Math.max(1,Math.min(1000,Number(limit)||400)),like='%'+q.replace(/[!%_]/g,c=>'!'+c)+'%';
 const saved=db.prepare("SELECT text,created_at at FROM saved_sentences WHERE game_id=? AND length(trim(text))>=2 AND text LIKE ? ESCAPE '!' ORDER BY created_at DESC LIMIT ?").all(id,like,lim);
 const read=db.prepare("SELECT text,MAX(read_at) at FROM reading_events WHERE game_id=? AND length(trim(text))>=2 AND text LIKE ? ESCAPE '!' GROUP BY text ORDER BY at DESC LIMIT ?").all(id,like,lim);
 const ok=storyOnly(db,id),ms=v=>{v=Number(v)||0;return v&&v<1e12?v*1000:v;},rows=new Map();for(const r of saved){const t=clean(r.text);if(t&&ok(t)&&!rows.has(t))rows.set(t,{text:t,at:ms(r.at),saved:true});}
 for(const r of read){const t=clean(r.text);if(!t||!ok(t))continue;const o=rows.get(t);if(o){o.at=Math.max(o.at,ms(r.at));}else rows.set(t,{text:t,at:ms(r.at),saved:false});}
 return {lines:[...rows.values()].sort((a,b)=>b.at-a.at).slice(0,lim),chosen:chosen(root,id)};}
module.exports={MAX,cleanList,chosen,save,list,auto,systemLine};
