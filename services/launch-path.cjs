'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function compatiblePath(root,exe,{create=true}={}){
 if(!/[^\x20-\x7e]/.test(path.dirname(exe)))return exe;
 const dir=path.dirname(exe),alias=path.join(root,'cache','game-launch',crypto.createHash('sha256').update(dir.toLowerCase()).digest('hex').slice(0,20));
 if(!fs.existsSync(alias)){if(!create)return exe;fs.mkdirSync(path.dirname(alias),{recursive:true});fs.symlinkSync(dir,alias,'junction');}
 const actual=fs.realpathSync(alias);if(actual.toLowerCase()!==fs.realpathSync(dir).toLowerCase())throw Error('GAME_LAUNCH_PATH_CONFLICT');
 return path.join(alias,path.basename(exe));
}
function canonical(exe,{root,pid,birth}={}){let actual;try{actual=fs.realpathSync(exe);}catch{return exe;}if(root&&Number.isSafeInteger(pid)&&pid>0&&typeof birth==='string'&&birth){const O=require('../core/owner-tests.cjs');for(const engine of ['rgss','unity','artemis']){const token=O.lookup(root,actual,engine);if(token&&O.bind(token,{pid,birth})&&O.matches(token,{pid,birth})){const original=O.identity(token,actual);if(original)return original;}}}return actual;}
module.exports={compatiblePath,canonical};
