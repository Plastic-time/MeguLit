'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function compatiblePath(root,exe,{create=true}={}){
 if(!/[^\x20-\x7e]/.test(path.dirname(exe)))return exe;
 const dir=path.dirname(exe),alias=path.join(root,'cache','game-launch',crypto.createHash('sha256').update(dir.toLowerCase()).digest('hex').slice(0,20));
 if(!fs.existsSync(alias)){if(!create)return exe;fs.mkdirSync(path.dirname(alias),{recursive:true});fs.symlinkSync(dir,alias,'junction');}
 const actual=fs.realpathSync(alias);if(actual.toLowerCase()!==fs.realpathSync(dir).toLowerCase())throw Error('GAME_LAUNCH_PATH_CONFLICT');
 return path.join(alias,path.basename(exe));
}
function canonical(exe){try{return fs.realpathSync(exe);}catch{return exe;}}
module.exports={compatiblePath,canonical};
