// SPDX-License-Identifier: GPL-3.0-or-later
/* E397 public profiles, follows and 同好 for the MeguLit relay (migration 0007_social.sql).
   - Every endpoint that writes, and the follow lists, need a signed-in account (Bearer token); the profile belongs to
     that account's leaderboard row, so a reader must have joined the leaderboard first.
   - Privacy: a profile is private by default. Only a public profile gets a pid on the board, can be opened by others,
     followed, or suggested as 同好. "Recently reading" only ever comes from readers who share game titles.
   - ctx carries the worker helpers (json, fail, readJSON, hit, sha256, authenticate, avatarsFor) so this file does not
     import worker.js. */
import {validateProfile,PROFILE,PID,REPORT_KINDS,cleanReportReason,mdText} from './validate.js';

const seconds=now=>Math.floor(now.getTime()/1000);
const randomPid=()=>[...crypto.getRandomValues(new Uint8Array(8))].map(b=>b.toString(16).padStart(2,'0')).join('');
async function me(request,env,now,ctx){const auth=await ctx.authenticate(request,env,now).catch(()=>null);return auth?await ctx.sha256('account:'+auth.account.id):'';}
async function favoritesOf(env,idHash){const {results}=await env.DB.prepare('SELECT title,vndb FROM profile_favorites WHERE id_hash=? ORDER BY pos').bind(idHash).all();return results.map(r=>({title:r.title,vndb:r.vndb||''}));}
/* the few games a reader shared most recently; empty unless they share game titles */
async function recentOf(env,idHash,limit=PROFILE.recent){
 const {results}=await env.DB.prepare('SELECT g.title,g.last_at FROM leaderboard_games g JOIN leaderboard_users u ON u.id_hash=g.id_hash AND u.share_games=1 WHERE g.id_hash=? ORDER BY g.last_at DESC,g.characters DESC LIMIT ?').bind(idHash,limit).all();
 return results.map(r=>({title:r.title,last:r.last_at||0}));
}
async function ownProfile(env,idHash){
 const user=await env.DB.prepare('SELECT name FROM leaderboard_users WHERE id_hash=?').bind(idHash).first();
 const row=await env.DB.prepare('SELECT pid,bio,public,hidden,appealed_at FROM profiles WHERE id_hash=?').bind(idHash).first();
 return {ok:true,joined:!!user,name:user?.name||'',pid:row?.public&&!row?.hidden?row.pid:null,public:!!row?.public,hidden:!!row?.hidden,appealed:!!row?.hidden&&!!row?.appealed_at,bio:row?.bio||'',favorites:await favoritesOf(env,idHash)};
}

/* GET /api/profile — your own profile; PUT /api/profile — save bio, favourites and the public switch */
export async function profileOwn(request,env,ip,now,ctx){
 const idHash=await me(request,env,now,ctx);if(!idHash)return ctx.fail('UNAUTHORIZED',401);
 if(request.method==='GET'){if(!await ctx.hit(env,'social-get',idHash,now.getTime()))return ctx.fail('RATE_LIMITED',429);return ctx.json(await ownProfile(env,idHash));}
 if(request.method!=='PUT')return ctx.fail('METHOD_NOT_ALLOWED',405);
 if(!await ctx.hit(env,'profile',idHash,now.getTime()))return ctx.fail('RATE_LIMITED',429);
 const body=await ctx.readJSON(request,8*1024);if(body.error)return ctx.fail(body.error,body.error==='PAYLOAD_TOO_LARGE'?413:400);
 const checked=validateProfile(body.value);if(!checked.ok)return ctx.fail(checked.error);const v=checked.value;
 if(!await env.DB.prepare('SELECT 1 FROM leaderboard_users WHERE id_hash=?').bind(idHash).first())return ctx.fail('NOT_JOINED',409);
 const t=seconds(now),old=await env.DB.prepare('SELECT pid FROM profiles WHERE id_hash=?').bind(idHash).first();
 const statements=[env.DB.prepare('INSERT INTO profiles(id_hash,pid,bio,public,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id_hash) DO UPDATE SET bio=excluded.bio,public=excluded.public,updated_at=excluded.updated_at').bind(idHash,old?.pid||randomPid(),v.bio,v.public?1:0,t),
  env.DB.prepare('DELETE FROM profile_favorites WHERE id_hash=?').bind(idHash)];
 v.favorites.forEach((g,pos)=>statements.push(env.DB.prepare('INSERT INTO profile_favorites(id_hash,pos,game_key,title,vndb) VALUES(?,?,?,?,?)').bind(idHash,pos,g.key,g.title,g.vndb)));
 await env.DB.batch(statements);
 return ctx.json(await ownProfile(env,idHash));
}

