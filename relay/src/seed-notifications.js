// The socket carries only a wakeup. D1 holds the ordered, transactional replay log.
export class SeedNotifications {
 constructor(state){this.state=state;}
 async fetch(request){
  if(request.method==='POST'){
   for(const socket of this.state.getWebSockets()){
    try{socket.send('changed');}catch{try{socket.close(1011,'reconnect');}catch{}}
   }
   return new Response(null,{status:204});
  }
  if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response(null,{status:426});
  const [client,server]=Object.values(new WebSocketPair());
  this.state.acceptWebSocket(server);
  return new Response(null,{status:101,webSocket:client});
 }
 webSocketMessage(socket){socket.close(1008,'receive only');}
 webSocketClose(socket){socket.close(1000,'closed');}
}
export function notifier(env){return env.SEED_NOTIFICATIONS.get(env.SEED_NOTIFICATIONS.idFromName('releases'));}

export async function wakeClients(env){
 if(!env.SEED_NOTIFICATIONS)return;
 // Clients replay the durable log on reconnect, including after a failed broadcast.
 try{
  const result=await notifier(env).fetch('https://seed.internal/wake',{method:'POST'});
  if(!result.ok)console.error('Seed notification failed',result.status);
 }catch(error){console.error('Seed notification failed',error.message);}
}
