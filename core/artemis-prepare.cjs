// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const own=(o,k)=>{const d=Object.getOwnPropertyDescriptor(o,k);return d&&Object.hasOwn(d,'value')?d.value:undefined;};
function prepare(variants,input={}){
 if(!input||typeof input!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(input))||own(input,'enabled')!==true)return {state:'disabled'};
 const executable=own(input,'exe');
 if(!Buffer.isBuffer(executable)||executable.length>16*1024*1024)return {state:'unsupported',reason:'ARTEMIS_EXE'};
 const exe=hash(executable),candidates=variants.filter(v=>v.exe===exe);
 if(!candidates.length)return {state:'unsupported',reason:'ARTEMIS_EXE'};
 const modules=own(input,'modules');
 if(!modules||typeof modules!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(modules)))return {state:'unsupported',reason:'ARTEMIS_MODULES'};
 const fingerprints={};
 for(const name of Object.keys(candidates[0].modules)){
  const d=Object.getOwnPropertyDescriptor(modules,name),b=d&&Object.hasOwn(d,'value')?d.value:null;
  if(!Buffer.isBuffer(b)||b.length>65536)return {state:'unsupported',reason:'ARTEMIS_MODULES'};
  fingerprints[name]=hash(b);
 }
 const variant=candidates.find(v=>Object.entries(v.modules).every(([name,expected])=>fingerprints[name]===expected));
 if(!variant)return {state:'unsupported',reason:'ARTEMIS_MODULES'};
 const lua=fs.readFileSync(path.join(__dirname,'artemis-observer.lua'),'utf8');
 return {state:'prepared',identity:variant.id,provenance:{exe,members:{...variant.modules}},script:'local factory = (function()\n'+lua+'\nend)()\nreturn function(env, control, sink) return factory(env, control, sink, "'+variant.id+'") end\n'};
}
module.exports=prepare;
