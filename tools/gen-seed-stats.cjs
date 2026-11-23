/* Counts the seeds under "The Seed/" (one game.json per game, one versions/<hash>.json per exe version) and writes web/the-seed-stats.json; run before a build. */
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..','The Seed');let games=0,versions=0;
const walk=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);
 if(e.isDirectory())walk(p);else if(e.name==='game.json')games++;else if(e.name.endsWith('.json')&&path.basename(dir)==='versions')versions++;}};
walk(root);
fs.writeFileSync(path.join(__dirname,'..','web','the-seed-stats.json'),JSON.stringify({games,versions})+'\n');
console.log(JSON.stringify({games,versions}));
