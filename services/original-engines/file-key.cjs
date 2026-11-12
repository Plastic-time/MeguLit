// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Shared by the engine readers: a file's cache key (size|mtime, '' when missing) and a ranged read. */
const fs=require('node:fs');
const stat=file=>{try{const s=fs.statSync(file);return s.size+'|'+s.mtimeMs;}catch{return '';}};
const readAt=(file,offset,length)=>{const d=Buffer.alloc(length),fd=fs.openSync(file,'r');try{fs.readSync(fd,d,0,length,offset);}finally{fs.closeSync(fd);}return d;};
module.exports={stat,readAt};
