// SPDX-License-Identifier: GPL-3.0-or-later
/* #117 交流 board: players help each other. Schema: migrations/0010_forum.sql.
   - Reading is open to everyone (no token needed). Posting, replying and deleting need a signed-in account.
   - Abuse: per-account and per-IP limits (worker RATE forum-*), length caps, a local filter (links, e-mail, invisible
     characters, the shared BLOCKED list) and then a Workers AI text check (FORUM_MODEL). The AI must answer SAFE or
     name a reason (ADULT / ABUSE / SPAM); a named reason rejects the text and is returned to the writer. If the AI is
     missing or fails, the local filter alone decides (text boards should not go dark when the model is down).
   - An author deletes their own post or reply; the maintainer deletes anything with the admin key
     (header x-megulit-admin: ADMIN_TOKEN, or LINK_SECRET when ADMIN_TOKEN is not set).
   ctx carries the worker helpers (json, fail, readJSON, hit, sha256, authenticate, avatarsFor). */
import {BLOCKED,NAME_ONLY,gameKey} from './validate.js';

export const FORUM={title:[2,60],body:[1,4000],reply:[1,2000],engine:24,game:120,page:20,replies:200,images:16,imageBytes:700*1024,imageSide:4096};
export const TAGS=['question','hook','guide','share','other'];
export const FORUM_MODEL='@cf/qwen/qwen3-30b-a3b-fp8';
const ID=/^[0-9a-f]{16}$/,IMG=/^[0-9a-f]{32}$/;
const sec=now=>Math.floor(now.getTime()/1000);
const newId=()=>[...crypto.getRandomValues(new Uint8Array(8))].map(b=>b.toString(16).padStart(2,'0')).join('');
const invisible=ch=>{const c=ch.codePointAt(0);return (c<32&&c!==10)||c>=0x7f&&c<=0x9f||c>=0x200b&&c<=0x200c||c>=0x200e&&c<=0x200f||c>=0x2028&&c<=0x202e||c>=0x2060&&c<=0x206f||c===0xfeff;};
const LINK=/https?:|www\.|\.(?:com|net|org|cn|jp|io|me|cc|xyz|top|ru|tk|link|site)\b|[\w.+-]+@[\w-]+\.[a-z]{2,}|(?:qq|wx|vx|微信|wechat|line|tg|telegram)\s*[:：号]?\s*[\w-]{5,}/i;

/* One field of text → {ok,text} or {ok:false,error}. Multi-line allowed for bodies (at most 2 blank lines in a row). */
export function cleanText(value,[min,max],multiline,prefix){
 if(typeof value!=='string')return {ok:false,error:prefix+'_REQUIRED'};
 let text=value.normalize('NFC').replace(/\r\n?/g,'\n');
 text=multiline?text.split('\n').map(l=>l.replace(/[ \t]+/g,' ').trimEnd()).join('\n').replace(/\n{3,}/g,'\n\n').trim():text.replace(/\s+/g,' ').trim();
 if(!text)return {ok:false,error:prefix+'_REQUIRED'};
 const n=[...text].length;if(n<min||n>max)return {ok:false,error:prefix+'_LENGTH'};
 if([...text].some(invisible))return {ok:false,error:'TEXT_INVALID'};
 const folded=text.normalize('NFKC');
 if(LINK.test(folded))return {ok:false,error:'TEXT_LINK'};
 const lower=folded.toLowerCase(),flat=lower.replace(/[\s._\-*·・]/g,''),tokens=lower.split(/[^a-z]+/).filter(Boolean);
 if(BLOCKED.some(w=>!NAME_ONLY.includes(w)&&!(/^[a-z]{1,2}$/.test(w))&&(/^[a-z]+$/.test(w)?tokens.some(t=>t.startsWith(w)):flat.includes(w))))return {ok:false,error:'TEXT_BLOCKED'};
 return {ok:true,text};
}
export function validatePost(body){
 if(!body||typeof body!=='object'||Array.isArray(body))return {ok:false,error:'INVALID_BODY'};
 const title=cleanText(body.title,FORUM.title,false,'TITLE');if(!title.ok)return title;
 const text=cleanText(body.body,FORUM.body,true,'BODY');if(!text.ok)return text;
 const tag=TAGS.includes(body.tag)?body.tag:null;if(!tag)return {ok:false,error:'INVALID_TAG'};
 let game='',engine='';
 if(body.game!==undefined&&body.game!==''){game=typeof body.game==='string'?body.game.normalize('NFKC').replace(/\s+/g,' ').trim():'';if(!game||[...game].length>FORUM.game||/[<>]/.test(game)||[...game].some(invisible))return {ok:false,error:'INVALID_GAME'};}
 if(body.engine!==undefined&&body.engine!==''){engine=typeof body.engine==='string'?body.engine.trim():'';if(!/^[\w .+()\/-]{1,24}$/.test(engine))return {ok:false,error:'INVALID_ENGINE'};}
 const images=imageList(body.images);if(!images)return {ok:false,error:'INVALID_IMAGES'};
 return {ok:true,value:{title:title.text,body:text.text,tag,game,gameKey:game?gameKey(game):'',engine,images}};
}
export function validateReply(body){
 if(!body||typeof body!=='object'||Array.isArray(body))return {ok:false,error:'INVALID_BODY'};
 const text=cleanText(body.body,FORUM.reply,true,'BODY');if(!text.ok)return text;const images=imageList(body.images);if(!images)return {ok:false,error:'INVALID_IMAGES'};return {ok:true,value:{body:text.text,images}};
}

