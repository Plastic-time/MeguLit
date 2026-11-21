#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 用户一键上传探针 → 我们离线做出差分和回放夹具 → 签名后热更新下发) the maintainer's diff maker.
   One probe (folder or .mlfp) in, without the game: the unsigned version-layer draft (by exe SHA-256), the game-layer draft and
   line replacement data (by game identity), the replay fixture and a report. Signing is tools/game-diff.cjs sign; the shipped
   format and folder are diff-layers'.
   README.md next to this file has the probe layout and the commands. */
const fs=require('node:fs'),path=require('node:path');
const Profiles=require('../../core/profiles/index.cjs');
const Probe=require('./probe.cjs'),Samples=require('./samples.cjs'),Scripts=require('./scripts.cjs'),Search=require('./search.cjs'),Emit=require('./emit.cjs'),Roles=require('./roles.cjs');
const ROOT=path.join(__dirname,'..','..');

/* make(probeDir,{key}) -> {probe,key,name,profile,rep,ix,result,diff,lines,fixtureLines,replay,report} (nothing written) */
function make(dir,{key='',runtime=''}={}){const probe=Probe.load(dir,{runtime});dir=probe.dir;
 const base=Profiles.profileFor(probe.input);const gameKey=key||base.gameKey;
 /* a draft builds on the hand-written games/<key>.cjs only, never on a seed (diff-layers a1f2cab0) */
 const gameFile=Profiles.games().find(g=>g.key===gameKey&&!g.seed)||null;
 const rep=Samples.replay(probe);
 const ix=Scripts.load(path.join(dir,'scripts'),probe.scriptFiles);
 /* a script without an original-text index (RPG Maker data, KAG files): the fingerprint over its dialogue lines, sorted */
 if(!probe.game.script&&ix.dialogue.size){probe.game.script=Probe.fingerprint([...ix.dialogue].sort());if(!probe.prints.script)probe.prints.script=probe.game.script;}
 const result=Search.search(rep,base,ix);
 result.lines=rep.events.filter(e=>e.kind==='line').length;result.windowCount=Search.windows(rep.events,result.thresholds).length;
 const diffs=Emit.diffsOf(probe,gameKey,result,gameFile);
 const profile=Profiles.apply(Profiles.apply(Profiles.profileFor({engine:probe.engine}),diffs.game.settings,'game'),diffs.version.settings,'version');
 const name='probe-'+probe.exe.sha256.slice(0,8);
 const lines=Scripts.replacements(ix.entries);
 const fixtureLines=Scripts.replacements(Scripts.touched(ix,texts(rep)));
 const replay=Emit.replayOf(probe,gameKey,rep,result,name);
 const rpt=Emit.report(probe,gameKey,result,diffs,base,lines);
 return {probe,key:gameKey,name,profile,rep,ix,result,diffs,lines,fixtureLines,replay,report:rpt};}
/* the texts a replay shows: reader lines and every engine-draw record */
const texts=rep=>[...rep.events.filter(e=>e.kind==='drawn').map(e=>e.text),...rep.records.map(r=>r.text)].filter(Boolean);

/* out/<key>-<sha8>/ always; with repo also validation/fixtures/games/<key>/diff-<sha8>.json + probe-<sha8>.* */
function write(m,{out,repo=false,root=ROOT}){const sha=m.probe.exe.sha256,dir=path.join(out,m.key+'-'+sha.slice(0,8));fs.mkdirSync(dir,{recursive:true});
 Emit.writeJson(path.join(dir,'version-'+sha+'.json'),m.diffs.version);Emit.writeJson(path.join(dir,'game-'+m.key+'.json'),m.diffs.game);
 Emit.writeJson(path.join(dir,'lines-'+m.key+'.json'),Emit.linesOf(m.probe,m.key,m.lines));Emit.writeJson(path.join(dir,m.name+'.replay.json'),m.replay);
 fs.writeFileSync(path.join(dir,'report.md'),m.report.md);
 Emit.writeJson(path.join(dir,'report.json'),{tool:Emit.TOOL,gameKey:m.key,exeSha256:sha,engine:m.probe.engine,probe:m.probe.manifest.identity||'',exe:m.probe.exe.name,title:m.probe.title,game:m.probe.game,covers:m.diffs.covers,prints:m.probe.prints,shots:m.probe.runtime.shots,
  best:m.result.best,hideBest:m.result.hideBest,perKey:m.result.perKey,draw:m.result.draw,scriptPair:m.result.scriptPair,look:m.report.look,
  candidates:m.result.candidates.map(c=>({params:c.params,pass:c.pass,cost:c.cost,over:c.over,metrics:c.metrics}))});
 const written=[dir];
 if(repo){const fx=path.join(root,'validation','fixtures','games',m.key);fs.mkdirSync(fx,{recursive:true});
  Emit.writeJson(path.join(fx,m.name+'.replay.json'),m.replay);Emit.writeJson(path.join(fx,m.name+'.version.json'),m.diffs.version);
  Emit.writeJson(path.join(fx,m.name+'.game.json'),m.diffs.game);Emit.writeJson(path.join(fx,m.name+'.lines.json'),Emit.linesOf(m.probe,m.key,m.fixtureLines));
  fs.writeFileSync(path.join(fx,m.name+'.case.cjs'),Emit.CASE(m.name));fs.writeFileSync(path.join(fx,m.name+'.report.md'),m.report.md);written.push(fx);}
 return written;}

