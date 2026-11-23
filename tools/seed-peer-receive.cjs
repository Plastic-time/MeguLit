// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');
const receiver=require('../services/torch-receive.cjs');
const feed=require('../services/auto-profile-feed.cjs');
const keys=name=>require('../services/'+name+'-keys.json').keys.filter(k=>!k.revoked);
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
function write(file,data){
  const tmp=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(data,null,2)+'\n');
  fs.renameSync(tmp,file);
}
function isolate(root){
  Object.assign(process.env,{MEGULIT_ROOT:root,MEGULIT_OWNER_TESTS:'1',MEGULIT_SIDE_BY_SIDE:'1',
    MEGULIT_OWNER_TORCH_RECEIVE:'1',MEGULIT_OWNER_SEED_REPORT:'0',MEGULIT_RELAY_BASE:'off'});
}
async function offline(root,id){
  isolate(root);process.env.MEGULIT_OFFLINE='1';
  global.fetch=async()=>{throw Error('OFFLINE');};
  const entry=read(path.join(root,'inventory.json')).find(row=>row.id===id);
  const {exe,key,engine}=entry;
  assert.equal(await receiver.fileHash(exe,{}),key);
  const receipt=await receiver.installed(root,key,{exe});assert.ok(receipt?.verified,'verified installed receipt required');
  const cached=feed.cached(root,key),layer=feed.layer(cached,key,{exe});
  assert.ok(layer?.exact);
  const sessions=require('../services/self-check-live.cjs');
  let applied=null;
  const reader={root,gameId:id,gal:{hooks:{},setGameProfile:profile=>{applied=profile;}}};
  try{
    const session=sessions.start(reader,exe,null,{exe,engine},{key});
    sessions.stageSeed(root,key);
    reader.gal.hooks.beforeDialogue({hookSequence:1,hookSource:'receiver-check'});
    assert.ok(applied&&!session.seedPending,'reader did not consume staged cache');
    const settings=layer.version.settings;
    const select=(schema,profile)=>Object.fromEntries(Object.entries(schema).map(([k,v])=>[
      k,v&&typeof v==='object'&&!Array.isArray(v)?select(v,profile?.[k]):profile?.[k]??null]));
    return {origin:receipt.origin,releaseHash:receipt.hash,revision:receipt.revision,verified:receipt.verified,
      keyId:(cached.torchRelease?.signature||cached.versionLayer?.diff?.signature||cached.diff?.signature)?.keyId,
      reviewKeyId:cached.torchRelease?.review?.signature?.keyId??null,serverTime:receipt.serverTime,
      selected:session.from,settings,applied:select(settings,applied),boundary:'controlled-reader-callback',offline:true};
  }finally{sessions.stop();}
}

