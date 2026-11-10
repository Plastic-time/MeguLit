process.env.MEGULIT_RELAY_BASE??='off';/* tests never reach the real relay */
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const shared=require('../services/shared-adaptation.cjs'),sync=require('../services/shared-adaptation-sync.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-shared-'));const dir=path.join(root,'games','Some Game');fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(path.join(root,'data','config'),{recursive:true});
 const exe=path.join(dir,'Game.exe');const body=Buffer.alloc(1024*1024+4096);for(let i=0;i<body.length;i++)body[i]=(i*31)&255;fs.writeFileSync(exe,body);return {root,exe,body};}
const stream={name:'GetGlyphOutlineW',code:'HS-1C@4A3B2:game.exe',addr:'4a3b2',ctx:'0',ctx2:'0'};
const calibrated={prefs:{x:10,y:70,width:80,height:22,scanX:12,scanY:72,scanWidth:76,scanHeight:20,textColor:'#FFFFFF',readTextColor:'#c0c0c0',hookProfile:'embed',japaneseSize:30},textSavedAt:1,positionSavedAt:1};

test('fingerprint: exe name + size + hash of the first MiB + engine, keyed by all four',()=>{
 const {root,exe,body}=fixture();const fp=shared.fingerprint(exe,'KiriKiri');
 assert.equal(fp.exe,'game.exe');assert.equal(fp.size,body.length);assert.equal(fp.head,sha(body.subarray(0,1024*1024)));assert.equal(fp.engine,'kirikiri');assert.match(fp.key,/^[a-f0-9]{64}$/);
 assert.deepEqual(shared.fingerprint(exe,'kirikiri'),fp,'stable');
 assert.notEqual(shared.fingerprint(exe,'bgi').key,fp.key,'engine is part of the key');
 const tail=Buffer.from(body);tail[tail.length-1]^=255;fs.writeFileSync(exe,tail);assert.equal(shared.fingerprint(exe,'kirikiri').key,fp.key,'bytes after the first MiB do not change it');
 const head=Buffer.from(body);head[10]^=255;fs.writeFileSync(exe,head);assert.notEqual(shared.fingerprint(exe,'kirikiri').key,fp.key);
 fs.writeFileSync(exe,Buffer.concat([body,Buffer.from([1])]));assert.notEqual(shared.fingerprint(exe,'kirikiri').key,fp.key,'size is part of the key');
 assert.ok(!JSON.stringify(fp).includes(root)&&!JSON.stringify(fp).includes('Some Game'),'no folder in the fingerprint');
});

test('record keeps only the whitelisted adaptation fields and never a path or the user name',()=>{
 const {root,exe}=fixture();const user=os.userInfo().username;const fp=shared.fingerprint(exe,'kirikiri');
 const record=shared.build({fingerprint:{...fp,dir:path.dirname(exe),user},stream:{...stream,name:'C:\\Users\\'+user+'\\x',extra:'secret',path:exe},embed:'verified',hookProfile:'embed',flowPage:true,
  profile:{...calibrated,prefs:{...calibrated.prefs,savePath:exe,lastLine:'今日はいい天気'}},zeroLatency:{adapter:'bgi',patchKind:'patch',file:exe},localeMode:'japanese',appVersion:'1.2.8d'});
 assert.ok(record);const json=JSON.stringify(record);
 for(const leak of [root,path.dirname(exe),'Some Game','secret','今日は','savePath','lastLine','japaneseSize'])assert.ok(!json.includes(leak),leak);
 if(user.length>=3)assert.ok(!json.toLowerCase().includes(user.toLowerCase()),'user name');
 assert.ok(!/[A-Za-z]:\\\\|\\\\Users/.test(json),'no Windows path');
 assert.deepEqual(Object.keys(record).sort(),['appVersion','fingerprint','flowPage','hook','key','layout','localeMode','schema','updatedAt','version','zeroLatency']);
 assert.deepEqual(Object.keys(record.fingerprint).sort(),['engine','exe','head','size']);
 assert.equal(record.hook.stream.name,'','a path-like stream name is dropped');assert.equal(record.hook.stream.code,stream.code);assert.equal(record.hook.embed,'verified');assert.equal(record.hook.profile,'embed');
 assert.deepEqual(record.layout.box,{x:10,y:70,width:80,height:22});assert.deepEqual(record.layout.scan,{x:12,y:72,width:76,height:20});assert.equal(record.layout.colors.textColor,'#ffffff');
 assert.deepEqual(record.zeroLatency,{adapter:'bgi',patchKind:'patch'});assert.equal(record.flowPage,true);assert.equal(record.localeMode,'japanese');assert.match(record.updatedAt,/^\d{4}-\d{2}-\d{2}$/);
 assert.equal(shared.clean({...record,fingerprint:{...record.fingerprint,exe:'C:\\Games\\game.exe'}}),null,'a fingerprint with a path is refused');
 assert.equal(shared.clean({...record,key:'0'.repeat(64)}),null,'a key that does not match the fingerprint is refused');
 const uncalibrated=shared.build({fingerprint:fp,stream,embed:'verified',profile:{prefs:calibrated.prefs,textSavedAt:0,positionSavedAt:0}});
 assert.equal(uncalibrated.layout.colors,null,'colours only when calibrated');assert.equal(uncalibrated.layout.box,null,'box only when calibrated');
});