/* ---- pictures ------------------------------------------------------------------------------------------------ */
/* 2026-11-12 (user: upload, paste or drop pictures into a post). The app encodes a WebP; the relay checks it with the
   vision model when it arrives and stores it in R2 only on a clean SAFE (no model, no picture). It belongs to its
   uploader until a post or reply names it; a cron removes the ones never used within a day and those of deleted posts. */
/* the list a post names: at most sixteen distinct picture ids, or null when malformed */
export function imageList(v){if(v===undefined||v===null)return [];if(!Array.isArray(v)||v.length>FORUM.images)return null;const out=[...new Set(v)];return out.every(x=>typeof x==='string'&&IMG.test(x))?out:null;}
/* WebP only; width and height from the VP8 / VP8L / VP8X header */
export function webpSize(b){
 if(!b||b.length<30)return null;const s=(a,n)=>String.fromCharCode(...b.subarray(a,a+n));if(s(0,4)!=='RIFF'||s(8,4)!=='WEBP')return null;const kind=s(12,4);
 if(kind==='VP8X')return {width:1+(b[24]|b[25]<<8|b[26]<<16),height:1+(b[27]|b[28]<<8|b[29]<<16)};
 if(kind==='VP8L'&&b[20]===0x2f){const v=(b[21]|b[22]<<8|b[23]<<16|b[24]<<24)>>>0;return {width:1+(v&0x3fff),height:1+((v>>>14)&0x3fff)};}
 if(kind==='VP8 '&&b[23]===0x9d&&b[24]===0x01&&b[25]===0x2a)return {width:(b[26]|b[27]<<8)&0x3fff,height:(b[28]|b[29]<<8)&0x3fff};
 return null;}
