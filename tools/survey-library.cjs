// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Read-only survey of every library game: engine family (from files on disk), Japanese data / restore state, how the
// text is stored, and the embed status MeguLit has recorded. Writes validation/library-survey.json and prints a table.
// Usage: runtime\node.exe tools\survey-library.cjs
const fs=require('node:fs'),path=require('node:path'),{DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..'),db=new DatabaseSync(path.join(root,'data','megulit.sqlite'),{readOnly:true});
const jr=require('../core/japanese-restore.cjs');
const list=d=>{try{return fs.readdirSync(d);}catch{return [];}};
function engine(dir,exe){
 const lower=[];const walk=(d,depth)=>{for(const e of (()=>{try{return fs.readdirSync(d,{withFileTypes:true});}catch{return [];}})()){lower.push(e.name.toLowerCase());if(e.isDirectory()&&depth<2)walk(path.join(d,e.name),depth+1);}};walk(dir,0);
 const has=re=>lower.some(x=>re.test(x)),name=path.basename(exe).toLowerCase();
 if(has(/\.mpk$/))return 'MAGES (MPK)';
 if(has(/\.cpz$/))return 'CatSystem2 (CS2)';
 if(has(/\.ypf$/))return 'YU-RIS';
 if(has(/\.pfs(\.\d+)?$/))return 'Artemis (PFS)';
 if(has(/\.cpk$/))return 'CRI CPK (Spike)';
 if(has(/^scene.*\.pck$/)||/siglus/.test(name))return 'Siglus';
 if(has(/\.xp3$/))return 'KiriKiri';
 if(has(/_data$/)&&fs.existsSync(path.join(dir,path.basename(exe,'.exe')+'_Data')))return has(/^gameassembly\.dll$/)?'Unity (IL2CPP)':'Unity (Mono)';
 if(has(/^data\.arc$|^sysgrp\.arc$|^bgi\.gdb$/)||has(/\._bp$/))return 'BGI';
 if(has(/\.ypf$/)||has(/^pac\.ypf$/))return 'YU-RIS';
 if(has(/\.npk$/))return 'Nitroplus (NPK)';
 if(has(/\.paz$/))return 'minori (PAZ)';
 if(has(/\.mpk$/)||has(/^c0data\.mpk$/))return 'MAGES';
 if(has(/\.cpz$/))return 'CatSystem2 (CS2)';
 if(has(/\.int$/))return 'ExHIBIT / int (Frontwing)';
 if(has(/\.pak$/)&&has(/^lvns|grp\.pak$/))return 'Leaf/AQUAPLUS';
 if(has(/\.wad$/))return 'Spike (WAD)';
 if(has(/\.rpa$/)||fs.existsSync(path.join(dir,'renpy')))return "Ren'Py";
 if(has(/^nw\.dll$|^package\.nw$/)||fs.existsSync(path.join(dir,'www')))return 'RPG Maker MV/MZ / NW.js';
 if(has(/\.ain$/)||has(/\.ald$/)||has(/\.afa$/))return 'AliceSoft (System4)';
 if(has(/\.dat$/)&&has(/^arc\d+\.dat$/))return 'Artemis/other ARC';
 if(has(/\.pac$/))return 'PAC (various)';
 return 'unknown';
}
const games=db.prepare('SELECT id,title,executable,original FROM games WHERE removed_at IS NULL ORDER BY title').all();
const seen=new Set(),rows=[];
for(const g of games){
 const dir=g.executable?path.dirname(g.executable):'';const key=dir.toLowerCase();if(!dir||seen.has(key))continue;seen.add(key);
 const exists=fs.existsSync(dir);let restore={state:'missing'};
 if(exists)try{restore=jr.detect(dir);}catch(e){restore={state:'error',error:e.message};}
 let original={};try{original=JSON.parse(g.original||'{}');}catch{}
 const steam=/steamapps[\\/]common/i.test(dir);
 const langFiles=exists?list(dir).filter(n=>/(^|[_.-])(jp|ja|jpn|japanese|en|eng|english|zh|cn|chs|cht|sc|tc|chinese)([_.-]|$)/i.test(n)).slice(0,8):[];
 rows.push({title:g.title,dir,exists,steam,engine:exists?engine(dir,g.executable):'-',restore:restore.state,restoreAdapter:restore.adapter||'',languageFiles:langFiles,originalExe:original.executable||''});
}
fs.writeFileSync(path.join(root,'validation','library-survey.json'),JSON.stringify({at:new Date().toISOString(),games:rows},null,1));
for(const r of rows)console.log([r.engine.padEnd(24),r.restore.padEnd(11),r.steam?'Steam':'     ',r.title].join(' | '),r.languageFiles.length?' ['+r.languageFiles.join(', ')+']':'');
console.log(rows.length+' game folders');