test('export writes data/config/shared-adaptation.json from the running game; the switch turns it off',()=>{
 const {root,exe}=fixture();const st=fs.statSync(exe);fs.mkdirSync(path.join(root,'data','hook-streams'),{recursive:true});
 fs.writeFileSync(shared.streamFile(root,exe,st.size),JSON.stringify({...stream,embeddable:true,at:'x'}));
 let pushed=null;const fake={push:async r=>{pushed=r;return {state:'not-configured'};}};
 const saved=shared.exportFor(root,{executable:exe,engine:'kirikiri',library:{hook:'verified',localeMode:'japanese',dir:path.dirname(exe)},hooks:{flowPage:false},styleSync:{profile:calibrated},hookProfile:'embed',appVersion:'1.2.8d',sync:fake});
 assert.ok(saved);const doc=JSON.parse(fs.readFileSync(path.join(root,'data','config','shared-adaptation.json'),'utf8'));
 assert.equal(doc.records[saved.key].origin,'local');assert.equal(doc.records[saved.key].hook.stream.code,stream.code);assert.ok(!JSON.stringify(doc).includes(root));
 fs.writeFileSync(path.join(root,'data','config','library.json'),JSON.stringify({sharedAdaptation:false}));
 assert.equal(shared.exportFor(root,{executable:exe,engine:'kirikiri',library:{hook:'verified'},sync:fake}),null);
});

test('import applies a matching record only where this PC has nothing saved, and says so once',()=>{
 const {root,exe}=fixture();const fp=shared.fingerprint(exe,'kirikiri');
 const record=shared.build({fingerprint:fp,stream,embed:'verified',hookProfile:'embed',profile:calibrated,localeMode:'japanese',appVersion:'1.2.8d'});shared.save(root,record,'remote');
 const library={};const styleSync={profiles:{},profileKey:null,replay(){}};
 const first=shared.importFor(root,{executable:exe,engine:'kirikiri',library,styleSync});
 assert.deepEqual(first.applied.sort(),['locale','profile','stream']);assert.equal(library.localeMode,'japanese');
 const key=sha(fs.readFileSync(exe)),profiles=JSON.parse(fs.readFileSync(path.join(root,'data','config','game-style-profiles.json'),'utf8'));
 assert.equal(profiles.entries[key].prefs.x,10);assert.equal(profiles.entries[key].prefs.scanWidth,76);assert.equal(profiles.entries[key].prefs.hookProfile,'embed');assert.equal(profiles.entries[key].shared,true);assert.ok(styleSync.profiles[key]);
 const memory=JSON.parse(fs.readFileSync(shared.streamFile(root,exe,fp.size),'utf8'));assert.equal(memory.code,stream.code);
 assert.equal(shared.takeNotice(root,fp),true);assert.equal(shared.takeNotice(root,fp),false,'notice once');
 assert.deepEqual(shared.importFor(root,{executable:exe,engine:'kirikiri',library:{},styleSync}).applied,[],'applied once per game');
});

test('import never overrides settings the user saved for that game',()=>{
 const {root,exe}=fixture();const fp=shared.fingerprint(exe,'kirikiri');
 shared.save(root,shared.build({fingerprint:fp,stream,embed:'verified',hookProfile:'embed',profile:calibrated,localeMode:'japanese'}),'remote');
 const key=sha(fs.readFileSync(exe)),file=path.join(root,'data','config','game-style-profiles.json');
 const mine={version:3,entries:{[key]:{name:'mine',prefs:{x:1,y:2,width:3,height:4,hookProfile:'read'},savedAt:5,textSavedAt:5,positionSavedAt:5,history:[]}}};fs.writeFileSync(file,JSON.stringify(mine));
 fs.mkdirSync(path.join(root,'data','hook-streams'),{recursive:true});const memFile=shared.streamFile(root,exe,fp.size);fs.writeFileSync(memFile,JSON.stringify({code:'MINE',name:'mine'}));
 const library={localeMode:'off'};const result=shared.importFor(root,{executable:exe,engine:'kirikiri',library,styleSync:{profiles:{}}});
 assert.deepEqual(result.applied,[]);assert.equal(library.localeMode,'off');assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),mine);assert.equal(JSON.parse(fs.readFileSync(memFile,'utf8')).code,'MINE');
 assert.equal(shared.takeNotice(root,fp),false,'nothing applied, nothing said');
 /* a remote record never replaces this PC's own record */
 const local=shared.save(root,shared.build({fingerprint:fp,stream:{...stream,code:'LOCAL'},embed:'verified'}),'local');assert.ok(local);
 assert.equal(shared.save(root,shared.build({fingerprint:fp,stream:{...stream,code:'REMOTE'},embed:'verified'}),'remote'),null);assert.equal(shared.find(root,fp).hook.stream.code,'LOCAL');
});

