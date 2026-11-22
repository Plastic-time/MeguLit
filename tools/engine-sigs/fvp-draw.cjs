// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{pe}=require('./draw-sites.cjs');
const source=fs.readFileSync(path.join(__dirname,'../../native/megulithook/FvpDrawSig.h'),'utf8');
const builds=[...source.matchAll(/\{"([a-f0-9]{64})",(\d+),(0x[0-9a-f]+)\}/g)].map(m=>({sha256:m[1],fileBytes:+m[2],rva:Number(m[3])}));
const pattern=Buffer.from(/Entry\[\]=\{([^}]+)\}/.exec(source)[1].split(',').map(x=>Number(x.trim())));
function find(code){const sites=[];for(let i=code.indexOf(pattern);i>=0;i=code.indexOf(pattern,i+1))sites.push({offset:i,thisRegister:'ecx',stackWords:1,textArg:1,calleePop:4,event:'append'});return sites;}
function validSite(build,sites,base=0){return Number.isInteger(build)&&build>=0&&build<builds.length&&sites.length===1&&sites[0].va-base===builds[build].rva;}
function scanFile(file){const bytes=fs.readFileSync(file),sha256=crypto.createHash('sha256').update(bytes).digest('hex'),build=builds.findIndex(b=>b.fileBytes===bytes.length&&b.sha256===sha256);if(build<0)return {pinned:false,sites:[]};const image=pe(bytes),sites=image.code.flatMap(c=>find(c.bytes).map(s=>({...s,va:c.va+s.offset})));return {pinned:validSite(build,sites,image.base),build,base:image.base,sites};}
module.exports={find,validSite,scanFile,builds,pattern};
