// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{pe}=require('./draw-sites.cjs');
const source=fs.readFileSync(path.join(__dirname,'../../native/megulithook/CmvsDrawSig.h'),'utf8');
const sha256=/Sha256\[\]="([a-f0-9]{64})"/.exec(source)[1],fileBytes=+(/FileBytes=(\d+)/.exec(source)[1]);
const rvas=['Main','Alternate'].map(n=>Number(new RegExp(n+'Rva=(0x[0-9a-f]+)').exec(source)[1]));
const patterns=['Main','Alternate'].map(n=>Buffer.from(new RegExp(n+'Entry\\[\\]=\\{([^}]+)\\}').exec(source)[1].split(',').map(x=>Number(x.trim()))));
function find(code){return patterns.flatMap((p,entry)=>{const sites=[];for(let i=code.indexOf(p);i>=0;i=code.indexOf(p,i+1))sites.push({entry,offset:i,thisRegister:'ecx',stackWords:2,textArg:1,calleePop:8});return sites;});}
function validPair(sites,base=0){return rvas.every((rva,entry)=>{const matches=sites.filter(s=>s.entry===entry);return matches.length===1&&matches[0].va-base===rva;});}
function scanFile(file){const bytes=fs.readFileSync(file);if(bytes.length!==fileBytes||crypto.createHash('sha256').update(bytes).digest('hex')!==sha256)return {pinned:false,sites:[]};const image=pe(bytes),sites=image.code.flatMap(c=>find(c.bytes).map(s=>({...s,va:c.va+s.offset})));return {pinned:validPair(sites,image.base),base:image.base,sites};}
module.exports={find,validPair,scanFile,sha256,fileBytes,rvas,patterns};
