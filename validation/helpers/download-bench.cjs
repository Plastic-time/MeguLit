'use strict';
/* Old vs new downloader under the same throttled simulation of a mainland China line (not part of the test run):
     node validation/helpers/download-bench.cjs [old-ref=main] [sizeMB=48]
   Simulated line: 4 MB/s in total for the player. Each source has its own per-connection speed and host limit taken
   from the 17ce numbers of 2026-11-20 (scaled to one machine), GitHub itself drops 1 of 3 connections, ghproxy.net
   answers 503 now and then. Runs core/fast-download.cjs and setup's MeguFetch, old (git ref) and new, with the old
   source list (main's setup/runtime.json) and the new one (with and without the ModelScope repository). */
const http=require('node:http'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync,spawn}=require('node:child_process');
const repo=path.join(__dirname,'..','..'),KB=1024,MB=1024*KB;
const ref=process.argv[2]||'main',sizeMB=Number(process.argv[3]||48);
const work=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'dl-bench-'));

/* token bucket shared by every server in this process: the player's line */
function bucket(rate){let tokens=rate*0.05,at=Date.now();return n=>{const now=Date.now();tokens=Math.min(rate*0.1,tokens+(now-at)*rate/1000);at=now;const k=Math.max(0,Math.min(n,Math.floor(tokens)));tokens-=k;return k;};}
const LINE=bucket(4*MB),stat={bytes:0};
if(process.env.BENCH_LOG){let last=0;setInterval(()=>{const d=stat.bytes-last;last=stat.bytes;console.log('  line '+(d/MB).toFixed(2)+' MB/s');},2000).unref();}
const PROFILES={
 'cn-dl':{conn:320*KB,host:1.2*MB},'dl':{conn:300*KB,host:1.0*MB},
 'modelscope':{conn:900*KB,host:3*MB},
 'gh-proxy':{conn:240*KB,host:600*KB},'ghproxy-net':{conn:170*KB,host:400*KB,fail503:0.25},
 'gh-monlor':{conn:320*KB,host:800*KB},'edgeone-ghproxy':{conn:270*KB,host:800*KB},'fastgit':{conn:300*KB,host:800*KB},
 'cdn-ghproxy':{conn:230*KB,host:600*KB},'ghfast':{conn:240*KB,host:600*KB,stallEvery:4},
 'github':{conn:350*KB,host:700*KB,stallEvery:3},
};
function server(name,data){
 const p=PROFILES[name],host=bucket(p.host);let n=0;
 const srv=http.createServer((req,res)=>{
  n++;if(p.fail503&&n>1&&Math.random()<p.fail503){res.writeHead(503);return res.end();}
  const m=/bytes=(\d+)-(\d*)/.exec(req.headers.range||'');let start=0,end=data.length-1,code=200;
  if(m){start=+m[1];end=m[2]?Math.min(+m[2],data.length-1):data.length-1;code=206;}
  const h={'Content-Length':end-start+1,'Content-Type':'application/zip'};if(code===206)h['Content-Range']=`bytes ${start}-${end}/${data.length}`;
  res.writeHead(code,h);let pos=start,closed=false,sent=0;res.on('close',()=>{closed=true;});
  const stall=p.stallEvery&&n>1&&n%p.stallEvery===0;
  const tick=()=>{if(closed)return;if(stall&&sent>256*KB)return;/* open, silent */
   const want=Math.max(1,Math.round(p.conn/50));const k=LINE(host(want));
   if(k>0){stat.bytes+=k;res.write(data.subarray(pos,Math.min(end+1,pos+k)));pos+=k;sent+=k;}
   if(pos>end)res.end();else setTimeout(tick,20);};tick();
 });
 return new Promise(ok=>srv.listen(0,'127.0.0.1',()=>ok({name,url:`http://127.0.0.1:${srv.address().port}/x.zip`,close:()=>{srv.closeAllConnections();srv.close();}})));
}
const OLD=['dl','cn-dl','gh-proxy','ghproxy-net','github'];
const NEW=['cn-dl','dl','gh-monlor','gh-proxy','edgeone-ghproxy','fastgit','cdn-ghproxy','ghfast','ghproxy-net','github'];
const NEW_MS=['cn-dl','modelscope','dl','gh-monlor','gh-proxy','edgeone-ghproxy','fastgit','cdn-ghproxy','ghfast','ghproxy-net','github'];
const RELAY_LIMIT={'gh-proxy':4,'ghproxy-net':2,'gh-monlor':4,'edgeone-ghproxy':4,'fastgit':4,'cdn-ghproxy':4,'ghfast':4};