export const IMAGE_PROMPT='You moderate pictures attached to posts on a help forum for a Japanese-learning app used by visual novel players, some of them teenagers. Screenshots of games, menus, text, errors, settings and ordinary game scenes are fine. Answer with exactly one word. Answer ADULT if the picture shows nudity or partial nudity, underwear focus, sexual acts or poses, or sexualized characters (including drawn or anime characters). Answer SPAM if it is mainly an advertisement or a QR code, or shows contact details such as a phone number, an account handle or a group number. Answer GORE for graphic violence or gore. Otherwise answer SAFE.';
const IMAGE_VERDICTS={ADULT:'IMAGE_ADULT',SPAM:'IMAGE_SPAM',GORE:'IMAGE_GORE'};
export async function moderatePicture(env,bytes){
 if(!env.AI||typeof env.AI.run!=='function')return {approved:false,reason:'IMAGE_UNAVAILABLE'};
 let answer='';try{const out=await env.AI.run(env.AVATAR_MODEL||'@cf/meta/llama-3.2-11b-vision-instruct',{messages:[{role:'system',content:IMAGE_PROMPT},{role:'user',content:'One word: SAFE, ADULT, SPAM or GORE?'}],image:[...bytes],max_tokens:4,temperature:0});answer=String(out?.response??out?.result?.response??'');}
 catch{return {approved:false,reason:'IMAGE_UNAVAILABLE'};}
 const word=answer.trim().toUpperCase().replace(/[^A-Z]/g,'');if(word==='SAFE')return {approved:true,reason:''};
 for(const[k,v]of Object.entries(IMAGE_VERDICTS))if(word.startsWith(k))return {approved:false,reason:v};
 return {approved:false,reason:'IMAGE_UNCLEAR'};
}
/* POST /api/forum/images (body: the WebP) → {id,width,height} */
export async function forumImageUpload(request,env,ip,now,ctx){
 const me=await viewer(request,env,now,ctx);if(!me)return ctx.fail('UNAUTHORIZED',401);
 if(!await ctx.hit(env,'forum-img',me,now.getTime())||!await ctx.hit(env,'forum-ip',ip,now.getTime()))return ctx.fail('RATE_LIMITED',429);
 if(!/^image\/webp\b/i.test(request.headers.get('content-type')||''))return ctx.fail('IMAGE_TYPE',415);
 if(Number(request.headers.get('content-length')||0)>FORUM.imageBytes)return ctx.fail('IMAGE_TOO_LARGE',413);
 const bytes=new Uint8Array(await request.arrayBuffer());if(bytes.length>FORUM.imageBytes)return ctx.fail('IMAGE_TOO_LARGE',413);
 const size=webpSize(bytes);if(!size||!size.width||!size.height||size.width>FORUM.imageSide||size.height>FORUM.imageSide)return ctx.fail('IMAGE_INVALID');
 if(!env.BUCKET)return ctx.fail('IMAGE_UNAVAILABLE',503);
 const verdict=await moderatePicture(env,bytes);if(!verdict.approved)return ctx.fail(verdict.reason,422);
 const id=crypto.randomUUID().replace(/-/g,'');await env.BUCKET.put(`forum/${id}.webp`,bytes,{httpMetadata:{contentType:'image/webp'}});
 await env.DB.prepare('INSERT INTO forum_images(id,author,post_id,width,height,bytes,created_at) VALUES(?,?,?,?,?,?,?)').bind(id,me,'',size.width,size.height,bytes.length,sec(now)).run();
 return ctx.json({ok:true,id,width:size.width,height:size.height},201);
}
/* GET /api/forum/images/:id — only pictures a published post or reply carries */
export async function forumImageGet(request,env,ip,now,ctx,id){
 if(!IMG.test(id))return ctx.fail('NOT_FOUND',404);if(!await ctx.hit(env,'forum-get',ip,now.getTime()))return ctx.fail('RATE_LIMITED',429);
 const row=await env.DB.prepare("SELECT post_id FROM forum_images WHERE id=? AND post_id<>''").bind(id).first();if(!row)return ctx.fail('NOT_FOUND',404);
 const object=await env.BUCKET?.get(`forum/${id}.webp`);if(!object)return ctx.fail('NOT_FOUND',404);
 return new Response(object.body,{headers:{'content-type':'image/webp','cache-control':'public, max-age=31536000, immutable','x-content-type-options':'nosniff'}});
}
/* the pictures a new post or reply names must be the writer's own unused ones */
async function claimImages(env,me,ids){
 if(!ids.length)return true;const {results}=await env.DB.prepare(`SELECT id FROM forum_images WHERE author=? AND post_id='' AND id IN (${ids.map(()=>'?').join(',')})`).bind(me,...ids).all();
 return results.length===ids.length;}
