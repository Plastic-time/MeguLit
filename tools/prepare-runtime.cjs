// SPDX-License-Identifier: GPL-3.0-or-later
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),source=process.argv[2];
const config=path.join(root,'data','config');fs.mkdirSync(config,{recursive:true});
for(const file of fs.readdirSync(path.join(root,'migration','baseline-20261103','config'))){
 const src=path.join(root,'migration','baseline-20261103','config',file),dst=path.join(config,file);
 if(fs.statSync(src).isFile()&&!fs.existsSync(dst))fs.copyFileSync(src,dst);
}
for(const dir of ['python','reading','aivis','llama']){
 const src=path.join(source,'runtime',dir),dst=path.join(root,'runtime',dir);
 if(fs.existsSync(src)&&!fs.existsSync(dst))fs.cpSync(src,dst,{recursive:true,filter:file=>!file.includes('__pycache__')});
}
const dictionaries=path.join(root,'runtime','dictionaries');fs.mkdirSync(dictionaries,{recursive:true});
for(const file of ['jmdict.json','jmdict.english.json','deconjugation_rules.json','unidic.dic.zst','unidic-NOTICE','unidic-BSD']){
 const src=path.join(source,'runtime','engine','resources',file),dst=path.join(dictionaries,file);
 if(fs.existsSync(src)&&!fs.existsSync(dst))fs.copyFileSync(src,dst);
}
const models=path.join(source,'models');if(fs.existsSync(models)&&!fs.existsSync(path.join(root,'models')))fs.cpSync(models,path.join(root,'models'),{recursive:true});
console.log(JSON.stringify({runtimePrepared:true,configFiles:fs.readdirSync(config).length}));
