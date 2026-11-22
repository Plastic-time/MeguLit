'use strict';
/* Read-only evidence from local release tags; an absent tag is explicitly unverified */
const {spawnSync}=require('node:child_process');
const git=(...args)=>{const r=spawnSync('git',args,{encoding:'utf8',windowsHide:true});return r.status===0?r.stdout:null;};
const files=['web/update-notice.js','web/feedback-ui.js','services/update.cjs','services/hot-update.cjs','services/feedback.cjs','services/probe-full.cjs','services/adapter-sample.cjs','services/adapter-contrib.cjs','services/probe-auto.cjs'];
const rows=[];
for(let patch=16;patch<=22;patch++){
 const version='1.4.'+patch,tag='v'+version,commit=git('rev-parse','--verify','refs/tags/'+tag+'^{commit}')?.trim();
 if(!commit){rows.push({version,confirmed:false,reason:'No local release tag. Neighboring releases are not evidence for this installed build.'});continue;}
 const evidence={};for(const file of files){const src=git('show',tag+':'+file);if(src===null)continue;evidence[file]={blob:git('rev-parse',tag+':'+file).trim(),lines:src.split(/\r?\n/).flatMap((line,i)=>/minVersion|UPDATE_REQUIRED|data-upd-close|const close=|api\('update_check|show\(info|fits\(|return \{version:|site_updates|page=|page =|x-megulit-version|r.status<500|RETRY_MIN|RETRY_MAX/.test(line)?[{line:i+1,text:line.slice(0,500)}]:[])};}
 const notice=git('show',tag+':web/update-notice.js')||'',hot=git('show',tag+':services/hot-update.cjs')||'';
 rows.push({version,confirmed:true,commit,forcedModal:notice.includes('minVersion')||notice.includes('UPDATE_REQUIRED')||notice.includes('info.required'),dismissible:notice.includes('data-upd-close'),hotRequiresExactFrom:hot.includes('===hot.from')&&hot.includes('startsWith(hot.fromDigest)'),evidence});
}
process.stdout.write(JSON.stringify(rows,null,2)+'\n');
