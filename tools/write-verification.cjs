// SPDX-License-Identifier: GPL-3.0-or-later
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const json=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8').replace(/^\uFEFF/,''));
const manifest=json('build-manifest.json'),checks=json('validation/automated-results.json');
const executable=path.join(root,manifest.artifact||'ToMe.exe');
const nativeWindows=fs.readFileSync(path.join(root,'validation/native-window-tests.txt'),'utf8');
const nativeResult=nativeWindows.match(/test result: (\w+)\. (\d+) passed; (\d+) failed/);
const result={
 recordedAt:new Date().toISOString(),
 milestone:'Independent host, persistent runtime and reader integrated; complete feature and game verification still open',
 build:{release:true,identity:'app.tome.final',bytes:fs.statSync(executable).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(executable)).digest('hex'),manifest:json('build-manifest.json')},
 automatedChecks:{...checks,scope:'Canonical data, settings, backup, reader requests/statistics, scanner tombstones, fake Anki, persistent transport and retained custom algorithms'},
 nativeService:json('validation/service-host-check.json'),
 nativeWindowChecks:{passed:Number(nativeResult?.[2]||0),failed:Number(nativeResult?.[3]||0),success:nativeResult?.[1]==='ok',scope:'Window size persistence, landscape defaults, maximized/minimized handling and direct close policy; no visible UI'},
 settingsUI:json('validation/settings-browser-results.json'),
 independenceAudit:json('validation/independence-audit.json'),
 preservation:json('validation/baseline-verification.json'),
 nativeUI:{passed:false,stage:'Hidden WebView construction',evidence:'Chromium GPU subprocesses repeatedly exit 0xC0000022 (access denied), followed by GPU process unusable fatal error',visibleDesktopWindowsUsed:false,screenshotsProduced:false},
 gamePlaytest:{performed:false},
 fullFeatureParity:{complete:false,ledger:'FEATURE-PARITY.md'},
};
fs.writeFileSync(path.join(root,'validation','verification-summary.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({built:result.build.bytes,checks:checks.passed,preserved:result.preservation.preservedFiles,nativeServicePassed:result.nativeService.home===true,nativeUIPassed:false,gamePlaytest:false}));
