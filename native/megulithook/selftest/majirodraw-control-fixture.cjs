// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {KrkrTransport,settings}=require('../../../core/engine-draw.cjs');
const base=process.argv[2];
if(!base)throw Error('expected output directory');
const transport=new KrkrTransport(733171,{tmp:base});
transport.flush(settings({draw:{roles:true,embed:false}}),new Map());
assert.equal(fs.readFileSync(transport.file).subarray(0,2).toString('hex'),'fffe');
