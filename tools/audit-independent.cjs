// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');const root=path.resolve(__dirname,'..'),errors=[],visited=new Set(),compatibilityProtocols=[];
// The original Anki module's SQL-shaped messages are handled by our canonical-data adapter.
// Keep the allowlist exact; a newly introduced SQL plugin caller must still fail this audit.
const sqlAdapterFiles=new Set(['services/legacy-reader-sql.cjs','services/reader.cjs','web/reader/bootstrap.js','web/reader/host-transport.js','web/reader/modules/anki-sync.js']);
function visit(file){file=path.resolve(file);if(visited.has(file))return;visited.add(file);if(!fs.existsSync(file)){errors.push('MISSING:'+path.relative(root,file));return;}if(!/\.(c?js)$/.test(file))return;const source=fs.readFileSync(file,'utf8');try{if(!/^\s*(?:import|export) /m.test(source))new vm.Script(source,{filename:file});}catch(e){errors.push('SYNTAX:'+path.relative(root,file)+':'+e.message);}
 for(const match of source.matchAll(/require\(['"](\.[^'"]+)['"]\)/g))visit(path.resolve(path.dirname(file),match[1]));
 for(const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\()(['"])(\.[^'"]+)\1/g))visit(path.resolve(path.dirname(file),match[2]));
 const relative=path.relative(root,file).replaceAll('\\','/');
 if(/runtime[\\/]engine|com\.daishi\.tomoyo[\\/]|hidden-startup[\\/]/.test(source))errors.push('UPSTREAM_RUNTIME_REFERENCE:'+relative);
 if(/plugin:sql\|/.test(source)){if(sqlAdapterFiles.has(relative))compatibilityProtocols.push(relative);else errors.push('UNREVIEWED_SQL_PROTOCOL:'+relative);}
}
for(const file of ['services/server.cjs','services/bridge.cjs','services/runtime.cjs','services/reader.cjs','web/reader/bootstrap.js','web/reader/host-startup.js'])visit(path.join(root,file));
const modules=JSON.parse(fs.readFileSync(path.join(root,'web/reader/modules.json'),'utf8'));for(const name of modules)visit(path.join(root,'web/reader/modules',name+'.js'));
for(const file of ['runtime/engine/ToMe.exe','runtime/engine/tomoyo.exe','source/hidden-startup/checkout'])if(fs.existsSync(path.join(root,file)))errors.push('UPSTREAM_PRESENT:'+file);
const result={checkedAt:new Date().toISOString(),filesChecked:visited.size,customReaderModules:modules.length,errors,compatibilityProtocols,sqlProtocolTarget:'services/legacy-reader-sql.cjs -> own canonical SQLite; no Tauri SQL plugin',upstreamRuntimeRequired:errors.length?null:false,scope:'Reachable service requires and reader ESM imports, script syntax and prohibited upstream host/SQL paths; not a game or visual test'};
fs.writeFileSync(path.join(root,'validation/independence-audit.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(errors.length)process.exitCode=1;
