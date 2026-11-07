// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path');
// System4 translations may replace CP932 script strings with CP936 strings.
// Only an explicit patch declaration in this engine's own configuration counts;
// Chinese directory names and translated library titles are not evidence.
function chineseSystem4Patch(exe){
 try{
  const ini=path.join(path.dirname(exe),'AliceStart.ini'),stat=fs.statSync(ini);
  if(!stat.isFile()||stat.size>65536)return false;
  const bytes=fs.readFileSync(ini);
  for(const encoding of ['utf-8','gbk']){
   const title=/^\s*GameName\s*=\s*"([^"\r\n]+)"/mi.exec(new TextDecoder(encoding).decode(bytes))?.[1];
   if(title&&/(?:汉化(?:版|组)|中文(?:版|补丁))/.test(title))return true;
  }
 }catch{}
 return false;
}
module.exports={chineseSystem4Patch};