test('import is off with the 共享适配数据（匿名） switch off; the switch defaults on',()=>{
 const {root,exe}=fixture();const fp=shared.fingerprint(exe,'');shared.save(root,shared.build({fingerprint:fp,stream,embed:'verified'}),'remote');
 const {Settings}=require('../services/settings.cjs');const settings=new Settings(root);assert.equal(settings.read('library').sharedAdaptation,true);
 settings.save({scope:'library',values:{sharedAdaptation:false}});assert.equal(settings.read('library').sharedAdaptation,false);assert.equal(shared.enabled(root),false);
 assert.deepEqual(shared.importFor(root,{executable:exe}).applied,[]);assert.ok(!fs.existsSync(shared.streamFile(root,exe,fp.size)));
 const field=require('../services/settings-schema.cjs').fields.find(f=>f.scope==='library'&&f.key==='sharedAdaptation');assert.equal(field.label.zh,'共享适配数据（匿名）');assert.ok(field.label.en&&field.label.ja);
});

test('sync: not configured without an endpoint, disabled by the switch, records only to the relay',async()=>{
 const {root,exe}=fixture();const saved=process.env.MEGULIT_ADAPTATION_ENDPOINT;delete process.env.MEGULIT_ADAPTATION_ENDPOINT;
 try{let calls=0;const fetch=async()=>{calls++;throw Error('no');};
  assert.deepEqual(await sync.push([{}],{root,fetch}),{state:'not-configured'});assert.deepEqual(await sync.pull(['a'.repeat(64)],{root,fetch}),{state:'not-configured'});
  assert.deepEqual(await sync.push([],{root,endpoint:'http://example.com/api/adaptation',fetch}),{state:'not-configured'},'plain http to a remote host is refused');
  fs.writeFileSync(path.join(root,'data','config','library.json'),JSON.stringify({sharedAdaptation:false,sharedAdaptationEndpoint:'https://relay.example/api/adaptation'}));
  assert.deepEqual(await sync.push([{}],{root,fetch}),{state:'disabled'});assert.deepEqual(await sync.pull(['a'.repeat(64)],{root,fetch}),{state:'disabled'});assert.equal(calls,0);
  fs.writeFileSync(path.join(root,'data','config','library.json'),JSON.stringify({sharedAdaptationEndpoint:'https://relay.example/api/adaptation'}));
  const fp=shared.fingerprint(exe,'bgi'),record=shared.build({fingerprint:fp,stream,embed:'verified',profile:calibrated}),sent=[];
  const relay=async(url,init)=>{const body=JSON.parse(init.body);sent.push({url,body});if(url.endsWith('/query'))return {ok:true,json:async()=>({records:[{...record,extra:'x'}]})};return {ok:true,json:async()=>({accepted:body.records.length,rejected:0})};};
  assert.deepEqual(await sync.push([{...record,log:'hook-diagnostics'}],{root,fetch:relay}),{state:'ok',accepted:1,rejected:0});
  assert.equal(sent[0].url,'https://relay.example/api/adaptation');assert.deepEqual(Object.keys(sent[0].body),['version','records']);assert.ok(!JSON.stringify(sent[0].body).includes('hook-diagnostics'));
  const pulled=await sync.pull([fp],{root,fetch:relay});assert.equal(pulled.state,'ok');assert.equal(pulled.records.length,1);assert.equal(pulled.records[0].extra,undefined);
  assert.deepEqual(sent[1].body,{version:1,keys:[fp.key]});assert.equal(shared.read(root).records[fp.key].origin,'remote');
  assert.deepEqual(await sync.push([record],{root,fetch:async()=>({ok:false,status:503})}),{state:'error',error:'HTTP_503'});
 }finally{if(saved!==undefined)process.env.MEGULIT_ADAPTATION_ENDPOINT=saved;}
});
