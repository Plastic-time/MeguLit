import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

test('scanner disconnect, authentication, request correlation and recovery',async t=>{
 const publisher=randomBytes(32).toString('hex'),connector=randomBytes(32).toString('hex');
 const mf=new Miniflare(convertV4MiniflareOptions({
  modules:[{type:'ESModule',path:'gateway.mjs',contents:readFileSync(new URL('./worker.js',import.meta.url),'utf8')}],
  bindings:{PUBLISHER_TOKEN:publisher,CONNECTOR_TOKEN:connector},
  compatibilityDate:'2026-10-01',durableObjects:{SCANNER:{className:'OrdinaryScanner',useSQLite:true}}
 }));
 t.after(()=>mf.dispose());
 const request=(path,token,init)=>mf.dispatchFetch('https://gateway.test'+path,{...init,headers:{...init.headers,authorization:'Bearer '+token}});
 const scan=(data,token=publisher)=>request('/scan',token,{method:'POST',body:data});
 const connect=token=>request('/connect',token,{headers:{upgrade:'websocket'}});
 assert.equal((await scan('{}',connector)).status,401);
 assert.equal((await connect(publisher)).status,401);
 assert.equal((await scan('{}')).status,503);
 assert.equal((await scan('x'.repeat(4097))).status,413);
 const response=await connect(connector);
 assert.equal(response.status,101);
 const socket=response.webSocket;
 socket.accept();
 let offers=[];
 let received;
 const wait=()=>new Promise(resolve=>{received=resolve;});
 socket.addEventListener('message',event=>{offers.push(JSON.parse(event.data));received?.();});
 const first=scan('one'),second=scan('two');
 while(offers.length!==2)await wait();
 assert.equal((await scan('third')).status,503);
 for(const job of offers.reverse())socket.send(JSON.stringify({id:job.id,status:200,body:job.doc}));
 assert.equal(await (await first).text(),'one');
 assert.equal(await (await second).text(),'two');
 offers=[];
 const pending=scan('interrupted');
 while(!offers.length)await wait();
 socket.close();
 assert.equal((await pending).status,503);
 const replacement=(await connect(connector)).webSocket;
 replacement.accept();
 replacement.addEventListener('message',event=>{
  const job=JSON.parse(event.data);
  replacement.send(JSON.stringify({id:job.id,status:200,body:'ready'}));
 });
 assert.equal(await (await scan('after reconnect')).text(),'ready');
 replacement.close();
});
