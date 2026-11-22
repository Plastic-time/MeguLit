'use strict';
/* 2026-11-15 (user: 我不是说了让所有幽灵窗口置到最底吗): a validation run put a dark window over the desktop. Console programs
   (GalWindowBridge self-tests, csc, harnesses, powershell, python) started without windowsHide open their own console window
   when the test runner has none. Every child process a test starts is hidden; Edge only runs headless; the bridge's
   self-test modes never adopt, move or raise a window of another process; fixtures with real windows stay off screen
   or cloaked. Static check, opens nothing. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const dir=__dirname,root=path.join(dir,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const files=[...fs.readdirSync(dir).filter(f=>f.endsWith('.cjs')).map(f=>path.join(dir,f)),...fs.readdirSync(path.join(dir,'helpers')).filter(f=>f.endsWith('.cjs')).map(f=>path.join(dir,'helpers',f))];
/* the argument text of a call starting at the opening parenthesis */
function call(src,open){let depth=0,quote='';for(let i=open;i<src.length;i++){const c=src[i];if(quote){if(c==='\\'){i++;continue;}if(c===quote)quote='';continue;}
 if(c==="'"||c==='"'||c==='`'){quote=c;continue;}if(c==='(')depth++;else if(c===')'&&--depth===0)return src.slice(open,i+1);}return src.slice(open);}

test('every child process a validation test starts is hidden (no console or app window on the user\'s desktop)',()=>{
 const missing=[];
 for(const file of files){const src=fs.readFileSync(file,'utf8');const re=/\b(spawnSync|spawn|execFileSync|execFile|execSync|exec)\(/g;let m;
  while((m=re.exec(src))){const args=call(src,m.index+m[1].length);const first=args.slice(1,80);
   if(/^[ \t]*\{/.test(src.slice(m.index+m[1].length+args.length)))continue; // mock method declaration
   if(/^\s*(process\.execPath|'git'|"git"|cmd\b|command\b)/.test(first)&&!/^\s*cmd\b/.test(first))continue;
   if(/^\s*edgePath\b|msedge/.test(first)){if(!/--headless/.test(args)&&!/--headless/.test(src))missing.push(path.basename(file)+': Edge without --headless');continue;}
   if(/windowsHide\s*:\s*true/.test(args))continue;
   if(m[1]==='exec'&&!/child_process|\bcp\b|require\('node:child_process'\)/.test(src.slice(Math.max(0,m.index-200),m.index)))continue;
   missing.push(path.basename(file)+':'+src.slice(0,m.index).split('\n').length+' '+args.slice(0,90).replace(/\s+/g,' '));}}
 assert.deepEqual(missing,[],'spawned without windowsHide');
});

test('bridge self-tests never touch another process\'s window; the policy fixture is created off screen and never shown',()=>{
 const cs=read('native/GalWindowBridge.cs');
 assert.match(cs,/static void FindOverlay\(\)\{\s*\/\/[^\n]*\n\s*if\(OverlayPid<=0\)\{Overlay=IntPtr\.Zero;return;\}/,'no overlay process: no window is adopted (the mode self-test toggles translation mode)');
 assert.match(cs,/new System\.Windows\.Forms\.Form\{StartPosition=System\.Windows\.Forms\.FormStartPosition\.Manual,Location=new System\.Drawing\.Point\(-32000,-32000\),ShowInTaskbar=false\}\)\{fixture\.Text="MeguLit hidden game fixture";/);
 const policy=cs.slice(cs.indexOf('"--game-window-policy-self-test"'),cs.indexOf('"--page-locator-ocr-test"'));assert.doesNotMatch(policy,/\.Show\(|ShowWindow/,'fixture never shown');
 const harness=fs.readFileSync(path.join(dir,'shot-overlay-harness.cs'),'utf8');
 for(const cls of ['Game','Overlay']){const body=harness.slice(harness.indexOf('sealed class '+cls+':Form'));
  assert.match(body,/ShowWithoutActivation\{get\{return true;\}\}/,cls+' never activates');assert.match(body,/OnHandleCreated\(EventArgs e\)\{Cloak\(Handle\);/,cls+' cloaked: never drawn on the monitor');}
 const ghost=read('validation/no-ghost-windows.test.cjs');assert.match(ghost,/CreateWindowExW\(0x08000080,"STATIC",a\[2\],0x90000000,-4000,-4000,/,'ghost fixtures off screen, no activation');
});
