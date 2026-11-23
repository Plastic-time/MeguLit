// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),ED=require('../../../core/engine-draw.cjs');
const tmp=process.argv[2];if(!tmp)throw new Error('missing task temporary directory');
const fx=require('../../../validation/fixtures/engine-sigs/mages-draw.json');
const seed=JSON.parse(fs.readFileSync(path.join(__dirname,'../../../The Seed/mages/steins-gate/versions',fx.snippets['steins-gate'].sha256+'.json'),'utf8'));
const t=new ED.KrkrTransport(733175,{tmp});t.flush(ED.settings({draw:{roles:true,engineTable:seed.settings.draw.engineTable}}),new Map());process.stdout.write(t.file);