function oldCopy(){
 const dir=path.join(work,'old');fs.mkdirSync(path.join(dir,'core'),{recursive:true});fs.mkdirSync(path.join(dir,'setup'),{recursive:true});
 fs.writeFileSync(path.join(dir,'core','fast-download.cjs'),execFileSync('git',['show',ref+':core/fast-download.cjs'],{cwd:repo}));
 fs.writeFileSync(path.join(dir,'setup','setup-runtime.ps1'),execFileSync('git',['show',ref+':setup/setup-runtime.ps1'],{cwd:repo}));
 fs.writeFileSync(path.join(dir,'driver.ps1'),execFileSync('git',['show',ref+':validation/helpers/setup-download/driver.ps1'],{cwd:repo}));
 return dir;
}
async function runJs(mod,servers,data,limits){
 const fd=require(mod),dest=path.join(work,'js-'+crypto.randomBytes(4).toString('hex')+'.bin'),t0=Date.now();
 const opt={log:process.env.BENCH_LOG?(l=>console.log('  '+((Date.now()-t0)/1000).toFixed(1)+'s '+l.replace(/127\.0\.0\.1:\d+/g,h=>(servers.find(x=>x.url.includes(h))||{}).name||h))):undefined,urls:servers.map(s=>s.url),dest,size:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex'),china:false,trusted:()=>false};
 if(limits)opt.limits=u=>{const s=servers.find(x=>x.url===u);return RELAY_LIMIT[s.name]||0;};
 await fd.download(opt);const ms=Date.now()-t0;fs.rmSync(dest,{force:true});return ms;
}
function runCs(driver,script,servers,data,limits){
 return new Promise((ok,bad)=>{
  const part=path.join(work,'cs-'+crypto.randomBytes(4).toString('hex')+'.part');
  const o=limits?{HostLimits:servers.filter(s=>RELAY_LIMIT[s.name]).map(s=>new URL(s.url).host+'='+RELAY_LIMIT[s.name])}:{};
  const a=['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',driver,'-Script',script,'-Urls',servers.map(s=>s.url).join('|'),'-Part',part,'-Size',String(data.length),'-Sha',crypto.createHash('sha256').update(data).digest('hex').toUpperCase(),'-Options','b64:'+Buffer.from(JSON.stringify(o)).toString('base64')];
  const p=spawn('powershell.exe',a,{windowsHide:true});let out='';p.stdout.on('data',d=>out+=d);
  p.on('close',()=>{try{const j=JSON.parse(out.trim().split(/\r?\n/).pop());for(const f of [part,part+'.json'])fs.rmSync(f,{force:true});if(j.phase!=='done')return bad(new Error(j.error+'\n'+j.log));ok(j.ms);}catch(e){bad(new Error(out));}});
 });
}
(async()=>{
 const data=crypto.randomBytes(sizeMB*MB),old=oldCopy(),rows=[];
 const cases=[
  ['fast-download.cjs','old',OLD,()=>runJs(path.join(old,'core','fast-download.cjs'),null,data,false)],
  ['fast-download.cjs','new',OLD,null],['fast-download.cjs','new',NEW,null],['fast-download.cjs','new',NEW_MS,null],
  ['setup MeguFetch','old',OLD,'cs-old'],['setup MeguFetch','new',OLD,'cs'],['setup MeguFetch','new',NEW,'cs'],['setup MeguFetch','new',NEW_MS,'cs'],
 ];
 for(const [i,[who,ver,list,how]] of cases.entries()){
  if(process.env.BENCH_ONLY&&!process.env.BENCH_ONLY.split(',').includes(String(i)))continue;
  const servers=await Promise.all(list.map(n=>server(n,data)));
  try{
   let ms;
   if(who==='fast-download.cjs')ms=ver==='old'?await runJs(path.join(old,'core','fast-download.cjs'),servers,data,false):await runJs(path.join(repo,'core','fast-download.cjs'),servers,data,true);
   else ms=how==='cs-old'?await runCs(path.join(old,'driver.ps1'),path.join(old,'setup','setup-runtime.ps1'),servers,data,false):await runCs(path.join(repo,'validation','helpers','setup-download','driver.ps1'),path.join(repo,'setup','setup-runtime.ps1'),servers,data,true);
   const row={downloader:who,code:ver,sources:list===OLD?'old list (5)':list===NEW?'new list (10)':'new list + ModelScope (11)',seconds:+(ms/1000).toFixed(1),'MB/s':+(sizeMB/(ms/1000)).toFixed(2)};
   rows.push(row);console.log(JSON.stringify(row));
  }catch(e){rows.push({downloader:who,code:ver,error:String(e.message).slice(0,200)});console.log('failed',who,ver,e.message.slice(0,300));}
  finally{servers.forEach(s=>s.close());}
 }
 console.table(rows);
 fs.writeFileSync(path.join(work,'bench.json'),JSON.stringify(rows,null,1));console.log('saved',path.join(work,'bench.json'));
 fs.rmSync(path.join(work,'old'),{recursive:true,force:true});
 process.exit(0);
})();
