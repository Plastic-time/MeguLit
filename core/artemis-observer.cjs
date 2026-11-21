// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const variants=Object.freeze([
 Object.freeze({id:'amakano3-trial-lua-input-v1',exe:'ca1fe32160ee8557acc0af712cd5eaf642eb29cc14f0ec06715824675d3c05a5',modules:Object.freeze({
  'system/msg/message.lua':'a2257f0db2a6db99568b87c8ea985763b23275decd1b305a96c8bf4bd960133f',
  'system/msg/ui.lua':'909d133b15e50f7694453bc79c54b37b98c5bf28e4c69906c836dc833c8c9588',
  'system/adv/select.lua':'87f5a39eb4498cc2ac36aaa8f85e77c1062d8d47c4637b12533547ebba3b65fa'})}),
 Object.freeze({id:'the-shell1-lua-input-v1',exe:'7f256e7395b62ba2298b1cde30e68097a23ce36e9f8f31753c64257d8181b68c',modules:Object.freeze({
  'system/msg/message.lua':'78525cf838b6ce0fb438ea66f966c51cf6faa511040d0141c2e9c1345e6f0fdd',
  'system/msg/ui.lua':'4611f6dc36812d3fba03360ed79e42c3983e440fd80f6a379f92283cee5e0267',
  'system/adv/select.lua':'e239ac3e2f7a72b20e7631bceffd1c3fa33bbd95b08659c95d6d29337676cf99'})})
]);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const own=(o,k)=>{const d=Object.getOwnPropertyDescriptor(o,k);return d&&Object.hasOwn(d,'value')?d.value:undefined;};
function prepare(input={}){
 if(!input||typeof input!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(input))||own(input,'enabled')!==true)return {state:'disabled'};
 const executable=own(input,'exe');
 if(!Buffer.isBuffer(executable)||executable.length>16*1024*1024)return {state:'unsupported',reason:'ARTEMIS_EXE'};
 const exe=hash(executable),variant=variants.find(v=>v.exe===exe);
 if(!variant)return {state:'unsupported',reason:'ARTEMIS_EXE'};
 const modules=own(input,'modules');
 if(!modules||typeof modules!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(modules)))return {state:'unsupported',reason:'ARTEMIS_MODULES'};
 for(const[name,expected]of Object.entries(variant.modules)){
  const d=Object.getOwnPropertyDescriptor(modules,name),b=d&&Object.hasOwn(d,'value')?d.value:null;
  if(!Buffer.isBuffer(b)||b.length>65536||hash(b)!==expected)return {state:'unsupported',reason:'ARTEMIS_MODULES'};
 }
 const lua=fs.readFileSync(path.join(__dirname,'artemis-observer.lua'),'utf8');
 return {state:'prepared',identity:variant.id,provenance:{exe,members:{...variant.modules}},script:'local factory = (function()\n'+lua+'\nend)()\nreturn function(env, control, sink) return factory(env, control, sink, "'+variant.id+'") end\n'};
}
module.exports={prepare,variants};