/* GET /api/profile/:pid — someone's public card. A private (or unknown) pid answers 404, the same either way. */
export async function profileCard(request,env,ip,now,ctx,pid){
 if(!PID.test(pid))return ctx.fail('NOT_FOUND',404);
 const viewer=await me(request,env,now,ctx);if(!await ctx.hit(env,'social-get',viewer||ip,now.getTime()))return ctx.fail('RATE_LIMITED',429);
 const row=await env.DB.prepare('SELECT p.id_hash,p.bio,u.name FROM profiles p JOIN leaderboard_users u ON u.id_hash=p.id_hash WHERE p.pid=? AND p.public=1 AND p.hidden=0').bind(pid).first();
 if(!row)return ctx.fail('NOT_FOUND',404);
 const avatars=await ctx.avatarsFor(env,[row.id_hash]);
 const following=viewer?!!await env.DB.prepare('SELECT 1 FROM follows WHERE follower=? AND followee=?').bind(viewer,row.id_hash).first():false;
 const followers=(await env.DB.prepare('SELECT COUNT(*) n FROM follows WHERE followee=?').bind(row.id_hash).first())?.n||0;
 return ctx.json({ok:true,pid,name:row.name,avatar:avatars.get(row.id_hash)||null,bio:row.bio,favorites:await favoritesOf(env,row.id_hash),recent:await recentOf(env,row.id_hash),followers,following,me:viewer===row.id_hash});
}

/* POST / DELETE /api/follow/:pid */
export async function followEdit(request,env,ip,now,ctx,pid){
 const idHash=await me(request,env,now,ctx);if(!idHash)return ctx.fail('UNAUTHORIZED',401);
 if(!PID.test(pid))return ctx.fail('NOT_FOUND',404);
 if(!await ctx.hit(env,'follow',idHash,now.getTime()))return ctx.fail('RATE_LIMITED',429);
 if(request.method==='DELETE'){
  /* unfollowing works even after the other reader went private: look the pid up without the public filter */
  const row=await env.DB.prepare('SELECT id_hash FROM profiles WHERE pid=?').bind(pid).first();
  if(row)await env.DB.prepare('DELETE FROM follows WHERE follower=? AND followee=?').bind(idHash,row.id_hash).run();
  return ctx.json({ok:true,following:false});
 }
 if(request.method!=='POST')return ctx.fail('METHOD_NOT_ALLOWED',405);
 const row=await env.DB.prepare('SELECT id_hash FROM profiles WHERE pid=? AND public=1 AND hidden=0').bind(pid).first();if(!row)return ctx.fail('NOT_FOUND',404);
 if(row.id_hash===idHash)return ctx.fail('CANNOT_FOLLOW_SELF');
 const count=(await env.DB.prepare('SELECT COUNT(*) n FROM follows WHERE follower=?').bind(idHash).first())?.n||0;
 if(count>=PROFILE.follows)return ctx.fail('TOO_MANY_FOLLOWS',409);
 await env.DB.prepare('INSERT INTO follows(follower,followee,created_at) VALUES(?,?,?) ON CONFLICT(follower,followee) DO NOTHING').bind(idHash,row.id_hash,seconds(now)).run();
 return ctx.json({ok:true,following:true});
}

/* GET /api/following — who you follow and what they read lately (newest first). A reader who went private stays in
   the list (so you can unfollow) but shows nothing beyond name and picture. */
