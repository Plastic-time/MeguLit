// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {pe}=require('./draw-sites.cjs');
function signature(){const s=fs.readFileSync(path.join(__dirname,'../../native/megulithook/IgaTextSig.h'),'utf8');const array=name=>s.match(new RegExp('char '+name+'\\[\\]=\\{([^}]+)'))[1].split(',').map(Number);return {entry:Buffer.from(array('Entry')),fixed:array('Fixed')};}
function find(bytes){const {entry,fixed}=signature(),out=[];for(let at=0;at<=bytes.length-entry.length;at++){let same=true;for(let i=0;i<entry.length;i++)if(fixed[i]&&bytes[at+i]!==entry[i]){same=false;break;}if(same)out.push(at);}return out;}
function image(bytes){const p=pe(bytes),out=[];for(const s of p.code)for(const at of find(s.bytes))out.push(s.va-p.base+at);return out;}
module.exports={signature,find,image};
