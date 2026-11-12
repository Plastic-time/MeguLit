// SPDX-License-Identifier: GPL-3.0-or-later
// Full uninstall (services/uninstall.cjs) on a fake install, fake game folders, fake environment folders and a fake
// registry; never touches the real MeguLit, real games, the real registry or real shortcuts.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const U=require('../services/uninstall.cjs'),swap=require('../services/patch-swap.cjs');
const sha=t=>crypto.createHash('sha256').update(t).digest('hex');
const w=(f,t)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,t);};
const r=f=>fs.readFileSync(f,'utf8');
const has=f=>fs.existsSync(f);

function fakeRegistry(init={}){
 const keys=new Map(Object.entries(init).map(([k,v])=>[k,new Map(Object.entries(v))])),log=[];
 return {log,keys,
  exists:k=>keys.has(k),values:k=>[...(keys.get(k)||new Map())].map(([name,data])=>({name,data})),
  deleteKey:k=>{log.push(['deleteKey',k]);keys.delete(k);},deleteValue:(k,n)=>{log.push(['deleteValue',k,n]);keys.get(k)?.delete(n);},
  set:(k,n,type,d)=>{log.push(['set',k,n]);if(!keys.has(k))keys.set(k,new Map());keys.get(k).set(n,String(d));}};
}
function fixture(){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-uninstall-test-')),root=path.join(base,'MeguLit 安装'),env=path.join(base,'env');
 // install folder
 w(path.join(root,'MeguLit.exe'),'exe');w(path.join(root,'web','index.html'),'ui');w(path.join(root,'runtime','node.exe'),'node');
 w(path.join(root,'cache','webview-profile','Local State'),'{}');w(path.join(root,'logs','a.log'),'log');w(path.join(root,'migration','update-rollback','MeguLit.exe'),'old');
 w(path.join(root,'data','megulit.sqlite'),'db');w(path.join(root,'data','config','secrets.dpapi'),'token');w(path.join(root,'data','config','preferences.json'),'{}');
 w(path.join(root,'data','assets','covers','c.png'),'cover');w(path.join(root,'data','preferences.json'),'{"language":"zh"}');
 w(path.join(root,'data','cache','x'),'c');w(path.join(root,'data','voice-cache','v'),'v');w(path.join(root,'data','update-installed.json'),'{}');
 w(path.join(root,'secrets','relay.txt'),'relay');
 // game A: DirectPlay/.NET compat files, an import of Japanese scripts, a leftover temp file, the player's own files
 const a=path.join(base,'Games','ゲームA');
 w(path.join(a,'game.exe'),'game');w(path.join(a,'save','01.sav'),'my save');w(path.join(a,'readme.txt'),'mine');
 w(path.join(a,'dplayx.dll'),'decline stub');w(path.join(a,'app.exe.config'),'<new/>');w(path.join(a,'old.exe.config'),'<changed/>');
 w(path.join(a,'.megulit-compat.json'),JSON.stringify({files:['dplayx.dll','app.exe.config','..\\..\\outside.dll'],kinds:{},features:[],configs:{'old.exe.config':'<original/>'}}));
 w(path.join(base,'outside.dll'),'not in the game');
 w(path.join(a,'nss.npa'),'imported jp');w(path.join(a,'system.npa'),'user edited after import');w(path.join(a,'Muramasa.exe'),'jp exe');
 w(path.join(a,'.megulit-japanese-import','nss.npa'),'zh original');w(path.join(a,'.megulit-japanese-import','system.npa'),'zh system');
 w(path.join(a,'.megulit-japanese-import','manifest.json'),JSON.stringify({version:1,adapter:'nitroplus-npa',exe:'Muramasa.exe',addedExe:true,exeSha256:sha('jp exe'),previousExe:'game.exe',
  files:[{file:'nss.npa',originalSha256:sha('zh original'),importedSha256:sha('imported jp')},{file:'system.npa',originalSha256:sha('zh system'),importedSha256:sha('imported system')}]}));
 w(path.join(a,'scene.pck.megulit-tmp'),'half written');
 // game B: switched to the Japanese original by patch swap; game C: Japanese restore (undo injected)
 const b=path.join(base,'Games','GameB'),bak=path.join(b,'clfvbak');
 w(path.join(bak,'REALLIVE.EXE'),'jp-exe');w(path.join(bak,'SEEN.TXT'),'jp-script');w(path.join(bak,'GAMEEXE.INI'),'shared');
 w(path.join(b,'clannad_sc.exe'),'zh-exe');w(path.join(b,'seen.txt'),'zh-script');w(path.join(b,'gameexe.ini'),'shared');w(path.join(b,'save.dat'),'b save');
 const c=path.join(base,'Games','GameC');w(path.join(c,'game.exe'),'c');w(path.join(c,'.megulit-japanese','manifest.json'),'{}');
 const untouched=path.join(base,'Games','NotMine');w(path.join(untouched,'x.megulit-tmp'),'not in the library');
 // environment
 const e={localAppData:path.join(env,'Local'),appData:path.join(env,'Roaming'),temp:path.join(env,'Temp'),desktop:path.join(env,'Desktop'),programs:path.join(env,'Programs')};
 w(path.join(e.localAppData,'app.megulit','EBWebView','x'),'w');w(path.join(e.localAppData,'other.app','x'),'keep');
 w(path.join(e.temp,'megulit-cx','k'),'k');w(path.join(e.temp,'megulit-anki-hidden.txt'),'h');w(path.join(e.temp,'megulit-cg-test','k'),'test dir');w(path.join(e.temp,'someone-else','k'),'k');
 for(const f of [path.join(e.desktop,'MeguLit.lnk'),path.join(e.programs,'MeguLit.lnk'),path.join(e.programs,'Uninstall MeguLit.lnk')])w(f,'lnk');
 w(path.join(e.desktop,'Other.lnk'),'lnk');
 const lnk={[path.join(e.desktop,'MeguLit.lnk')]:{target:path.join(root,'MeguLit.exe')},[path.join(e.programs,'MeguLit.lnk')]:{target:'D:\\Another\\MeguLit\\MeguLit.exe'},
  [path.join(e.programs,'Uninstall MeguLit.lnk')]:{target:'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',args:'-File "'+path.join(root,'setup','uninstall.ps1')+'" -Root "'+root+'"'}};
 const reg=fakeRegistry({[U.UNINSTALL_KEY]:{DisplayName:'MeguLit'},
  [U.PATH_VALUE_KEYS[0]]:{[path.join(root,'MeguLit.exe')]:'~ HIGHDPIAWARE','C:\\Games\\other.exe':'~ WIN7RTM'},
  [U.PATH_VALUE_KEYS[2]]:{[path.join(root,'MeguLit.exe')+'.FriendlyAppName']:'MeguLit',[path.join(root+' backup','MeguLit.exe')+'.FriendlyAppName']:'other folder'}});
 const games=[{id:'a',title:'ゲームA',dir:a},{id:'b',title:'GameB',dir:b},{id:'c',title:'GameC',dir:c},{id:'gone',title:'Removed',dir:path.join(base,'Games','Deleted')}];
 return {base,root,a,b,c,untouched,e,reg,games,readShortcuts:files=>Object.fromEntries(files.map(f=>[f,lnk[f]||{}]))};
}
const opts=f=>({root:f.root,env:f.e,registry:f.reg,readShortcuts:f.readShortcuts,games:f.games});

