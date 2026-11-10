// SPDX-License-Identifier: GPL-3.0-or-later
/* E383 Settings tutorials: every page guide is complete in three languages, its links open (bridge allowlist) and its buttons exist */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const web=path.join(__dirname,'..','web');
test('every settings guide has zh, en and ja text, allowed links and known actions',async()=>{
 const g=await import(pathToFileURL(path.join(web,'settings-guides.js')).href);
 assert.deepEqual(g.guideSections().sort(),['anki','dictionary','online','speech','translation']);
 const source=fs.readFileSync(path.join(web,'settings-guides.js'),'utf8'),bridge=fs.readFileSync(path.join(__dirname,'..','services','bridge.cjs'),'utf8');
 for(const section of g.guideSections())for(const locale of ['zh','en','ja']){const text=g.guideText(section,locale);assert.ok(text.length>40,section+' '+locale);}
 const links=[...source.matchAll(/^\s+([a-z]+): 'https:\/\/([^/']+)/gm)];assert.ok(links.length>=6);
 for(const [,,host] of links)assert.ok(bridge.includes(`'${host}'`),'open_source allows '+host);
 const used=new Set([...source.matchAll(/\{(link|act):([a-zA-Z]+)\}/g)].map(m=>m[1]+':'+m[2]));
 for(const id of used){const [kind,name]=id.split(':');const table=kind==='link'?'LINK_LABEL':'ACTIONS';const start=source.indexOf('const '+table+' = {'),end=source.indexOf('};',start);assert.ok(start>0&&source.slice(start,end).includes('  '+name+': T('),id);}
 const settings=fs.readFileSync(path.join(web,'settings.js'),'utf8');for(const act of ['voice','reading','ankiCheck'])assert.match(settings,new RegExp(act+':'),'settings wires '+act);
});
test('runtime mirror template: dl.megulit.com gets tag and file, GitHub proxies the whole URL',()=>{
 const {mirrorUrl}=require('../core/runtime-packs.cjs'),u='https://github.com/ilynthn/MeguLit/releases/download/runtime-v1.0.0/MeguLit-runtime-voice-v1.0.0.zip';
 assert.equal(mirrorUrl('https://dl.megulit.com/files/{tag}/{file}',u),'https://dl.megulit.com/files/runtime-v1.0.0/MeguLit-runtime-voice-v1.0.0.zip');
 assert.equal(mirrorUrl('https://gh-proxy.com/{url}',u),'https://gh-proxy.com/'+u);
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'..','setup','runtime.json'),'utf8').replace(/^﻿/,''));
 assert.equal(manifest.mirrors[0],'https://dl.megulit.com/files/{tag}/{file}');
});
