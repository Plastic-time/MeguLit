'use strict';
/* SPDX-License-Identifier: GPL-3.0-or-later
   Updates without a restart (services/hot-update.cjs): which installs get the small package, and how it is applied. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto'),{spawnSync}=require('child_process');
const hot=require('../services/hot-update.cjs'),u=require('../services/update.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const D='ab12cd34ef56'+'0'.repeat(52);
const url=n=>'https://github.com/ilynthn/MeguLit/releases/download/v1.5.2/'+n;

test('hot update: package name names the version and package it was made from',()=>{
 const name='MeguLit-v1.5.2-hot-from-v1.5.1-ab12cd34ef56.zip';
 const a=hot.asset({assets:[{name,size:9,digest:'sha256:'+'f'.repeat(64),browser_download_url:url(name)}]});
 assert.equal(a.from,'1.5.1');assert.equal(a.fromDigest,'ab12cd34ef56');assert.equal(a.digest,'f'.repeat(64));
 assert.equal(hot.asset({assets:[{name,size:9,browser_download_url:url(name)}]}),null,'no digest, no hot package');
 assert.equal(hot.asset({assets:[{name,size:9,digest:'sha256:'+'f'.repeat(64),browser_download_url:'https://evil.example/'+name}]}),null);
 assert.ok(hot.asset({assets:[{name:'MeguLit-v1.5.2a-hot-from-v1.5.2-ab12cd34ef56.zip',digest:'sha256:'+'f'.repeat(64),browser_download_url:url('x')}]}));
});
test('hot update: only the exact previous install fits',()=>{
 const h={from:'1.5.1',fromDigest:'ab12cd34ef56'};
 assert.equal(hot.fits(h,'1.5.1',{digest:D}),true);
 assert.equal(hot.fits(h,'v1.5.1',{digest:D}),true);
 assert.equal(hot.fits(h,'1.5.0',{digest:D}),false,'older version takes the full package');
 assert.equal(hot.fits(h,'1.5.1',{digest:'ffff'+D.slice(4)}),false,'another package of the same version');
 assert.equal(hot.fits(h,'1.5.1',null),false,'no record of the install');
});
test('hot update: paths outside page and service files are refused',()=>{
 for(const p of ['web/app.js','services/update.cjs','core/x.cjs','setup/a.ps1'])assert.equal(hot.safe(p),true,p);
 for(const p of ['MeguLit.exe','native/HookBridge.exe','runtime/node.exe','data/x.json','web/index.html','web/../MeguLit.exe','web//a.js','web/a\\b.js','web/C:x'])assert.equal(hot.safe(p),false,p);
});

function makeZip(dir,files,manifest){
 const src=path.join(dir,'src','MeguLit');
 for(const [p,body] of Object.entries(files)){const to=path.join(src,...p.split('/'));fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,body);}
 fs.writeFileSync(path.join(src,'hot.json'),JSON.stringify(manifest));
 const zip=path.join(dir,'hot.zip');
 const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','Compress-Archive -Path $env:S -DestinationPath $env:Z -Force'],{windowsHide:true,env:{...process.env,S:src,Z:zip}});
 assert.equal(r.status,0,String(r.stderr));return zip;
}
function makeRoot(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'hot-'));fs.writeFileSync(path.join(root,'MeguLit.exe'),'exe');fs.mkdirSync(path.join(root,'web'));fs.writeFileSync(path.join(root,'web','app.js'),'old');return root;}

test('hot update: files are verified, old copies kept, and the exe recorded',{skip:process.platform!=='win32'},()=>{
 const root=makeRoot(),body={'web/app.js':'new app','services/new.cjs':'module.exports=1'};
 const zip=makeZip(root,body,{version:'1.5.2',from:'1.5.1',files:Object.entries(body).map(([p,b])=>({path:p,sha256:sha(Buffer.from(b))}))});
 const m=hot.apply(root,zip);assert.equal(m.version,'1.5.2');
 assert.equal(fs.readFileSync(path.join(root,'web','app.js'),'utf8'),'new app');
 assert.equal(fs.readFileSync(path.join(root,'services','new.cjs'),'utf8'),'module.exports=1');
 assert.equal(fs.readFileSync(path.join(root,'cache','update','hot-rollback','1.5.2','web','app.js'),'utf8'),'old');
 const rec=JSON.parse(fs.readFileSync(path.join(root,'data','hot-update.json'),'utf8'));
 assert.equal(rec.exe,hot.exeStamp(root));assert.equal(rec.version,'1.5.2');
 assert.equal(fs.existsSync(path.join(root,'cache','update','hot-stage')),false);
});
test('hot update: a wrong hash or a refused path writes nothing',{skip:process.platform!=='win32'},()=>{
 const root=makeRoot();
 let zip=makeZip(root,{'web/app.js':'new'},{version:'1.5.2',files:[{path:'web/app.js',sha256:'0'.repeat(64)}]});
 assert.throws(()=>hot.apply(root,zip),/HOT_HASH_MISMATCH/);
 zip=makeZip(root,{'native/x.dll':'x'},{version:'1.5.2',files:[{path:'native/x.dll',sha256:sha(Buffer.from('x'))}]});
 assert.throws(()=>hot.apply(root,zip),/HOT_PATH_REJECTED/);
 assert.equal(fs.readFileSync(path.join(root,'web','app.js'),'utf8'),'old');
 assert.equal(fs.existsSync(path.join(root,'data','hot-update.json')),false);
});
test('hot update: check offers the small package only to the install it was made from',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hot-chk-'));fs.mkdirSync(path.join(root,'data'));
 fs.writeFileSync(path.join(root,'data','update-installed.json'),JSON.stringify({version:'1.5.1',digest:D}));
 fs.writeFileSync(path.join(root,'data','icon-refresh.json'),JSON.stringify({version:'1.5.1'}));
 const hotName='MeguLit-v1.5.2-hot-from-v1.5.1-ab12cd34ef56.zip';
 const rel={tag_name:'v1.5.2',body:'',assets:[{name:'MeguLit-v1.5.2-win-x64.zip',size:30000000,digest:'sha256:'+'1'.repeat(64),browser_download_url:url('MeguLit-v1.5.2-win-x64.zip')},{name:hotName,size:40000,digest:'sha256:'+'2'.repeat(64),browser_download_url:url(hotName)}]};
 const fetcher=async u2=>u2.endsWith('/latest')?{ok:true,json:async()=>rel}:{ok:false,status:404};
 u.reset();let info=await u.check('1.5.1',fetcher,root);
 assert.equal(info.newer,true);assert.equal(info.hot,true);assert.equal(info.hotSize,40000);
 u.reset();info=await u.check('1.5.0',fetcher,root);
 assert.equal(info.newer,true);assert.equal(info.hot,false,'1.5.0 takes the full package');
 u.reset();
});
