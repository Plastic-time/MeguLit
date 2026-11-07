// SPDX-License-Identifier: GPL-3.0-or-later
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const baseline=JSON.parse(fs.readFileSync(path.join(root,'migration','baseline-20261103','baseline.json'),'utf8'));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const changed=[];
for(const item of baseline.preservedFiles){if(item.link)continue;const file=path.join(root,'preserved',item.file);if(!fs.existsSync(file)||hash(file)!==item.sha256)changed.push(item.file);}
const sourceUntouched=hash(path.join(baseline.source,'ToMe.exe'))===baseline.sourceLauncherSha256&&hash(path.join(baseline.source,'runtime','engine','ToMe.exe'))===baseline.sourceEngineSha256;
const result={preservedFiles:baseline.preservedFiles.length,changed,sourceExecutableHashesUnchanged:sourceUntouched,oldEnginePresent:fs.existsSync(path.join(root,'runtime','engine','ToMe.exe'))||fs.existsSync(path.join(root,'runtime','engine','tomoyo.exe'))};
fs.writeFileSync(path.join(root,'validation','baseline-verification.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result));if(changed.length||!sourceUntouched||result.oldEnginePresent)process.exitCode=1;
