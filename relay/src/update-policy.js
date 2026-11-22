/* Enforcement stays dormant until the stable release and its domestic mirrors are ready */
import versions from '../../core/app-version.cjs';
const {newer,valid}=versions;
const cache=new WeakMap();
const enabled=env=>String(env.FORCE_UPDATE_ENABLED).toLowerCase()==='true';
export function policyFrom(releases,env){
 const list=[...new Set(releases.filter(r=>!r.draft&&!r.prerelease&&/^v?\d+\.\d+\.\d+$/.test(r.tag_name||'')).map(r=>r.tag_name.replace(/^v/,'')))].sort((a,b)=>newer(a,b)?-1:newer(b,a)?1:0);
 const latest=list[0]||'';let minVersion=null;
 if(enabled(env)&&latest){const [major,minor,patch]=latest.split('.').map(Number),sameLine=list[2]?.startsWith(`${major}.${minor}.`);minVersion=patch>=2&&(!list[2]||sameLine)?`${major}.${minor}.${patch-2}`:list[2]||null;
  const override=String(env.MIN_APP_VERSION_OVERRIDE||'').trim().replace(/^v/,'');if(/^\d+\.\d+\.\d+$/.test(override)&&!newer(override,latest))minVersion=override;}
 return {latest,minVersion,message:minVersion?'这本魔导书需要更新啦～此版本已不再接收反馈和适配探针，请更新后再继续':''};
}
export async function updatePolicy(env,now=Date.now()){
 let entry=cache.get(env);
 if(entry&&entry.until>now)return policyFrom(await entry.job,env);
 const job=(async()=>{
  const headers={'user-agent':'MeguLit-Relay',accept:'application/vnd.github+json'};if(env.GITHUB_TOKEN)headers.authorization='Bearer '+env.GITHUB_TOKEN;
  const response=await (env.fetch||fetch)('https://api.github.com/repos/ilynthn/MeguLit/releases?per_page=100',{headers,signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw Error('RELEASE_UNAVAILABLE');const list=await response.json();if(!Array.isArray(list))throw Error('RELEASE_UNAVAILABLE');return list;
 })();
 entry={job,until:now+300000};cache.set(env,entry);
 try{return policyFrom(await job,env);}catch(error){cache.delete(env);throw error;}
}
export function uploadPath(path,method){
 return /^(POST|PUT|PATCH)$/.test(method)&&(/^\/api\/(feedback|diagnostics|probe|adapters|contrib|cardinal|game-profile|torch)(\/|$)/.test(path)||path==='/api/adaptation');
}
/* Binary parts without a version belong to an existing full-probe upload. Never accept a part just because its
   start was accepted before the minimum changed. Unknown versionless traffic remains undecided, not guessed old */
export async function requestVersion(request,env,path){
 const header=request.headers.get('x-megulit-version');if(valid(header))return {version:header};
 let body={};
 if(/json/i.test(request.headers.get('content-type')||'')){
  const reader=request.clone().body?.getReader();if(reader){let bytes=0,text='';const decoder=new TextDecoder();try{for(;;){const r=await reader.read();if(r.done)break;bytes+=r.value.length;if(bytes>65536)break;text+=decoder.decode(r.value,{stream:true});}if(bytes<=65536)body=JSON.parse(text);}catch{}finally{reader.cancel().catch(()=>{});}}
 }
 if(!body||typeof body!=='object'||Array.isArray(body))body={};
 const explicit=body.app||body.appVersion||body.profile?.version||(/^app\//.test(body.page||'')?body.page.slice(4):'');if(valid(explicit))return {version:explicit};
 const upload=body.upload||new URL(request.url).searchParams.get('upload');
 if(path.startsWith('/api/probe/full/')&&/^[a-f0-9-]{36}$/.test(upload||'')){
  try{const row=await env.DB.prepare('SELECT app FROM probe_full WHERE upload=?').bind(upload).first();if(valid(row?.app))return {version:row.app};}catch{}
 }
 if(path==='/api/feedback'&&!/^app(?:\/|$)/.test(body.page||''))return {website:true};
 return {unknown:true};
}
export async function updateGuard(request,env,path,now=Date.now()){
 if(!enabled(env)||!uploadPath(path,request.method))return null;
 let policy;try{policy=await updatePolicy(env,now);}catch{return null;}
 if(!policy.minVersion)return null;
 const client=await requestVersion(request,env,path);
 if(client.version&&newer(policy.minVersion,client.version))return new Response(JSON.stringify({ok:false,error:'UPDATE_REQUIRED',...policy}),{status:426,headers:{'content-type':'application/json','cache-control':'no-store','retry-after':'86400'}});
 return null;
}