async function watch(parent,config){
  const specs=read(config);
  assert.ok(Array.isArray(specs)&&specs.length&&specs.length<=10);
  const root=fs.mkdtempSync(path.join(path.resolve(parent),'seed-player-b-'));
  console.log(root);
  isolate(root);
  for(const dir of ['data/config','cache','logs'])fs.mkdirSync(path.join(root,dir),{recursive:true});
  write(path.join(root,'data/config/library.json'),{autoProfileShare:false,runtimeSampleShare:false,sharedAdaptation:false,coldTest:false});
  write(path.join(root,'data/config/online.json'),{relayUrl:''});
  const inventory=[];
  for(const {id,exe:source,scripts=[],engine} of specs){
    assert.match(id,/^[a-z0-9-]{1,40}$/);assert.ok(path.isAbsolute(source));
    const game=path.join(root,'samples',id);fs.mkdirSync(game,{recursive:true});
    const exe=path.join(game,path.basename(source));fs.copyFileSync(source,exe,fs.constants.COPYFILE_EXCL);
    const hashes={};
    assert.ok(Array.isArray(scripts)&&scripts.length<=16);
    for(const script of scripts){
      assert.ok(!/[:\\]/.test(script)&&!path.isAbsolute(script)&&script.split('/').every(s=>s&&s!=='.'&&s!=='..'));
      const target=path.join(game,script);fs.mkdirSync(path.dirname(target),{recursive:true});
      fs.copyFileSync(path.join(path.dirname(source),script),target,fs.constants.COPYFILE_EXCL);
      hashes[script]=await receiver.fileHash(target,{});
    }
    inventory.push({id,exe,engine,key:await receiver.fileHash(exe,{}),scripts:hashes});
  }
  write(path.join(root,'inventory.json'),inventory);
  const db=require('../services/store.cjs').openStore(root);
  try{
    const add=db.prepare('INSERT INTO games(id,title,executable) VALUES(?,?,?)');
    for(const game of inventory)add.run(game.id,game.id,game.exe);
  }finally{db.close();}
  const trust={};
  for(const name of ['ordinary-seed','profile','torch-review'])trust[name]=keys(name).map(k=>({
    id:k.id,spkiSha256:crypto.createHash('sha256').update(Buffer.from(k.publicKey,'base64')).digest('hex')
  }));
  const status={pid:process.pid,startedAt:new Date().toISOString(),initialCursor:0,baseline:null,cursor:0,trust,receipts:{}};
  const file=path.join(root,'status.json'),save=()=>write(file,status);
  save();
  class ObservedSocket extends WebSocket {
    constructor(url){
      super(url);
      this.addEventListener('open',()=>{status.socket={url,openedAt:new Date().toISOString()};save();});
      this.addEventListener('close',()=>{if(status.socket?.url===url){status.socket.closedAt=new Date().toISOString();save();}});
    }
  }
  const stop=require('../services/seed-live.cjs').subscribe(root,{Socket:ObservedSocket,onReplay:({base,cursor,changes,more})=>{
    const first=status.baseline===null;
    status.cursor=cursor;status.base=base;status.replayedAt=new Date().toISOString();
    // Reconcile installs the current winner once per key, even if several changes were coalesced.
    const latest=new Map(changes.map(({seq,game_key})=>[game_key,seq]));
    for(const game of inventory){
      const seq=latest.get(game.key);
      if(seq===undefined)continue;
      const online=receiver.status(root,game.id);
      const prior=status.receipts[game.id]?.releaseHash;
      let receipt={seq,firstReplay:first,verified:false,state:online?.state??'unknown',code:online?.code};
      if(online?.state==='received'){
        try{
          const proof=JSON.parse(execFileSync(process.execPath,[__filename,'offline',root,game.id],
            {encoding:'utf8',windowsHide:true,timeout:20000}));
          assert.equal(proof.releaseHash,online.receipt.hash);
          receipt={...receipt,...proof,changedSinceLastReceipt:proof.releaseHash!==prior};
        }catch{receipt.error='OFFLINE_READBACK_FAILED';}
      }
      status.receipts[game.id]=receipt;
      fs.appendFileSync(path.join(root,'receipts.jsonl'),JSON.stringify({id:game.id,at:status.replayedAt,...receipt})+'\n');
    }
    if(first&&!more)status.baseline=cursor;
    save();
  }});
  assert.equal(typeof stop,'function');
  const close=async()=>{clearInterval(timer);await stop();status.stoppedAt=new Date().toISOString();save();};
  const timer=setInterval(()=>{if(fs.existsSync(path.join(root,'STOP')))void close();},2000);
  process.once('SIGINT',close);process.once('SIGTERM',close);
}
if(require.main===module){
  const [mode,first,second]=process.argv.slice(2);
  (mode==='offline'?offline(first,second).then(v=>console.log(JSON.stringify(v))):
    mode==='watch'?watch(first,second):Promise.reject(Error('Use watch <existing-parent> <inventory.json> or offline <root> <id>')))
    .catch(e=>{console.error(e.message);process.exitCode=1;});
}
