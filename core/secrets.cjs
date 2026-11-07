'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
class SecretStore{
 // The Windows (DPAPI) vault is the launcher run with --vault. When the launcher cannot run at all (renamed or missing)
 // that is reported as unavailable, separately from a key file this Windows account really cannot decrypt.
 constructor(folder,crypt,launcher=path.join(folder,'ToMe.exe'),options={}){this.folder=folder;this.crypt=crypt||((action,value)=>{const p=spawnSync(launcher,['--vault',action],{input:value,encoding:'utf8',windowsHide:true,timeout:10000});if(p.error||!fs.existsSync(launcher)){const e=Error('Windows 密钥存储不可用（无法运行 '+path.basename(launcher)+'），未保存密钥');e.code='VAULT_UNAVAILABLE';throw e;}if(p.status!==0)throw Error('Windows 密钥存储不可用，未保存密钥');return p.stdout.trim();});this.values={};const file=path.join(folder,'secrets.dpapi');if(options.load!==false&&fs.existsSync(file)){try{this.values=JSON.parse(this.crypt('open',fs.readFileSync(file,'utf8')));}catch(e){if(e.code==='VAULT_UNAVAILABLE')throw e;throw Error('无法解密已保存的密钥，请使用原 Windows 账户，或移走 secrets.dpapi 后重新配置');}}}
 set(base,key){if(typeof key!=='string'||key.length>10000||/[\r\n]/.test(key))throw Error('无效密钥');const next={...this.values,[base]:key.trim()},file=path.join(this.folder,'secrets.dpapi'),temp=file+'.tmp';fs.writeFileSync(temp,this.crypt('seal',JSON.stringify(next)));fs.renameSync(temp,file);this.values=next;}
 entries(){return Object.entries(this.values);}
}
module.exports={SecretStore};
