'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function forExecutable(executable){
 if(!executable)return {};
 let fd;try{
  const dat=path.join(path.dirname(executable),'dat');
  if(!fs.existsSync(dat)||!fs.readdirSync(dat).some(n=>/\.dbs$/i.test(n)))return {};
  const h=crypto.createHash('sha256'),buf=Buffer.alloc(1<<20);fd=fs.openSync(executable,'r');
  for(let n;(n=fs.readSync(fd,buf,0,buf.length,null))>0;)h.update(buf.subarray(0,n));
  fs.closeSync(fd);fd=undefined;
  const version=require('../core/profiles/seed.cjs').versionOf(h.digest('hex'));
  const id=version?.settings?.source?.siglusDbsNameColumn;
  return Number.isSafeInteger(id)&&id>=0&&id<=0x7fffffff?{siglusDbsNameColumn:id}:{};
 }catch(error){throw Object.assign(Error('JAPANESE_RESTORE_IDENTITY_UNVERIFIED'),{detail:String(error?.message||error).slice(0,200)});}finally{if(fd!==undefined)try{fs.closeSync(fd);}catch{}}
}
module.exports={forExecutable};