export async function followingFeed(request,env,ip,now,ctx){
 const idHash=await me(request,env,now,ctx);if(!idHash)return ctx.fail('UNAUTHORIZED',401);
 if(!await ctx.hit(env,'social-get',idHash,now.getTime()))return ctx.fail('RATE_LIMITED',429);
 const {results}=await env.DB.prepare('SELECT f.followee id_hash,p.pid,(p.public=1 AND p.hidden=0) public,u.name FROM follows f JOIN profiles p ON p.id_hash=f.followee LEFT JOIN leaderboard_users u ON u.id_hash=f.followee WHERE f.follower=? ORDER BY f.created_at DESC LIMIT ?').bind(idHash,PROFILE.follows).all();
 const avatars=await ctx.avatarsFor(env,results.filter(r=>r.public&&r.name).map(r=>r.id_hash));
 const people=[];
 for(const r of results){const open=!!r.public&&!!r.name;const recent=open?await recentOf(env,r.id_hash,3):[];
  people.push({pid:r.pid,name:r.name||'',public:open,avatar:open?avatars.get(r.id_hash)||null:null,recent,last:recent.reduce((m,g)=>Math.max(m,g.last),0)});}
 people.sort((a,b)=>b.last-a.last);
 return ctx.json({ok:true,following:people});
}

/* GET /api/kindred — public readers whose favourites or shared games overlap yours, most overlap first (max 20). */
export async function kindred(request,env,ip,now,ctx){
 const idHash=await me(request,env,now,ctx);if(!idHash)return ctx.fail('UNAUTHORIZED',401);
 if(!await ctx.hit(env,'social-get',idHash,now.getTime()))return ctx.fail('RATE_LIMITED',429);
 const {results}=await env.DB.prepare(`WITH mine AS (SELECT game_key FROM profile_favorites WHERE id_hash=?1 UNION SELECT game_key FROM leaderboard_games WHERE id_hash=?1),
   theirs AS (SELECT f.id_hash,f.game_key,f.title FROM profile_favorites f UNION SELECT g.id_hash,g.game_key,g.title FROM leaderboard_games g JOIN leaderboard_users s ON s.id_hash=g.id_hash AND s.share_games=1)
   SELECT t.id_hash,t.game_key,t.title,p.pid,u.name FROM theirs t JOIN mine m ON m.game_key=t.game_key JOIN profiles p ON p.id_hash=t.id_hash AND p.public=1 AND p.hidden=0 JOIN leaderboard_users u ON u.id_hash=t.id_hash
   WHERE t.id_hash<>?1 LIMIT 5000`).bind(idHash).all();
 const people=new Map();
 for(const r of results){const p=people.get(r.id_hash)||{id:r.id_hash,pid:r.pid,name:r.name,games:new Map()};if(!p.games.has(r.game_key))p.games.set(r.game_key,r.title);people.set(r.id_hash,p);}
 const top=[...people.values()].sort((a,b)=>b.games.size-a.games.size||a.name.localeCompare(b.name)).slice(0,PROFILE.kindred);
 const avatars=await ctx.avatarsFor(env,top.map(p=>p.id));
 const followed=new Set((await env.DB.prepare('SELECT followee FROM follows WHERE follower=?').bind(idHash).all()).results.map(r=>r.followee));
 return ctx.json({ok:true,kindred:top.map(p=>({pid:p.pid,name:p.name,avatar:avatars.get(p.id)||null,shared:[...p.games.values()].slice(0,10),count:p.games.size,following:followed.has(p.id)}))});
}

/* POST /api/profile/:pid/report {kind, reason?} — a signed-in reader reports a public profile (discrimination, nudity,
   racism, harassment, spam, other). The profile is hidden at once (private everywhere) until the maintainer reviews
   it. The report goes to an issue in REPORT_REPO, which must be a PRIVATE repository: without REPORT_REPO no issue is
   opened (never the public repo) and the report waits in moderation_queue. One report per reporter and profile,
   3 per day. The issue holds the reported name, signature, favourites, a 72-hour private link to the picture and the
   commands to restore or clear the profile. */
