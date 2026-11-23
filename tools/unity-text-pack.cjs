// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Builds the on-demand runtime pack "unity-text" (text architecture ③, core/text-paths-unity.cjs):
     runtime/unity-text/x86|x64/   BepInEx 5.4.23.6 win_x86 / win_x64 as released (LGPL-2.1; UnityDoorstop LGPL-2.1,
                                   HarmonyX / MonoMod MIT), checked against the SHA-256 below
     runtime/unity-text/MeguLitUnityText.dll   native/unitytext (GPL-3.0-or-later), built by Build-UnityText.ps1
     runtime/unity-text/LICENSES.txt
     runtime/unity-text/il2cpp-x86|il2cpp-x64/   BepInEx 6.0.0-be.793 IL2CPP builds (LGPL-2.1, own .NET runtime;
                                   Il2CppInterop LGPL-3.0, Cpp2IL / HarmonyX MIT), SHA-256 pinned (interop generated on first start)
     runtime/unity-text/MeguLitUnityText.IL2CPP.dll   native/unitytext, built by Build-UnityText-IL2CPP.ps1
   Usage: node tools/unity-text-pack.cjs <MeguLitUnityText.dll> <MeguLitUnityText.IL2CPP.dll> <out.zip> [work dir]
   Prints size / unpacked / sha256 for setup/runtime.json ("unity-text": onDemand, hidden, files). Nothing is uploaded. */
const fs=require('node:fs'),path=require('node:path'),https=require('node:https'),{createHash}=require('node:crypto'),{spawnSync}=require('node:child_process');
const VERSION='5.4.23.6';
const BEPINEX={x86:{file:'BepInEx_win_x86_'+VERSION+'.zip',sha256:'a4024dafaca5d3784097e34b3c2921415030c0b461e52f30053ed8914be9622d'},
 x64:{file:'BepInEx_win_x64_'+VERSION+'.zip',sha256:'6c57a714a892efb4e9e1fef63d608a3391f30ec984031c465404e4ee381a0755'},
 'il2cpp-x86':{file:'BepInEx-Unity.IL2CPP-win-x86-6.0.0-be.793%2Bdbc82f0.zip',url:'https://builds.bepinex.dev/projects/bepinex_be/793/',sha256:'6eb35cec828f16836674231b2ab4ab1db6c9953b7a11b34b8c8badba14218ed2'},
 'il2cpp-x64':{file:'BepInEx-Unity.IL2CPP-win-x64-6.0.0-be.793%2Bdbc82f0.zip',url:'https://builds.bepinex.dev/projects/bepinex_be/793/',sha256:'5b63d7d0e92a2448ccd13b738ff95ff1cc1026c6d718555d4df8e6c824953ac4'}};
