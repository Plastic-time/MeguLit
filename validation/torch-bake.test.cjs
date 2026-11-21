// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 传火碑: the shipped bake (web/assets/torch) must match the scene's source, or the page falls back to drawing everything
   when it opens (seconds on a slow PC). After changing web/torch-hall.js, web/torch-textures.js or web/torch-bake.js run
   `node tools/torch-bake.cjs`. */
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),path=require('node:path');
const {sourceHash}=require('../tools/torch-bake.cjs');
const DIR=path.join(__dirname,'..','web','assets','torch');
test('the torch bake matches the scene source',()=>{const man=JSON.parse(fs.readFileSync(path.join(DIR,'manifest.json'),'utf8'));
 assert.equal(man.hash,sourceHash(),'web/assets/torch is stale: run node tools/torch-bake.cjs');});
test('every baked file the manifest names is there',()=>{const man=JSON.parse(fs.readFileSync(path.join(DIR,'manifest.json'),'utf8'));
 const files=[man.ao.file,man.torch.file,...Object.values(man.textures).flatMap(o=>Object.values(o))];assert.ok(files.length>20);
 for(const f of files)assert.ok(fs.statSync(path.join(DIR,f)).size>100,f);
 assert.equal(man.ao.dims.length,3);assert.equal(man.torch.dims.length,3);});
