// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Codec=require('./rgss-scripts.cjs'),R=require('../services/original-engines/rgss.cjs'),{declaredVariant}=require('./rgss-variants.cjs'),{candidatePageScript}=require('./rgss-page.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),plans=new WeakMap();
const PINS=Object.freeze([
 Object.freeze({id:'egomaniacs-trial-104',generation:1,storage:'archive',library:'RGSS104J.dll',scripts:'Data/Scripts.rxdata',exe:'be7d4f41d9df0945faf82738e14f42523e6b8869829fb379b9c4d97aac9eb899',dll:'beb9c9a6ce5ceaa9d562e2906d4be7027a85a1c937266daaae743f272b296cf3',ini:'d51d39d698787020c5f9acbd04fe78083f114c8d5a09279466f08fe018fb77ea',data:'c26fc4af172daf412ececd8390ea697bdb51e875b5c7532c4621fc66df306fd4',dataBytes:160699563,table:'c358d43f3ccc3a74be211cd66397fb42b85edc86330ce55157370b35171b66f4',main:'Main-Extend',mainSha256:'77b58119081a81648e6e4fe7248c194c13dfcc4042d4eee294de6b604e373567',messageMode:'egomaniacs'}),
 Object.freeze({id:'soprano-101',generation:3,storage:'loose',library:'System/RGSS301.dll',scripts:'Data/Scripts.rvdata2',exe:'123de8dbcbad471029171892be78b21e2cfb0bf52d5fee8f2bb5447066ee9fd4',dll:'27647690ed16218cd988dd71069fdca67207515b2a2df775be361f0198ab6876',ini:'21761999f8aa223bc2b9ae8a5715a419e3d8a23766cb0c6d65157a262018e5e3',data:'8790fda9bc08cb8923103c877afa2e774c9fac87612f33f807add24719157513',dataBytes:157956,table:'8790fda9bc08cb8923103c877afa2e774c9fac87612f33f807add24719157513',main:'Main',mainSha256:'55ee198afc668e88c72bf08205a581d27f583d9c125ce7f3d18e017006370da6'})
]);
function read(file,max){const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size<1||st.size>max)throw Error('RGSS_PRIVATE_FILE_SCOPE');return fs.readFileSync(file);}
function authority(grant,exe){const O=require('./owner-tests.cjs');if(!O.allowed(grant,{exe,engine:'rgss',capability:'roles'})||O.describe(grant).draw?.roles!==true)throw Error('RGSS_PRIVATE_GRANT_REQUIRED');}
function plan(exe,grant){
 authority(grant,exe);const dir=path.dirname(exe),exeSha=hash(read(exe,4<<20)),pin=PINS.find(p=>p.exe===exeSha);if(!pin)throw Error('RGSS_PRIVATE_EXE_NOT_VERIFIED');
 const ini=read(path.join(dir,'Game.ini'),65536);if(hash(ini)!==pin.ini)throw Error('RGSS_PRIVATE_INI_CHANGED');
 const get=k=>new RegExp('^'+k+'[ \\t]*=[ \\t]*([^\\r\\n]+)','im').exec(ini.toString('latin1'))?.[1]?.trim().replace(/\\/g,'/');
 if(get('Library')!==pin.library||get('Scripts')!==pin.scripts||declaredVariant({library:path.posix.basename(pin.library),scripts:pin.scripts}).generation!==pin.generation)throw Error('RGSS_PRIVATE_STARTUP_CHANGED');
 if(hash(read(path.join(dir,pin.library),4<<20))!==pin.dll)throw Error('RGSS_PRIVATE_DLL_CHANGED');
 const archive=pin.storage==='loose'?path.join(dir,pin.scripts):path.join(dir,path.basename(exe,path.extname(exe))+'.rgssad');
 if(pin.storage==='archive'&&fs.existsSync(path.join(dir,pin.scripts)))throw Error('RGSS_LOOSE_SCRIPTS_OVERRIDE');
 if(pin.storage==='loose'&&fs.readdirSync(dir).some(n=>/\.rgss(?:ad|2a|3a)$/i.test(n)))throw Error('RGSS_PRIVATE_AMBIGUOUS_DATA');
 const data=read(archive,pin.dataBytes);if(data.length!==pin.dataBytes||hash(data)!==pin.data)throw Error('RGSS_PRIVATE_DATA_CHANGED');
 const matches=pin.storage==='archive'?R.list(archive)?.filter(e=>e.name.toLowerCase()===pin.scripts.toLowerCase()):null;
 if(pin.storage==='archive'&&matches?.length!==1)throw Error('RGSS_SCRIPTS_MISSING');
 const entry=matches?.[0]||null,original=entry?R.read(archive,entry):data;if(hash(original)!==pin.table)throw Error('RGSS_SCRIPT_TABLE_NOT_VERIFIED');
 Codec.patchMain(original,'',{name:pin.main,sourceSha256:pin.mainSha256});
 const result=Object.freeze({dir,exe,archive,entry:entry&&Object.freeze(entry),original,library:pin.library,scripts:pin.scripts,storage:pin.storage,generation:pin.generation});plans.set(result,{pin,grant});return result;
}
function verify(source){const state=plans.get(source);if(!state)return null;authority(state.grant,source.exe);const p=state.pin;
 for(const [file,max,want]of [[source.exe,4<<20,p.exe],[path.join(source.dir,'Game.ini'),65536,p.ini],[path.join(source.dir,p.library),4<<20,p.dll],[source.archive,p.dataBytes,p.data]])if(hash(read(file,max))!==want)throw Error('RGSS_PRIVATE_SOURCE_CHANGED');
 if(hash(source.original)!==p.table)throw Error('RGSS_PRIVATE_SOURCE_CHANGED');return p;
}
function patch(source,options){const p=verify(source);if(!p)throw Error('RGSS_PRIVATE_SOURCE_REQUIRED');return Codec.patchMain(source.original,candidatePageScript({...options,generation:p.generation,messageMode:p.messageMode}),{name:p.main,sourceSha256:p.mainSha256});}
module.exports={plan,verify,patch};
