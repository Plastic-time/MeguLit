'use strict';
// Kana voices (user, 2026-11-09): every kana listed for a recorded voice has its file, named in ASCII (Unicode code
// points) so the release zip, the updater and any system code page handle it; credits ship with the recordings.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const dir=path.join(__dirname,'..','web','kana','audio');
test('each recorded kana has an ASCII-named file and the credits are present',()=>{
 const src=fs.readFileSync(path.join(dir,'index.js'),'utf8'),data=JSON.parse(src.slice(src.indexOf('{'),src.lastIndexOf('}')+1));
 for(const voice of ['female','male']){
  const kana=data[voice].split(',').filter(Boolean);assert.ok(kana.length>=70,voice+' has the plain and voiced kana');
  for(const k of kana){const name=[...k].map(c=>c.codePointAt(0).toString(16).padStart(4,'0')).join('-')+'.'+data.ext;assert.ok(fs.existsSync(path.join(dir,voice,name)),voice+' '+k+' '+name);}
  for(const f of fs.readdirSync(path.join(dir,voice)))assert.match(f,/^[0-9a-f-]+\.ogg$/,'ASCII file name');
 }
 assert.match(fs.readFileSync(path.join(dir,'CREDITS.md'),'utf8'),/CC BY 4\.0[\s\S]*Public domain|Public domain[\s\S]*CC BY 4\.0/);
});
