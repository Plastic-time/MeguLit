'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const wait=async(m,phase)=>{for(let i=0;i<100;i++){if(m.status().phase===phase)return;await new Promise(r=>setTimeout(r,20));}};
test('one-click Anki: an existing Anki skips the download; a download that fails the checksum is never installed',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'anki-inst-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'logs'));const appdata=process.env.APPDATA;process.env.APPDATA=root;t.after(()=>{process.env.APPDATA=appdata;});/* AnkiConnect lands in a temp folder, never the real profile */
 delete require.cache[require.resolve('../core/anki-installer.cjs')];let m=require('../core/anki-installer.cjs');
 assert.equal(m.PACKAGE.size,201621504);assert.match(m.SOURCES[0],/^https:\/\/dl\.megulit\.com\/files\/anki\//);assert.match(m.SOURCES[1],/^https:\/\/cn-dl\.megulit\.com\/files\/anki\//);assert.match(m.SOURCES[2],/^https:\/\/github\.com\/ankitects\/anki\/releases\/download\//);
 let fetched=0;m.start(root,{find:()=>'C:\Anki\anki.exe',fetcher:async()=>{fetched++;throw Error('no');}});await wait(m,'done');
 assert.equal(m.status().phase,'done');assert.equal(fetched,0,'installed already: nothing downloaded');
 delete require.cache[require.resolve('../core/anki-installer.cjs')];m=require('../core/anki-installer.cjs');
 const bad=()=>new Response(new Uint8Array(1024));m.start(root,{find:()=>'',fetcher:async()=>bad()});await wait(m,'error');
 assert.equal(m.status().phase,'error');assert.match(m.status().error,/ANKI_DOWNLOAD_FAILED/);
 assert.equal(fs.existsSync(path.join(root,'data','cache','anki-installer',m.PACKAGE.name)),false,'a wrong file is never kept');
});
