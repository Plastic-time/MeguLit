/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const E=require('../core/engine-draw.cjs'),P=require('../core/profiles/index.cjs');
test('default profile emits no Siglus control; explicit roles opt-in serializes exact authorization',()=>{
 const profile=P.profileFor({}),calls=[];
 const draw=new E.EngineDraw({profile,transport:{write:(...args)=>calls.push(args),stop:()=>{}}});
 assert.equal(draw.active,false);assert.deepEqual(calls,[]);assert.equal(E.settings(profile).roles,false);
 assert.match(E.krkrControlText(E.settings(profile),new Map()),/^#cfg roles=0 embed=0/);
 assert.match(E.krkrControlText(E.settings({draw:{roles:true}}),new Map()),/^#cfg roles=1 embed=0/);
});
test('all Siglus game and version seeds keep new observation opt-in closed',()=>{
 const root=path.join(__dirname,'../The Seed/siglus');let count=0;
 function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(entry.name.endsWith('.json')){count++;const seed=JSON.parse(fs.readFileSync(file,'utf8'));assert.notEqual(seed.draw?.roles,true,file);assert.notEqual(seed.draw?.embed,true,file);}}}
 walk(root);assert.ok(count>0);
});
