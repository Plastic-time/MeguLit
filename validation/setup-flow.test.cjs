// SPDX-License-Identifier: GPL-3.0-or-later
// First-launch setup window flow (setup\setup-runtime.ps1): the download starts with the window, the user picks the
// folder meanwhile, packs are unpacked only after Install. Runs the real window on HidDesk's hidden desktop (nothing on
// the user's screen) against local throttled HTTP sources, driven by the MEGULIT_SETUP_* test hooks.
// Cases: Install before the download ends, download ends before Install, window closed mid-way then resumed,
// staging and install folder on different drives, not enough space on the chosen drive, repair (only missing packs).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),http=require('node:http'),{spawn,spawnSync}=require('node:child_process');
const repo=path.join(__dirname,'..'),script=path.join(repo,'setup','setup-runtime.ps1');
const hiddesk=process.env.MEGULIT_HIDDESK||'E:\\Apps\\megu-testbed\\HidDesk.exe';
const skip=process.platform!=='win32'||!fs.existsSync(hiddesk)?'needs Windows and HidDesk.exe (hidden desktop)':false;
/* NOT under %TEMP%: setup-runtime.ps1 treats a folder inside %TEMP% as "opened from an archive" and then suggests the roomiest other drive (the real E:\MeguLit on a dev machine), so "nothing to download" and the wrong install target would make every case here depend on the machine. */
const tmpBase=process.env.MEGULIT_TEST_TMP||path.join(os.homedir(),'.megulit-setup-test');fs.mkdirSync(tmpBase,{recursive:true});
const ps=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
const MB=1<<20;
const MARKERS={base:['node.exe','python/python.exe','python/Lib/zipfile/__init__.py','python/Lib/encodings/__init__.py'],reading:['reading/sudachidict_full/resources/system.dic'],voice:['aivis/run.exe']};

function zipOf(id,pad){
 const src=fs.mkdtempSync(path.join(tmpBase,'msf-src-'));
 for(const m of MARKERS[id]){const f=path.join(src,'runtime',m);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,id);}
 fs.writeFileSync(path.join(src,'runtime',id+'-pad.bin'),crypto.randomBytes(pad));
 const out=path.join(tmpBase,'msf-'+id+'-'+crypto.randomUUID()+'.zip');
 const r=spawnSync(path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe'),['-a','-cf',out,'-C',src,'runtime'],{windowsHide:true});
 assert.equal(r.status,0,String(r.stderr));fs.rmSync(src,{recursive:true,force:true});
 const body=fs.readFileSync(out);fs.rmSync(out);return body;
}
let PACKS;
function packs(){return PACKS||(PACKS={base:zipOf('base',6*MB),reading:zipOf('reading',6*MB),voice:zipOf('voice',6*MB)});}

/* One HTTP source serving every pack with Range support, rate per connection, bytes counted per pack.
   slow={id,from,rate}: that pack is served slowly past byte `from`, so its first 4 MB segment finishes (and is saved) early. */
