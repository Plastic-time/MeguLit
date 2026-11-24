// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Changed-file test selection for Build.ps1 -TestsChanged: run only the validation/*.test.cjs files a change can reach.
   Most tests name the sources they exercise (require('../core/x.cjs'), path.join(ROOT,'web','app.js'), a regex over
   'HookBridge.cs'), so a test is selected when its text names a changed file or a source that requires it (DEPTH
   hops), or when it lists a directory it names that holds a changed file. Changes on shared ground run the whole suite,
   with the reason printed. A shadow run over 114 failing CI runs (2026-11-24) found no failure a change caused that
   DEPTH 1 left out; DEPTH 0 left out three.
     node tools/changed-tests.cjs [--base <ref>] [--rev <commit>] [--out <file>] [--explain] [--json] [--depth <n>]
   --base: compare against this ref (default: merge-base of origin/main and HEAD).
   --rev: read the tree of this commit instead of the working tree (shadow comparisons over past commits).
   Without --rev the working tree counts: committed, staged, unstaged and untracked changes. */
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');

/* How many require hops from a changed file to a source a test names (see the shadow comparison). */
const DEPTH=1;
/* A test that lists directories, and one that lists its own folder (validation/). */
const LISTS=/readdirSync|readdir\(|opendirSync|globSync|ls-files/;
const SELF_DIR=/readdirSync\(\s*__dirname|\b(dir|DIR)\s*=\s*__dirname/;
/* Shared ground: a change here can fail tests that never name it. */
const FULL=[
 [/^tools\/(run-isolated\.cjs|RunOnTestDesktop\.cs|test-resume\.cjs|changed-tests\.cjs)$/,'test runner changed'],
 [/^Build\.ps1$/,'Build.ps1 runs the tests'],
 [/^\.github\//,'CI configuration changed'],
 [/(^|\/)package(-lock)?\.json$|^\.nvmrc$/,'Node dependencies or version changed'],
];

function parseArgs(argv){
 const o={};for(let i=0;i<argv.length;i++){const a=argv[i];
  if(a==='--explain'||a==='--json')o[a.slice(2)]=true;
  else if(['--base','--rev','--out','--root','--depth'].includes(a))o[a.slice(2)]=argv[++i];
  else throw new Error('unknown argument '+a);}
 return o;
}
const rel=f=>f.replace(/\\/g,'/');

function gitRunner(root){
 return (args,opts={})=>{const out=execFileSync('git',['-C',root,...args],{maxBuffer:1<<30,windowsHide:true,input:opts.input});return opts.buffer?out:out.toString('utf8');};
}

/* Files of a tree, with a reader: the working tree (default) or one commit (--rev, via one git cat-file --batch). */
function treeSource(git,root,rev){
 if(!rev){
  const files=git(['ls-files','-z','--cached','--others','--exclude-standard']).split('\0').filter(Boolean).filter(f=>fs.existsSync(path.join(root,f)));
  return {files,read:f=>fs.readFileSync(path.join(root,f),'utf8')};
 }
 const files=git(['ls-tree','-r','-z','--name-only',rev]).split('\0').filter(Boolean);
 const wanted=files.filter(isText);
 const out=git(['cat-file','--batch'],{buffer:true,input:wanted.map(f=>rev+':'+f).join('\n')+'\n'});
 const map=new Map();let at=0;
 for(const f of wanted){const nl=out.indexOf(10,at),head=out.toString('utf8',at,nl).split(' ');const size=Number(head[2]);
  map.set(f,out.toString('utf8',nl+1,nl+1+size));at=nl+1+size+1;}
 return {files,read:f=>map.has(f)?map.get(f):''};
}
const isText=f=>/\.(c?js|mjs|ts|json|cs|cc|cpp|c|h|hpp|rs|ps1|cmd|bat|lua|py|toml|html|css|md|txt|ya?ml)$/i.test(f);
const isSource=f=>/\.(c?js|mjs)$/i.test(f)&&!/(^|\/)node_modules\//.test(f);

function changedFiles(git,base,rev){
 const set=new Set();
 const add=s=>s.split('\0').filter(Boolean).forEach(f=>set.add(rel(f)));
 if(rev){add(git(['diff','--name-only','-z','--no-renames',base,rev]));return [...set];}
 add(git(['diff','--name-only','-z','--no-renames',base]));
 add(git(['ls-files','-z','--others','--exclude-standard']));
 return [...set];
}

/* Static relative requires between JavaScript sources: who depends on whom. */
function requireGraph(tree){
 const users=new Map(),known=new Set(tree.files.map(rel));
 for(const f of tree.files){if(!isSource(f))continue;const text=tree.read(f);
  for(const m of text.matchAll(/require\(\s*['"`](\.{1,2}\/[^'"`]+)['"`]\s*\)|from\s+['"](\.{1,2}\/[^'"]+)['"]|import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)){
   const spec=m[1]||m[2]||m[3];let dep=rel(path.posix.normalize(path.posix.join(path.posix.dirname(f),spec)));
   if(!known.has(dep)){const hit=['.cjs','.js','.mjs','/index.cjs','/index.js'].map(e=>dep+e).find(x=>known.has(x));if(!hit)continue;dep=hit;}
   if(!users.has(dep))users.set(dep,new Set());users.get(dep).add(f);
  }}
 return users;
}

function select({root,base,rev,depth=DEPTH}){
 const git=gitRunner(root);
 if(!base){try{base=git(['merge-base','origin/main',rev||'HEAD']).trim();}catch{throw new Error('no merge-base with origin/main: fetch it, or pass --base (Build.ps1: MEGULIT_TEST_BASE)');}}
 const tree=treeSource(git,root,rev);
 const tests=tree.files.filter(f=>/^validation\/.*\.test\.cjs$/.test(f)).sort();
 const changed=changedFiles(git,base,rev);
 const result={base,changed,tests:tests.length,full:null,selected:[],why:{}};
 for(const f of changed)for(const [re,why] of FULL)if(re.test(f)){result.full=`${why} (${f})`;break;}
 if(result.full){result.selected=tests;return result;}
 const users=requireGraph(tree),texts=new Map(tests.map(t=>[t,tree.read(t)]));
 const reasons=new Map();const note=(t,why)=>{if(!reasons.has(t))reasons.set(t,why);};
 for(const f of changed){
  if(texts.has(f))note(f,'edited');
  /* tests that list a directory (test-windows-hidden walks validation/, relay tests read relay/migrations): a file
     added to or changed in a directory such a test names */
  const dirs=[];const segs=f.split('/');for(let k=1;k<segs.length;k++)dirs.push(segs.slice(0,k));
  for(const [t,text] of texts){if(reasons.has(t)||!LISTS.test(text))continue;
   const own=/^validation\/[^/]+$/.test(f)&&SELF_DIR.test(text);
   const d=own?['validation']:dirs.find(d=>[`'${d[d.length-1]}'`,`"${d[d.length-1]}"`,`'${d.join('/')}`,`"${d.join('/')}`].some(k=>text.includes(k)));
   if(d)note(t,`lists ${d.join('/')}/, which holds ${f}`);}
  /* the changed file and the sources that require it, up to depth hops away */
  const reach=new Map([[f,null]]);let ring=[f];
  for(let d=0;d<depth&&ring.length;d++){const next=[];for(const x of ring)for(const u of users.get(x)||[])if(!reach.has(u)){reach.set(u,x);next.push(u);}ring=next;}
  for(const [src,via] of reach){
   const keys=[path.posix.basename(src)];
   for(const [t,text] of texts){if(reasons.has(t))continue;
    if(keys.some(k=>text.includes(k)))note(t,via?`names ${src}, which requires ${f}`:`names ${f}`);}
  }
 }
 result.selected=[...reasons.keys()].sort();result.why=Object.fromEntries(reasons);
 return result;
}

if(require.main===module){
 const o=parseArgs(process.argv.slice(2));const root=path.resolve(o.root||path.join(__dirname,'..'));
 const r=select({root,base:o.base,rev:o.rev,depth:o.depth===undefined?DEPTH:Number(o.depth)});
 if(o.out)fs.writeFileSync(o.out,r.selected.join('\n'));
 if(o.json)console.log(JSON.stringify(r,null,1));
 else{
  console.log(r.full?`tests: full run: ${r.full}`:`tests: ${r.changed.length} changed files select ${r.selected.length} of ${r.tests} test files`);
  if(o.explain&&!r.full)for(const t of r.selected)console.log(`  ${t}: ${r.why[t]}`);
 }
}
module.exports={select};
