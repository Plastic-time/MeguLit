// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Test resume for Build.ps1 -Check (owner, 2026-11-21: "失败的就那几个，成功了的为啥还要一起全量测"):
   the state file keeps, per test file, its content hash and last result, plus a fingerprint of everything else the tests
   exercise (code folders + validation helpers). Same fingerprint: only failed, new or edited test files run again; the
   rest keep their pass. A changed fingerprint drops the state and the whole suite runs.
     node tools/test-resume.cjs select <state> <root> <out-list>   -> writes the files to run, one per line
     node tools/test-resume.cjs record <state> <root> <ran-list> <tap-output> <exit-code> */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const CODE=['web','services','core','setup','desktop','native','relay','tools'];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
/* git is not always on PATH (a PowerShell started without the Git folder): try the usual places too */
const GIT=[process.env.MEGULIT_GIT,'git',process.env.ProgramFiles&&path.join(process.env.ProgramFiles,'Git','cmd','git.exe'),process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'hermes','git','cmd','git.exe'),process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'Programs','Git','cmd','git.exe')].filter(Boolean);
let gitExe=null;
const git=(root,args)=>{
 if(gitExe)return execFileSync(gitExe,['-C',root,...args],{encoding:'buffer',windowsHide:true,maxBuffer:1<<28});
 for(const g of GIT){try{const out=execFileSync(g,['-C',root,...args],{encoding:'buffer',windowsHide:true,maxBuffer:1<<28});gitExe=g;return out;}catch(e){if(e.code!=='ENOENT')throw e;}}
 throw Object.assign(Error('git not found'),{code:'NO_GIT'});
};
const rel=f=>f.replace(/\\/g,'/');

function allTests(root){
 const out=[];const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(e.name.endsWith('.test.cjs'))out.push(rel(path.relative(root,p)));}};
 walk(path.join(root,'validation'));return out.sort();
}
/* committed trees + working changes + untracked files of the code folders, and every non-test file under validation/ */
/* no git at all: a fresh random fingerprint, so the whole suite runs (never reuse what cannot be compared) */
function fingerprint(root){try{return fingerprintGit(root);}catch(e){if(e.code!=='NO_GIT')throw e;console.log('tests: git not found, code fingerprint unknown: full run');return 'nogit-'+crypto.randomUUID();}}
function fingerprintGit(root){
 const h=crypto.createHash('sha256');
 for(const d of CODE){let t='';try{t=git(root,['rev-parse','HEAD:'+d]).toString().trim();}catch(e){if(e.code==='NO_GIT')throw e;}h.update(d+'='+t+'\n');}
 h.update(git(root,['diff','HEAD','--',...CODE]));
 for(const f of git(root,['ls-files','--others','--exclude-standard','--',...CODE]).toString().split('\n').filter(Boolean).sort()){
  try{h.update(f+'\n');h.update(fs.readFileSync(path.join(root,f)));}catch{}
 }
 const helpers=[];const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(!e.name.endsWith('.test.cjs'))helpers.push(p);}};
 walk(path.join(root,'validation'));
 for(const p of helpers.sort()){const r=rel(path.relative(root,p));if(/^validation\/(automated-results\.(txt|json))$/.test(r))continue;h.update(r+'\n');h.update(fs.readFileSync(p));}
 return h.digest('hex');
}
const readState=f=>{try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch{return null;}};

/* failing test files from node --test TAP output: a file-level "not ok N - validation\x.test.cjs", or the location: of a
   failing test's YAML block (up to the next ok / not ok line) */
function failedFiles(tap){
 const bad=new Set(),lines=tap.split(/\r?\n/);let open=false;
 for(const line of lines){
  const head=line.match(/^\s*(ok|not ok) \d+ - (.*)$/);
  if(head){open=head[1]==='not ok';const m=head[2].match(/(validation[\\/]+[^\s'"]+?\.test\.cjs)/);if(open&&m)bad.add(rel(m[1]).replace(/\/+/g,'/'));continue;}
  if(open){const m=line.match(/location:\s*'[^']*?(validation[\\/]+[^:']+?\.test\.cjs)/);if(m){bad.add(rel(m[1]).replace(/\/+/g,'/'));open=false;}}
 }
 return bad;
}

const [cmd,stateFile,root,a,b,c]=process.argv.slice(2);
if(cmd==='select'){
 const tests=allTests(root),fp=fingerprint(root),st=readState(stateFile);
 let run,why;
 if(!st||st.fingerprint!==fp){run=tests;why=st?'code fingerprint changed: full run':'no earlier results: full run';}
 else{run=tests.filter(t=>{const e=st.files&&st.files[t];return !e||e.result!=='pass'||e.hash!==sha(fs.readFileSync(path.join(root,t)));});why='same code fingerprint';}
 fs.writeFileSync(a,run.join('\n'));
 console.log(`tests: ${why}; ${tests.length-run.length} reused from the last run, ${run.length} to run`);
}else if(cmd==='record'){
 const ran=fs.readFileSync(a,'utf8').split(/\r?\n/).filter(Boolean),tap=fs.readFileSync(b,'utf8'),exit=Number(c),fp=fingerprint(root);
 const old=readState(stateFile),files=old&&old.fingerprint===fp?{...old.files}:{};
 const bad=failedFiles(tap);
 /* a failed run whose failures cannot be read: nothing it ran counts as passed */
 const trusted=exit===0||bad.size>0;
 for(const t of ran){let hash='';try{hash=sha(fs.readFileSync(path.join(root,t)));}catch{continue;}
  files[t]={hash,result:bad.has(t)?'fail':(trusted?'pass':'unknown')};}
 fs.writeFileSync(stateFile,JSON.stringify({fingerprint:fp,updatedAt:new Date().toISOString(),files},null,1));
 const fails=Object.entries(files).filter(([,e])=>e.result!=='pass').map(([t])=>t);
 console.log(`tests recorded: ${ran.length} ran, ${bad.size} failed${trusted?'':' (failures unreadable: none counted as passed)'}; ${fails.length} left to run next time${fails.length?': '+fails.slice(0,12).join(', ')+(fails.length>12?' ...':''):''}`);
}else{console.error('usage: test-resume.cjs select|record ...');process.exit(2);}
