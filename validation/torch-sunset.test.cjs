// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','web','torch-hall.js'),'utf8');
const declaration=source.match(/^export function directSunVisibility\(el\)\{[^\n]+\}$/m);
assert.ok(declaration,'the scene exposes its solar-disc visibility curve');
const visibility=vm.runInNewContext(declaration[0].replace('export ','')+';directSunVisibility');

test('sunset twilight casts no direct orange light once the solar disc is below the horizon',()=>{
 for(const elevation of [-12,-2.5,-.39,0])assert.equal(visibility(elevation),0);
 assert.equal(visibility(1),.5);
 for(const elevation of [2,8,45,90])assert.equal(visibility(elevation),1);
});

test('direct sunlight fades continuously at the horizon without changing the moon branch',()=>{
 let last=0;
 for(let elevation=-.1;elevation<=2.1;elevation+=.01){const value=visibility(elevation);assert.ok(value>=last&&value<=1);assert.ok(value-last<.008);last=value;}
 assert.match(source,/if\(!s\.moon\)\{const visible=directSunVisibility\(s\.el\);k\.li\*=visible;k\.beam\*=visible;\}/);
});
