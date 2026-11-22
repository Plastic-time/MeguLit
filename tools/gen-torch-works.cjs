// Derive version-to-work evidence only from the bundled Seed manifests.
'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..','The Seed');
const matches=new Map();
for(const file of fs.readdirSync(root,{recursive:true}).filter(file=>path.basename(file)==='game.json')){
 const game=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
 for(const key of game.builds||[]){
  if(!/^[a-f0-9]{64}$/.test(key))continue;
  if(!matches.has(key))matches.set(key,new Set());
  matches.get(key).add(game.prints?.vndb||null);
 }
}
const works=Object.fromEntries([...matches].sort().flatMap(([key,ids])=>{
 const [vn]=ids;
 return ids.size===1&&/^v[1-9]\d*$/.test(vn)?[[key,vn]]:[];
}));
fs.writeFileSync(path.resolve(__dirname,'../relay/src/torch-works.json'),JSON.stringify(works,null,2)+'\n');
