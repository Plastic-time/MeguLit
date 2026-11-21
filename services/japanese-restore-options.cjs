'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
function forExecutable(executable){
 if(!executable)return {};
 let fd;try{
  const h=crypto.createHash('sha256'),buf=Buffer.alloc(1<<20);fd=fs.openSync(executable,'r');
  for(let n;(n=fs.readSync(fd,buf,0,buf.length,null))>0;)h.update(buf.subarray(0,n));
  const version=require('../core/profiles/seed.cjs').versionOf(h.digest('hex'));
  const id=version?.settings?.source?.siglusDbsNameColumn;
  return Number.isSafeInteger(id)&&id>=0&&id<=0x7fffffff?{siglusDbsNameColumn:id}:{};
 }catch{return {};}finally{if(fd!==undefined)fs.closeSync(fd);}
}
module.exports={forExecutable};