test('keep data: data\\ minus caches and secrets\\ stay; everything else in the install folder goes',()=>{
 const f=fixture(),p=U.plan({...opts(f),keepData:true});
 const kept=p.root.kept.map(x=>path.relative(f.root,x)).sort(),removed=p.root.remove.map(x=>path.relative(f.root,x)).sort();
 assert.deepEqual(kept,['data\\assets','data\\config','data\\megulit.sqlite','data\\preferences.json','secrets'].map(x=>x.replace(/\\/g,path.sep)));
 for(const x of ['MeguLit.exe','cache','logs','migration','runtime','web','data\\cache','data\\voice-cache','data\\update-installed.json'])assert.ok(removed.includes(x.replace(/\\/g,path.sep)),x);
 const all=U.plan({...opts(f),keepData:false});assert.equal(all.root.kept.length,0);assert.ok(all.root.remove.some(x=>path.basename(x)==='data')&&all.root.remove.some(x=>path.basename(x)==='secrets'));
 fs.rmSync(f.base,{recursive:true,force:true});
});

test('plan finds only what MeguLit placed, and only shortcuts, registry values and temp files tied to this install',()=>{
 const f=fixture();swap.toJapanese(f.root,'b',f.b,path.join(f.b,'clannad_sc.exe'));
 const p=U.plan({...opts(f),keepData:true});
 const byDir=Object.fromEntries(p.games.map(g=>[path.basename(g.dir),g.actions]));
 assert.deepEqual(Object.keys(byDir).sort(),['GameB','GameC','ゲームA'].sort());
 const compat=byDir['ゲームA'].find(x=>x.kind==='compat');assert.deepEqual(compat.files,['dplayx.dll','app.exe.config']);assert.deepEqual(compat.configs,['old.exe.config']);
 assert.ok(byDir['ゲームA'].some(x=>x.kind==='jp-import'));assert.ok(byDir['ゲームA'].some(x=>x.kind==='remove'&&x.path.endsWith('scene.pck.megulit-tmp')));
 assert.deepEqual(byDir.GameB.map(x=>x.kind),['patch-swap']);assert.deepEqual(byDir.GameC.map(x=>x.kind),['jp-restore']);
 assert.deepEqual(p.shortcuts.map(x=>path.basename(path.dirname(x))+'/'+path.basename(x)).sort(),['Desktop/MeguLit.lnk','Programs/Uninstall MeguLit.lnk']);
 assert.deepEqual(p.external.map(x=>path.basename(x.path)).sort(),['app.megulit','megulit-anki-hidden.txt','megulit-cx']);
 assert.deepEqual(p.registry.map(x=>x.op+' '+(x.name||x.key)).sort(),['deleteKey '+U.UNINSTALL_KEY,'deleteValue '+path.join(f.root,'MeguLit.exe'),'deleteValue '+path.join(f.root,'MeguLit.exe')+'.FriendlyAppName'].sort());
 assert.match(U.describe(p),/Game folders:[\s\S]*GameB[\s\S]*patch-swap/);
 fs.rmSync(f.base,{recursive:true,force:true});
});