const attach=(env,ids,owner)=>ids.length?[env.DB.prepare(`UPDATE forum_images SET post_id=? WHERE id IN (${ids.map(()=>'?').join(',')})`).bind(owner,...ids)]:[];
const parseImages=v=>{try{const a=JSON.parse(v||'[]');return Array.isArray(a)?a.filter(x=>IMG.test(String(x))).slice(0,FORUM.images):[];}catch{return [];}};
async function dropImages(env,owners){
 if(!owners.length)return;const marks=owners.map(()=>'?').join(','),{results}=await env.DB.prepare(`SELECT id FROM forum_images WHERE post_id IN (${marks})`).bind(...owners).all();
 for(const r of results)await env.BUCKET?.delete?.(`forum/${r.id}.webp`);if(results.length)await env.DB.prepare(`DELETE FROM forum_images WHERE post_id IN (${marks})`).bind(...owners).run();}
/* cron: pictures never used within a day, and those whose post or reply is gone */
export async function cleanupForumImages(env,now=new Date()){
 const {results}=await env.DB.prepare("SELECT i.id FROM forum_images i WHERE (i.post_id='' AND i.created_at<?) OR (i.post_id<>'' AND NOT EXISTS (SELECT 1 FROM forum_posts p WHERE p.id=i.post_id AND p.deleted=0) AND NOT EXISTS (SELECT 1 FROM forum_replies r WHERE r.id=i.post_id AND r.deleted=0)) LIMIT 200").bind(sec(now)-86400).all();
 for(const r of results){await env.BUCKET?.delete?.(`forum/${r.id}.webp`);await env.DB.prepare('DELETE FROM forum_images WHERE id=?').bind(r.id).run();}
 return results.length;}

/* ---- AI text moderation --------------------------------------------------------------------------------------- */
export const TEXT_PROMPT='You moderate posts on a help forum for a Japanese-learning app used by visual novel players, some of them teenagers. Discussing games, Japanese, hooks, bugs and plot is fine, even of adult-rated games, as long as the text itself is not sexual. Answer with exactly one word: SAFE, ADULT (sexual or pornographic text, sexual content involving minors), ABUSE (insults, harassment, hate, threats, self-harm encouragement) or SPAM (advertising, selling, piracy or cheat sellers, contact handles, repeated junk). If none applies answer SAFE.';
const VERDICTS={ADULT:'MODERATION_ADULT',ABUSE:'MODERATION_ABUSE',SPAM:'MODERATION_SPAM'};
/* → {approved, reason}. Only a named reason rejects; no binding or an error lets the local filter decide. */
export async function moderateText(env,text){
 if(!env.AI||typeof env.AI.run!=='function')return {approved:true,reason:'',checked:false};
 let answer='';
 try{const out=await env.AI.run(env.FORUM_MODEL||FORUM_MODEL,{messages:[{role:'system',content:TEXT_PROMPT+' /no_think'},{role:'user',content:text.slice(0,4200)}],max_tokens:8,temperature:0});answer=String(out?.response??out?.choices?.[0]?.message?.content??'');}
 catch{return {approved:true,reason:'',checked:false};}
 const word=answer.replace(/<think>[\s\S]*?<\/think>/g,'').trim().toUpperCase().replace(/[^A-Z]/g,'');
 for(const[k,v]of Object.entries(VERDICTS))if(word.startsWith(k))return {approved:false,reason:v,checked:true};
 return {approved:true,reason:'',checked:word==='SAFE'};
}