/* trim: a small probe folder with only what the maker reads (the repo's sample probes; never the game's whole script) */
function trim(src,dst){const m=make(src);fs.mkdirSync(path.join(dst,'runtime'),{recursive:true});
 const man={...m.probe.manifest};delete man.files;delete man.items;delete man.dropped;if(Array.isArray(m.probe.manifest.files))man.files=m.probe.manifest.files.filter(f=>/\.(exe|xp3|js|json)$/i.test(String(f.path||f))).slice(0,60);
 Emit.writeJson(path.join(dst,'manifest.json'),man);
 const kept=Samples.fromLogs(m.probe.runtime.hookEvents,m.probe.runtime.readerHost,m.probe.runtime.extra,m.probe.window).kept;
 fs.writeFileSync(path.join(dst,'runtime','hook-events.log'),kept.hook.join('\n')+'\n');fs.writeFileSync(path.join(dst,'runtime','reader-host.log'),kept.reader.join('\n')+'\n');
 const t=Scripts.touched(m.ix,texts(m.rep));
 if(t.length){Emit.writeJson(path.join(dst,'scripts','lines.json'),{note:'trimmed by tools/diff-maker trim: only the script lines this replay touches; fingerprint is of the full script',fingerprint:m.probe.game.script,lines:t.map(e=>e.line),ruby:t.map(e=>e.ruby)});
  if(t.some(e=>e.zh))Emit.writeJson(path.join(dst,'scripts','patch.json'),{note:'aligned with lines.json',lines:t.map(e=>e.zh||e.line)});}
 for(const f of m.probe.scriptFiles.filter(f=>!/^(lines|patch)\.json$/i.test(f))){const to=path.join(dst,'scripts',f);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(src,'scripts',f),to);}
 return dst;}

function main(argv){const args=argv.slice(2);const flag=n=>{const i=args.indexOf(n);if(i<0)return null;const v=args[i+1];args.splice(i,2);return v;};const has=n=>{const i=args.indexOf(n);if(i<0)return false;args.splice(i,1);return true;};
 if(args[0]==='trim'){const [,src,dst]=args;if(!src||!dst){console.error('usage: node tools/diff-maker/index.cjs trim <probe> <out>');return 2;}console.log(trim(src,dst));return 0;}
 const key=flag('--key')||'',runtime=flag('--runtime')||'',out=flag('--out')||process.env.MEGULIT_DIFF_OUT||'H:\\MeguLit-Work\\diff-maker\\out',repo=has('--write-repo');
 const dirs=args.filter(a=>!a.startsWith('--'));if(!dirs.length){console.error('usage: node tools/diff-maker/index.cjs <probe-dir|probe.mlfp>... [--key <gameKey>] [--runtime <bundle.json.gz>] [--out <dir>] [--write-repo]\n       node tools/diff-maker/index.cjs trim <probe-dir> <out-dir>');return 2;}
 let bad=0;for(const d of dirs){try{const m=make(d,{key:dirs.length===1?key:'',runtime:dirs.length===1?runtime:''});const w=write(m,{out,repo});const b=m.result.best;
   console.log(m.key+' '+m.probe.exe.sha256.slice(0,8)+' engine='+m.probe.engine+' mode='+b.params.hideMethod+' cost='+b.cost+(b.over.length?' over='+b.over.join(','):'')+' records='+m.rep.records.length+' lines='+m.lines.length+' look='+m.report.look.length+'\n  '+w.join('\n  '));}
  catch(e){bad++;console.error(d+': '+e.message);}}
 return bad?1:0;}
if(require.main===module)process.exitCode=main(process.argv);
module.exports={make,write,trim,main,ROOT,Roles};
