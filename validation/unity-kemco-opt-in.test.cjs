// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const domains=require('../core/profiles/domains.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const Profiles=require('../core/profiles/index.cjs'),{HookNative}=require('../core/hook-native.cjs'),{UnityTextPath}=require('../core/text-paths-unity.cjs');
test('Kemco observer has a strict per-version boolean domain',()=>{
 assert.equal(domains.layerOf('draw.kemcoSprites'),'version');
 assert.deepEqual(domains.clean({draw:{kemcoSprites:false}}).value,{draw:{kemcoSprites:false}});
 assert.deepEqual(domains.clean({draw:{kemcoSprites:'true'}}).rejected,['draw.kemcoSprites']);
 assert.deepEqual(domains.split({draw:{kemcoSprites:true}}),{game:{},version:{draw:{kemcoSprites:true}}});
});
test('Kemco observer defaults off and the existing Unity control bytes stay unchanged',()=>{
 const profile=Profiles.profileFor({});assert.equal(Profiles.get(profile,'draw.kemcoSprites'),false);
 const writes=[],transport={sock:{write:v=>writes.push(v)},drawLine:UnityTextPath.prototype.drawLine};
 const hook=Object.assign(Object.create(HookNative.prototype),{profile,state:{gameProcessId:0},textPath:{drawConfig:cfg=>UnityTextPath.prototype.drawConfig.call(transport,cfg)}});
 hook.drawSync();assert.deepEqual(writes,['DRAW roles=0 embed=0 zh=1\n']);assert.equal(hook.engineDraw,undefined);
 hook.profile={...profile,draw:{...profile.draw,kemcoSprites:true}};hook.drawSync();
 assert.equal(writes.at(-1),'DRAW roles=0 embed=0 zh=1 kemcoSprites=1\n');assert.equal(hook.engineDraw,undefined);assert.equal(hook.enabled,undefined);
 hook.profile=profile;hook.drawSync();assert.equal(writes.at(-1),'DRAW roles=0 embed=0 zh=1\n');
});
test('truthy strings cannot enable the Kemco observer',()=>{
 const profile=Profiles.profileFor({}),configs=[];
 const hook=Object.assign(Object.create(HookNative.prototype),{profile:{...profile,draw:{...profile.draw,kemcoSprites:'true'}},state:{gameProcessId:0},textPath:{drawConfig:cfg=>configs.push(cfg)}});
 hook.drawSync();assert.equal(configs[0].kemcoSprites,false);assert.equal(configs[0].roles,false);assert.equal(configs[0].embed,false);
});

test('Kemco permission survives strict domain cleaning only as a version-scoped boolean',()=>{
 const domain=require('../core/profiles/domains.cjs');
 assert.equal(domain.layerOf('draw.kemcoSprites'),'version');
 assert.deepEqual(domain.clean({draw:{kemcoSprites:true}}),{value:{draw:{kemcoSprites:true}},rejected:[]});
 assert.deepEqual(domain.split(domain.clean({draw:{kemcoSprites:true}}).value),{version:{draw:{kemcoSprites:true}},game:{}});
 for(const value of ['true',1,null,{},[]]){
  const cleaned=domain.clean({draw:{kemcoSprites:value}});
  assert.deepEqual(cleaned.value,{});assert.deepEqual(cleaned.rejected,['draw.kemcoSprites']);
 }
});
