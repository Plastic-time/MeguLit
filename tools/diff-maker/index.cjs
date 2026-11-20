#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 用户一键上传探针 → 我们离线做出差分和回放夹具 → 签名后热更新下发) the maintainer's diff maker.
   One probe folder in, without the game: the game diff draft <exeHash>.json, the replay fixture and a report. README.md next to
   this file has the probe layout and the commands. */
const fs=require('node:fs'),path=require('node:path');
const Profiles=require('../../core/profiles/index.cjs');
const Role=require('../../core/draw-role.cjs');
const Probe=require('./probe.cjs'),Samples=require('./samples.cjs'),Scripts=require('./scripts.cjs'),Search=require('./search.cjs'),Emit=require('./emit.cjs');
const ROOT=path.join(__dirname,'..','..');

/* make(probeDir,{key}) -> {probe,key,profile,rep,result,diff,replay,report} (nothing written) */
function make(dir,{key=''}={}){const probe=Probe.load(dir);
 const base=Profiles.profileFor(probe.input);const gameKey=key||base.gameKey;
 const gameFile=Profiles.games().find(g=>g.key===gameKey)||null;
 const rep=Samples.replay(probe,base);
 const ix=Scripts.load(path.join(dir,'scripts'),probe.scriptFiles);
 const result=Search.search(rep,base,ix);
 result.lines=rep.events.filter(e=>e.kind==='line').length;result.windowCount=Search.windows(rep.events,result.thresholds).length;
 const diff=Emit.diffOf(probe,gameKey,result,gameFile);
 const unknown=Profiles.unknownKeys(diff.settings);if(unknown.length)throw new Error('diff uses keys not in core/profiles/defaults.cjs: '+unknown.join(', '));
 const profile=Profiles.apply(Profiles.profileFor({engine:probe.engine}),diff.settings,'diff');
 const name='probe-'+probe.exe.hash.slice(0,12);
 const replay=Emit.replayOf(probe,gameKey,rep,result,'core/profiles/diffs/'+probe.exe.hash+'.json');
 for(const r of replay.identities)replay.expect.roles[r.label]=Role.classify(profile,r.id).role;
 const rpt=Emit.report(probe,gameKey,result,diff,base);
 return {probe,key:gameKey,name,profile,rep,ix,result,diff,replay,report:rpt};}

/* where the products go: out/<key>-<hash12>/ always; with repo also core/profiles/diffs/ and validation/fixtures/games/<key>/ */
function write(m,{out,repo=false,root=ROOT}){const dir=path.join(out,m.key+'-'+m.probe.exe.hash.slice(0,12));fs.mkdirSync(dir,{recursive:true});
 Emit.writeJson(path.join(dir,m.probe.exe.hash+'.json'),m.diff);Emit.writeJson(path.join(dir,m.name+'.replay.json'),m.replay);
 fs.writeFileSync(path.join(dir,'report.md'),m.report.md);
 Emit.writeJson(path.join(dir,'report.json'),{gameKey:m.key,exeHash:m.probe.exe.hash,engine:m.probe.engine,best:m.result.best,hideBest:m.result.hideBest,perKey:m.result.perKey,
  roles:m.result.roles,proposals:m.result.proposals,scriptPair:m.result.scriptPair,look:m.report.look,candidates:m.result.candidates.map(c=>({params:c.params,pass:c.pass,cost:c.cost,over:c.over,metrics:c.metrics}))});
 const written=[dir];
 if(repo){const d=path.join(root,'core','profiles','diffs',m.probe.exe.hash+'.json');Emit.writeJson(d,m.diff);
  const fx=path.join(root,'validation','fixtures','games',m.key);fs.mkdirSync(fx,{recursive:true});
  Emit.writeJson(path.join(fx,m.name+'.replay.json'),m.replay);fs.writeFileSync(path.join(fx,m.name+'.case.cjs'),Emit.CASE(m.name));fs.writeFileSync(path.join(fx,m.name+'.report.md'),m.report.md);
  written.push(d,fx);}
 return written;}

/* trim: a small probe folder with only what the maker reads (the repo's sample probes; never the game's whole script) */
function trim(src,dst){const m=make(src);fs.mkdirSync(path.join(dst,'runtime'),{recursive:true});
 const man={...m.probe.manifest};delete man.files;if(Array.isArray(m.probe.manifest.files))man.files=m.probe.manifest.files.filter(f=>/\.(exe|xp3|js)$/i.test(String(f.path||f))).slice(0,40);
 Emit.writeJson(path.join(dst,'manifest.json'),man);
 const kept=Samples.fromHookLogs(m.probe.runtime.hookEvents,m.probe.runtime.readerHost,m.probe.window).kept;
 if(m.probe.runtime.hookEvents){fs.writeFileSync(path.join(dst,'runtime','hook-events.log'),kept.hook.join('\n')+'\n');fs.writeFileSync(path.join(dst,'runtime','reader-host.log'),kept.reader.join('\n')+'\n');}
 if(m.probe.runtime.draws)fs.writeFileSync(path.join(dst,'runtime','draws.jsonl'),m.probe.runtime.draws);
 const texts=[...m.rep.events.filter(e=>e.kind==='drawn').map(e=>e.text),...m.rep.draws.flatMap(d=>d.kind==='choice'?d.items:[d.text]).filter(Boolean)];
 const lines=Scripts.touched(m.ix,texts);if(lines.length)Emit.writeJson(path.join(dst,'scripts','lines.json'),{note:'trimmed by tools/diff-maker trim: only the script lines this replay touches',lines});
 return dst;}

function main(argv){const args=argv.slice(2);const flag=n=>{const i=args.indexOf(n);if(i<0)return null;const v=args[i+1];args.splice(i,2);return v;};const has=n=>{const i=args.indexOf(n);if(i<0)return false;args.splice(i,1);return true;};
 if(args[0]==='trim'){const [,src,dst]=args;if(!src||!dst){console.error('usage: diff-maker trim <probe> <out>');return 2;}console.log(trim(src,dst));return 0;}
 const key=flag('--key')||'',out=flag('--out')||process.env.MEGULIT_DIFF_OUT||'H:\\MeguLit-Work\\diff-maker\\out',repo=has('--write-repo');
 const dirs=args.filter(a=>!a.startsWith('--'));if(!dirs.length){console.error('usage: node tools/diff-maker/index.cjs <probe-dir>... [--key <gameKey>] [--out <dir>] [--write-repo]\n       node tools/diff-maker/index.cjs trim <probe-dir> <out-dir>');return 2;}
 let bad=0;for(const d of dirs){try{const m=make(d,{key:dirs.length===1?key:''});const w=write(m,{out,repo});const b=m.result.best;
   console.log(m.key+' '+m.probe.exe.hash.slice(0,12)+' engine='+m.probe.engine+' mode='+b.params.hideMethod+' cost='+b.cost+(b.over.length?' over='+b.over.join(','):'')+' look='+m.report.look.length+'\n  '+w.join('\n  '));}
  catch(e){bad++;console.error(d+': '+e.message);}}
 return bad?1:0;}
if(require.main===module)process.exitCode=main(process.argv);
module.exports={make,write,trim,main,ROOT};