test('execute restores the games exactly, keeps user changes, and removes the rest (keep data)',()=>{
 const f=fixture();swap.toJapanese(f.root,'b',f.b,path.join(f.b,'clannad_sc.exe'));assert.equal(r(path.join(f.b,'seen.txt')),'jp-script');
 const calls=[];const p=U.plan({...opts(f),keepData:true});
 const rep=U.execute(p,{registry:f.reg,modules:{jpRestore:()=>({restore:d=>{calls.push(d);fs.rmSync(path.join(d,'.megulit-japanese'),{recursive:true});return {restored:1,skipped:[]};}})}});
 // game A: compat files gone, changed config back, import undone except the file the player changed after it
 assert.equal(has(path.join(f.a,'dplayx.dll')),false);assert.equal(has(path.join(f.a,'app.exe.config')),false);assert.equal(r(path.join(f.a,'old.exe.config')),'<original/>');
 assert.equal(has(path.join(f.a,'.megulit-compat.json')),false);assert.equal(r(path.join(f.base,'outside.dll')),'not in the game');
 assert.equal(r(path.join(f.a,'nss.npa')),'zh original');assert.equal(r(path.join(f.a,'system.npa')),'user edited after import');
 assert.equal(has(path.join(f.a,'.megulit-japanese-import','system.npa')),true,'backup stays while a file was skipped');
 assert.equal(has(path.join(f.a,'scene.pck.megulit-tmp')),false);
 assert.equal(r(path.join(f.a,'save','01.sav')),'my save');assert.equal(r(path.join(f.a,'readme.txt')),'mine');assert.equal(r(path.join(f.a,'game.exe')),'game');
 // game B: back on the patch; game C: undo called; a folder outside the library untouched
 assert.equal(r(path.join(f.b,'seen.txt')),'zh-script');assert.equal(has(path.join(f.b,'REALLIVE.EXE')),false);assert.equal(r(path.join(f.b,'clfvbak','SEEN.TXT')),'jp-script');assert.equal(r(path.join(f.b,'save.dat')),'b save');
 assert.deepEqual(calls,[f.c]);assert.equal(r(path.join(f.untouched,'x.megulit-tmp')),'not in the library');
 // report: only the changed import file failed
 assert.deepEqual(rep.failed.map(x=>x.kind+':'+(x.skipped||[]).join(',')),['jp-import:system.npa']);
 // install folder: kept data and the note remain
 assert.deepEqual(fs.readdirSync(f.root).sort(),['data','secrets',U.KEEP_NOTE].sort());
 assert.equal(r(path.join(f.root,'data','config','secrets.dpapi')),'token');assert.equal(has(path.join(f.root,'data','cache')),false);
 assert.match(r(path.join(f.root,U.KEEP_NOTE)),/secrets\.dpapi/);
 // outside: own shortcuts, app folders, app temp files and registry entries only
 assert.equal(has(path.join(f.e.desktop,'MeguLit.lnk')),false);assert.equal(has(path.join(f.e.programs,'Uninstall MeguLit.lnk')),false);
 assert.equal(has(path.join(f.e.programs,'MeguLit.lnk')),true,'a shortcut to another install stays');assert.equal(has(path.join(f.e.desktop,'Other.lnk')),true);
 assert.equal(has(path.join(f.e.localAppData,'app.megulit')),false);assert.equal(has(path.join(f.e.localAppData,'other.app')),true);
 assert.equal(has(path.join(f.e.temp,'megulit-cx')),false);assert.equal(has(path.join(f.e.temp,'megulit-cg-test')),true);assert.equal(has(path.join(f.e.temp,'someone-else')),true);
 assert.equal(f.reg.exists(U.UNINSTALL_KEY),false);assert.deepEqual(f.reg.values(U.PATH_VALUE_KEYS[0]).map(v=>v.name),['C:\\Games\\other.exe']);
 assert.equal(f.reg.values(U.PATH_VALUE_KEYS[2]).length,1);
 fs.rmSync(f.base,{recursive:true,force:true});
});

