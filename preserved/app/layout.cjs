'use strict';
// Folder layout of ToMe.V3. Every module asks here instead of assuming files sit next to it.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const at=(...p)=>path.join(root,...p);
const shared=at('runtime');
const layout={
 root,app:__dirname,
 // The launcher was renamed ToMe.V3.exe -> ToMe.exe; whichever exists is used (the key vault runs it).
 launcher:[at('ToMe.exe'),at('ToMe.V3.exe')].find(p=>fs.existsSync(p))||at('ToMe.exe'),
 native:at('native'),config:at('config'),logs:at('logs'),cache:at('cache'),
 runtime:shared,engine:path.join(shared,'engine'),reading:path.join(shared,'reading'),hook:at('runtime','hook'),
 python:path.join(shared,'python','python.exe'),aivis:path.join(shared,'aivis','run.exe'),
};
for(const dir of [layout.config,layout.logs,layout.cache])try{fs.mkdirSync(dir,{recursive:true});}catch{}
module.exports=layout;