/* ---- helpers -------------------------------------------------------------------------------------------------- */
async function viewer(request,env,now,ctx){const auth=await ctx.authenticate(request,env,now).catch(()=>null);return auth?await ctx.sha256('account:'+auth.account.id):'';}
function isAdmin(request,env){
 const key=env.ADMIN_TOKEN||env.LINK_SECRET||'',given=request.headers.get('x-megulit-admin')||'';if(!key||given.length!==key.length)return false;
 let d=0;for(let i=0;i<key.length;i++)d|=key.charCodeAt(i)^given.charCodeAt(i);return d===0;
}
/* shown name: the leaderboard nickname, else 读者 + 4 hex of the hash (never the e-mail) */
async function nameOf(env,idHash){const row=await env.DB.prepare('SELECT name FROM leaderboard_users WHERE id_hash=?').bind(idHash).first();return row?.name||'#'+idHash.slice(0,4);}
async function people(env,ctx,hashes){
 const list=[...new Set(hashes)];if(!list.length)return {avatars:new Map(),pids:new Map()};
 const {results}=await env.DB.prepare(`SELECT id_hash,pid FROM profiles WHERE public=1 AND hidden=0 AND id_hash IN (${list.map(()=>'?').join(',')})`).bind(...list).all();
 return {avatars:await ctx.avatarsFor(env,list),pids:new Map(results.map(r=>[r.id_hash,r.pid]))};
}
const author=(row,who,me)=>({name:row.name,avatar:who.avatars.get(row.author)||null,pid:who.pids.get(row.author)||null,mine:!!me&&row.author===me});
const excerpt=body=>{const t=body.replace(/\s+/g,' ');return [...t].length>120?[...t].slice(0,120).join('')+'…':t;};

