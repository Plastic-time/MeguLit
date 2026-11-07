// Preserve existing user data while moving the active installation to MeguLit.
'use strict';
const fs=require('node:fs'),path=require('node:path'),{DatabaseSync}=require('node:sqlite');
const databaseName='megulit.sqlite';
function databasePath(root){
 const folder=path.join(root,'data'),target=path.join(folder,databaseName),legacy=path.join(folder,'tome.sqlite');
 if(!fs.existsSync(target)&&fs.existsSync(legacy)){
  // VACUUM INTO includes committed WAL contents; copying just the main file could lose recent reviews.
  const source=new DatabaseSync(legacy,{readOnly:true});try{source.exec("VACUUM INTO '"+target.replace(/'/g,"''")+"'");}finally{source.close();}
 }
 return target;
}
function relocated(value,root){
 if(typeof value==='string')return value.replace(/E:\\\\Apps\\\\ToMe_Final(?=[\\\\/]|$)/gi,root.replace(/\\/g,'\\\\')).replace(/E:[\\/]Apps[\\/]ToMe_Final(?=[\\/]|$)/gi,root);
 if(Array.isArray(value))return value.map(v=>relocated(v,root));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,relocated(v,root)]));return value;
}
function relocateConfig(root){
 const folder=path.join(root,'data'),marker=path.join(folder,'megulit-relocation.json');if(fs.existsSync(marker))return;
 const visit=dir=>{for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory()&&item.name==='config')visit(file);else if(item.isFile()&&item.name.endsWith('.json')&&item.name!=='megulit-relocation.json'){let value;try{value=JSON.parse(fs.readFileSync(file,'utf8'));}catch{continue;}const next=relocated(value,root);if(JSON.stringify(value)!==JSON.stringify(next)){const tmp=file+'.megulit.tmp';fs.writeFileSync(tmp,JSON.stringify(next,null,2));fs.renameSync(tmp,file);}}}};
 if(fs.existsSync(folder))visit(folder);fs.writeFileSync(marker,JSON.stringify({schema:1,root,migratedAt:new Date().toISOString()}));
}
module.exports={databaseName,databasePath,relocated,relocateConfig};
