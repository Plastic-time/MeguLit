// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{pe}=require('./draw-sites.cjs');
const header=fs.readFileSync(path.join(__dirname,'../../native/megulithook/AdvhdDrawSig.h'),'utf8');
const sha256=/Sha256\[\]="([a-f0-9]{64})"/.exec(header)[1],fileBytes=+(/FileBytes=(\d+)/.exec(header)[1]);
const entryRva=Number(/EntryRva=(0x[\da-f]+)/.exec(header)[1]),pattern=Buffer.from(/Entry\[\]=\{([^}]+)\}/.exec(header)[1].split(',').map(x=>Number(x.trim())));
function find(code){const hits=[];for(let i=code.indexOf(pattern);i>=0;i=code.indexOf(pattern,i+1))hits.push({offset:i,heightRegister:'eax',stackWords:11,textArg:7});return hits;}
function scanFile(file){const bytes=fs.readFileSync(file);if(bytes.length!==fileBytes||crypto.createHash('sha256').update(bytes).digest('hex')!==sha256)return {pinned:false,sites:[]};const image=pe(bytes),sites=image.code.flatMap(c=>find(c.bytes).map(s=>({...s,va:c.va+s.offset})));return {pinned:sites.length===1&&sites[0].va-image.base===entryRva,base:image.base,sites};}
module.exports={find,scanFile,sha256,fileBytes,entryRva,pattern};
