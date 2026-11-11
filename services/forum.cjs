// SPDX-License-Identifier: GPL-3.0-or-later
/* #117 交流 board, the app side of relay/src/forum.js. Reading works signed out (the token is sent when there is one so
   the relay can mark your own posts); writing needs the MeguLit account. Every reply from the relay is re-checked here
   before it reaches the page. Bridge actions: forum_list / forum_get / forum_post / forum_reply / forum_delete. */
const lb=require('./leaderboard.cjs');

const TAGS=['question','hook','guide','share','other'];
const ID=/^[0-9a-f]{16}$/,AVATAR=/^[0-9a-f]{32}$/,PID=/^[0-9a-f]{16}$/;
const str=(v,n)=>String(v??'').slice(0,n);
const int=v=>Math.max(0,Math.min(Number.MAX_SAFE_INTEGER,Math.round(Number(v)||0)));
const person=a=>({name:str(a?.name,32)||'?',avatar:AVATAR.test(String(a?.avatar||''))?a.avatar:null,pid:PID.test(String(a?.pid||''))?a.pid:null,mine:a?.mine===true});
const signedIn=(root,options={})=>!!lb.identity(root,options);
function cleanPost(p,full=false){
 if(!p||!ID.test(String(p.id||'')))return null;
 return {id:p.id,title:str(p.title,60),...(full?{body:str(p.body,4000)}:{excerpt:str(p.excerpt,130)}),tag:TAGS.includes(p.tag)?p.tag:'other',game:str(p.game,120),engine:str(p.engine,24),replies:int(p.replies),created:int(p.created),active:int(p.active),author:person(p.author)};
}
async function images(root,people,options){const ids=people.map(p=>p?.avatar).filter(Boolean);return ids.length?await lb.avatarImages(root,ids,options).catch(()=>({})):{};}

/* list({game,engine,tag,mine,page}) → {state:'ok',posts,more,page,signedIn,avatars} | {state:'not-configured'|'error'|...} */
async function list(root,{game='',engine='',tag='',mine=false,page=0}={},options={}){
 const q=new URLSearchParams();
 if(game)q.set('game',str(game,120));if(engine)q.set('engine',str(engine,24));if(TAGS.includes(tag))q.set('tag',tag);if(mine)q.set('mine','1');if(int(page))q.set('page',String(Math.min(500,int(page))));
 const res=await lb.socialCall(root,'GET','/api/forum'+(q.toString()?'?'+q:''),undefined,options,mine===true);if(res.state!=='ok')return {...res,signedIn:signedIn(root,options)};
 const posts=(Array.isArray(res.data.posts)?res.data.posts:[]).slice(0,20).map(p=>cleanPost(p)).filter(Boolean);
 return {state:'ok',posts,more:res.data.more===true,page:int(res.data.page),signedIn:signedIn(root,options),avatars:await images(root,posts.map(p=>p.author),options)};
}
async function get(root,id,options={}){
 if(!ID.test(String(id||'')))return {state:'error',error:'NOT_FOUND'};
 const res=await lb.socialCall(root,'GET','/api/forum/'+id,undefined,options,false);if(res.state!=='ok')return res;
 const post=cleanPost(res.data.post,true);if(!post)return {state:'error',error:'BAD_RESPONSE'};
 const replies=(Array.isArray(res.data.replies)?res.data.replies:[]).slice(0,200).filter(r=>ID.test(String(r?.id||''))).map(r=>r.deleted?{id:r.id,deleted:true,created:int(r.created)}:{id:r.id,body:str(r.body,2000),created:int(r.created),author:person(r.author)});
 return {state:'ok',post,replies,signedIn:signedIn(root,options),avatars:await images(root,[post.author,...replies.map(r=>r.author)],options)};
}
/* writes: an error code from the relay is thrown as FORUM_<CODE> so the page can show its message */
const thrown=res=>{if(res.state==='login')throw Error('FORUM_UNAUTHORIZED');if(res.state==='not-configured')throw Error('FORUM_NOT_CONFIGURED');if(res.state!=='ok')throw Error('FORUM_'+(res.error||'NETWORK'));return res;};
async function create(root,{title,body,tag,game='',engine=''}={},options={}){
 const res=thrown(await lb.socialCall(root,'POST','/api/forum',{title:str(title,200),body:str(body,8000),tag:TAGS.includes(tag)?tag:'other',game:str(game,120),engine:str(engine,24)},options));
 return {state:'ok',id:ID.test(String(res.data.id||''))?res.data.id:null};
}
async function reply(root,id,body,options={}){
 if(!ID.test(String(id||'')))throw Error('FORUM_NOT_FOUND');
 const res=thrown(await lb.socialCall(root,'POST',`/api/forum/${id}/replies`,{body:str(body,4000)},options));return {state:'ok',id:res.data.id||null};
}
async function remove(root,id,replyId='',options={}){
 if(!ID.test(String(id||''))||(replyId&&!ID.test(String(replyId))))throw Error('FORUM_NOT_FOUND');
 thrown(await lb.socialCall(root,'DELETE',`/api/forum/${id}`+(replyId?`/replies/${replyId}`:''),undefined,options));return {state:'ok'};
}
function status(root,options={}){const c=lb.config(root,options.env,options);return {configured:c.configured,signedIn:signedIn(root,options)};}
module.exports={TAGS,status,list,get,create,reply,remove};
