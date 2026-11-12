'use strict';
/* 1.4.7 shipped web/game-language.js with "},," (a merge left a double comma): the main page never loaded for anyone.
   Every browser script in web/ must parse as an ES module before a release. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const ROOT=path.join(__dirname,'..','web');
function files(dir){const out=[];for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory()){if(!/^(vendor|lib|node_modules|fonts)$/.test(e.name))out.push(...files(f));}else if(e.name.endsWith('.js'))out.push(f);}return out;}
test('every web script parses (as an ES module)',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-websyntax-'));const bad=[];
 try{files(ROOT).forEach((f,i)=>{const copy=path.join(tmp,i+'.mjs');fs.copyFileSync(f,copy);const r=spawnSync(process.execPath,['--check',copy],{encoding:'utf8'});if(r.status!==0)bad.push(path.relative(ROOT,f)+': '+String(r.stderr).split(/\r?\n/).find(l=>/SyntaxError/.test(l)));});}
 finally{fs.rmSync(tmp,{recursive:true,force:true});}
 assert.deepEqual(bad,[]);
});