function server(rate,{slow}={}){
 const served={base:0,reading:0,voice:0};
 const s=http.createServer((req,res)=>{
  const id=(/runtime-(\w+)\.zip/.exec(req.url)||[])[1];const body=packs()[id];if(!body){res.writeHead(404);return res.end();}
  const m=/bytes=(\d+)-(\d*)/.exec(req.headers.range||'');let start=0,end=body.length-1,code=200;
  if(m){start=+m[1];end=m[2]?Math.min(+m[2],body.length-1):end;code=206;}
  const h={'Content-Length':end-start+1,'Content-Type':'application/zip'};if(code===206)h['Content-Range']=`bytes ${start}-${end}/${body.length}`;
  res.writeHead(code,h);let pos=start,closed=false;res.on('close',()=>{closed=true;});
  const tick=()=>{if(closed)return;const r=slow&&id===slow.id&&pos>=slow.from?slow.rate:rate;const n=Math.max(1024,Math.round(r/20));const chunk=body.subarray(pos,Math.min(end+1,pos+n));served[id]+=chunk.length;res.write(chunk);pos+=n;if(pos>end)res.end();else setTimeout(tick,50);};tick();
 });
 return new Promise(ok=>s.listen(0,'127.0.0.1',()=>ok({base:`http://127.0.0.1:${s.address().port}/files/runtime-v1/`,served,close:()=>{s.closeAllConnections();s.close();}})));
}
function fakeRoot(dir,src,{installed=[]}={}){
 fs.mkdirSync(path.join(dir,'setup'),{recursive:true});
 fs.copyFileSync(script,path.join(dir,'setup','setup-runtime.ps1'));
 fs.copyFileSync(path.join(repo,'setup','setup-vc-runtime.ps1'),path.join(dir,'setup','setup-vc-runtime.ps1'));
 if(process.env.MEGULIT_SETUP_WEB==='1'){/* web skin under test: the skin files go next to the script, like in the release package */for(const f of ['setup-web.ps1'])fs.copyFileSync(path.join(repo,'setup',f),path.join(dir,'setup',f));for(const d of ['ui-web','webview2'])fs.cpSync(path.join(repo,'setup',d),path.join(dir,'setup',d),{recursive:true});}
 const logo=path.join(repo,'setup','logo.png');if(fs.existsSync(logo))fs.copyFileSync(logo,path.join(dir,'setup','logo.png'));
 fs.writeFileSync(path.join(dir,'MeguLit.exe'),'not a real exe');
 const p={};for(const [id,body] of Object.entries(packs()))p[id]={size:body.length,unpacked:body.length*2,sha256:crypto.createHash('sha256').update(body).digest('hex').toUpperCase(),urls:[src.base+'runtime-'+id+'.zip']};
 fs.writeFileSync(path.join(dir,'setup','runtime.json'),JSON.stringify({version:'test',packs:p,mirrors:[]}));
 for(const id of installed)for(const m of MARKERS[id]){const f=path.join(dir,'runtime',m);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,id);}
 return dir;
}
/* Starts the setup window on the hidden desktop and resolves with its event log once it has exited. */
/* HidDesk is started async: a blocking spawn would also stall the HTTP sources this process serves.
   Resolve on exit, not close: the window it starts can keep an inherited pipe open. */