/* GET /api/forum?game=&engine=&tag=&page= */
export async function forumList(request,env,ip,now,ctx,url){
 const me=await viewer(request,env,now,ctx);if(!await ctx.hit(env,'forum-get',ip,now.getTime()))return ctx.fail('RATE_LIMITED',429);
 const p=url.searchParams,where=['deleted=0'],args=[];
 const game=(p.get('game')||'').trim();if(game){if([...game].length>FORUM.game)return ctx.fail('INVALID_QUERY');where.push('game_key=?');args.push(gameKey(game));}
 const engine=(p.get('engine')||'').trim();if(engine){if(engine.length>FORUM.engine)return ctx.fail('INVALID_QUERY');where.push('engine=? COLLATE NOCASE');args.push(engine);}
 const tag=p.get('tag')||'';if(tag){if(!TAGS.includes(tag))return ctx.fail('INVALID_QUERY');where.push('tag=?');args.push(tag);}
 if(p.get('mine')==='1'){if(!me)return ctx.fail('UNAUTHORIZED',401);where.push('author=?');args.push(me);}
 const page=Math.max(0,Math.min(500,Number.parseInt(p.get('page')||'0',10)||0));
 const {results}=await env.DB.prepare(`SELECT id,author,name,title,body,tag,game_title,engine,replies,created_at,active_at,images FROM forum_posts WHERE ${where.join(' AND ')} ORDER BY active_at DESC,id LIMIT ? OFFSET ?`).bind(...args,FORUM.page+1,page*FORUM.page).all();
 const rows=results.slice(0,FORUM.page),who=await people(env,ctx,rows.map(r=>r.author));
 return ctx.json({ok:true,page,more:results.length>FORUM.page,signedIn:!!me,posts:rows.map(r=>({id:r.id,title:r.title,excerpt:excerpt(r.body),pictures:parseImages(r.images).length,tag:r.tag,game:r.game_title,engine:r.engine,replies:r.replies,created:r.created_at,active:r.active_at,author:author(r,who,me)}))});
}
/* GET /api/forum/:id */
export async function forumGet(request,env,ip,now,ctx,id){
 if(!ID.test(id))return ctx.fail('NOT_FOUND',404);
 const me=await viewer(request,env,now,ctx);if(!await ctx.hit(env,'forum-get',ip,now.getTime()))return ctx.fail('RATE_LIMITED',429);
 const post=await env.DB.prepare('SELECT * FROM forum_posts WHERE id=? AND deleted=0').bind(id).first();if(!post)return ctx.fail('NOT_FOUND',404);
 const {results}=await env.DB.prepare('SELECT id,author,name,body,created_at,deleted,images FROM forum_replies WHERE post_id=? ORDER BY created_at,id LIMIT ?').bind(id,FORUM.replies).all();
 const who=await people(env,ctx,[post.author,...results.map(r=>r.author)]);
 return ctx.json({ok:true,signedIn:!!me,post:{id:post.id,title:post.title,body:post.body,images:parseImages(post.images),tag:post.tag,game:post.game_title,engine:post.engine,replies:post.replies,created:post.created_at,active:post.active_at,author:author(post,who,me)},
  replies:results.map(r=>r.deleted?{id:r.id,deleted:true,created:r.created_at}:{id:r.id,body:r.body,images:parseImages(r.images),created:r.created_at,author:author(r,who,me)})});
}
async function writeGuard(request,env,ip,now,ctx,kind){
 const me=await viewer(request,env,now,ctx);if(!me)return {error:ctx.fail('UNAUTHORIZED',401)};
 if(!await ctx.hit(env,kind,me,now.getTime())||!await ctx.hit(env,'forum-ip',ip,now.getTime())||!await ctx.hit(env,'forum-day',me,now.getTime()))return {error:ctx.fail('RATE_LIMITED',429)};
 const body=await ctx.readJSON(request,24*1024);if(body.error)return {error:ctx.fail(body.error,body.error==='PAYLOAD_TOO_LARGE'?413:400)};
 return {me,value:body.value};
}
/* POST /api/forum */
export async function forumPost(request,env,ip,now,ctx){
 const g=await writeGuard(request,env,ip,now,ctx,'forum-post');if(g.error)return g.error;
 const checked=validatePost(g.value);if(!checked.ok)return ctx.fail(checked.error);const v=checked.value;
 const verdict=await moderateText(env,v.title+'\n\n'+v.body);if(!verdict.approved)return ctx.fail(verdict.reason,422);
 if(!await claimImages(env,g.me,v.images))return ctx.fail('INVALID_IMAGES');
 const id=newId(),t=sec(now),name=await nameOf(env,g.me);
 await env.DB.batch([env.DB.prepare('INSERT INTO forum_posts(id,author,name,title,body,tag,game_key,game_title,engine,replies,created_at,active_at,deleted,ip_hash,images) VALUES(?,?,?,?,?,?,?,?,?,0,?,?,0,?,?)').bind(id,g.me,name,v.title,v.body,v.tag,v.gameKey,v.game,v.engine,t,t,ip,v.images.length?JSON.stringify(v.images):''),...attach(env,v.images,id)]);
 return ctx.json({ok:true,id},201);
}
/* POST /api/forum/:id/replies */
export async function forumReply(request,env,ip,now,ctx,id){
 if(!ID.test(id))return ctx.fail('NOT_FOUND',404);
 const g=await writeGuard(request,env,ip,now,ctx,'forum-reply');if(g.error)return g.error;
 const checked=validateReply(g.value);if(!checked.ok)return ctx.fail(checked.error);
 const post=await env.DB.prepare('SELECT id,replies FROM forum_posts WHERE id=? AND deleted=0').bind(id).first();if(!post)return ctx.fail('NOT_FOUND',404);
 if(post.replies>=FORUM.replies)return ctx.fail('THREAD_FULL',409);
 const verdict=await moderateText(env,checked.value.body);if(!verdict.approved)return ctx.fail(verdict.reason,422);
 if(!await claimImages(env,g.me,checked.value.images))return ctx.fail('INVALID_IMAGES');
 const rid=newId(),t=sec(now),pics=checked.value.images;
 await env.DB.batch([env.DB.prepare('INSERT INTO forum_replies(id,post_id,author,name,body,created_at,deleted,ip_hash,images) VALUES(?,?,?,?,?,?,0,?,?)').bind(rid,id,g.me,await nameOf(env,g.me),checked.value.body,t,ip,pics.length?JSON.stringify(pics):''),...attach(env,pics,rid),
  env.DB.prepare('UPDATE forum_posts SET replies=replies+1,active_at=? WHERE id=?').bind(t,id)]);
 return ctx.json({ok:true,id:rid},201);
}
/* DELETE /api/forum/:id and /api/forum/:id/replies/:rid — the author, or the maintainer with the admin key */
export async function forumDelete(request,env,ip,now,ctx,id,rid=''){
 if(!ID.test(id)||(rid&&!ID.test(rid)))return ctx.fail('NOT_FOUND',404);
 const admin=isAdmin(request,env),me=admin?'':await viewer(request,env,now,ctx);
 if(!admin&&!me)return ctx.fail('UNAUTHORIZED',401);
 if(!admin&&!await ctx.hit(env,'forum-reply',me,now.getTime()))return ctx.fail('RATE_LIMITED',429);
 const flag=admin?2:1;
 if(rid){
  const row=await env.DB.prepare('SELECT author,deleted FROM forum_replies WHERE id=? AND post_id=?').bind(rid,id).first();if(!row||row.deleted)return ctx.fail('NOT_FOUND',404);
  if(!admin&&row.author!==me)return ctx.fail('FORBIDDEN',403);
  await dropImages(env,[rid]);
  await env.DB.batch([env.DB.prepare("UPDATE forum_replies SET deleted=?,body='',images='' WHERE id=?").bind(flag,rid),env.DB.prepare('UPDATE forum_posts SET replies=MAX(0,replies-1) WHERE id=?').bind(id)]);
  return ctx.json({ok:true});
 }
 const row=await env.DB.prepare('SELECT author,deleted FROM forum_posts WHERE id=?').bind(id).first();if(!row||row.deleted)return ctx.fail('NOT_FOUND',404);
 if(!admin&&row.author!==me)return ctx.fail('FORBIDDEN',403);
 const {results:gone}=await env.DB.prepare('SELECT id FROM forum_replies WHERE post_id=?').bind(id).all();await dropImages(env,[id,...gone.map(r=>r.id)]);
 await env.DB.batch([env.DB.prepare("UPDATE forum_posts SET deleted=?,title='',body='',images='' WHERE id=?").bind(flag,id),env.DB.prepare("UPDATE forum_replies SET deleted=?,body='',images='' WHERE post_id=? AND deleted=0").bind(flag,id)]);
 return ctx.json({ok:true});
}
/* router entry: path starts with /api/forum */
export async function forumRoute(request,env,ip,now,ctx,path){
 const parts=path.split('/').slice(3),m=request.method;
 if(parts[0]==='images'){if(parts.length===1)return m==='POST'?forumImageUpload(request,env,ip,now,ctx):ctx.fail('METHOD_NOT_ALLOWED',405);if(parts.length===2)return m==='GET'?forumImageGet(request,env,ip,now,ctx,parts[1]):ctx.fail('METHOD_NOT_ALLOWED',405);return ctx.fail('NOT_FOUND',404);}
 if(!parts.length)return m==='GET'?forumList(request,env,ip,now,ctx,new URL(request.url)):m==='POST'?forumPost(request,env,ip,now,ctx):ctx.fail('METHOD_NOT_ALLOWED',405);
 if(parts.length===1)return m==='GET'?forumGet(request,env,ip,now,ctx,parts[0]):m==='DELETE'?forumDelete(request,env,ip,now,ctx,parts[0]):ctx.fail('METHOD_NOT_ALLOWED',405);
 if(parts.length===2&&parts[1]==='replies')return m==='POST'?forumReply(request,env,ip,now,ctx,parts[0]):ctx.fail('METHOD_NOT_ALLOWED',405);
 if(parts.length===3&&parts[1]==='replies')return m==='DELETE'?forumDelete(request,env,ip,now,ctx,parts[0],parts[2]):ctx.fail('METHOD_NOT_ALLOWED',405);
 return ctx.fail('NOT_FOUND',404);
}
/* removes everything an account wrote (account deletion) */
export function forumDeletes(env,hashes){return hashes.flatMap(h=>[env.DB.prepare("UPDATE forum_posts SET deleted=1,title='',body='',images='' WHERE author=?").bind(h),env.DB.prepare("UPDATE forum_replies SET deleted=1,body='',images='' WHERE author=?").bind(h),env.DB.prepare("UPDATE forum_images SET post_id='' ,created_at=0 WHERE author=?").bind(h)]);}
