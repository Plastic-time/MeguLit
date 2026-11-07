// SPDX-License-Identifier: GPL-3.0-or-later
// Anki <-> ToMe dictionary link.
//  * "+ Anki" also mines the word into ToMe's dictionary (same JMdict entry id, sentence, current media).
//  * Card state and review history from Anki are copied into ToMe's word status and review_log,
//    so the statistics page (mined words, dictionary status, vocabulary growth, reviews) follows Anki.
(function installAnkiSync(){
 'use strict';
 if(window.__tomeAnkiSync)return;
 if(!document.documentElement||!document.body){document.addEventListener('DOMContentLoaded',installAnkiSync,{once:true});return;}
 if(location.hostname!=='tauri.localhost'&&!window.__tomeAnkiSyncTest)return;
 window.__tomeAnkiSync=true;
 const invoke=(cmd,args)=>window.__TAURI_INTERNALS__.invoke(cmd,args);
 let dbName=null;
 async function db(){if(!dbName)dbName=await invoke('plugin:sql|load',{db:'sqlite:immersion.db'});return dbName;}
 const run=async(query,values=[])=>invoke('plugin:sql|execute',{db:await db(),query,values});
 const changed=r=>Array.isArray(r)?Number(r[0])||0:Number(r?.rowsAffected)||0;
 const sel=async(query,values=[])=>invoke('plugin:sql|select',{db:await db(),query,values});
 let ready=null;
 function tables(){return ready||(ready=(async()=>{
  await run('CREATE TABLE IF NOT EXISTS tome_anki_links (word_id INTEGER PRIMARY KEY, note_id INTEGER NOT NULL UNIQUE, linked_at INTEGER NOT NULL DEFAULT (unixepoch()))');
  await run('CREATE TABLE IF NOT EXISTS tome_anki_reviews (review_id INTEGER PRIMARY KEY, word_id INTEGER NOT NULL)');
 })().catch(e=>{ready=null;throw e;}));}
 const mediaId=()=>{try{const m=/^\/media\/(\d+)/.exec(localStorage.getItem('tomoyo-reader-path')||location.pathname);return m?Number(m[1]):null;}catch{return null;}};
 // Same writes Tomoyo itself does when a word is mined from the sentence window.
 async function mine({entry,sentence='',start=0,end=0,noteId,createdAt=null,media=mediaId()}){
  if(!entry?.id)return null;await tables();
  const id=Number(entry.id),spelling=entry.spellings?.[0]||'',reading=entry.readings?.[0]||'';
  const have=await sel('SELECT id FROM words WHERE id = $1',[id]);
  if(!have.length){
   if(createdAt)await run('INSERT INTO words (id, spelling, reading, definitions, word_type, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $6)',[id,spelling,reading,JSON.stringify(entry.definitions||[]),(entry.pos||[]).join(', '),createdAt]);
   else await run('INSERT INTO words (id, spelling, reading, definitions, word_type) VALUES ($1, $2, $3, $4, $5)',[id,spelling,reading,JSON.stringify(entry.definitions||[]),(entry.pos||[]).join(', ')]);
  }
  if(media!==null)await run('INSERT OR IGNORE INTO word_tags (word_id, media_id) VALUES ($1, $2)',[id,media]).catch(()=>{});
  if(sentence){const dup=await sel('SELECT id FROM word_sentences WHERE word_id = $1 AND sentence_text = $2',[id,sentence]);
   if(!dup.length)await run('INSERT INTO word_sentences (word_id, sentence_text, highlight_start, highlight_end, media_id'+(createdAt?', created_at':'')+') VALUES ($1, $2, $3, $4, $5'+(createdAt?', $6':'')+')',createdAt?[id,sentence,start,end,media,createdAt]:[id,sentence,start,end,media]);}
  if(noteId)await run('INSERT OR REPLACE INTO tome_anki_links (word_id, note_id) VALUES ($1, $2)',[id,Number(noteId)]);
  return id;
 }
 window.__tomeAnkiMined=async({entry,args,noteId})=>{try{const chars=[...(args?.text||'')];await mine({entry,sentence:args?.text||'',start:args?.start||0,end:args?.end||0,noteId});schedule(4000);}catch(e){console.warn('[ToMe] mine failed',e);}};
 // Anki -> ToMe
 let syncing=null,last={at:0,words:0,imported:0,reviews:0,status:0,error:''};
 async function sync(){
  if(syncing)return syncing;
  syncing=(async()=>{
   const request=window.__tomeV4Request;if(!request)throw Error('学习组件尚未就绪');
   await tables();const links=await sel('SELECT word_id, note_id FROM tome_anki_links');const byNote=new Map(links.map(l=>[Number(l.note_id),Number(l.word_id)]));
   const notes=await request('ankiStats',{linked:[...byNote.keys()]});let imported=0,reviews=0,status=0;
   for(const n of notes){
    let wordId=byNote.get(n.noteId);
    if(!wordId&&n.entry){const s=n.sentence||'',w=n.word||'',at=s.indexOf(w);wordId=await mine({entry:n.entry,sentence:s,start:at>=0?[...s.slice(0,at)].length:0,end:at>=0?[...s.slice(0,at)].length+[...w].length:0,noteId:n.noteId,createdAt:Math.floor(n.noteId/1000),media:null});if(wordId){byNote.set(n.noteId,wordId);imported++;}}
    if(!wordId)continue;
    const r=await run('UPDATE words SET status = $1, status_updated_at = unixepoch() WHERE id = $2 AND status != $1',[n.status,wordId]);if(changed(r))status++;
    for(const rid of n.reviews||[]){const ins=await run('INSERT OR IGNORE INTO tome_anki_reviews (review_id, word_id) VALUES ($1, $2)',[rid,wordId]);if(changed(ins)){await run("INSERT INTO review_log (review_type, item_key, media_id, reviewed_at) VALUES ('word', $1, NULL, $2)",[String(wordId),Math.floor(rid/1000)]);reviews++;}}
   }
   last={at:Date.now(),words:byNote.size,imported,reviews,status,error:''};return last;
  })().catch(e=>{last={...last,at:Date.now(),error:e.message||String(e)};throw e;}).finally(()=>{syncing=null;paint();});
  return syncing;
 }
 let timer=0;function schedule(ms){clearTimeout(timer);timer=setTimeout(()=>sync().catch(()=>{}),ms);}
 // Statistics page: small sync badge.
 const T={zh:{title:'Anki 同步',never:'尚未同步',now:'立即同步',busy:'同步中…',done:(l)=>`${l.words} 个单词已关联 · 新增 ${l.imported} · 复习 +${l.reviews} · 状态更新 ${l.status}`,fail:'同步失败：',reload:'有新数据，正在刷新统计…'},en:{title:'Anki sync',never:'Not synced yet',now:'Sync now',busy:'Syncing…',done:l=>`${l.words} words linked · +${l.imported} new · +${l.reviews} reviews · ${l.status} status updates`,fail:'Sync failed: ',reload:'New data — refreshing…'},ja:{title:'Anki 同期',never:'未同期',now:'今すぐ同期',busy:'同期中…',done:l=>`${l.words} 語を連携 · 新規 ${l.imported} · 復習 +${l.reviews} · 状態更新 ${l.status}`,fail:'同期に失敗：',reload:'新しいデータがあります。更新中…'}};
 const tr=()=>T[window.__tomeI18n?.get?.()]||T.zh;
 const style=document.createElement('style');style.textContent=`
 .tome-anki-badge{position:fixed;right:18px;bottom:18px;z-index:200;display:flex;align-items:center;gap:10px;max-width:min(560px,calc(100vw - 120px));padding:9px 10px 9px 14px;border-radius:12px;border:1px solid var(--theme-border,#333);background:var(--theme-surface,#18181c);color:var(--theme-text,#eee);font-size:12.5px;box-shadow:0 10px 30px rgba(0,0,0,.35)}
 .tome-anki-badge i{width:8px;height:8px;border-radius:50%;flex:none;background:#45c47f}
 .tome-anki-badge[data-s=busy] i{background:#e2b04a}.tome-anki-badge[data-s=err] i{background:#e3804f}.tome-anki-badge[data-s=idle] i{background:#777}
 .tome-anki-badge b{font-weight:700;white-space:nowrap}.tome-anki-badge span{color:var(--theme-textSecondary,#aaa);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 .tome-anki-badge button{flex:none;padding:5px 11px;border-radius:8px;border:1px solid var(--theme-primary,#e0495a);background:var(--theme-primary,#e0495a);color:#fff;font:inherit;font-size:12px;font-weight:700;cursor:pointer}
 .tome-anki-badge button:disabled{opacity:.6;cursor:progress}
 body.mini-mode .tome-anki-badge,body.tomoyo-ui-translation .tome-anki-badge{display:none}`;
 document.head.append(style);
 let badge=null;
 function paint(){
  const on=/^\/statistics(\/|$)/.test(location.pathname);if(!on){badge?.remove();badge=null;return;}
  if(!badge||!badge.isConnected){badge=document.createElement('div');badge.className='tome-anki-badge';badge.dataset.noI18n='';badge.innerHTML='<i></i><b></b><span></span><button type="button"></button>';badge.querySelector('button').onclick=async()=>{const before=last;try{const r=await sync();if(r.imported||r.reviews||r.status){badge.querySelector('span').textContent=tr().reload;setTimeout(()=>location.reload(),600);}}catch{}};document.body.append(badge);}
  const t=tr(),s=syncing?'busy':last.error?'err':last.at?'ok':'idle';badge.dataset.s=s;badge.querySelector('b').textContent=t.title;
  badge.querySelector('span').textContent=syncing?t.busy:last.error?t.fail+last.error:last.at?t.done(last)+' · '+new Date(last.at).toLocaleTimeString():t.never;
  const btn=badge.querySelector('button');btn.textContent=t.now;btn.disabled=!!syncing;
 }
 for(const fn of ['pushState','replaceState']){const orig=history[fn];history[fn]=function(...a){const r=orig.apply(this,a);queueMicrotask(()=>{paint();if(/^\/statistics/.test(location.pathname)&&Date.now()-last.at>60000)sync().catch(()=>{});});return r;};}
 addEventListener('popstate',paint);
 const prevSet=window.__tomeI18n?.set;if(prevSet)window.__tomeI18n.set=v=>{prevSet(v);paint();};
 window.__tomeAnkiSyncNow=sync;
 schedule(8000);setInterval(()=>sync().catch(()=>{}),10*60*1000);paint();
})();