function hid(args,env){return new Promise(ok=>{const p=spawn(hiddesk,args,{env,windowsHide:true});let out='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>out+=d);p.on('exit',()=>setTimeout(()=>ok(out),300));});}
/* Since 52751111 the window downloads only after Install is pressed; the cases about what happens before Install opt back into the prefetch path. */
async function runWindow(root,env,{timeout=90000,shots={}}={}){
 const log=path.join(tmpBase,'msf-events-'+crypto.randomUUID()+'.jsonl');
 const e={...process.env,MEGULIT_SETUP_TEST:log,MEGULIT_SETUP_TARGET:root,MEGULIT_SETUP_PREFETCH:"1",...env};   /* the new installer downloads only after Install is pressed; these scenarios model the old open-and-download flow, so they opt in */
 const out=await hid(['run',ps,'-NoProfile','-ExecutionPolicy','Bypass','-STA','-File',path.join(root,'setup','setup-runtime.ps1'),'-Root',root],e);
 const pid=+out.trim().split(/\s+/)[0];assert.ok(pid>0,'HidDesk run failed: '+out);
 const t0=Date.now(),taken=new Set();let seen;/* after its exit event the window still holds its files until the process is gone */
 return new Promise((ok,bad)=>{
  const tick=()=>{
   let ev=[];try{ev=fs.readFileSync(log,'utf8').trim().split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l.replace(/^\uFEFF/,'')));}catch{}
   for(const [kind,png] of Object.entries(shots))if(!taken.has(kind)&&ev.some(x=>x.kind===kind)){taken.add(kind);hid(['shot',String(pid),png],process.env);}
   const end=ev.find(x=>x.kind==='exit');if(end)end.seen=seen??=Date.now();
   if(end&&alive(pid)&&Date.now()-end.seen<10000)return setTimeout(tick,150);
   if(end){try{fs.rmSync(log);}catch{}const err=ev.filter(x=>x.kind==='error');return err.length?bad(new Error('error inside the setup window: '+err.map(x=>x.text).join(' | '))):ok(ev);}
   if(Date.now()-t0>timeout){try{process.kill(pid);}catch{}return bad(new Error('setup window did not finish\n'+JSON.stringify(ev)));}
   setTimeout(tick,150);
  };tick();
 });
}
const at=(ev,kind,f=()=>true)=>{const x=ev.find(e=>e.kind===kind&&f(e));return x?x.t:Infinity;};
const has=(dir,id)=>MARKERS[id].every(m=>fs.existsSync(path.join(dir,'runtime',m)));
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
const tmp=p=>fs.mkdtempSync(path.join(tmpBase,p));

test('Install pressed first: download keeps going, each pack is unpacked as soon as it arrives',{skip,timeout:120000},async()=>{
 const src=await server(512*1024),work=tmp('msf-first-'),root=fakeRoot(path.join(work,'from'),src),target=path.join(work,'to','MeguLit'),stage=path.join(work,'to',".megulit-download");
 try{
  const shots=process.env.MEGULIT_SETUP_SHOTS?{'download-start':path.join(process.env.MEGULIT_SETUP_SHOTS,'1-confirmed-downloading.png')}:{};
  const ev=await runWindow(root,{MEGULIT_SETUP_AUTOSTART:'now',MEGULIT_SETUP_TARGET:target,MEGULIT_SETUP_STAGING:stage},{shots});
  assert.equal(ev.at(-1).code,3,'moved to the chosen folder: '+JSON.stringify(ev));
  assert.ok(at(ev,'confirmed')<at(ev,'downloaded'),'confirmed before the first pack finished');
  assert.ok(at(ev,'unpack-start',e=>e.id==='base')<at(ev,'downloaded',e=>e.id==='voice'),'base unpacked while voice was still downloading');
  for(const id of ['base','reading','voice'])assert.ok(has(target,id),id+' installed in the target');
  assert.ok(fs.existsSync(path.join(target,'MeguLit.exe')),'program copied');
  assert.equal(fs.existsSync(stage),false,'staging folder removed');
  assert.equal(fs.existsSync(path.join(root,'runtime')),false,'nothing unpacked in the source folder');
 }finally{src.close();fs.rmSync(work,{recursive:true,force:true,maxRetries:30,retryDelay:300});}
});

test('download ends first: waits for Install, nothing unpacked before it; repair fetches only missing packs',{skip,timeout:120000},async()=>{
 const src=await server(2*MB),work=tmp('msf-wait-'),root=fakeRoot(path.join(work,'MeguLit'),src,{installed:['base']}),stage=path.join(root,'.megulit-download');
 try{
  const shots=process.env.MEGULIT_SETUP_SHOTS?{'all-downloaded':path.join(process.env.MEGULIT_SETUP_SHOTS,'2-downloaded-waiting.png')}:{};
  const ev=await runWindow(root,{MEGULIT_SETUP_PREFETCH:'1',MEGULIT_SETUP_AUTOSTART:'downloaded',MEGULIT_SETUP_STAGING:stage},{shots});
  assert.equal(ev.at(-1).code,0,JSON.stringify(ev));
  assert.equal(ev.find(e=>e.kind==='shown').want,'reading,voice','base already there, not fetched again');
  assert.equal(src.served.base,0,'base never downloaded');
  assert.ok(at(ev,'all-downloaded')<at(ev,'confirmed'),'every pack downloaded before Install');
  assert.ok(at(ev,'unpack-start')>at(ev,'confirmed'),'no unpack before Install');
  for(const id of ['base','reading','voice'])assert.ok(has(root,id),id);
  assert.equal(fs.existsSync(stage),false,'staging folder removed');
 }finally{src.close();fs.rmSync(work,{recursive:true,force:true,maxRetries:30,retryDelay:300});}
});

test('window closed mid-way: next launch reuses the finished pack and resumes the half one',{skip,timeout:180000},async()=>{
 const src=await server(MB,{slow:{id:'reading',from:4*MB,rate:96*1024}}),work=tmp('msf-resume-'),root=fakeRoot(path.join(work,'MeguLit'),src),stage=path.join(work,'stage');
 const P=packs();
 try{
  const ev1=await runWindow(root,{MEGULIT_SETUP_PREFETCH:'1',MEGULIT_SETUP_STAGING:stage,MEGULIT_SETUP_CLOSE_AT:String(P.base.length+5*MB)});
  assert.equal(ev1.at(-1).code,1);assert.ok(ev1.some(e=>e.kind==='close'));
  assert.ok(fs.existsSync(path.join(stage,'runtime-base.setup.part.ok')),'finished pack marked');
  assert.ok(fs.existsSync(path.join(stage,'runtime-reading.setup.part.json')),'half pack has resume state');
  assert.equal(fs.existsSync(path.join(root,'runtime')),false,'nothing installed without Install');
  const before={...src.served};
  const ev2=await runWindow(root,{MEGULIT_SETUP_STAGING:stage,MEGULIT_SETUP_AUTOSTART:'now'});
  assert.equal(ev2.at(-1).code,0,JSON.stringify(ev2));
  assert.equal(ev2.find(e=>e.kind==='downloaded'&&e.id==='base').reused,true,'base not downloaded again');
  assert.equal(src.served.base,before.base,'no base bytes on the second run');
  /* the first 4 MB segment was finished before the window closed: it must be reused, not fetched again. The bytes the server sent also include the 3 s source probe, which on a fast machine alone is half the 6 MB pack, so the served total is only bounded loosely. */
  assert.ok(ev2.find(e=>e.kind==='downloaded'&&e.id==='reading').resumed>=4*MB,'reading resumed with its finished 4 MB segment: '+ev2.find(e=>e.kind==='downloaded'&&e.id==='reading').resumed);
  assert.ok(src.served.reading-before.reading<P.reading.length*1.5,'reading not fetched twice over: '+(src.served.reading-before.reading));
  for(const id of ['base','reading','voice'])assert.ok(has(root,id),id);
 }finally{src.close();fs.rmSync(work,{recursive:true,force:true,maxRetries:30,retryDelay:300});}
});

const otherDrive=(()=>{const here=path.parse(path.resolve(tmpBase)).root.toUpperCase();for(const d of (process.env.MEGULIT_TEST_OTHER_DRIVES||'E:\\,D:\\,H:\\,C:\\').split(',')){if(d.toUpperCase()!==here&&fs.existsSync(d))return d;}return null;})();
test('staging and install folder on different drives',{skip:skip||(!otherDrive&&'needs a second drive'),timeout:120000},async()=>{
 const src=await server(2*MB),work=tmp('msf-cross-'),root=fakeRoot(path.join(work,'from'),src),stage=path.join(work,'stage');
 const far=fs.mkdtempSync(path.join(otherDrive,'megulit-setup-flow-test-')),target=path.join(far,'MeguLit');
 try{
  const ev=await runWindow(root,{MEGULIT_SETUP_PREFETCH:'1',MEGULIT_SETUP_STAGING:stage,MEGULIT_SETUP_TARGET:target,MEGULIT_SETUP_AUTOSTART:'downloaded'});
  assert.equal(ev.at(-1).code,3,JSON.stringify(ev));
  assert.notEqual(path.parse(stage).root.toUpperCase(),path.parse(target).root.toUpperCase());
  for(const id of ['base','reading','voice'])assert.ok(has(target,id),id+' on the other drive');
  assert.equal(fs.readdirSync(target).filter(n=>/\.unpack$/.test(n)).length,0,'no unpack leftovers');
  assert.equal(fs.existsSync(stage),false,'staging folder removed');
 }finally{src.close();fs.rmSync(work,{recursive:true,force:true,maxRetries:30,retryDelay:300});fs.rmSync(far,{recursive:true,force:true});}
});

test('not enough space on the chosen drive: says so up front and does not start installing',{skip,timeout:60000},async()=>{
 const src=await server(256*1024),work=tmp('msf-space-'),root=fakeRoot(path.join(work,'MeguLit'),src),stage=path.join(work,'stage');
 try{
  const ev=await runWindow(root,{MEGULIT_SETUP_PREFETCH:'1',MEGULIT_SETUP_STAGING:stage,MEGULIT_SETUP_AUTOSTART:'now',MEGULIT_SETUP_FREE:String(MB),MEGULIT_SETUP_CLOSE_AT:String(MB)});
  const msg=ev.find(e=>e.kind==='message');
  assert.ok(msg&&/空间不够/.test(msg.text),JSON.stringify(ev));
  assert.ok(!ev.some(e=>e.kind==='confirmed'),'not confirmed');
  assert.ok(at(ev,'download-start')<Infinity,'download still runs meanwhile');
  assert.equal(ev.at(-1).code,1);
 }finally{src.close();fs.rmSync(work,{recursive:true,force:true,maxRetries:30,retryDelay:300});}
});

test('no Lite/Full choice left in the setup window',()=>{
 const s=fs.readFileSync(script,'utf8');
 assert.doesNotMatch(s,/精简版|\$lite\b|LITE ·/);
 assert.match(s,/\$full = @\('base','reading','voice'\)/);
});