export async function profileReport(request,env,ip,now,ctx,pid){
 const reporter=await me(request,env,now,ctx);if(!reporter)return ctx.fail('UNAUTHORIZED',401);
 const body=await ctx.readJSON(request,4*1024);if(body.error)return ctx.fail(body.error,body.error==='PAYLOAD_TOO_LARGE'?413:400);
 const kind=String(body.value?.kind||'');if(!REPORT_KINDS.includes(kind))return ctx.fail('INVALID_KIND');
 const reason=cleanReportReason(body.value?.reason);if(!reason.ok)return ctx.fail(reason.error);
 const row=await env.DB.prepare('SELECT p.id_hash,p.bio,p.hidden,u.name FROM profiles p JOIN leaderboard_users u ON u.id_hash=p.id_hash WHERE p.pid=? AND p.public=1').bind(pid).first();
 if(!row)return ctx.fail('NOT_FOUND',404);if(row.id_hash===reporter)return ctx.fail('CANNOT_REPORT_SELF');
 if(await env.DB.prepare('SELECT 1 FROM profile_reports WHERE target=? AND reporter=?').bind(row.id_hash,reporter).first())return ctx.json({ok:true,already:true,hidden:true});
 if(!await ctx.hit(env,'profile-report',reporter,now.getTime()))return ctx.fail('RATE_LIMITED',429);
 const t=seconds(now),favorites=await favoritesOf(env,row.id_hash),avatar=(await ctx.avatarsFor(env,[row.id_hash])).get(row.id_hash)||'';
 let issueUrl='';
 const repo=/^[\w.-]+\/[\w.-]+$/.test(env.REPORT_REPO||'')?env.REPORT_REPO:'',token=env.REPORT_TOKEN||env.GITHUB_TOKEN;
 if(repo&&token){
  const origin=new URL(request.url).origin,exp=t+72*3600,picture=avatar&&env.LINK_SECRET?`${origin}/api/avatar/${avatar}/review?exp=${exp}&sig=${await ctx.signReview(env.LINK_SECRET,avatar,exp)}`:'';
  const sql=s=>['```',`npx wrangler d1 execute megulit-relay --remote --command "${s}"`,'```'];
  const text=['A reader reported this public profile. It is hidden (private everywhere) until you decide.','',
   `- kind: \`${kind}\``,`- reason: ${reason.reason?mdText(reason.reason):'(none given)'}`,`- nickname: ${mdText(row.name)}`,`- signature: ${row.bio?mdText(row.bio):'(empty)'}`,
   `- favourites: ${favorites.length?favorites.map(f=>mdText(f.title)).join(' / '):'(none)'}`,`- picture: ${picture?`[private link, 72 h](${picture})`:'(none)'}`,`- pid: \`${pid}\``,'',
   'Restore (nothing wrong):',...sql(`UPDATE profiles SET hidden=0 WHERE pid='${pid}'; UPDATE moderation_queue SET resolved_at=unixepoch() WHERE kind='profile' AND subject='${pid}'`),
   'Clear it (signature and favourites removed, profile stays private; remove the picture separately if needed):',...sql(`UPDATE profiles SET bio='',public=0,hidden=0 WHERE pid='${pid}'; DELETE FROM profile_favorites WHERE id_hash=(SELECT id_hash FROM profiles WHERE pid='${pid}'); UPDATE moderation_queue SET resolved_at=unixepoch() WHERE kind='profile' AND subject='${pid}'`)].join('\n');
  try{const r=await (env.fetch||fetch)(`https://api.github.com/repos/${repo}/issues`,{method:'POST',headers:{authorization:'Bearer '+token,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28','user-agent':'megulit-relay','content-type':'application/json'},
    body:JSON.stringify({title:`[主页举报] ${kind} · ${row.name}`.slice(0,200),body:text,labels:['profile-report']})});
   if(r.ok){const data=await r.json().catch(()=>({}));issueUrl=typeof data.html_url==='string'?data.html_url:'';}}catch{}
 }
 await env.DB.batch([env.DB.prepare('INSERT INTO profile_reports(target,reporter,kind,reason,issue_url,created_at) VALUES(?,?,?,?,?,?)').bind(row.id_hash,reporter,kind,reason.reason,issueUrl,t),
  env.DB.prepare('UPDATE profiles SET hidden=1,appealed_at=0 WHERE id_hash=?').bind(row.id_hash),
  env.DB.prepare("INSERT INTO moderation_queue(kind,subject,reason,created_at,resolved_at) VALUES('profile',?,?,?,0)").bind(pid,kind+(reason.reason?': '+reason.reason:''),t)]);
 return ctx.json({ok:true,hidden:true});
}

/* E398 POST /api/profile/appeal {reason?} — 異議あり！ The owner of a reported (hidden) profile objects once per
   hiding. The objection goes to the same private REPORT_REPO as an issue labelled profile-appeal, with every report
   on this profile, the owner's statement and the restore command; it also adds a moderation_queue row of kind
   profile-appeal. The profile stays hidden until the maintainer decides. */
export async function profileAppeal(request,env,ip,now,ctx){
 const idHash=await me(request,env,now,ctx);if(!idHash)return ctx.fail('UNAUTHORIZED',401);
 const body=await ctx.readJSON(request,4*1024);if(body.error)return ctx.fail(body.error,body.error==='PAYLOAD_TOO_LARGE'?413:400);
 const reason=cleanReportReason(body.value?.reason);if(!reason.ok)return ctx.fail(reason.error);
 const row=await env.DB.prepare('SELECT p.pid,p.bio,p.hidden,p.appealed_at,u.name FROM profiles p LEFT JOIN leaderboard_users u ON u.id_hash=p.id_hash WHERE p.id_hash=?').bind(idHash).first();
 if(!row||!row.hidden)return ctx.fail('NOT_HIDDEN');
 if(row.appealed_at)return ctx.json({ok:true,already:true});
 if(!await ctx.hit(env,'profile-appeal',idHash,now.getTime()))return ctx.fail('RATE_LIMITED',429);
 const t=seconds(now),{results:reports}=await env.DB.prepare('SELECT kind,reason,issue_url,created_at FROM profile_reports WHERE target=? ORDER BY created_at').bind(idHash).all();
 let issueUrl='';
 const repo=/^[\w.-]+\/[\w.-]+$/.test(env.REPORT_REPO||'')?env.REPORT_REPO:'',token=env.REPORT_TOKEN||env.GITHUB_TOKEN;
 if(repo&&token){
  const sql=s=>['```',`npx wrangler d1 execute megulit-relay --remote --command "${s}"`,'```'];
  const text=['The owner of this reported profile objects (異議あり！). It stays hidden until you decide.','',
   `- nickname: ${mdText(row.name||'')}`,`- signature: ${row.bio?mdText(row.bio):'(empty)'}`,`- pid: \`${row.pid}\``,
   `- owner's statement: ${reason.reason?mdText(reason.reason):'(none given)'}`,'','Reports:',
   ...reports.map(r=>`- \`${r.kind}\`${r.reason?': '+mdText(r.reason):''}${r.issue_url?` (${r.issue_url})`:''}`),'',
   'Objection upheld (show the profile again):',...sql(`UPDATE profiles SET hidden=0,appealed_at=0 WHERE pid='${row.pid}'; UPDATE moderation_queue SET resolved_at=unixepoch() WHERE kind IN ('profile','profile-appeal') AND subject='${row.pid}'`),
   'Objection overruled: leave it hidden and close this issue, or clear it with the command in the report issue.'].join('\n');
  try{const r=await (env.fetch||fetch)(`https://api.github.com/repos/${repo}/issues`,{method:'POST',headers:{authorization:'Bearer '+token,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28','user-agent':'megulit-relay','content-type':'application/json'},
    body:JSON.stringify({title:`[異議あり] ${row.name||row.pid}`.slice(0,200),body:text,labels:['profile-appeal']})});
   if(r.ok){const data=await r.json().catch(()=>({}));issueUrl=typeof data.html_url==='string'?data.html_url:'';}}catch{}
 }
 await env.DB.batch([env.DB.prepare('UPDATE profiles SET appealed_at=? WHERE id_hash=?').bind(t,idHash),
  env.DB.prepare("INSERT INTO moderation_queue(kind,subject,reason,created_at,resolved_at) VALUES('profile-appeal',?,?,?,0)").bind(row.pid,reason.reason||'(none)',t)]);
 return ctx.json({ok:true,appealed:true});
}

/* leaving the leaderboard or deleting the account removes all of it */
export function socialDeletes(env,hashes){
 return hashes.flatMap(h=>[env.DB.prepare('DELETE FROM profiles WHERE id_hash=?').bind(h),env.DB.prepare('DELETE FROM profile_favorites WHERE id_hash=?').bind(h),env.DB.prepare('DELETE FROM follows WHERE follower=? OR followee=?').bind(h,h),env.DB.prepare('DELETE FROM profile_reports WHERE reporter=?').bind(h)]);
}
