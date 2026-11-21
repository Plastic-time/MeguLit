const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{Worker}=require('node:worker_threads');
const budget=require('../services/background-budget.cjs');
const tmp=path.join('H:/MeguLit-Work/tmp','cpu-budget-'+process.pid);fs.mkdirSync(tmp,{recursive:true});test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
test('real maintenance worker asks the service again after input activity and cannot trust its own playing closure',async()=>{
 const source=`const {parentPort}=require('node:worker_threads');require(${JSON.stringify(require.resolve('../services/background-budget.cjs'))}).wait('root',{delay:5}).then(ok=>parentPort.postMessage({done:ok}));`;
 const worker=new Worker(source,{eval:true,workerData:{backgroundBudget:true}});let checks=0;
 budget.attach(worker,'root',{allowed:async()=>++checks>=2});
 try{const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('worker permission timeout')),3000);worker.on('message',m=>{if(m.done){clearTimeout(timer);resolve(m);}});worker.on('error',reject);});assert.equal(result.done,true);assert.equal(checks,2);}finally{await worker.terminate();}
});
test('automatic feed checks permission at start and before every package, retaining manual sync responsiveness',async()=>{
 const feed=require('../services/adapter-feed.cjs'),root=path.join(tmp,'feed');fs.mkdirSync(path.join(root,'data/config'),{recursive:true});fs.writeFileSync(path.join(root,'data/config/online.json'),JSON.stringify({relayUrl:'https://relay.test'}));
 const packs=[{id:'pack-one',version:1,format:999},{id:'pack-two',version:1,format:999}];let checks=0;
 const result=await feed.sync(root,{automatic:true,checkpoint:async()=>{checks++;},fetch:async()=>new Response(JSON.stringify({schema:'megulit.adapter-feed',packs}))});
 assert.equal(result.state,'ok');assert.equal(checks,3);assert.equal(result.skipped.length,2);
 const manual=await feed.sync(root,{fetch:async()=>new Response(JSON.stringify({schema:'megulit.adapter-feed',packs:[]}))});assert.equal(manual.state,'ok');
});
test('automatic library probe yields between games and cancellation never records unprocessed games',async()=>{
 const probe=require('../services/adapter-probe.cjs'),root=path.join(tmp,'probe');let release,second;const waiting=new Promise(resolve=>second=resolve),original=budget.wait;let calls=0;
 budget.wait=async()=>{if(++calls===1)return true;second();return new Promise(resolve=>release=resolve);};
 try{probe.start(root,{prepare:()=>({all:()=>[{id:'one',title:'one',executable:path.join(tmp,'one/no.exe')},{id:'two',title:'two',executable:path.join(tmp,'two/no.exe')}]})},{automatic:true,force:true});await waiting;
  assert.equal(probe.status(root).done,1);assert.equal(probe.results(root).two,undefined);probe.cancel(root);release(false);await new Promise(resolve=>setImmediate(resolve));assert.equal(probe.status(root).state,'cancelled');assert.equal(probe.results(root).two,undefined);
 }finally{budget.wait=original;release?.(false);probe.cancel(root);}
});
test('temporary reader interactions keep their own bounded clocks even with no game',()=>{
 for(const name of ['interaction','game-style-sync-ui','menu-layout','settings-reset','v4'])assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../web/reader/modules',name+'.js'),'utf8'),/__megulitReaderIntervals/);
});
