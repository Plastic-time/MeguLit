// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path');
function libraryOnly(root){
 try{return JSON.parse(fs.readFileSync(path.join(root,'data','config','library.json'),'utf8').replace(/^\uFEFF/,'')).libraryOnly===true;}
 catch(error){if(error.code==='ENOENT')return false;throw Error('LIBRARY_MODE_UNAVAILABLE');}
}
module.exports={libraryOnly};
