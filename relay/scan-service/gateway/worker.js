// Fixed protocol between the ordinary Seed publisher and the single scan host.
// The main relay owns the durable job queue. Losing this socket returns 503.
const unavailable=()=>new Response(null,{status:503});
const digest=text=>crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
async function authorized(request,secret){
 if(!secret||secret.length<32)return false;
 const header=request.headers.get('authorization')||'';
 if(header.length>256)return false;
 const [actual,expected]=await Promise.all([digest(header),digest('Bearer '+secret)]);
 return crypto.subtle.timingSafeEqual(actual,expected);
}
async function readDocument(request){
 const reader=request.body?.getReader();
 if(!reader)return null;
 const data=new Uint8Array(4096);
 let offset=0;
 for(;;){
  const {done,value}=await reader.read();
  if(done)break;
  if(value.length>data.length-offset){await reader.cancel();return null;}
  data.set(value,offset);offset+=value.length;
 }
 return new TextDecoder('utf-8',{fatal:true}).decode(data.subarray(0,offset));
}
export default {
 async fetch(request,env){
  const path=new URL(request.url).pathname;
  const scan=path==='/scan'&&request.method==='POST';
  const connect=path==='/connect'&&request.method==='GET'&&request.headers.get('upgrade')?.toLowerCase()==='websocket';
  if(!scan&&!connect)return new Response(null,{status:404});
  if(!await authorized(request,scan?env.PUBLISHER_TOKEN:env.CONNECTOR_TOKEN))return new Response(null,{status:401});
  return env.SCANNER.get(env.SCANNER.idFromName('ordinary')).fetch(request);
 }
};
export class OrdinaryScanner {
 constructor(state){this.state=state;this.pending=new Map();}
 async fetch(request){
  if(request.method==='GET'){
   const [client,host]=Object.values(new WebSocketPair());
   for(const old of this.state.getWebSockets()){this.disconnect(old);old.close(1000,'reconnected');}
   this.state.acceptWebSocket(host);
   return new Response(null,{status:101,webSocket:client});
  }
  let doc;
  try{doc=await readDocument(request);}catch{return new Response(null,{status:400});}
  if(!doc)return new Response(null,{status:413});
  const [host]=this.state.getWebSockets();
  if(!host||this.pending.size>=2)return unavailable();
  const id=crypto.randomUUID();
  return new Promise(resolve=>{
   const finish=response=>{clearTimeout(timer);this.pending.delete(id);resolve(response);};
   const timer=setTimeout(()=>finish(unavailable()),20000);
   this.pending.set(id,{host,finish});
   try{host.send(JSON.stringify({id,doc}));}catch{finish(unavailable());}
  });
 }
 webSocketMessage(host,raw){
  if(typeof raw!=='string'||raw.length>8192)return;
  let reply;try{reply=JSON.parse(raw);}catch{return;}
  const job=this.pending.get(reply?.id);
  if(!job||job.host!==host)return;
  job.finish(reply.status===200&&typeof reply.body==='string'&&reply.body.length<=2048?
   new Response(reply.body,{headers:{'content-type':'application/json','cache-control':'no-store'}}):unavailable());
 }
 disconnect(host){for(const job of this.pending.values())if(job.host===host)job.finish(unavailable());}
 webSocketClose(host){this.disconnect(host);host.close();}
 webSocketError(host){this.disconnect(host);}
}
