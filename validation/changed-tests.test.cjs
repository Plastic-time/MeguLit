'use strict';
/* tools/changed-tests.cjs (Build.ps1 -TestsChanged) on a throwaway repository: a test runs when it names a changed file
   or a source one require away from it, a shared-ground change runs everything, and --rev reads a past commit the same
   way the working tree is read. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {select}=require('../tools/changed-tests.cjs');

function repo(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-changed-tests-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const git=(...a)=>execFileSync('git',['-C',root,'-c','user.name=t','-c','user.email=t@t','-c','commit.gpgsign=false','-c','core.autocrlf=false',...a],{encoding:'utf8'});
 const write=(f,s)=>{fs.mkdirSync(path.dirname(path.join(root,f)),{recursive:true});fs.writeFileSync(path.join(root,f),s);};
 git('init','-q','-b','main');git('config','core.autocrlf','false');
 write('core/leaf.cjs','module.exports=1;\n');
 write('core/mid.cjs',"module.exports=require('./leaf.cjs')+1;\n");
 write('core/top.cjs',"module.exports=require('./mid')+1;\n");
 write('web/page.js','export const x=1;\n');
 write('tools/run-isolated.cjs','\n');
 write('validation/leaf.test.cjs',"require('../core/leaf.cjs');\n");
 write('validation/mid.test.cjs',"const p=path.join(ROOT,'core','mid.cjs');\n");
 write('validation/top.test.cjs',"require('../core/top.cjs');\n");
 write('validation/page.test.cjs',"/page.js/.test(src);\n");
 git('add','-A');git('commit','-qm','base');
 return {root,git,write,base:git('rev-parse','HEAD').trim()};
}

test('a changed source selects the tests naming it and the sources one require away',t=>{
 const r=repo(t);r.write('core/leaf.cjs','module.exports=2;\n');
 const s=select({root:r.root,base:r.base,depth:1});
 assert.equal(s.full,null);
 assert.deepEqual(s.selected,['validation/leaf.test.cjs','validation/mid.test.cjs']);
 assert.match(s.why['validation/mid.test.cjs'],/core\/mid\.cjs, which requires core\/leaf\.cjs/);
 assert.deepEqual(select({root:r.root,base:r.base,depth:0}).selected,['validation/leaf.test.cjs']);
 /* './mid' without an extension resolves to core/mid.cjs */
 assert.deepEqual(select({root:r.root,base:r.base,depth:2}).selected,['validation/leaf.test.cjs','validation/mid.test.cjs','validation/top.test.cjs']);
});

test('edited and untracked test files run; a change nothing names runs none',t=>{
 const r=repo(t);
 r.write('validation/top.test.cjs',"require('../core/top.cjs');// edited\n");
 r.write('validation/new.test.cjs','\n');
 r.write('docs/notes.md','unnamed\n');
 assert.deepEqual(select({root:r.root,base:r.base}).selected,['validation/new.test.cjs','validation/top.test.cjs']);
 fs.rmSync(path.join(r.root,'validation'),{recursive:true});r.git('checkout','-q','--','validation');
 assert.deepEqual(select({root:r.root,base:r.base}).selected,[]);
});

test('a shared-ground change runs the whole suite and says why',t=>{
 const r=repo(t);r.write('tools/run-isolated.cjs','// changed\n');
 const s=select({root:r.root,base:r.base});
 assert.equal(s.selected.length,4);
 assert.match(s.full,/test runner changed \(tools\/run-isolated\.cjs\)/);
});

test('--rev reads the commit, not the working tree',t=>{
 const r=repo(t);
 r.write('web/page.js','export const x=2;\n');r.git('commit','-qam','page');
 const head=r.git('rev-parse','HEAD').trim();
 r.write('core/leaf.cjs','module.exports=3;\n'); /* uncommitted: not part of the commit */
 const s=select({root:r.root,base:r.base,rev:head});
 assert.deepEqual(s.changed,['web/page.js']);
 assert.deepEqual(s.selected,['validation/page.test.cjs']);
});