const get=(url,hops=0)=>new Promise((resolve,reject)=>{if(new URL(url).protocol!=='https:')return reject(Error('HTTPS_REQUIRED'));const request=https.get(url,{headers:{'User-Agent':'MeguLit-pack'}},res=>{if([301,302,303,307,308].includes(res.statusCode)&&hops<8){res.resume();return resolve(get(new URL(res.headers.location,url).toString(),hops+1));}if(res.statusCode!==200){res.resume();return reject(Error('HTTP '+res.statusCode));}if(Number(res.headers['content-length'])>64*1024**2){res.destroy();return reject(Error('DOWNLOAD_BUDGET'));}const b=[];let n=0;res.on('data',d=>{n+=d.length;if(n>64*1024**2){res.destroy(Error('DOWNLOAD_BUDGET'));return;}b.push(d);});res.on('error',reject);res.on('end',()=>resolve(Buffer.concat(b)));});request.setTimeout(30000,()=>request.destroy(Error('DOWNLOAD_TIMEOUT')));request.on('error',reject);});
const tar=path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe');
function du(d){let n=0;for(const e of fs.readdirSync(d,{withFileTypes:true}))n+=e.isDirectory()?du(path.join(d,e.name)):fs.statSync(path.join(d,e.name)).size;return n;}
(async()=>{
 const [dll,dllIl2cpp,out,work0]=process.argv.slice(2);if(!dll||!dllIl2cpp||!out)throw Error('usage: unity-text-pack.cjs <MeguLitUnityText.dll> <MeguLitUnityText.IL2CPP.dll> <out.zip> [work]');
 if(fs.existsSync(out))throw Error('OUTPUT_EXISTS');
 const base=work0||require('node:os').tmpdir();fs.mkdirSync(base,{recursive:true});const work=fs.mkdtempSync(path.join(base,'unity-text-')),dest=path.join(work,'runtime','unity-text');fs.mkdirSync(dest,{recursive:true});
 if(require('node:os').freemem()<4*1024**3)throw Error('RAM_BUDGET');
 for(const d of process.platform==='win32'?['C:/','E:/','H:/']:[work]){const s=fs.statfsSync(d);if(Number(s.bavail)*Number(s.bsize)<10*1024**3+512*1024**2)throw Error('DISK_BUDGET '+d);}
 for(const [arch,b] of Object.entries(BEPINEX)){const zip=path.join(work,b.file);
  if(!fs.existsSync(zip))fs.writeFileSync(zip,await get((b.url||'https://github.com/BepInEx/BepInEx/releases/download/v'+VERSION+'/')+b.file));
  const sum=createHash('sha256').update(fs.readFileSync(zip)).digest('hex');if(sum!==b.sha256)throw Error(b.file+' sha256 '+sum);
  const entries=await require('../core/zip-extract.cjs').entries(zip);if(!entries.length||entries.length>5000||entries.reduce((s,e)=>s+e.usize,0)>256*1024**2||entries.some(e=>e.usize>64*1024**2||e.flag&1||e.name.replace(/\\/g,'/').split('/').some(p=>p==='..')||/^[/\\]|:/.test(e.name)))throw Error('ARCHIVE_BUDGET_OR_PATH');
  fs.mkdirSync(path.join(dest,arch));const r=spawnSync(tar,['-xf',zip,'-C',path.join(dest,arch)]);if(r.status!==0)throw Error('unpack '+b.file);}
 fs.copyFileSync(dll,path.join(dest,'MeguLitUnityText.dll'));fs.copyFileSync(dllIl2cpp,path.join(dest,'MeguLitUnityText.IL2CPP.dll'));
 const licenses=path.join(dest,'licenses');fs.mkdirSync(licenses);fs.copyFileSync(path.join(__dirname,'../LICENSE'),path.join(licenses,'MeguLit-GPL-3.0.txt'));
 for(const [name,url]of Object.entries({'BepInEx-LGPL-2.1.txt':'https://raw.githubusercontent.com/BepInEx/BepInEx/dbc82f0/LICENSE','Il2CppInterop-LGPL-3.0.txt':'https://raw.githubusercontent.com/BepInEx/Il2CppInterop/v1.5.3/LICENSE','HarmonyX-MIT.txt':'https://raw.githubusercontent.com/BepInEx/HarmonyX/v2.10.2/LICENSE','dotnet-6.0.7-MIT.txt':'https://raw.githubusercontent.com/dotnet/runtime/v6.0.7/LICENSE.TXT','dotnet-6.0.7-ThirdPartyNotices.txt':'https://raw.githubusercontent.com/dotnet/runtime/v6.0.7/THIRD-PARTY-NOTICES.TXT','UnityDoorstop-LGPL-2.1.txt':'https://raw.githubusercontent.com/NeighTools/UnityDoorstop/master/LICENSE','Cpp2IL-MIT.txt':'https://raw.githubusercontent.com/SamboyCoding/Cpp2IL/development/LICENSE'}))fs.writeFileSync(path.join(licenses,name),await get(url));
 fs.writeFileSync(path.join(dest,'LICENSES.txt'),['MeguLitUnityText.dll, MeguLitUnityText.IL2CPP.dll: MeguLit, GPL-3.0-or-later (https://github.com/ilynthn/MeguLit)','il2cpp-x86/, il2cpp-x64/: BepInEx 6.0.0-be.793 IL2CPP (https://builds.bepinex.dev), LGPL-2.1; includes Il2CppInterop (LGPL-3.0, https://github.com/BepInEx/Il2CppInterop), Cpp2IL and HarmonyX (MIT), and a .NET runtime (MIT). Unmodified official binaries.','x86/, x64/: BepInEx '+VERSION+' (https://github.com/BepInEx/BepInEx), LGPL-2.1; includes UnityDoorstop (LGPL-2.1), HarmonyX and MonoMod (MIT), Mono.Cecil (MIT). Unmodified release archives.',''].join('\r\n'));
 const r=spawnSync(tar,['-a','-cf',path.resolve(out),'runtime'],{cwd:work});if(r.status!==0)throw Error('zip failed');
 const buf=fs.readFileSync(out);console.log(JSON.stringify({size:buf.length,unpacked:du(dest),sha256:createHash('sha256').update(buf).digest('hex').toUpperCase(),onDemand:true,hidden:true,license:'BepInEx (LGPL-2.1), Il2CppInterop (LGPL-3.0), MeguLit (GPL-3.0-or-later)'},null,1));
})().catch(e=>{console.error(e.message);process.exit(1);});