test('execute without keeping data removes the whole install folder',()=>{
 const f=fixture(),p=U.plan({...opts(f),keepData:false,games:[]});
 const rep=U.execute(p,{registry:f.reg});assert.equal(rep.failed.length,0);assert.equal(has(f.root),false);
 fs.rmSync(f.base,{recursive:true,force:true});
});

test('leaveRoot (the window removes the folder after node exits) touches nothing in the install folder but the note',()=>{
 const f=fixture(),before=fs.readdirSync(f.root).sort(),p=U.plan({...opts(f),keepData:true,games:[]});
 U.execute(p,{registry:f.reg,leaveRoot:true});assert.deepEqual(fs.readdirSync(f.root).sort(),[...before,U.KEEP_NOTE].sort());
 const g=fixture();U.execute(U.plan({...opts(g),keepData:false,games:[]}),{registry:g.reg,leaveRoot:true});assert.equal(has(path.join(g.root,U.KEEP_NOTE)),false);assert.equal(has(path.join(g.root,'MeguLit.exe')),true);
 fs.rmSync(f.base,{recursive:true,force:true});fs.rmSync(g.base,{recursive:true,force:true});
});

test('a folder that is not MeguLit is refused',()=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-uninstall-not-'));w(path.join(d,'x.txt'),'x');
 assert.throws(()=>U.plan({root:d,env:{},registry:fakeRegistry(),readShortcuts:()=>({}),games:[]}),/NOT_A_MEGULIT_FOLDER/);
 fs.rmSync(d,{recursive:true,force:true});
});

test('Apps & features entry: written once, refreshed only when the install moved or updated',()=>{
 const reg=fakeRegistry(),root='E:\\MeguLit';
 assert.equal(U.register(root,'1.4.7',{registry:reg}),9);
 const v=Object.fromEntries(reg.values(U.UNINSTALL_KEY).map(x=>[x.name,x.data]));
 assert.equal(v.DisplayName,'MeguLit');assert.equal(v.InstallLocation,root);assert.match(v.UninstallString,/powershell\.exe" .*-File "E:\\MeguLit\\setup\\uninstall\.ps1" -Root "E:\\MeguLit"$/);
 reg.log.length=0;assert.equal(U.register(root,'1.4.7',{registry:reg}),0);assert.equal(reg.log.length,0);
 assert.equal(U.register(root,'1.4.8',{registry:reg}),1);
 assert.equal(U.registerSoon(root,'1.4.8'),null,'never from the test runner');
});

test('dry run from the command line prints the plan and changes nothing',()=>{
 const f=fixture(),before=fs.readdirSync(f.root).sort();
 const out=require('node:child_process').execFileSync(process.execPath,['--no-warnings',path.join(__dirname,'..','services','uninstall.cjs'),'--root',f.root,'--dry-run'],{encoding:'utf8',env:{...process.env,LOCALAPPDATA:f.e.localAppData,APPDATA:f.e.appData,TEMP:f.e.temp,MEGULIT_DESKTOP:f.e.desktop,MEGULIT_PROGRAMS:f.e.programs}});
 assert.match(out,/MeguLit uninstall plan/);assert.match(out,/keep local data: yes/);assert.match(out,/app\.megulit/);
 assert.deepEqual(fs.readdirSync(f.root).sort(),before);assert.equal(has(path.join(f.e.localAppData,'app.megulit')),true);
 fs.rmSync(f.base,{recursive:true,force:true});
});

test('the uninstaller ships: setup\\uninstall.ps1 (UTF-8 with BOM) and services\\uninstall.cjs are in the packaged folders',()=>{
 const repo=path.join(__dirname,'..'),ps=fs.readFileSync(path.join(repo,'setup','uninstall.ps1'));
 assert.deepEqual([...ps.subarray(0,3)],[0xef,0xbb,0xbf],'Windows PowerShell 5.1 needs the BOM to read the Chinese text');
 const rel=fs.readFileSync(path.join(repo,'Release.ps1'),'utf8');
 assert.match(rel,/git ls-files --cached --others --exclude-standard core services web setup/);assert.match(rel,/MeguLit\/setup\/uninstall\.ps1/);
 assert.match(fs.readFileSync(path.join(repo,'setup','setup-runtime.ps1'),'utf8'),/Register-Uninstall/);
 assert.match(fs.readFileSync(path.join(repo,'services','bridge.cjs'),'utf8'),/case 'uninstall_open'/);
});
